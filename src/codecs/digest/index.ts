import { validateBrand } from "../_kernel/brand.js";
import { IdsError } from "../../error.js";
import { createDigestLayoutOps } from "./layout.js";
import { registerBrand } from "../_kernel/registry.js";
import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "../../types.js";
import { wireMethods } from "../../wire/codec-shell.js";
import {
  decodeDigestKey,
  encodeDigestKey,
  getDigestKeyHmacKey,
  importDigestKey,
  type DigestKey,
  type DigestKeyFormat,
} from "./key.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../../error.js";
export { decodeDigestKey, encodeDigestKey, importDigestKey, type DigestKey, type DigestKeyFormat };

/**
 * Configuration options for a Digest codec instance.
 */
export type DigestOptions = {
  /**
   * Non-secret, required namespace. The same material under a different
   * `ns` yields a different ID, so one key can serve multiple unlinkable namespaces.
   * Must be non-empty and not whitespace-only.
   */
  ns: string;
  /**
   * Single operator digest key. The Digest codec holds exactly one key — there
   * is no keyring. Re-keying is a deliberate, breaking operator action.
   */
  key: DigestKey;
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

/**
 * Codec returned by {@link createDigestId}.
 *
 * Maps caller **material** to a stable public ID under one **Digest key**:
 * the same material always yields the same ID, and the material cannot be
 * recovered from the ID (**equality leakage** is the intended property).
 *
 * - `digest` is async (WebCrypto HMAC).
 * - `is`, `parse`, `safeParse`, `toJsonSchema`, and `~standard` are synchronous
 *   and require no key material — they validate prefix and base32 shape only.
 * - There is no reverse method (`unwrap`, `verify`, `extractTimestamp`) — the
 *   codec is one-way by definition.
 */
export type DigestCodec<Brand extends string> = {
  /**
   * Digest `material` into a stable canonical {@link Id}.
   *
   * The same `(brand, ns, key, material)` tuple always returns the same ID.
   * Strings are UTF-8 encoded; byte arrays are used as-is.
   */
  digest(material: string | Uint8Array): Promise<Id<Brand>>;
  /** Strict type guard: `true` only for already-canonical `Id<Brand>` strings. */
  is(value: unknown): value is Id<Brand>;
  /** Normalise to canonical form, or throw on parse failure. */
  parse(value: unknown): Id<Brand>;
  /** Normalise to canonical form, or return `{ ok: false, error }`. */
  safeParse(value: unknown): ParseResult<Brand>;
  /** JSON Schema for the canonical wire form (`pattern` is canonical-only). */
  toJsonSchema(): JsonSchema;
  /** Standard Schema validate entry point. */
  readonly "~standard": StandardSchemaProps<Brand>;
};

/**
 * Construct a {@link DigestCodec} for `brand`.
 *
 * `opts.ns` is the required namespace — the same material under a
 * different `ns` yields a different ID. `opts.key` is the single operator
 * Digest key; there is no keyring.
 *
 * @example
 * ```ts
 * const key = await importDigestKey(new Uint8Array(32));
 * const idk = createDigestId("idk", { ns: "checkout", key });
 *
 * const id = await idk.digest("order-123"); // Id<"idk">
 * idk.is(id);                               // true
 * ```
 */
export function createDigestId<Brand extends string>(
  brand: Brand,
  opts: DigestOptions,
): DigestCodec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);

  if (typeof opts.ns !== "string" || opts.ns.trim() === "") {
    throw new IdsError(
      "invalid_namespace",
      "invalid namespace: ns must be a non-empty, non-whitespace string",
    );
  }

  const hmacKey = getDigestKeyHmacKey(opts.key);
  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createDigestLayoutOps(prefix, brand, opts.ns, hmacKey);

  return {
    digest: layout.digest,
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    toJsonSchema: () => wire.toJsonSchema(brand, layout.exampleWireId()),
    "~standard": wire["~standard"],
  };
}
