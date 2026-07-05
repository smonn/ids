import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Fork posture of the docs-coverage gate (issue #983): the mapping and
// enforcement steps are read-only and must run on fork PRs; only the
// sticky-comment step needs write permissions and is skipped for forks.
// These tests pin that posture so a future edit can't silently reopen the
// "gate skipped for the least-trusted population" hole.

const workflowPath = fileURLToPath(new URL("../workflows/docs-coverage.yml", import.meta.url));
const workflow = parse(readFileSync(workflowPath, "utf8"));
const job = workflow.jobs["docs-coverage"];

describe("docs-coverage fork posture", () => {
  it("runs the job on fork PRs (no job-level fork guard)", () => {
    expect(job.if).toBeUndefined();
  });

  it("skips only the comment step on fork PRs (same-repo step guard)", () => {
    const comment = job.steps.find((s) => /comment/i.test(s.name ?? ""));
    expect(comment).toBeDefined();
    expect(comment.if).toMatch(
      /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/,
    );
  });

  it("keeps every non-comment step unguarded so mapping and enforcement run on forks", () => {
    const others = job.steps.filter((s) => !/comment/i.test(s.name ?? ""));
    expect(others.length).toBeGreaterThan(0);
    for (const step of others) {
      expect(step.if, `step "${step.name ?? step.uses}" must run on forks`).toBeUndefined();
    }
  });

  it("publishes the gap report to the job summary from an unguarded step", () => {
    const summary = job.steps.find((s) => (s.run ?? "").includes("GITHUB_STEP_SUMMARY"));
    expect(summary, "no step writes to $GITHUB_STEP_SUMMARY").toBeDefined();
    expect(summary.if, "the summary step must also run on fork PRs").toBeUndefined();
  });
});
