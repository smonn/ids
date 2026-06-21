// Payload is always 16 bytes on the wire (every codec). 16 bytes → 26 Crockford
// base32 chars. ADR-0002 codifies this as the shared wire-format invariant.
export const payloadByteLength: number = 16;
export const payloadBase32Length: number = Math.ceil((payloadByteLength * 8) / 5);

// Compact regex character class for the canonical lowercase Crockford alphabet
// (`0123456789abcdefghjkmnpqrstvwxyz` — excludes i, l, o, u). Used in the JSON
// Schema `pattern`, which describes the canonical wire form only (ADR-0003).
export const base32CharClass: string = "[0-9a-hjkmnp-tv-z]";

// The 8 Crockford base32 characters valid as the final (26th) char of a canonical ID.
// A 16-byte (128-bit) payload encoded in 26 base32 chars (130 bits) leaves 2 surplus
// bits in the 26th char; canonical encoding sets them to zero. Only the 8 alphabet
// values whose index is divisible by 4 (i.e. low 2 bits = 00) satisfy this: indices
// 0,4,8,12,16,20,24,28 → chars '0','4','8','c','g','m','r','w'. ADR-0003 amendment.
export const base32FinalCharClass: string = "[048cgmrw]";
