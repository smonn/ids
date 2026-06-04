import { alphabet } from "./base32.js";
import type { Id, ParseError, ParseResult, Prefix } from "./types.js";

// Payload is always 16 bytes on the wire (every codec). 16 bytes → 26 Crockford
// base32 chars. ADR-0002 codifies this as the shared wire-format invariant.
export const payloadByteLength: number = 16;
export const payloadBase32Length: number = Math.ceil((payloadByteLength * 8) / 5);

// Compact regex character class for the canonical lowercase Crockford alphabet
// (`0123456789abcdefghjkmnpqrstvwxyz` — excludes i, l, o, u). Used in the JSON
// Schema `pattern`, which describes the canonical wire form only (ADR-0003).
export const base32CharClass: string = "[0-9a-hjkmnp-tv-z]";

const replacePattern = /[ilo]/g;
const aliasTestPattern = /[ilo]/;
const replacer = (match: string): string => (match === "o" ? "0" : "1");
const base32Pattern = new RegExp(`^[${alphabet}]{${payloadBase32Length}}$`);

export function safeParse<Brand extends string>(
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

export function parse<Brand extends string>(prefix: Prefix<Brand>, value: unknown): Id<Brand> {
  const result = safeParse(prefix, value);
  if (result.ok) return result.id;
  throw new Error(`Invalid ID: ${result.error}`);
}

export function is<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
): value is Id<Brand> {
  if (typeof value !== "string") return false;
  if (!value.startsWith(prefix)) return false;
  return base32Pattern.test(value.slice(prefix.length));
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

// Timestamp byte layout: first N bytes of the plaintext payload encode a
// big-endian Unix-ms timestamp. Shared by every codec whose plaintext begins
// with a timestamp (Timestamp, Opaque, Signed, Reverse). The Derived codec
// does not use this.
export const timestampByteLength: number = 6;

// Write the timestamp in big-endian; encoded via mod-256 to avoid 32-bit bitwise coercion.
export function writeTimestamp(ms: number, buffer: Uint8Array): void {
  if (Number.isNaN(ms)) throw new Error("timestamp is not a number");
  if (ms < 0) throw new Error("timestamp is negative");
  if (ms >= 2 ** (timestampByteLength * 8)) {
    throw new Error("timestamp exceeds 48-bit range");
  }
  for (let i = timestampByteLength - 1; i >= 0; i--) {
    buffer[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
}

// Decode the first `timestampByteLength` bytes of a buffer as a big-endian
// unsigned millisecond timestamp.
export function readTimestampMs(buffer: Uint8Array): number {
  let ms = 0;
  for (let i = 0; i < timestampByteLength; i++) ms = ms * 256 + buffer[i]!;
  return ms;
}

export function standardValidate<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
):
  | { readonly value: Id<Brand>; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> } {
  const result = safeParse(prefix, value);
  if (result.ok) return { value: result.id };
  return { issues: [{ message: errorMessage(prefix, result.error) }] };
}
