import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  STEP_GATED_EXEMPTIONS,
  findLabelTriggerViolations,
  labelNameComparisons,
  listensOnLabeled,
  loadWorkflows,
} from "./label-trigger-lint.mjs";

// Build a { name, text, doc } workflow record from a YAML string, the shape
// findLabelTriggerViolations consumes.
function wf(name, yaml) {
  return { name, text: yaml, doc: parse(yaml) };
}

describe("listensOnLabeled", () => {
  it("detects `labeled` across issues / pull_request / pull_request_target", () => {
    expect(listensOnLabeled(parse("on:\n  issues:\n    types: [opened, labeled]\n"))).toBe(true);
    expect(listensOnLabeled(parse("on:\n  pull_request:\n    types: [labeled]\n"))).toBe(true);
    expect(listensOnLabeled(parse("on:\n  pull_request_target:\n    types: [labeled]\n"))).toBe(
      true,
    );
  });

  it("is false when no event lists the `labeled` type", () => {
    expect(
      listensOnLabeled(parse("on:\n  pull_request:\n    types: [opened, synchronize]\n")),
    ).toBe(false);
    expect(listensOnLabeled(parse("on:\n  push:\n    branches: [main]\n"))).toBe(false);
    expect(listensOnLabeled(parse("on: workflow_dispatch\n"))).toBe(false);
  });
});

describe("labelNameComparisons", () => {
  it("extracts single- and double-quoted label comparisons", () => {
    expect(labelNameComparisons("github.event.label.name == 'do:review'")).toEqual(["do:review"]);
    expect(labelNameComparisons('github.event.label.name == "do:triage"')).toEqual(["do:triage"]);
  });

  it("extracts every comparison in a compound expression", () => {
    const expr =
      "github.event.action == 'labeled' && (github.event.label.name == 'needs-triage' || github.event.label.name == 'do:triage')";
    expect(labelNameComparisons(expr)).toEqual(["needs-triage", "do:triage"]);
  });

  it("returns [] for a non-string or label-free expression", () => {
    expect(labelNameComparisons(undefined)).toEqual([]);
    expect(labelNameComparisons("github.event_name == 'workflow_dispatch'")).toEqual([]);
  });
});

describe("findLabelTriggerViolations", () => {
  it("passes a job gated only on a do:* label", () => {
    const clean = wf(
      "implement.yml",
      "on:\n  issues:\n    types: [labeled]\njobs:\n  implement:\n    if: github.event.label.name == 'do:implement'\n",
    );
    expect(findLabelTriggerViolations([clean])).toEqual([]);
  });

  it("flags a status label used as a trigger", () => {
    const bad = wf(
      "implement.yml",
      "on:\n  issues:\n    types: [labeled]\njobs:\n  implement:\n    if: github.event.label.name == 'ready-for-agent' || github.event.label.name == 'do:implement'\n",
    );
    const violations = findLabelTriggerViolations([bad]);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain("ready-for-agent");
  });

  it("flags a labeled-listening workflow whose job has no do:* filter", () => {
    const unguarded = wf(
      "loose.yml",
      "on:\n  issues:\n    types: [labeled]\njobs:\n  run:\n    if: github.event_name == 'issues'\n",
    );
    const violations = findLabelTriggerViolations([unguarded]);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain("unguarded");
  });

  it("flags a second top-level job that lacks a do:* filter (per-job, not per-workflow)", () => {
    const multi = wf(
      "two-jobs.yml",
      [
        "on:",
        "  pull_request:",
        "    types: [labeled]",
        "jobs:",
        "  gated:",
        "    if: github.event.label.name == 'do:review'",
        "  ungated:",
        "    if: github.event_name == 'pull_request'",
        "",
      ].join("\n"),
    );
    const violations = findLabelTriggerViolations([multi]);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain("ungated");
    expect(violations[0].reason).toContain("unguarded");
  });

  it("does not flag a needs:-chained job that has no do:* filter", () => {
    const chained = wf(
      "chained.yml",
      [
        "on:",
        "  pull_request:",
        "    types: [labeled]",
        "jobs:",
        "  gated:",
        "    if: github.event.label.name == 'do:review'",
        "  followup:",
        "    needs: gated",
        "    if: success()",
        "",
      ].join("\n"),
    );
    expect(findLabelTriggerViolations([chained])).toEqual([]);
  });

  it("ignores workflows that do not listen on `labeled`", () => {
    const pushOnly = wf(
      "ci.yml",
      "on:\n  push:\n    branches: [main]\njobs:\n  ci:\n    if: github.event.label.name == 'anything'\n",
    );
    expect(findLabelTriggerViolations([pushOnly])).toEqual([]);
  });

  it("exempts a step-gated workflow that still references a do:* label", () => {
    const review = wf(
      "review.yml",
      "on:\n  pull_request:\n    types: [opened, labeled]\njobs:\n  review:\n    steps:\n      - run: '[ \"$LABEL\" = do:review ]'\n",
    );
    expect(findLabelTriggerViolations([review])).toEqual([]);
  });

  it("flags a step-gated exemption that no longer gates on any do:* label", () => {
    const stale = wf(
      "review.yml",
      "on:\n  pull_request:\n    types: [opened, labeled]\njobs:\n  review:\n    steps:\n      - run: 'echo hi'\n",
    );
    const violations = findLabelTriggerViolations([stale]);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain("in-step gate is missing");
  });
});

describe("the real .github/workflows tree", () => {
  const dir = fileURLToPath(new URL("../workflows", import.meta.url));
  const workflows = loadWorkflows(dir);

  it("upholds the no-status-triggers invariant (ADR-0030)", () => {
    expect(findLabelTriggerViolations(workflows)).toEqual([]);
  });

  it("keeps every step-gated exemption live (listens on labeled, gates on do:*)", () => {
    for (const name of STEP_GATED_EXEMPTIONS) {
      const workflow = workflows.find((w) => w.name === name);
      expect(workflow, `exempted workflow ${name} must exist`).toBeDefined();
      expect(listensOnLabeled(workflow.doc), `${name} must listen on \`labeled\``).toBe(true);
      expect(/\bdo:[a-z]+/.test(workflow.text), `${name} must gate on a do:* label`).toBe(true);
    }
  });
});
