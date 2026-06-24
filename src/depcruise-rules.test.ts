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
    fixture: "test/fixtures/depcruise/layouts/no-shell.ts",
    rule: "layouts-no-shell",
  },
  {
    fixture: "test/fixtures/depcruise/layouts/sibling.ts",
    rule: "layouts-no-sibling-layouts",
  },
  {
    fixture: "test/fixtures/depcruise/layouts/bad-wire.ts",
    rule: "layouts-wire-imports-allowlist",
  },
  // codec constructors
  {
    fixture: "test/fixtures/depcruise/timestamp.ts",
    rule: "codec-constructors-wire-codec-shell-only",
  },
  {
    fixture: "test/fixtures/depcruise/non-codec.ts",
    rule: "codec-constructors-layouts-only",
  },
  // adapters
  {
    fixture: "test/fixtures/depcruise/adapter-types.ts",
    rule: "adapter-types-imports-allowlist",
  },
  {
    fixture: "test/fixtures/depcruise/drizzle.ts",
    rule: "drizzle-adapter-no-internals",
  },
  {
    fixture: "test/fixtures/depcruise/kysely.ts",
    rule: "kysely-adapter-no-internals",
  },
  {
    fixture: "test/fixtures/depcruise/prisma.ts",
    rule: "prisma-adapter-no-internals",
  },
  // CLI
  {
    fixture: "test/fixtures/depcruise/cli.ts",
    rule: "cli-no-internals",
  },
  // brand / registry guards
  {
    fixture: "test/fixtures/depcruise/non-codec-brand.ts",
    rule: "brand-only-from-codec-constructors",
  },
  {
    fixture: "test/fixtures/depcruise/non-codec-registry.ts",
    rule: "registry-only-from-codec-constructors",
  },
  // leaf guards
  {
    fixture: "test/fixtures/depcruise/wire/base32.ts",
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
];

describe("depcruise ring rules — negative fixtures", () => {
  it.each(cases)("$rule fires for $fixture", ({ fixture, rule }) => {
    const { status, output } = runDepcruise(fixture);
    expect(status, `${rule}: expected non-zero exit`).not.toBe(0);
    expect(output, `${rule}: expected rule name in output`).toContain(rule);
  });
});
