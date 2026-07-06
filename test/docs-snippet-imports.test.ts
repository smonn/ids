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
  /** Non-null when the block has a `no-verify` annotation; holds the non-empty reason text. */
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
 * A block annotated with `no-verify` must include a non-empty reason suffix after the
 * keyword (e.g. ```ts no-verify: intentionally partial). Bare `no-verify` or a
 * whitespace-only suffix causes an immediate throw identifying the file and snippet index.
 * Valid `no-verify` blocks are returned with a non-null `skipReason` (the reason text)
 * and must be excluded from import checks.
 */
function extractCodeBlocks(content: string, filePath?: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // Match opening fences with optional annotations, then content, then closing fence.
  // [\s\S]*? spans multiple lines without the `s` flag — `.` is never used.
  const re = /^```(?:ts|typescript|js)([ \t][^\n]*)?\n([\s\S]*?)^```[ \t]*$/gm;
  let index = 0;
  for (const match of content.matchAll(re)) {
    const annotation = (match[1] ?? "").trim();
    const code = match[2] ?? "";
    let skipReason: string | null = null;
    if (annotation.includes("no-verify")) {
      const after = annotation.slice(annotation.indexOf("no-verify") + "no-verify".length);
      const reason = after.replace(/^:\s*/, "").trim();
      if (!reason) {
        const loc = filePath ? `${filePath}:snippet-${index}` : `snippet-${index}`;
        throw new Error(
          `${loc}: \`no-verify\` annotation requires a non-empty reason suffix (e.g. \`no-verify: intentionally partial\`)`,
        );
      }
      skipReason = reason;
    }
    blocks.push({ code, skipReason });
    index++;
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
// Tests
// ---------------------------------------------------------------------------

describe("extractCodeBlocks no-verify enforcement", () => {
  it("throws when no-verify has no reason suffix", () => {
    const content = "```ts no-verify\nconsole.log('hi');\n```";
    expect(() => extractCodeBlocks(content)).toThrow(
      "`no-verify` annotation requires a non-empty reason suffix",
    );
  });

  it("throws when no-verify has whitespace-only text after the colon", () => {
    const content = "```ts no-verify:   \nconsole.log('hi');\n```";
    expect(() => extractCodeBlocks(content)).toThrow(
      "`no-verify` annotation requires a non-empty reason suffix",
    );
  });

  it("passes when no-verify has a non-empty reason suffix", () => {
    const content = "```ts no-verify: intentionally partial\nconsole.log('hi');\n```";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.skipReason).toBe("intentionally partial");
  });

  it("includes file path and snippet index in the error message when filePath is provided", () => {
    const content = "```ts no-verify\nconsole.log('hi');\n```";
    expect(() => extractCodeBlocks(content, "docs/foo.md")).toThrow("docs/foo.md:snippet-0:");
  });
});

describe("docs snippet imports", () => {
  it("every @smonn/ids import in a doc snippet references a valid specifier", () => {
    const violations: string[] = [];

    for (const docFile of getAllDocFiles()) {
      const relPath = docFile.slice(ROOT.length + 1);
      const content = readFileSync(docFile, "utf-8");
      const blocks = extractCodeBlocks(content, relPath);

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
      const blocks = extractCodeBlocks(content, relPath);

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
