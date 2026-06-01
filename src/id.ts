import { alphabet, decodeBase32, encodeBase32 } from "./base32.js";

export type Options = {
  now: () => number;
  rng: (target: Uint8Array) => void;
};

const defaultOptions: Options = {
  now: Date.now,
  rng: (target) => {
    crypto.getRandomValues(target as Uint8Array<ArrayBuffer>);
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

export type Codec<Brand extends string> = {
  generate(): Id<Brand>;
  is(value: unknown): value is Id<Brand>;
  parse(value: unknown): Id<Brand>;
  safeParse(value: unknown): ParseResult<Brand>;
  extractTimestamp(id: Id<Brand>): Date;
};

const timestampByteLength = 6;
const randomByteLength = 10;
const totalByteLength = timestampByteLength + randomByteLength;
const base32Length = Math.ceil((totalByteLength * 8) / 5);
const timestampBase32Length = Math.ceil((timestampByteLength * 8) / 5);
const replacePattern = /[ilo]/g;
const aliasTestPattern = /[ilo]/;
const replaceMap = { o: "0", i: "1", l: "1" } as const;
const replacer = (match: string): string => {
  if (match !== "o" && match !== "i" && match !== "l") throw new Error("invalid match");
  return replaceMap[match];
};

const base32Pattern = new RegExp(`^[${alphabet}]{${base32Length}}$`);
const brandPattern = /^[a-z]{3}$/;

export function createId<Brand extends string>(
  brand: Brand,
  opts: Partial<Options> = {},
): Codec<Brand> {
  if (!brandPattern.test(brand)) {
    throw new Error("invalid brand, expected three lowercase a-z characters");
  }

  const options = {
    ...defaultOptions,
    ...opts,
  } satisfies Options;

  const prefix: Prefix<Brand> = `${brand}_`;
  // Per-codec scratch buffer. Reused across generate() calls — generate is
  // synchronous, so successive callers see the buffer overwritten, not the
  // previous result. encodeBase32 reads the buffer and returns an independent
  // string, so the caller never sees the buffer itself.
  const buffer = new Uint8Array(totalByteLength);
  const randomView = new Uint8Array(buffer.buffer, timestampByteLength, randomByteLength);

  return {
    generate: () => generate(prefix, options, buffer, randomView),
    is: (value: unknown) => is(prefix, value),
    parse: (value: unknown) => parse(prefix, value),
    safeParse: (value: unknown) => safeParse(prefix, value),
    extractTimestamp: (id: Id<Brand>) => extractTimestamp(prefix, id),
  };
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

function generate<Brand extends string>(
  prefix: Prefix<Brand>,
  options: Options,
  buffer: Uint8Array,
  randomView: Uint8Array,
): Id<Brand> {
  let ms = options.now();
  if (ms < 0) throw new Error("timestamp is negative");
  if (ms >= 2 ** (timestampByteLength * 8)) throw new Error("timestamp exceeds 48-bit range");
  // write the timestamp in big-endian; encoded via mod-256 to avoid 32-bit bitwise coercion
  for (let i = timestampByteLength - 1; i >= 0; i--) {
    buffer[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  options.rng(randomView);
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
