// CI lint for ADR YAML front matter (docs/adr/ADR-FORMAT.md > Front matter).
//
// Every docs/adr/NNNN-*.md must open with a front-matter block carrying the
// ADR's machine-readable metadata: status enum, created / last-updated dates,
// and bidirectional supersedes / superseded-by links. This is a
// zero-dependency validator for the restricted `key: value` subset the ADRs
// use — it is NOT a general YAML parser and rejects anything outside that
// subset (nesting, flow collections, multi-line values), which is the point:
// front matter stays grep-able.
//
// Checks:
//   - every docs/adr/[0-9]*.md starts with a `---` front-matter block of
//     single-line `key: value` pairs (a block over MAX_BLOCK_LINES lines is
//     diagnosed as unterminated — a stray thematic break in the body must not
//     swallow the document)
//   - keys are exactly from the allowed set; status/created/last-updated required
//   - status ∈ {proposed, accepted, rejected, superseded}
//   - dates are YYYY-MM-DD and last-updated >= created
//   - status: superseded ⇔ superseded-by present
//   - implemented-by is a "#N, #N, ..." PR-ref list (no commit hashes — see
//     ADR-FORMAT's "No commit hashes in front matter")
//   - ADR numbers are unique; supersedes / superseded-by reference existing,
//     parseable ADRs and the pair is bidirectional (A superseded-by B ⇔ B
//     supersedes A)
//
// This module is pure (file records are passed in) so it is unit-tested in the
// sibling .test.mjs, mirroring label-trigger-lint.mjs (ADR-0031); it also runs
// standalone — `node adr-front-matter-lint.mjs` reads the real docs/adr/ and
// exits non-zero on any violation. Runs from the pre-push hook and CI.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ADR_DIR = "docs/adr";
export const ALLOWED_KEYS = [
  "status",
  "created",
  "last-updated",
  "supersedes",
  "superseded-by",
  "implemented-by",
];
export const REQUIRED_KEYS = ["status", "created", "last-updated"];
export const STATUSES = new Set(["proposed", "accepted", "rejected", "superseded"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REF_RE = /^ADR-(\d{4})$/;
const PR_LIST_RE = /^#\d+(, #\d+)*$/;
// 6 allowed keys + slack; a "front matter" wider than this is a missing
// terminator picking up a thematic break deep in the body.
const MAX_BLOCK_LINES = 12;

// Parse one ADR's front matter. Returns { meta, errors } where errors are
// strings without the file-name prefix (the caller adds it).
export function parseFrontMatter(content) {
  const errors = [];
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { meta: null, errors: ["missing front matter (file must start with `---`)"] };
  }
  const end = lines.indexOf("---", 1);
  if (end === -1 || end - 1 > MAX_BLOCK_LINES) {
    return {
      meta: null,
      errors: [
        `unterminated front matter (no closing \`---\` within ${MAX_BLOCK_LINES} lines of the top)`,
      ],
    };
  }

  const meta = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const m = /^([a-z-]+):\s*(.+?)\s*$/.exec(line);
    if (!m) {
      errors.push(`unparseable front-matter line: ${JSON.stringify(line)}`);
      continue;
    }
    const [, key, rawValue] = m;
    if (!ALLOWED_KEYS.includes(key)) {
      errors.push(`unknown front-matter key "${key}" (allowed: ${ALLOWED_KEYS.join(", ")})`);
      continue;
    }
    if (key in meta) errors.push(`duplicate front-matter key "${key}"`);
    // Strip one layer of quotes (implemented-by values are quoted for `#`).
    meta[key] = rawValue.replace(/^"(.*)"$/, "$1");
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in meta)) errors.push(`missing required front-matter key "${key}"`);
  }
  if (meta.status !== undefined && !STATUSES.has(meta.status)) {
    errors.push(`invalid status "${meta.status}" (expected ${[...STATUSES].join(" | ")})`);
  }
  for (const key of ["created", "last-updated"]) {
    if (meta[key] !== undefined && !DATE_RE.test(meta[key])) {
      errors.push(`${key} is not a YYYY-MM-DD date: "${meta[key]}"`);
    }
  }
  if (
    DATE_RE.test(meta.created ?? "") &&
    DATE_RE.test(meta["last-updated"] ?? "") &&
    meta["last-updated"] < meta.created
  ) {
    errors.push(`last-updated (${meta["last-updated"]}) precedes created (${meta.created})`);
  }
  if (meta.status === "superseded" && !meta["superseded-by"]) {
    errors.push('status is "superseded" but superseded-by is missing');
  }
  if (meta["superseded-by"] && meta.status !== "superseded") {
    errors.push(`superseded-by is set but status is "${meta.status}" (expected "superseded")`);
  }
  if (meta["implemented-by"] !== undefined && !PR_LIST_RE.test(meta["implemented-by"])) {
    errors.push(
      `implemented-by must be a "#N, #N" PR-ref list (no commit hashes), got "${meta["implemented-by"]}"`,
    );
  }
  return { meta, errors };
}

// Lint a set of ADR files: per-file schema plus the cross-file rules.
// files: [{ name, content }] where name is the basename (e.g. "0018-....md").
// Returns ["<name>: <message>", ...].
export function lintAdrFrontMatter(files) {
  const errors = [];
  const byNumber = new Map(); // "0018" -> { file, meta } (meta null if parse failed)

  for (const { name, content } of files) {
    const { meta, errors: fileErrors } = parseFrontMatter(content);
    for (const e of fileErrors) errors.push(`${name}: ${e}`);
    const num = name.slice(0, 4);
    if (byNumber.has(num)) {
      errors.push(`${name}: duplicate ADR number ${num} (also used by ${byNumber.get(num).name})`);
      continue;
    }
    byNumber.set(num, { name, meta });
  }

  // Cross-file: references resolve and supersedes/superseded-by are bidirectional.
  for (const [, { name, meta }] of byNumber) {
    if (meta === null) continue;
    for (const key of ["supersedes", "superseded-by"]) {
      const value = meta[key];
      if (value === undefined) continue;
      const m = REF_RE.exec(value);
      if (!m) {
        errors.push(`${name}: ${key} must look like ADR-0008, got "${value}"`);
        continue;
      }
      const target = byNumber.get(m[1]);
      if (!target) {
        errors.push(`${name}: ${key}: ${value} does not exist under ${ADR_DIR}/`);
        continue;
      }
      if (target.meta === null) {
        errors.push(`${name}: ${key}: ${value} exists but its own front matter failed to parse`);
        continue;
      }
      const inverseKey = key === "supersedes" ? "superseded-by" : "supersedes";
      const self = `ADR-${name.slice(0, 4)}`;
      if (target.meta[inverseKey] !== self) {
        errors.push(
          `${name}: ${key}: ${value} must declare ${inverseKey}: ${self} (found "${target.meta[inverseKey] ?? "<unset>"}")`,
        );
      }
    }
  }
  return errors;
}

// Read the real ADR corpus into the shape lintAdrFrontMatter consumes.
export function loadAdrFiles(dir = ADR_DIR) {
  return readdirSync(dir)
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort()
    .map((name) => ({ name, content: readFileSync(join(dir, name), "utf8") }));
}

function main() {
  const files = loadAdrFiles();
  const errors = lintAdrFrontMatter(files);
  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${ADR_DIR}/${e}`);
    console.error(
      `\nadr-front-matter-lint: ${errors.length} error(s) across ${files.length} ADR(s). See docs/adr/ADR-FORMAT.md > Front matter.`,
    );
    process.exit(1);
  }
  console.log(`✓ ADR front matter valid across ${files.length} ADR(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
