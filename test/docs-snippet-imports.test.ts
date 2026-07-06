import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Specifier → source entry file (relative to ROOT).
// Mirrors the entry map in tsdown.config.ts so the test stays
// aligned with the build without importing that TS config at runtime.
const SPECIFIER_TO_SOURCE: Record<string, string> = {
  "@smonn/ids": "src/index.ts",
  "@smonn/ids/opaque": "src/codecs/opaque/index.ts",
  "@smonn/ids/reverse": "src/codecs/reverse/index.ts",
  "@smonn/ids/signed": "src/codecs/signed/index.ts",
  "@smonn/ids/wrapped": "src/codecs/wrapped/index.ts",
  "@smonn/ids/digest": "src/codecs/digest/index.ts",
  "@smonn/ids/drizzle": "src/adapters/drizzle.ts",
  "@smonn/ids/hono": "src/adapters/hono.ts",
  "@smonn/ids/kysely": "src/adapters/kysely.ts",
  "@smonn/ids/mikro-orm": "src/adapters/mikro-orm.ts",
  "@smonn/ids/prisma": "src/adapters/prisma.ts",
  "@smonn/ids/express": "src/adapters/express.ts",
  "@smonn/ids/fastify": "src/adapters/fastify.ts",
  "@smonn/ids/typeorm": "src/adapters/typeorm.ts",
  "@smonn/ids/graphql": "src/adapters/graphql.ts",
  "@smonn/ids/nestjs": "src/adapters/nestjs.ts",
};

interface CodeBlock {
  code: string;
  /** Non-null when the block has a `no-verify` annotation; holds the annotation text. */
  skipReason: string | null;
}

interface ParsedImport {
  specifier: string;
  names: string[];
}

/** Walk a directory recursively and return all .md / .mdx file paths. */
function walkDocs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDocs(full));
    } else if (/\.(md|mdx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

/** Return all doc files that the guard scans. */
function getAllDocFiles(): string[] {
  return [join(ROOT, "README.md"), ...walkDocs(join(ROOT, "website/src/content/docs"))];
}

/**
 * Extract fenced ```ts / ```typescript / ```js code blocks from Markdown content.
 *
 * A block annotated with `no-verify` (e.g. ```ts no-verify) is returned with a
 * non-null `skipReason` and must be excluded from import checks.
 */
function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // Match opening fences with optional annotations, then content, then closing fence.
  // [\s\S]*? spans multiple lines without the `s` flag — `.` is never used.
  const re = /^```(?:ts|typescript|js)([ \t][^\n]*)?\n([\s\S]*?)^```[ \t]*$/gm;
  for (const match of content.matchAll(re)) {
    const annotation = (match[1] ?? "").trim();
    const code = match[2] ?? "";
    const skipReason = annotation.includes("no-verify") ? annotation : null;
    blocks.push({ code, skipReason });
  }
  return blocks;
}

/**
 * Parse all static `import { ... } from "@smonn/ids..."` declarations in a
 * code block, including `import type { ... }`.  Returns one entry per import
 * statement that contains at least one named binding.
 */
function parseBlockImports(code: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  // Matches: import [type] { ... } from "@smonn/ids[/subpath]"
  // [^}]* spans newlines inherently — the `s` flag is not needed here.
  const re = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](@smonn\/ids(?:\/[^"']*)?)["']/g;
  for (const match of code.matchAll(re)) {
    const bindingsStr = match[1] ?? "";
    const specifier = match[2] ?? "";
    if (!specifier) continue;
    const names: string[] = [];
    for (const binding of bindingsStr.split(",")) {
      const trimmed = binding.trim();
      if (!trimmed) continue;
      // Strip a leading `type ` modifier (e.g. `type Id` inside `import { type Id }`).
      const withoutType = trimmed.replace(/^type\s+/, "");
      // Handle `ImportedName as LocalAlias` — take the imported (external) name.
      const importedName = (withoutType.split(/\s+as\s+/)[0] ?? "").trim();
      if (/^\w+$/.test(importedName)) names.push(importedName);
    }
    if (names.length > 0) imports.push({ specifier, names });
  }
  return imports;
}

/**
 * Collect all exported names from a TypeScript source entry file using
 * regex-based static analysis.  Handles:
 *   - export { name, type name } [from "..."]
 *   - export type { name } [from "..."]
 *   - export function / async function / class / const / let / var / type / enum / interface
 */
function collectSourceExports(relPath: string): Set<string> {
  const content = readFileSync(join(ROOT, relPath), "utf-8");
  const names = new Set<string>();

  // export { name1, type name2, name3 as alias } [from "..."]
  // export type { name1, name2 } [from "..."]
  const blockRe = /\bexport\s+(?:type\s+)?\{([^}]+)\}/g;
  for (const match of content.matchAll(blockRe)) {
    for (const entry of (match[1] ?? "").split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      // Strip leading `type ` keyword
      const withoutType = trimmed.replace(/^type\s+/, "");
      // If `localName as exportedName`, take the exported name (after `as`).
      const parts = withoutType.split(/\s+as\s+/);
      const exportedName = (parts.length > 1 ? (parts[1] ?? "") : (parts[0] ?? "")).trim();
      if (/^\w+$/.test(exportedName)) names.add(exportedName);
    }
  }

  // export [async] function [*] name
  // export class name
  // export const / let / var name
  // export type name [=<]  (type alias)
  // export enum name
  // export interface name
  // export abstract class name
  const namedRe =
    /\bexport\s+(?:async\s+)?(?:(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+|type\s+|enum\s+|interface\s+|abstract\s+class\s+))(\w+)/g;
  for (const match of content.matchAll(namedRe)) {
    if (match[1]) names.add(match[1]);
  }

  return names;
}

// ---------------------------------------------------------------------------
// Load package.json exports map once at module evaluation time so every test
// in this describe block shares the same parsed data.
// ---------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
  exports: Record<string, unknown>;
};

/** Set of valid @smonn/ids specifiers derived from package.json exports. */
const VALID_SPECIFIERS = new Set(
  Object.keys(pkg.exports)
    .filter((k) => k !== "./package.json")
    .map((k) => (k === "." ? "@smonn/ids" : `@smonn/ids${k.slice(1)}`)),
);

/** Cache of source exports so each source file is parsed at most once. */
const sourceExportsCache = new Map<string, Set<string>>();

function getSourceExports(specifier: string): Set<string> {
  const relPath = SPECIFIER_TO_SOURCE[specifier];
  if (!relPath) return new Set();
  const cached = sourceExportsCache.get(relPath);
  if (cached) return cached;
  const exports = collectSourceExports(relPath);
  sourceExportsCache.set(relPath, exports);
  return exports;
}

// ---------------------------------------------------------------------------
// Unit tests for private helpers
// ---------------------------------------------------------------------------

describe("extractCodeBlocks", () => {
  it("returns empty array for a document with no fenced blocks", () => {
    expect(extractCodeBlocks("# Title\n\nSome text.\n")).toEqual([]);
  });

  it("extracts a single ts fenced block with no annotation", () => {
    const content = "Before\n```ts\nconst x = 1;\n```\nAfter\n";
    expect(extractCodeBlocks(content)).toEqual([{ code: "const x = 1;\n", skipReason: null }]);
  });

  it("extracts a single typescript fenced block", () => {
    const content = "```typescript\nconst y = 2;\n```\n";
    expect(extractCodeBlocks(content)).toEqual([{ code: "const y = 2;\n", skipReason: null }]);
  });

  it("extracts a single js fenced block", () => {
    const content = "```js\nconst z = 3;\n```\n";
    expect(extractCodeBlocks(content)).toEqual([{ code: "const z = 3;\n", skipReason: null }]);
  });

  it("extracts multiple fenced blocks in one document", () => {
    const content = "```ts\nfoo();\n```\nMiddle\n```typescript\nbar();\n```\n";
    expect(extractCodeBlocks(content)).toEqual([
      { code: "foo();\n", skipReason: null },
      { code: "bar();\n", skipReason: null },
    ]);
  });

  it("sets skipReason to the annotation text when no-verify appears alone", () => {
    const content = "```ts no-verify\nsome code\n```\n";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.skipReason).toBe("no-verify");
  });

  it("sets skipReason to the full annotation when no-verify has trailing text", () => {
    const content = "```ts no-verify intentionally broken example\nsome code\n```\n";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.skipReason).toBe("no-verify intentionally broken example");
  });

  it("leaves skipReason null for an unannotated block even when another block has no-verify", () => {
    const content = "```ts no-verify\nskipped\n```\n\n```ts\nnormal\n```\n";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.skipReason).toBe("no-verify");
    expect(blocks[1]!.skipReason).toBeNull();
  });
});

describe("parseBlockImports", () => {
  it("returns empty array for a block with no import statements", () => {
    expect(parseBlockImports("const x = 1;\nconsole.log(x);\n")).toEqual([]);
  });

  it("parses a plain named import from @smonn/ids", () => {
    const code = 'import { Foo } from "@smonn/ids";\n';
    expect(parseBlockImports(code)).toEqual([{ specifier: "@smonn/ids", names: ["Foo"] }]);
  });

  it("parses an import type from @smonn/ids", () => {
    const code = 'import type { Bar } from "@smonn/ids";\n';
    expect(parseBlockImports(code)).toEqual([{ specifier: "@smonn/ids", names: ["Bar"] }]);
  });

  it("parses a multi-binding import from @smonn/ids", () => {
    const code = 'import { A, B, C } from "@smonn/ids";\n';
    expect(parseBlockImports(code)).toEqual([{ specifier: "@smonn/ids", names: ["A", "B", "C"] }]);
  });

  it("excludes imports whose specifier is not @smonn/ids", () => {
    const code = 'import { something } from "some-other-package";\n';
    expect(parseBlockImports(code)).toEqual([]);
  });

  it("parses imports from @smonn/ids subpath specifiers", () => {
    const code = 'import { reverse } from "@smonn/ids/reverse";\n';
    expect(parseBlockImports(code)).toEqual([
      { specifier: "@smonn/ids/reverse", names: ["reverse"] },
    ]);
  });

  it("includes only the @smonn/ids import when a block mixes specifiers", () => {
    const code = 'import { other } from "unrelated";\nimport { IdType } from "@smonn/ids";\n';
    expect(parseBlockImports(code)).toEqual([{ specifier: "@smonn/ids", names: ["IdType"] }]);
  });
});

describe("collectSourceExports", () => {
  it("returns all exported names from a file that only exports", () => {
    const exports = collectSourceExports("test/fixtures/docs-snippet-imports/all-exports.ts");
    expect(exports.has("alpha")).toBe(true);
    expect(exports.has("beta")).toBe(true);
    expect(exports.has("Gamma")).toBe(true);
    expect(exports.has("Delta")).toBe(true);
    expect(exports.has("Epsilon")).toBe(true);
    expect(exports.has("Zeta")).toBe(true);
  });

  it("returns an empty set for a file with no exports", () => {
    const exports = collectSourceExports("test/fixtures/docs-snippet-imports/no-exports.ts");
    expect(exports.size).toBe(0);
  });

  it("includes only exported names from a mixed file", () => {
    const exports = collectSourceExports("test/fixtures/docs-snippet-imports/mixed-exports.ts");
    expect(exports.has("publicFn")).toBe(true);
    expect(exports.has("publicConst")).toBe(true);
    expect(exports.has("PublicClass")).toBe(true);
    expect(exports.has("privateFn")).toBe(false);
    expect(exports.has("privateConst")).toBe(false);
    expect(exports.has("PrivateClass")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("docs snippet imports", () => {
  it("every @smonn/ids import in a doc snippet references a valid specifier", () => {
    const violations: string[] = [];

    for (const docFile of getAllDocFiles()) {
      const relPath = docFile.slice(ROOT.length + 1);
      const content = readFileSync(docFile, "utf-8");
      const blocks = extractCodeBlocks(content);

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block || block.skipReason !== null) continue;

        for (const { specifier } of parseBlockImports(block.code)) {
          if (!VALID_SPECIFIERS.has(specifier)) {
            violations.push(
              `${relPath}:snippet-${i}: specifier "${specifier}" is not in package.json exports`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("every named binding imported from @smonn/ids in a doc snippet is actually exported", () => {
    const violations: string[] = [];

    for (const docFile of getAllDocFiles()) {
      const relPath = docFile.slice(ROOT.length + 1);
      const content = readFileSync(docFile, "utf-8");
      const blocks = extractCodeBlocks(content);

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block || block.skipReason !== null) continue;

        for (const { specifier, names } of parseBlockImports(block.code)) {
          if (!VALID_SPECIFIERS.has(specifier)) continue; // already caught above

          const sourceRelPath = SPECIFIER_TO_SOURCE[specifier];
          if (!sourceRelPath) {
            violations.push(
              `${relPath}:snippet-${i}: no source entry mapped for specifier "${specifier}" — update SPECIFIER_TO_SOURCE in this test`,
            );
            continue;
          }

          const exported = getSourceExports(specifier);
          for (const name of names) {
            if (!exported.has(name)) {
              violations.push(
                `${relPath}:snippet-${i}: "${name}" is not exported from "${specifier}" (source: ${sourceRelPath})`,
              );
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
