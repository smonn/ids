import { validateBrand } from "./brand.js";
import { createOpaqueWireOps, schemaExample } from "./layouts/opaque.js";
import { registerBrand } from "./registry.js";
import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "./types.js";
import { wireMethods } from "./wire/codec-shell.js";

export { decodeOpaqueKey, encodeOpaqueKey, type OpaqueKeyFormat } from "./opaque-key.js";

/**
 * Configuration options for an Opaque codec instance.
 */
export type OpaqueOptions = {
  /** AES-CBC key used for encryption and decryption. */
  key: CryptoKey;
  /** Returns the current timestamp in milliseconds. Defaults to `Date.now`. */
  now: () => number;
  /** Writes random bytes into `target` for ID generation. Defaults to `crypto.getRandomValues`. */
  rng: (target: Uint8Array) => void;
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

/**
 * A brand-scoped codec for generating and validating encrypted (opaque) IDs.
 *
 * Same wire shape as the Timestamp codec (`{brand}_` + 26 base32 chars) but the
 * payload is AES-CBC encrypted. `generate`, `generateAt`, and `extractTimestamp`
 * are async; parsing methods are sync. No `minIdForTime` / `maxIdForTime` —
 * encrypted payloads do not sort by creation time.
 */
export type OpaqueCodec<Brand extends string> = {
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
   */
  extractTimestamp(id: Id<Brand>): Promise<Date>;
  /** JSON Schema for the canonical wire form (`example` is a structural placeholder). */
  toJsonSchema(): JsonSchema;
  /** Standard Schema validate entry point. */
  readonly "~standard": StandardSchemaProps<Brand>;
};

function defaultRng(target: Uint8Array): void {
  crypto.getRandomValues(target as Uint8Array<ArrayBuffer>);
}

/**
 * Imports a raw AES key for use with the Opaque codec.
 *
 * @param bytes - Raw key bytes (16, 24, or 32 bytes for AES-128/192/256).
 */
export function importOpaqueKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes as Uint8Array<ArrayBuffer>, "AES-CBC", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Creates an Opaque codec for `brand` (three lowercase a–z characters).
 *
 * @param brand - Entity type brand validated once at construction.
 * @param opts - Required `key` plus optional `now`, `rng`, and `allowDuplicateBrand` overrides.
 */
export function createOpaqueId<Brand extends string>(
  brand: Brand,
  opts: { key: CryptoKey } & Partial<Omit<OpaqueOptions, "key">>,
): OpaqueCodec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);

  const key = opts.key;
  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? defaultRng;
  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createOpaqueWireOps(prefix, key, rng);

  return {
    generate: () => layout.generateAt(now()),
    generateAt: (date: Date) => layout.generateAt(date.getTime()),
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    extractTimestamp: layout.extractTimestamp,
    toJsonSchema: () => wire.toJsonSchema(brand, schemaExample(prefix)),
    "~standard": wire["~standard"],
  };
}
