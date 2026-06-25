import { describe, expect, it } from "vitest";
import { formatInspectOutput, msPerDay, msPerHour, msPerMinute } from "./format.js";

function relativeLabel(diffMs: number): string {
  const out = formatInspectOutput({
    brand: "tst",
    timestamp: new Date(0),
    canonical: "tst_00000000000000000000000000" as any,
    input: "tst_00000000000000000000000000",
    nowMs: diffMs,
  });
  const match = /\((.+?)\)/.exec(out);
  return match?.[1] ?? "";
}

describe("exact threshold boundaries", () => {
  it("1 ms below msPerMinute → just now", () => {
    expect(relativeLabel(msPerMinute - 1)).toBe("just now");
  });

  it("exactly msPerMinute → 1 minute ago", () => {
    expect(relativeLabel(msPerMinute)).toBe("1 minute ago");
  });

  it("exactly msPerHour → 1 hour ago", () => {
    expect(relativeLabel(msPerHour)).toBe("1 hour ago");
  });

  it("exactly msPerDay → 1 day ago", () => {
    expect(relativeLabel(msPerDay)).toBe("1 day ago");
  });
});
