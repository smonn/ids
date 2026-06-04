import { decodeBase32, encodeBase32 } from "./base32.js";
import { registerBrand, validateBrand } from "./registry.js";
import {
  base32CharClass,
  is,
  parse,
  payloadBase32Length,
  payloadByteLength,
  readTimestampMs,
  safeParse,
  standardValidate,
  timestampByteLength,
  writeTimestamp,
} from "./shared.js";
import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "./types.js";

export type Options = {
  now: () => number;
  rng: (target: Uint8Array) => void;
  allowDuplicateBrand?: boolean;
};

export type Codec<Brand extends string> = {
  generate(): Id<Brand>;
  generateAt(date: Date): Id<Brand>;
  is(value: unknown): value is Id<Brand>;
  parse(value: unknown): Id<Brand>;
  safeParse(value: unknown): ParseResult<Brand>;
  extractTimestamp(id: Id<Brand>): Date;
  minIdForTime(date: Date): Id<Brand>;
  maxIdForTime(date: Date): Id<Brand>;
  toJsonSchema(): JsonSchema;
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

const randomByteLength = payloadByteLength - timestampByteLength;
const timestampBase32Length = Math.ceil((timestampByteLength * 8) / 5);

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
  // Per-codec scratch buffer. Shared across generate(), generateAt(),
  // minIdForTime(), and maxIdForTime() — all are synchronous and overwrite both
  // the timestamp and random slices before encoding, so successive callers see
  // their own freshly-written bytes. encodeBase32 reads the buffer and
  // returns an independent string, so the caller never sees the buffer itself.
  const buffer = new Uint8Array(payloadByteLength);
  const randomView = new Uint8Array(buffer.buffer, timestampByteLength, randomByteLength);

  return {
    generate: () => generate(prefix, options, buffer, randomView),
    generateAt: (date: Date) => generate(prefix, options, buffer, randomView, date.getTime()),
    is: (value: unknown) => is(prefix, value),
    parse: (value: unknown) => parse(prefix, value),
    safeParse: (value: unknown) => safeParse(prefix, value),
    extractTimestamp: (id: Id<Brand>) => extractTimestamp(prefix, id),
    minIdForTime: (date: Date) => sentinelIdForTime(prefix, date, 0x00, buffer, randomView),
    maxIdForTime: (date: Date) => sentinelIdForTime(prefix, date, 0xff, buffer, randomView),
    toJsonSchema: () => toJsonSchema(brand, prefix, options, buffer, randomView),
    "~standard": {
      version: 1,
      vendor: "@smonn/ids",
      validate: (value: unknown) => standardValidate(prefix, value),
    },
  };
}

function toJsonSchema<Brand extends string>(
  brand: Brand,
  prefix: Prefix<Brand>,
  options: Options,
  buffer: Uint8Array,
  randomView: Uint8Array,
): JsonSchema {
  return {
    type: "string",
    pattern: `^${prefix}${base32CharClass}{${payloadBase32Length}}$`,
    description: `Branded ID for '${brand}'`,
    example: generate(prefix, options, buffer, randomView),
  };
}

function generate<Brand extends string>(
  prefix: Prefix<Brand>,
  options: Options,
  buffer: Uint8Array,
  randomView: Uint8Array,
  ms: number = options.now(),
): Id<Brand> {
  writeTimestamp(ms, buffer);
  options.rng(randomView);
  return (prefix + encodeBase32(buffer)) as Id<Brand>;
}

function sentinelIdForTime<Brand extends string>(
  prefix: Prefix<Brand>,
  date: Date,
  fill: number,
  buffer: Uint8Array,
  randomView: Uint8Array,
): Id<Brand> {
  writeTimestamp(date.getTime(), buffer);
  randomView.fill(fill);
  return (prefix + encodeBase32(buffer)) as Id<Brand>;
}

function extractTimestamp<Brand extends string>(prefix: Prefix<Brand>, id: Id<Brand>): Date {
  const base32 = id.slice(prefix.length, prefix.length + timestampBase32Length);
  return new Date(readTimestampMs(decodeBase32(base32)));
}
