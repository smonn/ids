import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Gating posture decided in issue #1003 / ADR-0037: the weekly Stryker run
// fails on mutation-score collapse via thresholds.break. This test keeps the
// gate itself from regressing — removing or lowering the floor is a red PR
// check, not a silent edit. Floor derivation: 2026-07-05 baseline 86.93,
// minus a ~5-point noise buffer, floored to a multiple of 5.
const BREAK_FLOOR = 80;

const configPath = fileURLToPath(new URL("../stryker.config.json", import.meta.url));

type StrykerThresholds = { high?: number; low?: number; break?: number | null };

function readThresholds(): StrykerThresholds {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    thresholds?: StrykerThresholds;
  };
  return config.thresholds ?? {};
}

describe("mutation-score gating (ADR-0037)", () => {
  it("weekly run fails on score collapse: thresholds.break is at or above the agreed floor", () => {
    const { break: breakThreshold } = readThresholds();
    expect(breakThreshold).toBeTypeOf("number");
    expect(breakThreshold).toBeGreaterThanOrEqual(BREAK_FLOOR);
  });

  it("report grading is coherent: red = failing (low === break), green = at baseline (break <= low <= high <= 100)", () => {
    const { high, low, break: breakThreshold } = readThresholds();
    expect(high).toBeTypeOf("number");
    expect(low).toBeTypeOf("number");
    expect(low).toBe(breakThreshold);
    expect(high).toBeGreaterThanOrEqual(low as number);
    expect(high).toBeLessThanOrEqual(100);
  });
});
