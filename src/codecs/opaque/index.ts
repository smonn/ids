import { validateBrand } from "../_kernel/brand.js";
import { createOpaqueLayoutOps } from "./layout.js";
import { getOpaqueKeyCryptoKey, type OpaqueKey } from "./key.js";
import { registerBrand } from "../_kernel/registry.js";
import { defaultRng } from "../_kernel/rng.js";
import type {
  Id,
  JsonSchema,
  ParseResult,
  Prefix,
  StandardSchemaProps,
  ValidBrand,
} from "../../types.js";
import { wireMethods } from "../../wire/codec-shell.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../../error.js";
export {
  decodeOpaqueKey,
  encodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKey,
  type OpaqueKeyFormat,
} from "./key.js";

/**
 * Configuration options for an Opaque Timestamp codec instance.
 */
export type OpaqueTimestampOptions = {
  /**
   * {@link OpaqueKey} handle for AES-CBC encryption and decryption.
   * Obtain via {@link importOpaqueKey}.
   *
   * A single key, not a ring: rotation is forward-only and caller-tracked —
   * hold one codec per key epoch and select it from your own records. The
   * library cannot trial keys (the payload is unauthenticated). See ADR-0013.
   */
  key: OpaqueKey;
  /** Returns the current timestamp in milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** Writes random bytes into `target` for ID generation. Defaults to `crypto.getRandomValues`. */
  rng?: (target: Uint8Array) => void;
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

/**
 * A brand-scoped codec for generating and validating Opaque Timestamp IDs.
 *
 * Same wire shape as the Timestamp codec (`{brand}_` + 26 base32 chars) but the
 * payload is AES-CBC encrypted. `generate`, `generateAt`, and `extractTimestamp`
 * are async; parsing methods are sync. No `minIdForTime` / `maxIdForTime` —
 * encrypted payloads do not sort by creation time.
 *
 * @remarks
 * **Security properties (unauthenticated, deterministic, and malleable by design):**
 *
 * - The payload is AES-CBC encrypted but **unauthenticated** — there is no
 *   integrity tag. A tampered or wrong-key payload decrypts to garbage bytes
 *   without throwing.
 * - Opaque IDs must be treated as **opaque handles**, not as trusted or
 *   authenticated tokens.
 * - `extractTimestamp` is best-effort on untrusted input: a wrong or tampered
 *   key returns a plausible-looking `Date` without error, not a verification
 *   failure. Do not treat the returned timestamp as proof of origin.
 */
export type OpaqueTimestampCodec<Brand extends ValidBrand> = {
  /** Produces a new canonical encrypted ID using the codec's `now` and `rng`. */
  generate(): Promise<Id<Brand>>;
  /** Produces a new canonical encrypted ID with timestamp bytes from `date`. Throws on invalid dates. */
  generateAt(date: Date): Promise<Id<Brand>>;
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
   * Decrypts and decodes the creation `Date` from an `Id<Brand>`. Trusts the type — use `safeParse()` at boundaries first. See ADR-0002.
   *
   * Requires the same key used at generation; a wrong key returns a plausible
   * but wrong `Date`, never an error. With rotation, select the codec for the
   * ID's key epoch from your own records — the library cannot. See ADR-0013.
   */
  extractTimestamp(id: Id<Brand>): Promise<Date>;
  /** JSON Schema for the canonical wire form (`example` is a structural placeholder). */
  toJsonSchema(): JsonSchema;
  /** Standard Schema validate entry point. */
  readonly "~standard": StandardSchemaProps<Brand>;
};

/**
 * Creates an Opaque Timestamp codec for `brand` (three lowercase a–z characters).
 *
 * @param brand - Entity type brand validated once at construction.
 * @param opts - Required `key` (an {@link OpaqueKey} from {@link importOpaqueKey}) plus
 *   optional `now`, `rng`, and `allowDuplicateBrand` overrides.
 */
export function createOpaqueTimestampId<Brand extends ValidBrand>(
  brand: Brand,
  opts: OpaqueTimestampOptions,
): OpaqueTimestampCodec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);

  const cryptoKey = getOpaqueKeyCryptoKey(opts.key);
  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? defaultRng;
  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createOpaqueLayoutOps(prefix, cryptoKey, rng);

  return {
    generate: () => layout.generateAt(now()),
    generateAt: (date: Date) => layout.generateAt(date.getTime()),
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    extractTimestamp: layout.extractTimestamp,
    toJsonSchema: () => wire.toJsonSchema(brand, layout.exampleWireId()),
    "~standard": wire["~standard"],
  };
}
