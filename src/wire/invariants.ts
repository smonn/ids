// Payload is always 16 bytes on the wire (every codec). 16 bytes → 26 Crockford
// base32 chars. ADR-0002 codifies this as the shared wire-format invariant.
export const payloadByteLength: number = 16;
export const payloadBase32Length: number = Math.ceil((payloadByteLength * 8) / 5);

// Compact regex character class for the canonical lowercase Crockford alphabet
// (`0123456789abcdefghjkmnpqrstvwxyz` — excludes i, l, o, u). Used in the JSON
// Schema `pattern`, which describes the canonical wire form only (ADR-0003).
export const base32CharClass: string = "[0-9a-hjkmnp-tv-z]";

// The 8 alphabet values at indices divisible by 4 (low 2 bits = 00) that satisfy the
// canonical padding-bit constraint for a 130-bit encoding of 16 bytes. ADR-0003.
export const base32FinalCharClass: string = "[048cgmrw]";
