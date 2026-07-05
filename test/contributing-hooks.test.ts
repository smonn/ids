import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function extractHookSteps(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("#");
    })
    .map((line) => {
      const trimmed = line.trim();
      // node .github/scripts/label-trigger-lint.mjs → label-trigger-lint
      const nodeStep = /^node\s+\S+\/([^/\s]+)\.mjs$/.exec(trimmed)?.[1];
      if (nodeStep !== undefined) return nodeStep;
      // pnpm run knip → knip
      const pnpmStep = /^pnpm run (\S+)$/.exec(trimmed)?.[1];
      if (pnpmStep !== undefined) return pnpmStep;
      throw new Error(`unrecognised hook line: ${trimmed}`);
    });
}

function extractDocSteps(content: string): string[] {
  // Locates: "A Husky pre-push hook runs … (`step-a`, `step-b`, …)"
  const match = /A Husky pre-push hook runs[^(]*\(([^)]+)\)/.exec(content);
  if (!match || !match[1]) {
    throw new Error(
      "Could not find the pre-push step list in CONTRIBUTING.md — expected a sentence matching: A Husky pre-push hook runs … (`step`, …)",
    );
  }
  const list: string = match[1];
  const steps: string[] = [];
  for (const m of list.matchAll(/`([^`]+)`/g)) {
    const step = m[1];
    if (step !== undefined) steps.push(step);
  }
  return steps;
}

const hookSteps = extractHookSteps(read("../.husky/pre-push"));
const docSteps = extractDocSteps(read("../CONTRIBUTING.md"));

describe("CONTRIBUTING.md — pre-push hook sync", () => {
  it("hook step list and documented step list agree in order", () => {
    expect(
      hookSteps,
      `pre-push steps in .husky/pre-push and CONTRIBUTING.md must match.\n` +
        `Hook:  ${hookSteps.join(", ")}\n` +
        `Docs:  ${docSteps.join(", ")}`,
    ).toEqual(docSteps);
  });
});
