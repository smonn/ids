import { IdsError } from "../error.js";
import type { Id, ParseResult, Prefix } from "../types.js";
import { payloadBytesFromId, toWireId } from "./envelope.js";

// Byte value → 2-char lowercase hex string, e.g. 0x0a → "0a".
const byteToHex = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

// Hex char code → nibble value (0–15). Initialised for both cases; 0xff = invalid sentinel.
const hexNibble = new Uint8Array(256).fill(0xff);
for (let i = 0; i <= 9; i++) hexNibble["0".charCodeAt(0) + i] = i;
for (let i = 0; i <= 5; i++) hexNibble["a".charCodeAt(0) + i] = 10 + i;
for (let i = 0; i <= 5; i++) hexNibble["A".charCodeAt(0) + i] = 10 + i;

const hexOffsets = [0, 2, 4, 6, 9, 11, 14, 16, 19, 21, 24, 26, 28, 30, 32, 34] as const;

// RFC 9562 canonical form: 8-4-4-4-12 hyphenated hex, case-insensitive.
// Rejects braces, urn:uuid: prefix, and hyphenless 32-char forms.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bytesToUuidString(b: Uint8Array): string {
  return (
    byteToHex[b[0]!]! +
    byteToHex[b[1]!]! +
    byteToHex[b[2]!]! +
    byteToHex[b[3]!]! +
    "-" +
    byteToHex[b[4]!]! +
    byteToHex[b[5]!]! +
    "-" +
    byteToHex[b[6]!]! +
    byteToHex[b[7]!]! +
    "-" +
    byteToHex[b[8]!]! +
    byteToHex[b[9]!]! +
    "-" +
    byteToHex[b[10]!]! +
    byteToHex[b[11]!]! +
    byteToHex[b[12]!]! +
    byteToHex[b[13]!]! +
    byteToHex[b[14]!]! +
    byteToHex[b[15]!]!
  );
}

function uuidStringToBytes(uuid: string): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const off = hexOffsets[i]!;
    bytes[i] = (hexNibble[uuid.charCodeAt(off)]! << 4) | hexNibble[uuid.charCodeAt(off + 1)]!;
  }
  return bytes;
}

/**
 * Converts a trusted `Id<Brand>` to an RFC 9562 canonical (lowercase, hyphenated)
 * UUID string by reinterpreting the 16-byte payload verbatim as 128 bits.
 * Total (cannot fail). Returns a plain `string` — the brand is shed.
 * The output is raw/unversioned: all 128 bits are payload data.
 */
export function toUUID<Brand extends string>(prefix: Prefix<Brand>, id: Id<Brand>): string {
  return bytesToUuidString(payloadBytesFromId(prefix, id));
}

/**
 * Parses a UUID string and returns a `ParseResult<Brand>`.
 * Accepts case-insensitive `8-4-4-4-12` hyphenated form only.
 * Returns `{ ok: false, error: "not_string" }` for non-string input,
 * `{ ok: false, error: "invalid_uuid" }` for malformed UUID strings,
 * or `{ ok: true, id }` on success. Never throws.
 */
export function safeFromUUID<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
): ParseResult<Brand> {
  if (typeof value !== "string") return { ok: false, error: "not_string" };
  if (!uuidPattern.test(value)) return { ok: false, error: "invalid_uuid" };
  const bytes = uuidStringToBytes(value);
  return { ok: true, id: toWireId(prefix, bytes) };
}

/**
 * Parses a UUID string and returns an `Id<Brand>`.
 * Accepts case-insensitive `8-4-4-4-12` hyphenated form only.
 * Throws `IdsError` with `code: "invalid_id"` and the `ParseError` on `cause` for bad input.
 */
export function fromUUID<Brand extends string>(prefix: Prefix<Brand>, value: string): Id<Brand> {
  const result = safeFromUUID(prefix, value);
  if (result.ok) return result.id;
  throw new IdsError("invalid_id", `invalid UUID: ${result.error}`, {
    cause: result.error,
  });
}
