import { validateBrand } from "../_kernel/brand.js";
import { IdsError } from "../../error.js";
import { createWrappedLayoutOps } from "./layout.js";
import { registerBrand } from "../_kernel/registry.js";
import type {
  Id,
  JsonSchema,
  ParseError,
  ParseResult,
  Prefix,
  StandardSchemaProps,
  ValidBrand,
} from "../../types.js";
import { wireMethods } from "../../wire/codec-shell.js";
import {
  assertValidKeyring,
  decodeWrappingKey,
  encodeWrappingKey,
  getWrappingKeyMaterial,
  importWrappingKey,
  type WrappingKey,
  type WrappingKeyFormat,
  wrappingKeysEqual,
} from "./key.js";

export {
  decodeWrappingKey,
  encodeWrappingKey,
  importWrappingKey,
  type WrappingKey,
  type WrappingKeyFormat,
};

/**
 * Integer kind for a {@link WrappedKeyCodec}, fixed at construction time.
 *
 * - `"u32"` — unsigned 32-bit integer; JS type `number`, range `[0, 4 294 967 295]`.
 * - `"i32"` — signed 32-bit integer; JS type `number`, range `[-2 147 483 648, 2 147 483 647]`.
 * - `"u64"` — unsigned 64-bit integer; JS type `bigint`, range `[0n, 18 446 744 073 709 551 615n]`.
 * - `"i64"` — signed 64-bit integer; JS type `bigint`, range `[-9 223 372 036 854 775 808n, 9 223 372 036 854 775 807n]`.
 *
 * 32-bit kinds use safe JavaScript `number` values; 64-bit kinds always use `bigint`
 * even when the magnitude would fit in a `number`, preventing silent truncation or sign erasure.
 */
export type WrappedKind = "u32" | "i32" | "u64" | "i64";

type LookupKeyForKind<K extends WrappedKind> = K extends "u32" | "i32" ? number : bigint;

/**
 * Result returned by {@link WrappedKeyCodec.safeUnwrap}.
 *
 * On success, `id` is the canonical {@link Id} and `lookupKey` is the recovered
 * integer (`number` for 32-bit kinds, `bigint` for 64-bit kinds).
 * On failure, `error` is a {@link ParseError} for structural problems or
 * `"verification_failed"` when the payload is structurally valid but the
 * verification tag does not match any entry in the wrapping keyring.
 */
export type UnwrapResult<Brand extends string, Kind extends WrappedKind> =
  | { ok: true; id: Id<Brand>; lookupKey: LookupKeyForKind<Kind> }
  | { ok: false; error: ParseError | "verification_failed" };

/**
 * Codec returned by {@link createWrappedKeyId}.
 *
 * Wraps a caller-owned integer **lookup key** into a public {@link Id} and
 * recovers it on unwrap. The codec is deterministic under fixed key material:
 * the same lookup key always yields the same public ID (**equality leakage**).
 *
 * - `wrap` / `unwrap` / `safeUnwrap` are async (WebCrypto).
 * - `is`, `parse`, `safeParse`, and `toJsonSchema` are synchronous and require
 *   no key material — they validate prefix and base32 shape only.
 * - The `Kind` type parameter drives value types at the TypeScript boundary:
 *   `u32` / `i32` → `number`; `u64` / `i64` → `bigint`.
 *
 * @remarks
 * **Security properties (correctness-grade verification, not AEAD):**
 *
 * - The construction is deterministic — the same lookup key always yields the
 *   same public ID (**equality leakage**).
 * - The verification tag is a fixed **64-bit (8-byte) truncation** of a
 *   domain-separated HMAC over the brand, kind, and lookup key lane.
 * - False-accept rate is approximately `keyring_size / 2^64` per `unwrap`
 *   trial — correctness-grade verification, not AEAD-strength origin
 *   authentication.
 * - Consumers requiring full AEAD guarantees must use a different construction.
 */
export type WrappedKeyCodec<Brand extends string, Kind extends WrappedKind> = {
  /**
   * Wrap `lookupKey` into a public ID using the current (first) wrapping key.
   *
   * Throws if `lookupKey` is out of range or the wrong JS type for `Kind`.
   */
  wrap(lookupKey: LookupKeyForKind<Kind>): Promise<Id<Brand>>;
  /**
   * Verify the payload of a trusted `Id<Brand>` and return the lookup key.
   *
   * Throws `IdsError` with `code: "verification_failed"` if no entry in the
   * wrapping keyring matches the payload tag. Use {@link safeUnwrap} for
   * untrusted input.
   */
  unwrap(id: Id<Brand>): Promise<LookupKeyForKind<Kind>>;
  /**
   * Non-throwing path for untrusted input.
   *
   * Structurally parses `input` first (same rules as {@link safeParse}), then
   * verifies the payload. Returns `{ ok: false, error }` on any failure —
   * `ParseError` for structural problems or `"verification_failed"` for tag
   * mismatch — without throwing. Tamper, wrong keyring, and revoked-key cases
   * all surface as `"verification_failed"`.
   */
  safeUnwrap(input: unknown): Promise<UnwrapResult<Brand, Kind>>;
  /** Strict type guard: `true` only for already-canonical `Id<Brand>` strings. */
  is(value: unknown): value is Id<Brand>;
  /** Normalise to canonical form, or throw on parse failure. */
  parse(value: unknown): Id<Brand>;
  /** Normalise to canonical form, or return `{ ok: false, error }`. */
  safeParse(value: unknown): ParseResult<Brand>;
  toJsonSchema(): JsonSchema;
  readonly "~standard": StandardSchemaProps<Brand>;
  /**
   * Converts a trusted `Id<Brand>` to an RFC 9562 canonical (lowercase, hyphenated)
   * UUID string by reinterpreting the 16-byte payload verbatim. Total — cannot fail.
   * Returns a plain `string` (brand is shed). See ADR-0024.
   */
  toUUID(id: Id<Brand>): string;
  /**
   * Parses a UUID string into an `Id<Brand>`. Accepts case-insensitive `8-4-4-4-12`
   * hyphenated form only. Throws `IdsError` with `code: "invalid_id"` on bad input.
   * See ADR-0024.
   */
  fromUUID(value: string): Id<Brand>;
  /**
   * Non-throwing UUID parse. Returns `{ ok: true, id }` or
   * `{ ok: false, error: "not_string" | "invalid_uuid" }`. See ADR-0024.
   */
  safeFromUUID(value: unknown): ParseResult<Brand>;
};

/**
 * Construction options for {@link createWrappedKeyId}.
 */
export type WrappedKeyOptions<K extends WrappedKind> = {
  /** Integer kind for the codec — fixed for the lifetime of the codec. Drives the JS value type (`number` for 32-bit, `bigint` for 64-bit). */
  kind: K;
  /** Non-empty ordered wrapping keyring. The first entry is current (used by `wrap`); all entries are tried on `unwrap`. Duplicate operator secrets are rejected at construction. */
  keys: [WrappingKey, ...WrappingKey[]];
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

const u32Max = 0xffff_ffff;
const i32Min = -0x8000_0000;
const i32Max = 0x7fff_ffff;
const u64Max = 0xffff_ffff_ffff_ffffn;
const i64Min = -(1n << 63n);
const i64Max = (1n << 63n) - 1n;

function assertSupportedKind(kind: WrappedKind): asserts kind is WrappedKind {
  if (kind !== "u32" && kind !== "i32" && kind !== "u64" && kind !== "i64") {
    throw new IdsError("invalid_kind", "invalid wrapped key kind: expected u32, i32, u64, or i64");
  }
}

function assertU32LookupKey(lookupKey: unknown): asserts lookupKey is number {
  if (
    typeof lookupKey !== "number" ||
    !Number.isInteger(lookupKey) ||
    Object.is(lookupKey, -0) ||
    lookupKey < 0 ||
    lookupKey > u32Max
  ) {
    throw new IdsError(
      "invalid_lookup_key",
      `invalid u32 lookup key: expected integer in [0, ${u32Max}], got ${lookupKey}`,
    );
  }
}

function assertI32LookupKey(lookupKey: unknown): asserts lookupKey is number {
  if (
    typeof lookupKey !== "number" ||
    !Number.isInteger(lookupKey) ||
    Object.is(lookupKey, -0) ||
    lookupKey < i32Min ||
    lookupKey > i32Max
  ) {
    throw new IdsError(
      "invalid_lookup_key",
      `invalid i32 lookup key: expected integer in [${i32Min}, ${i32Max}], got ${lookupKey}`,
    );
  }
}

function assertU64LookupKey(lookupKey: unknown): asserts lookupKey is bigint {
  if (typeof lookupKey !== "bigint" || lookupKey < 0n || lookupKey > u64Max) {
    throw new IdsError(
      "invalid_lookup_key",
      `invalid u64 lookup key: expected bigint in [0, ${u64Max}], got ${lookupKey}`,
    );
  }
}

function assertI64LookupKey(lookupKey: unknown): asserts lookupKey is bigint {
  if (typeof lookupKey !== "bigint" || lookupKey < i64Min || lookupKey > i64Max) {
    throw new IdsError(
      "invalid_lookup_key",
      `invalid i64 lookup key: expected bigint in [${i64Min}, ${i64Max}], got ${lookupKey}`,
    );
  }
}

function assertLookupKey<Kind extends WrappedKind>(
  kind: Kind,
  lookupKey: unknown,
): asserts lookupKey is LookupKeyForKind<Kind> {
  if (kind === "i32") {
    assertI32LookupKey(lookupKey);
    return;
  }
  if (kind === "u64") {
    assertU64LookupKey(lookupKey);
    return;
  }
  if (kind === "i64") {
    assertI64LookupKey(lookupKey);
    return;
  }
  assertU32LookupKey(lookupKey);
}

/**
 * Construct a {@link WrappedKeyCodec} for `brand` and the given `kind`.
 *
 * `opts.kind` fixes the integer type at construction time — one brand, one
 * kind. `opts.keys` is a non-empty ordered wrapping keyring: the first entry
 * is current (used by `wrap`); all entries are tried on `unwrap`; duplicate
 * operator secrets are rejected at construction.
 *
 * @example
 * ```ts
 * const key = await importWrappingKey(new Uint8Array(32));
 * const invoices = createWrappedKeyId("inv", { kind: "u32", keys: [key] });
 *
 * const id = await invoices.wrap(42);      // Id<"inv">
 * await invoices.unwrap(id);               // 42
 * ```
 */
export function createWrappedKeyId<Brand extends string, Kind extends WrappedKind>(
  brand: Brand & ValidBrand<Brand>,
  opts: WrappedKeyOptions<Kind>,
): WrappedKeyCodec<Brand, Kind> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);
  assertSupportedKind(opts.kind);
  assertValidKeyring(opts.keys, wrappingKeysEqual, "wrapping");
  const layoutKeys = opts.keys.map(getWrappingKeyMaterial);

  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createWrappedLayoutOps(prefix, brand, opts.kind, layoutKeys);

  return {
    wrap: async (lookupKey) => {
      assertLookupKey(opts.kind, lookupKey);
      return layout.wrap(lookupKey);
    },
    unwrap: async (id) => {
      const lookupKey = await layout.tryUnwrap(id);
      if (lookupKey === null) {
        throw new IdsError("verification_failed", "verification failed");
      }
      return lookupKey;
    },
    safeUnwrap: async (input) => {
      const parsed = wire.safeParse(input);
      if (!parsed.ok) return parsed;
      const lookupKey = await layout.tryUnwrap(parsed.id);
      if (lookupKey === null) return { ok: false, error: "verification_failed" };
      return { ok: true, id: parsed.id, lookupKey };
    },
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    toJsonSchema: wire.toJsonSchema,
    "~standard": wire["~standard"],
    toUUID: wire.toUUID,
    fromUUID: wire.fromUUID,
    safeFromUUID: wire.safeFromUUID,
  };
}
