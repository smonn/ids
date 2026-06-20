import { describe, expect, it } from "vitest";
import { failThreshold } from "./compare.js";

describe("failThreshold", () => {
  it("returns 0.30 for ns-scale benches", () => {
    expect(failThreshold("generate")).toBe(0.3);
    expect(failThreshold("is(canonical)")).toBe(0.3);
    expect(failThreshold("parse(canonical)")).toBe(0.3);
    expect(failThreshold("safeParse(canonical)")).toBe(0.3);
    expect(failThreshold("safeParse(lenient)")).toBe(0.3);
    expect(failThreshold("extractTimestamp")).toBe(0.3);
    expect(failThreshold("encodeBase32")).toBe(0.3);
    expect(failThreshold("decodeBase32")).toBe(0.3);
  });

  it("returns 0.50 for opaque.* benches (AES-CBC async crypto, high CI runner variance)", () => {
    expect(failThreshold("opaque.generate")).toBe(0.5);
    expect(failThreshold("opaque.extractTimestamp")).toBe(0.5);
  });

  it("treats any future opaque.* bench as high-threshold", () => {
    expect(failThreshold("opaque.someNewBench")).toBe(0.5);
  });
});
