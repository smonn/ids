import { validateBrand } from "../_kernel/brand.js";
import { IdsError, isIdsError, type IdsErrorCode } from "../../error.js";
import { createReverseTimestampLayoutOps } from "./layout.js";
import { registerBrand } from "../_kernel/registry.js";
import { fastTenByteRng } from "../_kernel/rng.js";
import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "../../types.js";
import { wireMethods } from "../../wire/codec-shell.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode };

/**
 * Configuration options for a Reverse Timestamp codec instance.
 */
export type ReverseTimestampOptions = {
  /** Returns the current timestamp in milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** Writes the 10-byte random tail into `target`. Defaults to a `crypto.randomUUID` harvest fast path (same as the Timestamp codec). */
  rng?: (target: Uint8Array) => void;
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

/**
 * A brand-scoped codec for generating and validating Reverse Timestamp IDs.
 *
 * Wire format: `{brand}_` plus 26 lowercase Crockford base32 characters encoding a
 * 16-byte payload (6-byte bitwise-inverted ms timestamp + 10 random bytes). IDs sort
 * by creation time in **descending** (newest-first) order.
 *
 * Range queries across a time interval [t_old, t_new] should scan from
 * `minIdForTime(t_new)` to `maxIdForTime(t_old)` — the reversed sort order means
 * newer timestamps produce lexicographically smaller IDs.
 *
 * Constructed via `createReverseTimestampId(brand)` from `@smonn/ids/reverse`.
 */
export type ReverseTimestampCodec<Brand extends string> = {
  /** Produces a new canonical ID using the codec's `now` and `rng`. */
  generate(): Id<Brand>;
  /** Produces a new canonical ID with timestamp bytes from `date` and a fresh random tail. Throws on invalid dates. */
  generateAt(date: Date): Id<Brand>;
  /**
   * Strict type guard: `true` only for already-canonical strings for this brand.
   * For untrusted input, use `safeParse()` or `parse()` instead. See ADR-0003.
   */
  is(value: unknown): value is Id<Brand>;
  /**
   * Lenient parse: normalises case and Crockford aliases, returns canonical `Id<Brand>`, or throws.
   */
  parse(value: unknown): Id<Brand>;
  /**
   * Lenient parse without throwing: normalises to canonical form, or returns `{ ok: false, error }`.
   */
  safeParse(value: unknown): ParseResult<Brand>;
  /**
   * Decodes the creation `Date` from an `Id<Brand>` by inverting the timestamp bytes.
   * Trusts the type — use `safeParse()` at boundaries first.
   */
  extractTimestamp(id: Id<Brand>): Date;
  /**
   * Lexicographically smallest ID for any ID generated at `date` (random portion `0x00`).
   * Because timestamps are inverted, a newer `date` yields a lexicographically smaller result —
   * use `minIdForTime(t_new)` as the lower bound when scanning [t_old, t_new].
   * Throws on invalid dates.
   */
  minIdForTime(date: Date): Id<Brand>;
  /**
   * Lexicographically largest ID for any ID generated at `date` (random portion `0xff`).
   * Because timestamps are inverted, an older `date` yields a lexicographically larger result —
   * use `maxIdForTime(t_old)` as the upper bound when scanning [t_old, t_new].
   * Throws on invalid dates.
   */
  maxIdForTime(date: Date): Id<Brand>;
  /** JSON Schema for the canonical wire form (`pattern` is canonical-only). */
  toJsonSchema(): JsonSchema;
  /** Standard Schema validate entry point. */
  readonly "~standard": StandardSchemaProps<Brand>;
};

/**
 * Creates a Reverse Timestamp codec for `brand` (three lowercase a–z characters).
 *
 * IDs sort newest-first: the 48-bit timestamp field is bitwise-inverted before encoding,
 * so lexicographic ID order equals descending creation-time order. `extractTimestamp`
 * inverts back to recover the original millisecond.
 *
 * @param brand - Entity type brand validated once at construction.
 * @param opts - Optional `now`, `rng`, and `allowDuplicateBrand` overrides.
 */
export function createReverseTimestampId<Brand extends string>(
  brand: Brand,
  opts: ReverseTimestampOptions = {},
): ReverseTimestampCodec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);

  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? fastTenByteRng;
  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createReverseTimestampLayoutOps(prefix, rng);

  return {
    generate: () => layout.generateAt(now()),
    generateAt: (date: Date) => layout.generateAt(date.getTime()),
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    extractTimestamp: layout.extractTimestamp,
    minIdForTime: (date: Date) => layout.minIdForTime(date.getTime()),
    maxIdForTime: (date: Date) => layout.maxIdForTime(date.getTime()),
    toJsonSchema: () => wire.toJsonSchema(brand, layout.exampleWireId(now())),
    "~standard": wire["~standard"],
  };
}
