import { decodeBase32, encodeBase32 } from "./base32.js";
import type { Id, Prefix } from "../types.js";

/** Composes a canonical wire ID from a prefix and 16-byte payload. */
export function toWireId<Brand extends string>(
  prefix: Prefix<Brand>,
  payload: Uint8Array,
): Id<Brand> {
  return (prefix + encodeBase32(payload)) as Id<Brand>;
}

/** Decodes the full 16-byte payload from a trusted wire ID. Trust-the-type.
 * Input always comes from `id.slice(prefix.length)` where `id: Id<Brand>` —
 * the Id brand guarantees that safeParse() / parse() normalised any alias chars
 * at the parse boundary (is() rejects aliases rather than normalising them),
 * so every character is canonical Crockford alphabet.
 */
export function payloadBytesFromId<Brand extends string>(
  prefix: Prefix<Brand>,
  id: Id<Brand>,
): Uint8Array {
  return decodeBase32(id.slice(prefix.length));
}
