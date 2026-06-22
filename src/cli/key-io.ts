export type KeyFormat = "hex" | "base64url";

export function isKeyFormatError(result: KeyFormat | string): result is string {
  return result !== "hex" && result !== "base64url";
}
