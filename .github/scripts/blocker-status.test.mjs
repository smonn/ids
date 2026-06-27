import { describe, expect, it } from "vitest";
import { blockerStatus } from "./blocker-status.mjs";

describe("blockerStatus — resolution", () => {
  it("treats both CLOSED and MERGED as resolved", () => {
    const result = blockerStatus([
      { number: 1, state: "CLOSED" },
      { number: 2, state: "MERGED" },
    ]);
    expect(result.anyOpen).toBe(false);
    expect(result.open).toEqual([]);
  });

  it("treats OPEN and any unrecognised state (UNKNOWN) as still open", () => {
    const result = blockerStatus([
      { number: 1, state: "OPEN" },
      { number: 2, state: "CLOSED" },
      { number: 3, state: "UNKNOWN" },
    ]);
    expect(result.anyOpen).toBe(true);
    expect(result.open).toEqual([1, 3]);
    expect(result.resolved).toEqual([2]);
  });

  it("is vacuously resolved for no blockers", () => {
    const result = blockerStatus([]);
    expect(result.anyOpen).toBe(false);
    expect(result.open).toEqual([]);
    expect(blockerStatus().anyOpen).toBe(false);
  });
});

describe("blockerStatus — openList formatting", () => {
  it("formats open blockers as a #-prefixed, comma-joined list in input order", () => {
    const result = blockerStatus([
      { number: 7, state: "OPEN" },
      { number: 4, state: "CLOSED" },
      { number: 9, state: "UNKNOWN" },
    ]);
    expect(result.openList).toBe("#7, #9");
  });

  it("is an empty string when nothing is open", () => {
    expect(blockerStatus([{ number: 1, state: "MERGED" }]).openList).toBe("");
    expect(blockerStatus([]).openList).toBe("");
  });
});
