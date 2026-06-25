import { validateBrand } from "../_kernel/brand.js";
import { createTimestampLayoutOps } from "./layout.js";
import { registerBrand } from "../_kernel/registry.js";
import { fastTenByteRng } from "../_kernel/rng.js";
import type {
  Id,
  JsonSchema,
  ParseResult,
  Prefix,
  StandardSchemaProps,
  ValidBrand,
} from "../../types.js";
import { wireMethods } from "../../wire/codec-shell.js";

/**
 * Configuration options for a codec instance.
 */
export type TimestampOptions = {
  /** Returns the current timestamp in milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** Writes random bytes into `target` for ID generation. Defaults to a `crypto.randomUUID` fast path. */
  rng?: (target: Uint8Array) => void;
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

type ResolvedTimestampOptions = Required<Pick<TimestampOptions, "now" | "rng">> &
  Pick<TimestampOptions, "allowDuplicateBrand">;

/**
 * A brand-scoped codec for generating and validating public-facing IDs.
 *
 * Wire format: `{brand}_` plus 26 lowercase Crockford base32 characters encoding a
 * 16-byte payload (6-byte ms timestamp + 10 random bytes). IDs sort by creation
 * time in ascending order.
 *
 * For encrypted IDs, use `createOpaqueTimestampId` from `@smonn/ids/opaque`.
 */
export type TimestampCodec<Brand extends string> = {
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
   * Decodes the creation `Date` from an `Id<Brand>`. Trusts the type — use `safeParse()` at boundaries first. See ADR-0002.
   */
  extractTimestamp(id: Id<Brand>): Date;
  /** Tight lower bound for any ID generated at `date` (random portion `0x00`). Throws on invalid dates. */
  minIdForTime(date: Date): Id<Brand>;
  /** Tight upper bound for any ID generated at `date` (random portion `0xff`). Throws on invalid dates. */
  maxIdForTime(date: Date): Id<Brand>;
  /** JSON Schema for the canonical wire form (`pattern` is canonical-only). */
  toJsonSchema(): JsonSchema;
  /** Standard Schema validate entry point. */
  readonly "~standard": StandardSchemaProps<Brand>;
};

const defaultTimestampOptions: ResolvedTimestampOptions = {
  now: Date.now,
  // crypto.randomUUID harvest fast path (~7× faster than crypto.getRandomValues);
  // see fastTenByteRng. The Reverse Timestamp codec shares the identical 10-byte
  // random tail and the same default.
  rng: fastTenByteRng,
};

/**
 * Creates a codec for `brand` (three lowercase a–z characters).
 *
 * @param brand - Entity type brand validated once at construction.
 * @param opts - Optional `now`, `rng`, and `allowDuplicateBrand` overrides.
 * @example
 * ```ts
 * const users = createTimestampId("usr");
 *
 * const id = users.generate();            // Id<"usr">
 * users.extractTimestamp(id);             // Date
 * ```
 */
export function createTimestampId<Brand extends string>(
  brand: Brand & ValidBrand<Brand>,
  opts: TimestampOptions = {},
): TimestampCodec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);

  const options = {
    now: opts.now ?? defaultTimestampOptions.now,
    rng: opts.rng ?? defaultTimestampOptions.rng,
  } satisfies ResolvedTimestampOptions;

  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createTimestampLayoutOps(prefix, options.rng);

  return {
    generate: () => layout.generateAt(options.now()),
    generateAt: (date: Date) => layout.generateAt(date.getTime()),
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    extractTimestamp: layout.extractTimestamp,
    minIdForTime: (date: Date) => layout.minIdForTime(date.getTime()),
    maxIdForTime: (date: Date) => layout.maxIdForTime(date.getTime()),
    toJsonSchema: () => wire.toJsonSchema(brand, layout.exampleWireId()),
    "~standard": wire["~standard"],
  };
}
