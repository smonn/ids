import { describe, expect, it } from "vitest";
import { formatInspectOutput, msPerDay, msPerHour, msPerMinute } from "./format.js";
import type { Id } from "../types.js";

const nowMs = 1_000_000_000_000;
const fakeId = "tst_00000000000000000000000000" as unknown as Id<string>;

function relative(thenMs: number): string {
  return formatInspectOutput({
    brand: "tst",
    timestamp: new Date(thenMs),
    canonical: fakeId,
    uuid: "00000000-0000-0000-0000-000000000000",
    input: "tst_00000000000000000000000000",
    nowMs,
  });
}

describe("formatRelative — exact threshold boundaries", () => {
  it("diff === 0 (same millisecond): output contains 'just now'", () => {
    expect(relative(nowMs)).toContain("just now");
  });

  it("abs === msPerMinute (60 000 ms): output contains '1 minute', not 'just now'", () => {
    const out = relative(nowMs - msPerMinute);
    expect(out).toContain("1 minute");
    expect(out).not.toContain("just now");
  });

  it("abs === msPerHour (3 600 000 ms): output contains '1 hour', not '60 minutes'", () => {
    const out = relative(nowMs - msPerHour);
    expect(out).toContain("1 hour");
    expect(out).not.toContain("60 minutes");
  });

  it("abs === msPerDay (86 400 000 ms): output contains '1 day', not '24 hours'", () => {
    const out = relative(nowMs - msPerDay);
    expect(out).toContain("1 day");
    expect(out).not.toContain("24 hours");
  });
});
