import { describe, expect, it } from "vitest";
import { sharedCodecOpts } from "./codec-options.js";
import type { RunOpts } from "./types.js";

const base: RunOpts = { argv: [], stdout: () => {}, stderr: () => {} };

describe("sharedCodecOpts", () => {
  it("omits now/rng when absent", () => {
    expect(sharedCodecOpts(base)).toEqual({ allowDuplicateBrand: true });
  });

  it("passes through now/rng when present", () => {
    const now = () => 0;
    const rng = (t: Uint8Array) => t.fill(0);
    expect(sharedCodecOpts({ ...base, now, rng })).toEqual({ allowDuplicateBrand: true, now, rng });
  });
});
