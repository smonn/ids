import { describe, expect, it } from "vitest";
import { usage, usageGenerate, usageInspect } from "./usage.js";

describe("usage strings — vocabulary alignment (CONTEXT.md)", () => {
  it("usageInspect does not say 'AES key'", () => {
    expect(usageInspect()).not.toContain("AES key");
  });

  it("usageInspect says 'Opaque key' for the --opaque flag", () => {
    expect(usageInspect()).toContain("reads the Opaque key from IDS_OPAQUE_KEY");
  });

  it("usageGenerate does not say 'AES key'", () => {
    expect(usageGenerate()).not.toContain("AES key");
  });

  it("usageGenerate says 'Opaque key' for the --opaque flag", () => {
    expect(usageGenerate()).toContain("reads the Opaque key from IDS_OPAQUE_KEY");
  });

  it("combined usage() does not say 'AES key'", () => {
    expect(usage()).not.toContain("AES key");
  });

  it("combined usage() says 'Opaque key' for the --opaque flag (both inspect and generate blocks)", () => {
    const text = usage();
    const matches = [...text.matchAll(/reads the Opaque key from IDS_OPAQUE_KEY/g)];
    expect(matches.length).toBe(2);
  });
});
