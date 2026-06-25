import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const depcruiseBin = fileURLToPath(new URL("../node_modules/.bin/depcruise", import.meta.url));

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

const cases = [
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
    fixture: "test/fixtures/depcruise/codecs/no-shell-layout/layout.ts",
    rule: "layouts-no-shell",
  },
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
    rule: "codec-constructors-wire-codec-shell-only",
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
  // codec slice rules
  {
    fixture: "test/fixtures/depcruise/codecs/cross-codec-violation/index.ts",
    rule: "codec-slice-no-cross-codec-imports",
  },
  {
    fixture: "test/fixtures/depcruise/codecs/filename-violation/helpers.ts",
    rule: "codec-slice-filename-convention",
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
