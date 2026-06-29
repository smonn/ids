import { describe, expect, it } from "vitest";
import { codecOpts } from "./codec-options.js";
import type { RunOpts } from "./types.js";

const base: RunOpts = { argv: [], stdout: () => {}, stderr: () => {} };

describe("codecOpts", () => {
  it("omits now/rng when absent", () => {
    expect(codecOpts(base)).toEqual({ allowDuplicateBrand: true });
  });

  it("passes through now/rng when present", () => {
    const now = () => 0;
    const rng = (t: Uint8Array) => t.fill(0);
    expect(codecOpts({ ...base, now, rng })).toEqual({ allowDuplicateBrand: true, now, rng });
  });
});
