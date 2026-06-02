import { alphabet, decodeBase32, encodeBase32 } from "./base32.js";

export type Options = {
  now: () => number;
  rng: (target: Uint8Array) => void;
  allowDuplicateBrand?: boolean;
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

type Prefix<Brand extends string> = `${Brand}_`;

export type Id<Brand extends string> = `${Prefix<Brand>}${string}` & {
  readonly __brand: Brand;
};

export type ParseError = "not_string" | "invalid_prefix" | "invalid_base32";

export type ParseResult<Brand extends string> =
  | { ok: true; id: Id<Brand> }
  | { ok: false; error: ParseError };

type StandardSchemaProps<Brand extends string> = {
  readonly version: 1;
  readonly vendor: "@smonn/ids";
  readonly validate: (
    value: unknown,
    options?: { readonly libraryOptions?: Record<string, unknown> | undefined },
  ) =>
    | { readonly value: Id<Brand>; readonly issues?: undefined }
    | { readonly issues: ReadonlyArray<{ readonly message: string }> };
  readonly types?: { readonly input: unknown; readonly output: Id<Brand> };
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
  readonly "~standard": StandardSchemaProps<Brand>;
};

const timestampByteLength = 6;
const randomByteLength = 10;
const totalByteLength = timestampByteLength + randomByteLength;
const base32Length = Math.ceil((totalByteLength * 8) / 5);
const timestampBase32Length = Math.ceil((timestampByteLength * 8) / 5);
const replacePattern = /[ilo]/g;
const aliasTestPattern = /[ilo]/;
const replacer = (match: string): string => (match === "o" ? "0" : "1");

const base32Pattern = new RegExp(`^[${alphabet}]{${base32Length}}$`);
const brandPattern = /^[a-z]{3}$/;

const registeredBrands = new Set<string>();
const warnedBrands = new Set<string>();

export function createId<Brand extends string>(
  brand: Brand,
  opts: Partial<Options> = {},
): Codec<Brand> {
  if (!brandPattern.test(brand)) {
    throw new Error("invalid brand, expected three lowercase a-z characters");
  }

  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    !opts.allowDuplicateBrand
  ) {
    if (registeredBrands.has(brand)) {
      if (!warnedBrands.has(brand)) {
        console.warn(
          `[@smonn/ids] createId("${brand}") called more than once — this usually indicates a bundling or import bug. Pass { allowDuplicateBrand: true } to silence.`,
        );
        warnedBrands.add(brand);
      }
    } else {
      registeredBrands.add(brand);
    }
  }

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
  const buffer = new Uint8Array(totalByteLength);
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
    "~standard": {
      version: 1,
      vendor: "@smonn/ids",
      validate: (value: unknown) => standardValidate(prefix, value),
    },
  };
}

function standardValidate<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
):
  | { readonly value: Id<Brand>; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> } {
  const result = safeParse(prefix, value);
  if (result.ok) return { value: result.id };
  return { issues: [{ message: errorMessage(prefix, result.error) }] };
}

function errorMessage<Brand extends string>(prefix: Prefix<Brand>, error: ParseError): string {
  switch (error) {
    case "not_string":
      return "expected string";
    case "invalid_prefix":
      return `expected prefix '${prefix}'`;
    case "invalid_base32":
      return "invalid base32 payload";
  }
}

function safeParse<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
): ParseResult<Brand> {
  if (typeof value !== "string") return { ok: false, error: "not_string" };
  const lowercase = value.toLowerCase();
  if (!lowercase.startsWith(prefix)) return { ok: false, error: "invalid_prefix" };

  const sliced = lowercase.slice(prefix.length);
  const base32 = aliasTestPattern.test(sliced)
    ? sliced.replaceAll(replacePattern, replacer)
    : sliced;

  if (!base32Pattern.test(base32)) return { ok: false, error: "invalid_base32" };

  const id = (prefix + base32) as Id<Brand>;
  return { ok: true, id };
}

function parse<Brand extends string>(prefix: Prefix<Brand>, value: unknown): Id<Brand> {
  const result = safeParse(prefix, value);
  if (result.ok) return result.id;
  throw new Error(`Invalid ID: ${result.error}`);
}

function is<Brand extends string>(prefix: Prefix<Brand>, value: unknown): value is Id<Brand> {
  if (typeof value !== "string") return false;
  if (!value.startsWith(prefix)) return false;
  return base32Pattern.test(value.slice(prefix.length));
}

// write the timestamp in big-endian; encoded via mod-256 to avoid 32-bit bitwise coercion
function writeTimestamp(ms: number, buffer: Uint8Array): void {
  if (Number.isNaN(ms)) throw new Error("timestamp is not a number");
  if (ms < 0) throw new Error("timestamp is negative");
  if (ms >= 2 ** (timestampByteLength * 8)) throw new Error("timestamp exceeds 48-bit range");
  for (let i = timestampByteLength - 1; i >= 0; i--) {
    buffer[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
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
  const bytes = decodeBase32(base32);
  let ms = 0;
  for (const byte of bytes) {
    ms = ms * 256 + byte;
  }
  return new Date(ms);
}
