import { describe, expect, it } from "vitest";
import { isBlockingEligible } from "./compare.js";

describe("isBlockingEligible", () => {
  it("gates sync ns-scale benches (eligible)", () => {
    expect(isBlockingEligible("generate")).toBe(true);
    expect(isBlockingEligible("is(canonical)")).toBe(true);
    expect(isBlockingEligible("parse(canonical)")).toBe(true);
    expect(isBlockingEligible("safeParse(canonical)")).toBe(true);
    expect(isBlockingEligible("safeParse(lenient)")).toBe(true);
    expect(isBlockingEligible("extractTimestamp")).toBe(true);
    expect(isBlockingEligible("encodeBase32")).toBe(true);
    expect(isBlockingEligible("decodeBase32")).toBe(true);
  });

  it("gates reverse.* benches (sync inversion, same variance profile as plain Timestamp)", () => {
    expect(isBlockingEligible("reverse.generate")).toBe(true);
    expect(isBlockingEligible("reverse.extractTimestamp")).toBe(true);
  });

  it("never gates opaque.* benches (AES-CBC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("opaque.generate")).toBe(false);
    expect(isBlockingEligible("opaque.extractTimestamp")).toBe(false);
    expect(isBlockingEligible("opaque.someNewBench")).toBe(false);
  });

  it("never gates wrapped.* benches (AES + HMAC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("wrapped.wrap")).toBe(false);
    expect(isBlockingEligible("wrapped.unwrap")).toBe(false);
    expect(isBlockingEligible("wrapped.someNewBench")).toBe(false);
  });

  it("never gates signed.* benches (HMAC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("signed.generate")).toBe(false);
    expect(isBlockingEligible("signed.verify")).toBe(false);
    expect(isBlockingEligible("signed.someNewBench")).toBe(false);
  });

  it("never gates digest.* benches (HMAC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("digest.digest")).toBe(false);
    expect(isBlockingEligible("digest.someNewBench")).toBe(false);
  });
});
