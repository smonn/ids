/** Default RNG: writes cryptographically random bytes via `crypto.getRandomValues`. */
export function defaultRng(target: Uint8Array): void {
  crypto.getRandomValues(target as Uint8Array<ArrayBuffer>);
}
