/* oxlint-disable no-control-regex -- intentional: strip C0/DEL/C1/bidi/format before echoing */
const STRIP_RE =
  /[\u0000-\u001f\u007f\u0080-\u009f\u200b-\u200f\u2028-\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g;
/* oxlint-enable no-control-regex */

/** Strip control, bidi, and format chars without truncating. For path diagnostics where truncation hurts. */
export function stripToken(s: string): string {
  return s.replace(STRIP_RE, "");
}

/**
 * Strip control chars and truncate to 20 Unicode code points with a trailing ….
 * Operates on code points (not UTF-16 code units) so truncation never emits a lone surrogate.
 */
export function redactToken(token: string): string {
  const stripped = stripToken(token);
  const codePoints = [...stripped];
  // Deliberate: truncate-not-mask — no-verbatim-echo posture; a secret-length token is cut to a non-functional prefix, never starred out. See CONTEXT.md postures.
  return codePoints.length > 20 ? `${codePoints.slice(0, 20).join("")}…` : stripped;
}
