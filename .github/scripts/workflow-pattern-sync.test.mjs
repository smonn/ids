import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflowsDir = fileURLToPath(new URL("../workflows", import.meta.url));

/**
 * Finds the first line in `source` that contains `anchor`, then extracts the
 * Conventional-Commits type set and scope/bang/colon fragment from a bash
 * =~/assignment pattern of the form:
 *   ^(type1|type2|...)(\([a-z0-9._/-]+\))?!?:
 */
export function extractCC(source, anchor) {
  const line = source
    .replaceAll("\r\n", "\n")
    .split("\n")
    .find((l) => l.includes(anchor));
  if (!line) throw new Error(`Anchor not found: "${anchor}"`);
  const typeMatch = line.match(/\^\(([a-z|]+)\)/);
  if (!typeMatch) throw new Error(`No CC type group on line: ${line.trim()}`);
  const fragMatch = line.match(/\^\([a-z|]+\)(.+?)(?=\s|$)/);
  if (!fragMatch) throw new Error(`No scope fragment on line: ${line.trim()}`);
  return { types: typeMatch[1].split("|"), scopeFrag: fragMatch[1] };
}

// The scope/bang/colon fragment as it appears verbatim in both workflow files.
const SCOPE_FRAG = "(\\([a-z0-9._/-]+\\))?!?:";

describe("workflow CC pattern sync (changeset-check.yml vs pr-title.yml)", () => {
  describe("extractCC — fixture coverage", () => {
    it("parses types and scope fragment from a changeset-check-style line", () => {
      const src = `if [[ ! "$PR_TITLE" =~ ^(feat|fix|perf)${SCOPE_FRAG} ]]; then`;
      const { types, scopeFrag } = extractCC(src, '"$PR_TITLE" =~');
      expect(types).toEqual(["feat", "fix", "perf"]);
      expect(scopeFrag).toBe(SCOPE_FRAG);
    });

    it("parses types and scope fragment from a pr-title-style line", () => {
      const src = `pattern='^(feat|fix|docs|refactor|perf|test|build|ci|chore|revert)${SCOPE_FRAG} .+'`;
      const { types, scopeFrag } = extractCC(src, "pattern=");
      expect(types).toEqual([
        "feat",
        "fix",
        "docs",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ]);
      expect(scopeFrag).toBe(SCOPE_FRAG);
    });

    it("drift: subset check fails when pr-title type set is narrowed below changeset-check's", () => {
      // Simulate a future edit removing 'perf' from pr-title's type set.
      const narrowPT = `pattern='^(feat|fix)${SCOPE_FRAG} .+'`;
      const cs = extractCC(
        `if [[ ! "$PR_TITLE" =~ ^(feat|fix|perf)${SCOPE_FRAG} ]]; then`,
        '"$PR_TITLE" =~',
      );
      const pt = extractCC(narrowPT, "pattern=");
      const ptSet = new Set(pt.types);
      const isSubset = cs.types.every((t) => ptSet.has(t));
      expect(isSubset).toBe(false);
    });

    it("drift: byte-identity check fails when scope charsets diverge", () => {
      // Simulate removing '/' from pr-title's scope charset.
      const altScope = "(\\([a-z0-9._-]+\\))?!?:";
      const cs = extractCC(
        `if [[ ! "$PR_TITLE" =~ ^(feat|fix|perf)${SCOPE_FRAG} ]]; then`,
        '"$PR_TITLE" =~',
      );
      const pt = extractCC(`pattern='^(feat|fix|docs)${altScope} .+'`, "pattern=");
      expect(cs.scopeFrag).not.toBe(pt.scopeFrag);
    });

    it("throws when the anchor is not found in source", () => {
      expect(() => extractCC("no pattern here", "missing-anchor")).toThrow(
        'Anchor not found: "missing-anchor"',
      );
    });

    it("handles CRLF line endings transparently", () => {
      const src = `if [[ ! "$PR_TITLE" =~ ^(feat|fix|perf)${SCOPE_FRAG} ]]; then`.replaceAll(
        "\n",
        "\r\n",
      );
      const { types } = extractCC(src, '"$PR_TITLE" =~');
      expect(types).toEqual(["feat", "fix", "perf"]);
    });
  });

  describe("real workflow files", () => {
    const csSource = readFileSync(`${workflowsDir}/changeset-check.yml`, "utf8");
    const ptSource = readFileSync(`${workflowsDir}/pr-title.yml`, "utf8");
    const cs = extractCC(csSource, '"$PR_TITLE" =~');
    const pt = extractCC(ptSource, "pattern=");

    it("changeset-check type set is a subset of pr-title type set", () => {
      const ptSet = new Set(pt.types);
      for (const type of cs.types) {
        expect(
          ptSet.has(type),
          `"${type}" from changeset-check is missing from pr-title's type set`,
        ).toBe(true);
      }
    });

    it("scope/bang/colon fragment is byte-identical in both files", () => {
      expect(cs.scopeFrag).toBe(pt.scopeFrag);
    });
  });
});
