import { describe, expect, it } from "vitest";
import {
  decodeSigningKey,
  encodeSigningKey,
  importSigningKey,
  IdsError,
  isIdsError,
  type SigningKey,
  type SigningKeyFormat,
  type IdsErrorCode,
} from "./signed.js";

describe("@smonn/ids/signed re-exports", () => {
  it("exports importSigningKey as a function", () => {
    expect(typeof importSigningKey).toBe("function");
  });

  it("exports encodeSigningKey as a function", () => {
    expect(typeof encodeSigningKey).toBe("function");
  });

  it("exports decodeSigningKey as a function", () => {
    expect(typeof decodeSigningKey).toBe("function");
  });

  it("exports IdsError class", () => {
    expect(typeof IdsError).toBe("function");
    const err = new IdsError("invalid_key_length", "test");
    expect(err).toBeInstanceOf(IdsError);
  });

  it("exports isIdsError guard", () => {
    expect(typeof isIdsError).toBe("function");
    const err = new IdsError("empty_keyring", "test");
    expect(isIdsError(err)).toBe(true);
  });

  it("SigningKeyFormat type covers hex and base64url", () => {
    const formats: SigningKeyFormat[] = ["hex", "base64url"];
    expect(formats).toHaveLength(2);
  });

  it("IdsErrorCode includes signing-key-relevant codes", () => {
    const codes: IdsErrorCode[] = [
      "invalid_key_format",
      "invalid_key_encoding",
      "invalid_key_length",
      "empty_keyring",
      "duplicate_keyring_entry",
    ];
    expect(codes).toHaveLength(5);
  });

  it("key helpers work end-to-end via the signed subpath", async () => {
    const raw = new Uint8Array(32).fill(0x42);
    const encoded = encodeSigningKey(raw, "hex");
    const decoded = decodeSigningKey(encoded, "hex");
    const key: SigningKey = await importSigningKey(decoded);
    expect(key).toBeDefined();
  });
});
