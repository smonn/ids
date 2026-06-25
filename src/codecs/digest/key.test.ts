import { describe, expect, it } from "vitest";
import { isIdsError } from "../../error.js";
import { getDigestKeyHmacKey, importDigestKey, type DigestKey } from "./key.js";

describe("getDigestKeyHmacKey", () => {
  it("getDigestKeyHmacKey throws on an unregistered handle (internal guard — plain Error)", () => {
    const fake = Object.freeze({}) as DigestKey;
    let err: unknown;
    try {
      getDigestKeyHmacKey(fake);
    } catch (e) {
      err = e;
    }
    // WeakMap handle-not-found is an internal invariant — stays plain Error, not IdsError
    expect(err instanceof Error).toBe(true);
    expect(isIdsError(err)).toBe(false);
  });

  it("getDigestKeyHmacKey returns the CryptoKey for a valid handle", async () => {
    const key: DigestKey = await importDigestKey(new Uint8Array(32).fill(0x42));
    const cryptoKey = getDigestKeyHmacKey(key);
    expect(cryptoKey).toBeDefined();
  });
});
