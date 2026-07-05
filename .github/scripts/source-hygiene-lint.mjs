// Source-hygiene lint: scan all git-tracked text files for raw invisible
// code points that are banned from source (NUL, C0/C1 controls, bidi/format
// chars, line/paragraph separators). These enable Trojan-Source attacks
// (CVE-2021-42574 family) and make files unreviewable by diff/grep/blame.
//
// Excluded from the forbidden set: tab (U+0009), LF (U+000A), CR (U+000D).
// Exempt from scanning: binary asset extensions (.png, etc.).
// Escaped forms (\uXXXX in source) pass -- the check is on raw bytes, not
// runtime strings.
//
// This is the single-source checker invoked by test/source-hygiene.test.ts
// (CI enforcement) and .husky/pre-push via the source-hygiene-lint package
// script (pre-push feedback). It mirrors the adr-front-matter-lint pattern
// (ADR-0031): exported pure functions + a main() for standalone execution.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Binary extensions: skip these rather than trying to decode as UTF-8.
const BINARY_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2"]);

// Forbidden code points in source files.
// Excludes tab (U+0009), LF (U+000A), CR (U+000D) -- all legitimately appear in code.
// Expressed as \uXXXX escapes so this file is itself lint-clean.
/* oxlint-disable no-control-regex -- intentional: detect raw invisible code points in source */
const FORBIDDEN_RE =
  /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u0080-\u009f\u200b-\u200f\u2028-\u2029\u202a-\u202e\u2060-\u2069\ufeff]/;
/* oxlint-enable no-control-regex */

/**
 * Check a single file's text content for forbidden code points.
 * @param {string} content - UTF-8 text of the file.
 * @param {string} filePath - File path for error messages.
 * @returns {string[]} List of violation strings, empty if clean.
 */
export function checkContent(content, filePath) {
  const violations = [];
  const lines = content.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let offset = 0;
    while (offset < line.length) {
      const slice = line.slice(offset);
      const m = FORBIDDEN_RE.exec(slice);
      if (m === null) break;
      const cp = slice.codePointAt(m.index) ?? 0;
      violations.push(
        `${filePath}:${lineIdx + 1}: raw U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      );
      // Advance past this match to find additional violations on the same line.
      offset += m.index + Math.max(m[0].length, 1);
    }
  }
  return violations;
}

/**
 * Load all git-tracked text files into { name, content } records.
 * Skips binary-extension files.
 * @param {string} [cwd="."] - Working directory for git ls-files.
 * @returns {{ name: string; content: string }[]}
 */
export function loadTrackedFiles(cwd = ".") {
  const output = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" });
  const files = [];
  for (const rel of output.split("\n")) {
    const name = rel.trim();
    if (!name) continue;
    if (BINARY_EXTS.has(extname(name).toLowerCase())) continue;
    try {
      const content = readFileSync(join(cwd, name), "utf8");
      files.push({ name, content });
    } catch {
      // Unreadable file -- skip silently; not a source-hygiene violation.
    }
  }
  return files;
}

/**
 * Lint a set of { name, content } file records.
 * @param {{ name: string; content: string }[]} files
 * @returns {string[]} All violations across all files.
 */
export function lintFiles(files) {
  return files.flatMap(({ name, content }) => checkContent(content, name));
}

function main() {
  const files = loadTrackedFiles();
  const errors = lintFiles(files);
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write("\u2717 " + e + "\n");
    process.stderr.write(
      "\nsource-hygiene-lint: " +
        errors.length +
        " violation(s) across " +
        files.length +
        " file(s).\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    "\u2713 source hygiene clean across " + files.length + " tracked text file(s).\n",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
