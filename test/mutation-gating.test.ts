import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
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

const workflowPath = fileURLToPath(new URL("../.github/workflows/mutation.yml", import.meta.url));

function readWorkflowTriggers(): string[] {
  const content = readFileSync(workflowPath, "utf8");
  const doc = parse(content) as { on?: Record<string, unknown> };
  return Object.keys(doc.on ?? {}).sort();
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

  it("mutation workflow stays non-PR-blocking: trigger keys are exactly schedule and workflow_dispatch (ADR-0037)", () => {
    const triggers = readWorkflowTriggers();
    expect(
      triggers,
      "ADR-0037 records that mutation testing is weekly and non-PR-blocking. " +
        "Adding 'pull_request' or any other trigger would silently reverse that decision. " +
        "See docs/adr/0037-mutation-score-gating.md.",
    ).toEqual(["schedule", "workflow_dispatch"].sort());
  });
});
