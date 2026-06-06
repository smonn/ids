import { validateBrand } from "./brand.js";
import { registerBrand } from "./registry.js";
import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "./types.js";
import {
  buildPayload,
  buildSentinelPayload,
  extractTimestampFromId,
  randomByteLength,
  toWireIdFromBuffer,
} from "./layouts/timestamp.js";
import { payloadByteLength } from "./wire/envelope.js";
import { wireMethods } from "./wire/codec-shell.js";
import { timestampByteLength } from "./wire/timestamp-bytes.js";

/**
 * Configuration options for a codec instance.
 */
export type Options = {
  /** Returns the current timestamp in milliseconds. Defaults to `Date.now`. */
  now: () => number;
  /** Writes random bytes into `target` for ID generation. Defaults to a `crypto.randomUUID` fast path. */
  rng: (target: Uint8Array) => void;
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

/**
 * A brand-scoped codec for generating and validating public-facing IDs.
 *
 * Wire format: `{brand}_` plus 26 lowercase Crockford base32 characters encoding a
 * 16-byte payload (6-byte ms timestamp + 10 random bytes). IDs sort by creation
 * time in ascending order.
 *
 * For encrypted IDs, use `createOpaqueId` from `@smonn/ids/opaque`.
 */
export type Codec<Brand extends string> = {
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

// hex charCode → 0–15 nibble, for decoding UUIDv4 strings into bytes.
// Covers ['0'-'9' = 48–57] and ['a'-'f' = 97–102]; UUIDs are lowercase per spec.
const hexCharCodeToNibble = new Uint8Array(128);
for (let i = 0; i < 10; i++) hexCharCodeToNibble[48 + i] = i;
for (let i = 0; i < 6; i++) hexCharCodeToNibble[97 + i] = 10 + i;

const defaultOptions: Options = {
  now: Date.now,
  // crypto.randomUUID is ~7× faster than crypto.getRandomValues in Node 24
  // (~84 ns vs ~610 ns for a 16-byte fill — likely because the UUID path has
  // a tight fixed-format fast path). We use the 122 random bits of a UUIDv4
  // string as our entropy source, harvesting 10 fully-random bytes from
  // positions where no version (hex 12) or variant (hex 16) bits sit.
  // String layout: "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx" — bytes 0–5 are
  // string[0..7]+string[9..12], bytes 6–9 are string[24..31].
  rng: (target) => {
    const s = crypto.randomUUID();
    target[0] =
      (hexCharCodeToNibble[s.charCodeAt(0)]! << 4) | hexCharCodeToNibble[s.charCodeAt(1)]!;
    target[1] =
      (hexCharCodeToNibble[s.charCodeAt(2)]! << 4) | hexCharCodeToNibble[s.charCodeAt(3)]!;
    target[2] =
      (hexCharCodeToNibble[s.charCodeAt(4)]! << 4) | hexCharCodeToNibble[s.charCodeAt(5)]!;
    target[3] =
      (hexCharCodeToNibble[s.charCodeAt(6)]! << 4) | hexCharCodeToNibble[s.charCodeAt(7)]!;
    target[4] =
      (hexCharCodeToNibble[s.charCodeAt(9)]! << 4) | hexCharCodeToNibble[s.charCodeAt(10)]!;
    target[5] =
      (hexCharCodeToNibble[s.charCodeAt(11)]! << 4) | hexCharCodeToNibble[s.charCodeAt(12)]!;
    target[6] =
      (hexCharCodeToNibble[s.charCodeAt(24)]! << 4) | hexCharCodeToNibble[s.charCodeAt(25)]!;
    target[7] =
      (hexCharCodeToNibble[s.charCodeAt(26)]! << 4) | hexCharCodeToNibble[s.charCodeAt(27)]!;
    target[8] =
      (hexCharCodeToNibble[s.charCodeAt(28)]! << 4) | hexCharCodeToNibble[s.charCodeAt(29)]!;
    target[9] =
      (hexCharCodeToNibble[s.charCodeAt(30)]! << 4) | hexCharCodeToNibble[s.charCodeAt(31)]!;
  },
};

/**
 * Creates a codec for `brand` (three lowercase a–z characters).
 *
 * @param brand - Entity type brand validated once at construction.
 * @param opts - Optional `now`, `rng`, and `allowDuplicateBrand` overrides.
 */
export function createId<Brand extends string>(
  brand: Brand,
  opts: Partial<Options> = {},
): Codec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);

  const options = {
    ...defaultOptions,
    ...opts,
  } satisfies Options;

  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  // Per-codec scratch buffer. Shared across generate(), generateAt(),
  // minIdForTime(), and maxIdForTime() — all are synchronous and overwrite both
  // the timestamp and random slices before encoding, so successive callers see
  // their own freshly-written bytes. encodePayload reads the buffer and returns
  // an independent string, so the caller never sees the buffer itself.
  const buffer = new Uint8Array(payloadByteLength);
  const randomView = new Uint8Array(buffer.buffer, timestampByteLength, randomByteLength);

  return {
    generate: () => {
      buildPayload(options.now(), options.rng, buffer, randomView);
      return toWireIdFromBuffer(prefix, buffer);
    },
    generateAt: (date: Date) => {
      buildPayload(date.getTime(), options.rng, buffer, randomView);
      return toWireIdFromBuffer(prefix, buffer);
    },
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    extractTimestamp: (id: Id<Brand>) => extractTimestampFromId(prefix, id),
    minIdForTime: (date: Date) => {
      buildSentinelPayload(date.getTime(), 0x00, buffer, randomView);
      return toWireIdFromBuffer(prefix, buffer);
    },
    maxIdForTime: (date: Date) => {
      buildSentinelPayload(date.getTime(), 0xff, buffer, randomView);
      return toWireIdFromBuffer(prefix, buffer);
    },
    toJsonSchema: () => {
      buildPayload(options.now(), options.rng, buffer, randomView);
      return wire.toJsonSchema(brand, toWireIdFromBuffer(prefix, buffer));
    },
    "~standard": wire["~standard"],
  };
}
