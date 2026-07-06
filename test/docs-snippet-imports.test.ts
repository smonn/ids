import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 * Collect all exported names from a TypeScript source file using regex-based
 * static analysis. Recursively follows `export { ... } from "..."` and
 * `export * from "..."` re-export chains into sub-modules within `src/`,
 * accumulating only names that are actually exported at the leaf level.
 *
 * @param relPath - Path relative to `root`.
 * @param visited - Absolute paths currently on the traversal stack (cycle guard only). Internal use only.
 * @param root - Repository root for path resolution. Defaults to the repo ROOT. Internal use only.
 * @param resolvedCache - Fully-resolved results keyed by absolute path (memoization). Internal use only.
 */
function collectSourceExports(
  relPath: string,
  visited = new Set<string>(),
  root = ROOT,
  resolvedCache = new Map<string, Set<string>>(),
): Set<string> {
  // Normalise root to always have a trailing "/" so slicing works uniformly.
  const rootPrefix = root.endsWith("/") ? root : root + "/";
  const fullPath = join(root, relPath);

  // Memoization: return cached result for a file already fully resolved.
  const cached = resolvedCache.get(fullPath);
  if (cached !== undefined) return cached;

  // Cycle guard: if this file is already on the traversal stack, stop.
  if (visited.has(fullPath)) return new Set();
  visited.add(fullPath);

  let content: string;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    visited.delete(fullPath);
    return new Set();
  }

  const names = new Set<string>();
  const fileDir = dirname(fullPath);
  // srcDir with trailing "/" so "src_other/..." is not mistakenly included.
  const srcDir = join(root, "src") + "/";

  /** Resolve a relative specifier (with .js extension) to an absolute .ts path inside src/, or null. */
  function resolveToSrc(spec: string): string | null {
    if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
    const tsSpec = spec.endsWith(".js") ? spec.slice(0, -3) + ".ts" : spec;
    const resolved = join(fileDir, tsSpec);
    return resolved.startsWith(srcDir) ? resolved : null;
  }

  /** Parse exported names from an `export { ... }` bindings string. */
  function parseBindings(bindingsStr: string): string[] {
    const result: string[] = [];
    for (const entry of bindingsStr.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const withoutType = trimmed.replace(/^type\s+/, "");
      const parts = withoutType.split(/\s+as\s+/);
      const exported = (parts.length > 1 ? (parts[1] ?? "") : (parts[0] ?? "")).trim();
      if (/^\w+$/.test(exported)) result.push(exported);
    }
    return result;
  }

  // 1. `export * from "..."` — wildcard re-exports: add ALL names from the sub-module.
  const starRe = /\bexport\s+\*\s+from\s+["']([^"']+)["']/g;
  for (const match of content.matchAll(starRe)) {
    const resolved = resolveToSrc(match[1] ?? "");
    if (resolved) {
      const subRel = resolved.slice(rootPrefix.length);
      for (const name of collectSourceExports(subRel, visited, root, resolvedCache)) {
        names.add(name);
      }
    }
    // Bare/external specifiers: skip, contribute no names.
  }

  // 2. `export [type] { ... } from "..."` (named re-export) or `export [type] { ... }` (local).
  // The optional `from "..."` group distinguishes the two forms.
  const blockRe = /\bexport\s+(?:type\s+)?\{([^}]+)\}(?:\s+from\s+["']([^"']+)["'])?/g;
  for (const match of content.matchAll(blockRe)) {
    const bindingsStr = match[1] ?? "";
    const fromSpec = match[2]; // undefined → local export (no `from` clause)
    const listed = parseBindings(bindingsStr);

    if (fromSpec !== undefined) {
      // Named re-export: follow into sub-module and include only actually-exported names.
      const resolved = resolveToSrc(fromSpec);
      if (resolved) {
        const subRel = resolved.slice(rootPrefix.length);
        const subExports = collectSourceExports(subRel, visited, root, resolvedCache);
        for (const name of listed) {
          if (subExports.has(name)) names.add(name);
        }
      }
      // Bare/external specifiers: skip, contribute no names.
    } else {
      // Local export (e.g. `export { a, b }` without `from`): add names directly.
      for (const name of listed) names.add(name);
    }
  }

  // 3. Named export declarations:
  //   export [async] function [*] name / export class name / export abstract class name
  //   export const / let / var name / export type name / export enum name / export interface name
  const namedRe =
    /\bexport\s+(?:async\s+)?(?:(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+|type\s+|enum\s+|interface\s+|abstract\s+class\s+))(\w+)/g;
  for (const match of content.matchAll(namedRe)) {
    if (match[1]) names.add(match[1]);
  }

  // Cache the fully-resolved result and unwind the traversal stack.
  resolvedCache.set(fullPath, names);
  visited.delete(fullPath);
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

  it("sets skipReason to the reason text after no-verify:", () => {
    const content = "```ts no-verify: standalone reason\nsome code\n```\n";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.skipReason).toBe("standalone reason");
  });

  it("sets skipReason to the reason portion only (not the full annotation)", () => {
    const content = "```ts no-verify: intentionally broken example\nsome code\n```\n";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.skipReason).toBe("intentionally broken example");
  });

  it("leaves skipReason null for an unannotated block even when another block has no-verify", () => {
    const content = "```ts no-verify: skip reason\nskipped\n```\n\n```ts\nnormal\n```\n";
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.skipReason).toBe("skip reason");
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
    // aliased re-export — exercises the `as` branch in blockRe
    expect(exports.has("betaAlias")).toBe(true);
    // async function — exercises the `(?:async\s+)?` arm in namedRe
    expect(exports.has("eta")).toBe(true);
    // generator — exercises the `function\s*\*?\s*` arm with `*` in namedRe
    expect(exports.has("mu")).toBe(true);
    // let / var — exercise the `let\s+` and `var\s+` arms in namedRe
    expect(exports.has("kappa")).toBe(true);
    expect(exports.has("lambda")).toBe(true);
    // enum — exercises the `enum\s+` arm in namedRe
    expect(exports.has("Theta")).toBe(true);
    // abstract class — exercises the `abstract\s+class\s+` arm in namedRe
    expect(exports.has("Iota")).toBe(true);
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

// ---------------------------------------------------------------------------
// Unit tests for collectSourceExports recursive behaviour
// ---------------------------------------------------------------------------

describe("collectSourceExports", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "ids-snippet-test-"));
    mkdirSync(join(tmpRoot, "src"), { recursive: true });

    // leaf.ts — exports only `a`; `stale` is intentionally absent.
    writeFileSync(join(tmpRoot, "src/leaf.ts"), "export const a = 1;\n");

    // barrel.ts — re-exports `a` (valid) and `stale` (not in leaf.ts).
    writeFileSync(join(tmpRoot, "src/barrel.ts"), 'export { a, stale } from "./leaf.js";\n');

    // wildcard.ts — exports `b` and `c`.
    writeFileSync(join(tmpRoot, "src/wildcard.ts"), "export const b = 2;\nexport const c = 3;\n");

    // star.ts — re-exports everything from wildcard via `export *`.
    writeFileSync(join(tmpRoot, "src/star.ts"), 'export * from "./wildcard.js";\n');

    // cycle-a.ts and cycle-b.ts — circular re-export pair.
    writeFileSync(
      join(tmpRoot, "src/cycle-a.ts"),
      'export { x } from "./cycle-b.js";\nexport const own = 1;\n',
    );
    writeFileSync(
      join(tmpRoot, "src/cycle-b.ts"),
      'export { own } from "./cycle-a.js";\nexport const x = 2;\n',
    );

    // external.ts — re-exports from a bare specifier (should be skipped).
    writeFileSync(
      join(tmpRoot, "src/external.ts"),
      'export { describe } from "vitest";\nexport const local = 1;\n',
    );

    // diamond topology: diamond-common.ts is reachable via two paths.
    writeFileSync(join(tmpRoot, "src/diamond-common.ts"), "export const shared = 1;\n");
    writeFileSync(join(tmpRoot, "src/diamond-a.ts"), 'export * from "./diamond-common.js";\n');
    writeFileSync(join(tmpRoot, "src/diamond-b.ts"), 'export * from "./diamond-common.js";\n');
    writeFileSync(
      join(tmpRoot, "src/diamond.ts"),
      'export * from "./diamond-a.js";\nexport * from "./diamond-b.js";\n',
    );
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns only names the sub-module actually exports (stale barrel name excluded)", () => {
    const result = collectSourceExports("src/barrel.ts", new Set(), tmpRoot);
    expect(result.has("a")).toBe(true); // exists in leaf.ts
    expect(result.has("stale")).toBe(false); // absent from leaf.ts — stale barrel entry
  });

  it("follows export * from and includes all sub-module names", () => {
    const result = collectSourceExports("src/star.ts", new Set(), tmpRoot);
    expect(result.has("b")).toBe(true);
    expect(result.has("c")).toBe(true);
  });

  it("does not follow bare or external specifiers", () => {
    const result = collectSourceExports("src/external.ts", new Set(), tmpRoot);
    expect(result.has("local")).toBe(true); // direct declaration
    expect(result.has("describe")).toBe(false); // re-exported from external "vitest"
  });

  it("returns names from shared deps in diamond re-export graphs without dropping them", () => {
    // diamond.ts → diamond-a.ts → diamond-common.ts
    //            → diamond-b.ts → diamond-common.ts (second path)
    // With pure visited-as-fence, diamond-common would be dropped on the second traversal.
    const result = collectSourceExports("src/diamond.ts", new Set(), tmpRoot);
    expect(result.has("shared")).toBe(true);
  });

  it("terminates without error on circular re-export chains", () => {
    // cycle-a re-exports `x` from cycle-b; cycle-b re-exports `own` from cycle-a.
    // The cycle guard prevents infinite recursion; available names are still returned.
    const result = collectSourceExports("src/cycle-a.ts", new Set(), tmpRoot);
    expect(result.has("own")).toBe(true); // direct export from cycle-a.ts
    expect(result.has("x")).toBe(true); // re-exported from cycle-b.ts (no cycle at that depth)
  });

  it("transitively follows named re-exports from real source files", () => {
    // src/index.ts re-exports createTimestampId from ./codecs/timestamp/index.ts;
    // the recursive walk must reach the leaf to include it.
    const result = collectSourceExports("src/index.ts");
    expect(result.has("createTimestampId")).toBe(true);
    expect(result.has("IdsError")).toBe(true);
    expect(result.has("isIdsError")).toBe(true);
    expect(result.has("IdsErrorCode")).toBe(true);
  });
});

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
