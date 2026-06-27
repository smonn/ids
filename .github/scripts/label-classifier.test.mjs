import { describe, expect, it } from "vitest";
import {
  areasFromIssueBody,
  areasFromPaths,
  bumpFromChangeset,
  changesetFromBumps,
  churnFromNumstat,
  codecsFromIssueBody,
  codecsFromPaths,
  isGeneratedPath,
  reconcileLabels,
  sizeFromChurn,
  typeFromIssueLabels,
  typeFromTitle,
} from "./label-classifier.mjs";

describe("typeFromTitle", () => {
  it("maps each Conventional-Commit type to its label", () => {
    for (const type of [
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
    ]) {
      expect(typeFromTitle(`${type}: do a thing`)).toBe(`type:${type}`);
    }
  });

  it("tolerates a scope and a breaking-change bang", () => {
    expect(typeFromTitle("feat(cli): add flag")).toBe("type:feat");
    expect(typeFromTitle("fix(wire)!: change layout")).toBe("type:fix");
    expect(typeFromTitle("refactor(codecs/opaque): rename")).toBe("type:refactor");
  });

  it("returns null for non-Conventional or unknown-type titles", () => {
    expect(typeFromTitle("Version Packages")).toBeNull();
    expect(typeFromTitle("wip: scratch")).toBeNull();
    expect(typeFromTitle("")).toBeNull();
    expect(typeFromTitle(null)).toBeNull();
    expect(typeFromTitle(undefined)).toBeNull();
  });
});

describe("typeFromIssueLabels", () => {
  it("maps bug and enhancement onto the CC vocabulary", () => {
    expect(typeFromIssueLabels(["bug"])).toBe("type:fix");
    expect(typeFromIssueLabels(["enhancement"])).toBe("type:feat");
  });

  it("prefers bug when both are present and ignores other labels", () => {
    expect(typeFromIssueLabels(["enhancement", "bug"])).toBe("type:fix");
    expect(typeFromIssueLabels(["needs-triage"])).toBeNull();
    expect(typeFromIssueLabels([])).toBeNull();
  });
});

describe("sizeFromChurn", () => {
  it("buckets churn at the calibrated thresholds", () => {
    expect(sizeFromChurn(0)).toBe("size:xs");
    expect(sizeFromChurn(10)).toBe("size:xs");
    expect(sizeFromChurn(11)).toBe("size:s");
    expect(sizeFromChurn(50)).toBe("size:s");
    expect(sizeFromChurn(51)).toBe("size:m");
    expect(sizeFromChurn(150)).toBe("size:m");
    expect(sizeFromChurn(151)).toBe("size:l");
    expect(sizeFromChurn(400)).toBe("size:l");
    expect(sizeFromChurn(401)).toBe("size:xl");
    expect(sizeFromChurn(9999)).toBe("size:xl");
  });
});

describe("isGeneratedPath", () => {
  it("excludes lockfiles but not reviewable content", () => {
    expect(isGeneratedPath("pnpm-lock.yaml")).toBe(true);
    expect(isGeneratedPath("nested/package-lock.json")).toBe(true);
    expect(isGeneratedPath("spec/vectors.json")).toBe(false);
    expect(isGeneratedPath("src/index.ts")).toBe(false);
  });
});

describe("churnFromNumstat", () => {
  it("sums additions and deletions of reviewable files", () => {
    const numstat = ["10\t5\tsrc/index.ts", "3\t0\tsrc/types.ts"].join("\n");
    expect(churnFromNumstat(numstat)).toBe(18);
  });

  it("excludes lockfiles and binary entries", () => {
    const numstat = [
      "12\t4\tsrc/index.ts",
      "9000\t1\tpnpm-lock.yaml", // generated → excluded
      "-\t-\tassets/logo.png", // binary → excluded
    ].join("\n");
    expect(churnFromNumstat(numstat)).toBe(16);
  });

  it("counts spec vectors and depcruise fixtures as reviewable", () => {
    const numstat = "40\t10\tspec/vectors.json";
    expect(churnFromNumstat(numstat)).toBe(50);
  });

  it("ignores blank lines and empty input", () => {
    expect(churnFromNumstat("")).toBe(0);
    expect(churnFromNumstat("\n\n")).toBe(0);
  });
});

describe("codecsFromPaths", () => {
  it("detects each touched codec slice, sorted and de-duplicated", () => {
    const paths = [
      "src/codecs/timestamp/index.ts",
      "src/codecs/timestamp/encode.ts",
      "src/codecs/opaque/index.ts",
    ];
    expect(codecsFromPaths(paths)).toEqual(["codec:opaque", "codec:timestamp"]);
  });

  it("ignores the shared _kernel and non-codec paths", () => {
    expect(codecsFromPaths(["src/codecs/_kernel/shell.ts"])).toEqual([]);
    expect(codecsFromPaths(["src/wire/parse.ts", "docs/x.md"])).toEqual([]);
  });
});

describe("areasFromPaths", () => {
  it("maps paths to their areas, sorted and de-duplicated", () => {
    const paths = [
      "src/wire/parse.ts",
      "spec/vectors.json",
      "src/cli/dispatch.ts",
      "bin/cli.ts",
      "src/adapters/drizzle.ts",
      "src/codecs/opaque/index.ts",
      "docs/adr/0029.md",
      "README.md",
      ".changeset/foo.md",
      "package.json",
      ".github/workflows/ci.yml",
    ];
    expect(areasFromPaths(paths)).toEqual([
      "area:adapters",
      "area:build",
      "area:cli",
      "area:core",
      "area:docs",
      "area:wire",
    ]);
  });

  it("routes changeset markdown to build, not docs", () => {
    expect(areasFromPaths([".changeset/foo.md"])).toEqual(["area:build"]);
  });

  it("routes bare source to core and unknown tooling to build", () => {
    expect(areasFromPaths(["src/index.ts"])).toEqual(["area:core"]);
    expect(areasFromPaths(["tsconfig.json"])).toEqual(["area:build"]);
  });
});

describe("bumpFromChangeset", () => {
  it("reads the @smonn/ids bump from frontmatter", () => {
    const content = ["---", '"@smonn/ids": minor', "---", "", "Add a thing."].join("\n");
    expect(bumpFromChangeset(content)).toBe("minor");
  });

  it("handles unquoted keys and other bump levels", () => {
    expect(bumpFromChangeset(["---", "@smonn/ids: major", "---", "x"].join("\n"))).toBe("major");
    expect(bumpFromChangeset(["---", "'@smonn/ids': patch", "---", "x"].join("\n"))).toBe("patch");
  });

  it("returns null without frontmatter or a matching key", () => {
    expect(bumpFromChangeset("just prose")).toBeNull();
    expect(bumpFromChangeset(["---", '"other/pkg": minor', "---"].join("\n"))).toBeNull();
  });
});

describe("changesetFromBumps", () => {
  it("takes the highest bump", () => {
    expect(changesetFromBumps(["patch", "minor", "patch"])).toBe("changeset:minor");
    expect(changesetFromBumps(["minor", "major"])).toBe("changeset:major");
    expect(changesetFromBumps(["patch"])).toBe("changeset:patch");
  });

  it("is changeset:none for an empty list", () => {
    expect(changesetFromBumps([])).toBe("changeset:none");
  });
});

describe("codecsFromIssueBody", () => {
  it("maps a single-select codec dropdown to its label", () => {
    const body = "### Relevant codec variant\n\nOpaque Timestamp codec\n\n### Next\n\nx";
    expect(codecsFromIssueBody(body)).toEqual(["codec:opaque"]);
  });

  it("maps nothing for the not-sure option or a missing field", () => {
    const body = "### Relevant codec variant\n\nNot sure / not relevant\n";
    expect(codecsFromIssueBody(body)).toEqual([]);
    expect(codecsFromIssueBody("no fields here")).toEqual([]);
  });
});

describe("areasFromIssueBody", () => {
  it("maps a multi-select surface dropdown, de-duplicating to core", () => {
    const body = "### Affected surface\n\nPublic API, Wire format, Internal implementation\n";
    expect(areasFromIssueBody(body)).toEqual(["area:core", "area:wire"]);
  });

  it("maps nothing for not-sure", () => {
    expect(areasFromIssueBody("### Affected surface\n\nNot sure\n")).toEqual([]);
  });
});

describe("reconcileLabels", () => {
  it("adds missing desired labels and removes stale managed ones", () => {
    const { add, remove } = reconcileLabels(
      ["type:fix", "size:s", "do:implement", "issue:in-progress"],
      ["type:feat", "size:s", "area:core"],
      ["type:", "size:", "area:", "codec:", "changeset:"],
    );
    expect(add).toEqual(["type:feat", "area:core"]);
    expect(remove).toEqual(["type:fix"]);
  });

  it("never touches labels outside the managed prefixes", () => {
    const { add, remove } = reconcileLabels(
      ["do:review", "pr:reviewing", "needs-human", "size:xl"],
      ["size:m"],
      ["size:"],
    );
    expect(add).toEqual(["size:m"]);
    expect(remove).toEqual(["size:xl"]);
  });

  it("is a no-op when current already matches desired", () => {
    const { add, remove } = reconcileLabels(["size:m"], ["size:m"], ["size:"]);
    expect(add).toEqual([]);
    expect(remove).toEqual([]);
  });
});
