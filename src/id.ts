import { alphabet, decodeBase32, encodeBase32 } from "./base32.js";
import { invariant } from "./invariant.js";

export type Options = {
  now: () => Date;
  rng: (bytes: number) => Uint8Array;
};

export const defaultOptions: Options = {
  now: () => new Date(),
  rng: (bytes: number) => crypto.getRandomValues(new Uint8Array(bytes)),
};

export type Prefix<Brand extends string> = `${Brand}_`;

export type Id<Brand extends string> = `${Prefix<Brand>}${string}` & {
  readonly __brand: Brand;
};

export type Result<T, E> = { success: true; data: T } | { success: false; error: E };

export type ParseError = "not_string" | "invalid_prefix" | "invalid_base32";

function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

export type Codec<Brand extends string> = {
  generate(): Id<Brand>;
  is(value: unknown): value is Id<Brand>;
  parse(value: unknown): Id<Brand>;
  safeParse(value: unknown): Result<Id<Brand>, ParseError>;
  extractTimestamp(id: Id<Brand>): Date;
};

const timestampByteLength = 6;
const randomByteLength = 10;
const totalByteLength = timestampByteLength + randomByteLength;
const base32Length = Math.ceil((totalByteLength * 8) / 5);
const replacePattern = /[ilo]/gi;
const replaceMap = { o: "0", i: "1", l: "1" } as const;
const replacer = (match: string) => {
  invariant(match === "o" || match === "i" || match === "l", "invalid match");
  return replaceMap[match];
};

const base32Pattern = new RegExp(`^[${alphabet}]{${base32Length}}$`);
const brandPattern = /^[a-z]{3}$/;

export function createId<Brand extends string>(
  brand: Brand,
  opts: Partial<Options> = {},
): Codec<Brand> {
  invariant(brandPattern.test(brand), "invalid brand, expected three lowercase a-z characters");

  const options = {
    ...defaultOptions,
    ...opts,
  } satisfies Options;

  const prefix: Prefix<Brand> = `${brand}_`;

  return {
    generate: () => generate(prefix, options),
    is: (value: unknown) => is(prefix, value),
    parse: (value: unknown) => parse(prefix, value),
    safeParse: (value: unknown) => safeParse(prefix, value),
    extractTimestamp: (id: Id<Brand>) => extractTimestamp(prefix, id),
  };
}

function safeParse<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
): Result<Id<Brand>, ParseError> {
  if (typeof value !== "string") return err("not_string");
  const lowercase = value.toLowerCase();
  if (!lowercase.startsWith(prefix)) return err("invalid_prefix");

  const base32 = lowercase.slice(prefix.length).replaceAll(replacePattern, replacer);

  if (!base32Pattern.test(base32)) return err("invalid_base32");

  const id = (prefix + base32) as Id<Brand>;
  return ok(id);
}

function parse<Brand extends string>(prefix: Prefix<Brand>, value: unknown): Id<Brand> {
  const result = safeParse(prefix, value);
  if (result.success) return result.data;
  throw new Error(`Invalid ID: ${result.error}`);
}

function is<Brand extends string>(prefix: Prefix<Brand>, value: unknown): value is Id<Brand> {
  return safeParse(prefix, value).success;
}

function encodeNumberToUint8Array(value: number, bytes: number): Uint8Array {
  invariant(value >= 0, "value is negative");
  invariant(value < 2 ** (bytes * 8), `value exceeds ${bytes * 8}-bit range`);
  const result = new Uint8Array(bytes);
  // iterate backwards to encode in big-endian
  for (let i = bytes - 1; i >= 0; i--) {
    // we encode via 256 as bitwise ops will coerce to 32-bit integers
    result[i] = value % 256;
    value = Math.floor(value / 256);
  }
  return result;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function generate<Brand extends string>(prefix: Prefix<Brand>, options: Options): Id<Brand> {
  const timestamp = encodeNumberToUint8Array(options.now().getTime(), timestampByteLength);
  const rand = options.rng(randomByteLength);
  return (prefix + encodeBase32(concat(timestamp, rand))) as Id<Brand>;
}

function extractTimestamp<Brand extends string>(prefix: Prefix<Brand>, id: Id<Brand>): Date {
  const base32 = id.slice(prefix.length);
  const bytes = decodeBase32(base32);
  const timestampBytes = bytes.subarray(0, timestampByteLength);
  let ms = 0;
  for (const byte of timestampBytes) {
    ms = ms * 256 + byte;
  }
  return new Date(ms);
}
