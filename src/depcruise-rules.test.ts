import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const _require = createRequire(import.meta.url);
const mainConfig = _require("../.dependency-cruiser.cjs") as {
  forbidden: Array<{ name: string; from: Record<string, unknown> }>;
};
const fixturesConfig = _require("../.dependency-cruiser-fixtures.cjs") as {
  forbidden: Array<{ name: string }>;
};
const fromOverrides = _require("../.dependency-cruiser-from-overrides.cjs") as Record<
  string,
  unknown
>;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const depcruiseBin = fileURLToPath(new URL("../node_modules/.bin/depcruise", import.meta.url));

function walkDir(absDir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const full = join(absDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkDir(full));
    } else if (entry.isFile()) {
      result.push(full);
    }
  }
  return result;
}

function runDepcruise(fixturePath: string): {
  status: number | null;
  output: string;
} {
  const result = spawnSync(
    depcruiseBin,
    ["--config", ".dependency-cruiser-fixtures.cjs", fixturePath],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return {
    status: result.status,
    output: (result.stdout ?? "") + (result.stderr ?? ""),
  };
}

// Note: the rules below are exercised against synthetic fixtures only.
// The real-tree enforcement — running depcruise against the live src/ tree —
// is the separate `pnpm depcruise` step in CI.

const cases = [
  // root barrel
  {
    fixture: "test/fixtures/depcruise/index.ts",
    rule: "index-imports-allowlist",
  },
  // wire layer
  {
    fixture: "test/fixtures/depcruise/wire/no-layouts.ts",
    rule: "wire-no-layouts",
  },
  {
    fixture: "test/fixtures/depcruise/wire/no-shell.ts",
    rule: "wire-no-shell",
  },
  {
    fixture: "test/fixtures/depcruise/wire/parse-middle.ts",
    rule: "wire-middle-no-siblings",
  },
  {
    fixture: "test/fixtures/depcruise/wire/invariants.ts",
    rule: "wire-leaves-no-upward",
  },
  {
    fixture: "test/fixtures/depcruise/wire/parse-allowlist.ts",
    rule: "wire-parse-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/wire/envelope.ts",
    rule: "wire-envelope-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/wire/timestamp-bytes.ts",
    rule: "wire-timestamp-bytes-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/wire/codec-shell.ts",
    rule: "codec-shell-parse-invariants-only",
  },
  // layouts layer
  {
    fixture: "test/fixtures/depcruise/codecs/sibling-layout/layout.ts",
    rule: "layouts-no-sibling-layouts",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/bad-wire-layout/layout.ts",
    rule: "layouts-wire-imports-allowlist",
  },
  // codec constructors
  {
    fixture: "test/fixtures/depcruise/codecs/timestamp-violation/index.ts",
    rule: "codec-constructors-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/non-codec.ts",
    rule: "codec-constructors-layouts-only",
  },
  // adapters
  {
    fixture: "test/fixtures/depcruise/adapters/adapter-types.ts",
    rule: "adapter-types-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/adapters/drizzle.ts",
    rule: "adapters-no-internals",
  },
  {
    fixture: "test/fixtures/depcruise/adapters/test-helpers.ts",
    rule: "adapters-test-helpers-imports-allowlist",
  },
  // CLI
  {
    fixture: "test/fixtures/depcruise/cli.ts",
    rule: "cli-no-internals",
  },
  // brand / registry guards (collapsed into one rule)
  {
    fixture: "test/fixtures/depcruise/non-codec-brand.ts",
    rule: "_kernel-brand-registry-only-from-codec-constructors",
  },
  {
    fixture: "test/fixtures/depcruise/non-codec-registry.ts",
    rule: "_kernel-brand-registry-only-from-codec-constructors",
  },
  // leaf guards
  {
    fixture: "test/fixtures/depcruise/wire/base32.ts",
    rule: "wire-base32-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/wire/base32.ts",
    rule: "leaves-no-upward",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/_kernel/bytes.ts",
    rule: "leaves-no-upward",
  },
  {
    fixture: "test/fixtures/depcruise/non-key-handle.ts",
    rule: "key-material-leaf-restricted",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/_kernel/key-material.ts",
    rule: "key-material-leaf-no-upward",
  },
  {
    fixture: "test/fixtures/depcruise/non-crypto-consumer.ts",
    rule: "crypto-leaf-restricted",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/_kernel/crypto.ts",
    rule: "crypto-leaf-no-upward",
  },
  {
    fixture: "test/fixtures/depcruise/non-rng-consumer.ts",
    rule: "rng-leaf-restricted",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/_kernel/rng.ts",
    rule: "rng-leaf-no-upward",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/_kernel/registry.ts",
    rule: "leaves-no-upward",
  },
  {
    fixture: "test/fixtures/depcruise/wire/uuid-allowlist.ts",
    rule: "wire-uuid-imports-allowlist",
  },
  // codec slice rules
  {
    fixture: "test/fixtures/depcruise/codecs/cross-codec-violation/index.ts",
    rule: "codec-slice-no-cross-codec-imports",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/filename-violation/helpers.ts",
    rule: "codec-slice-filename-convention",
  },
  // codec upward-edge allowlist (adapter target)
  {
    fixture: "test/fixtures/depcruise/codecs/upward-violation/index.ts",
    rule: "codec-constructors-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/key-upward-violation/key.ts",
    rule: "codec-key-imports-allowlist",
  },
  // codec upward-edge allowlist (cli target)
  {
    fixture: "test/fixtures/depcruise/codecs/codec-index-cli-violation/index.ts",
    rule: "codec-constructors-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/codec-key-cli-violation/key.ts",
    rule: "codec-key-imports-allowlist",
  },
  // broader no-shell narrowing (Gap 3)
  {
    fixture: "test/fixtures/depcruise/wire/no-shell-router.ts",
    rule: "wire-no-shell",
  },
];

describe("depcruise ring rules — negative fixtures", () => {
  it.each(cases)("$rule fires for $fixture", ({ fixture, rule }) => {
    const { status, output } = runDepcruise(fixture);
    expect(status, `${rule}: expected non-zero exit`).not.toBe(0);
    expect(output, `${rule}: expected rule name in output`).toContain(rule);
  });
});

describe("depcruise ring rules — zero-edit proof", () => {
  it("a conventional codec slice (index.ts + layout.ts) trips no rule", () => {
    const { status, output } = runDepcruise("test/fixtures/depcruise/codecs/sample");
    expect(status, `zero-edit proof: expected exit 0 but got:\n${output}`).toBe(0);
  });
});

describe("depcruise config — sync assertions", () => {
  const mainRuleNames = new Set(mainConfig.forbidden.map((r) => r.name));
  const pathScopedRuleNames = mainConfig.forbidden
    .filter((r) => r.from.path != null || r.from.pathNot != null)
    .map((r) => r.name);
  const fixtureRuleNames = new Set(fixturesConfig.forbidden.map((r) => r.name));
  const caseRuleNames = new Set(cases.map((c) => c.rule));

  // Structural rules have no from.path or from.pathNot; they apply globally and are
  // intentionally not covered by path-scoped fixture tests.
  const STRUCTURAL_RULE_SKIP_LIST: ReadonlySet<string> = new Set([
    "no-circular", // structural: from has no path or pathNot
    "not-to-unresolvable", // structural: from has no path or pathNot
  ]);

  const allFixtureFilePaths = walkDir(join(projectRoot, "test/fixtures/depcruise")).map((p) =>
    p.slice(projectRoot.length),
  );

  it("derived-config rule names equal main-config path-scoped rule names", () => {
    expect(fixtureRuleNames).toEqual(new Set(pathScopedRuleNames));
  });

  it("every FROM_OVERRIDES key is a known main-config rule name", () => {
    for (const key of Object.keys(fromOverrides)) {
      expect(mainRuleNames.has(key), `FROM_OVERRIDES key "${key}" is not a main-config rule`).toBe(
        true,
      );
    }
  });

  it("every path-scoped main-config rule name appears in cases", () => {
    for (const name of pathScopedRuleNames) {
      expect(caseRuleNames.has(name), `main-config rule "${name}" has no test case`).toBe(true);
    }
  });

  it("every main-config rule name appears in cases or the structural skip-list", () => {
    for (const { name } of mainConfig.forbidden) {
      const covered = caseRuleNames.has(name) || STRUCTURAL_RULE_SKIP_LIST.has(name);
      expect(
        covered,
        `main-config rule "${name}" is neither in cases nor in the structural skip-list`,
      ).toBe(true);
    }
  });

  it("every FROM_OVERRIDES path value matches at least one fixture file", () => {
    for (const key of Object.keys(fromOverrides)) {
      const override = fromOverrides[key] as { path: string };
      const re = new RegExp(override.path);
      const matches = allFixtureFilePaths.some((p) => re.test(p));
      expect(
        matches,
        `FROM_OVERRIDES["${key}"].path "${override.path}" matches no file under test/fixtures/depcruise/`,
      ).toBe(true);
    }
  });
});

describe("depcruise config — module coverage meta-test", () => {
  // Files deliberately exempt from the from.path coverage check.
  // Every entry must carry an inline comment explaining why it is exempt.
  const COVERAGE_EXEMPT: ReadonlySet<string> = new Set<string>();

  it("every production src/ module is matched by at least one rule's from.path pattern", () => {
    const fromPatterns = mainConfig.forbidden
      .filter((r) => typeof r.from.path === "string")
      .map((r) => new RegExp(r.from.path as string));

    const srcDir = join(projectRoot, "src");
    const productionFiles = walkDir(srcDir)
      .map((p) => p.slice(projectRoot.length))
      .filter((rel) => !rel.endsWith(".test.ts"));

    const uncovered = productionFiles.filter(
      (rel) => !COVERAGE_EXEMPT.has(rel) && !fromPatterns.some((re) => re.test(rel)),
    );

    expect(
      uncovered,
      `The following src/ modules are not covered by any rule's from.path pattern:\n${uncovered.map((f) => `  ${f}`).join("\n")}`,
    ).toHaveLength(0);
  });
});
