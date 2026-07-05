#!/usr/bin/env node
// adr-front-matter-lint.mjs — validate the YAML front matter on every ADR.
//
// Schema and rules live in docs/adr/ADR-FORMAT.md > Front matter. This is a
// zero-dependency validator for the restricted `key: value` subset the ADRs
// use — it is NOT a general YAML parser and rejects anything outside that
// subset (nesting, flow collections, multi-line values), which is the point:
// front matter stays grep-able.
//
// Checks:
//   - every docs/adr/[0-9]*.md starts with a `---` front-matter block
//   - keys are exactly from the allowed set; status/created/last-updated required
//   - status ∈ {proposed, accepted, rejected, superseded}
//   - dates are YYYY-MM-DD and last-updated >= created
//   - status: superseded ⇔ superseded-by present
//   - supersedes / superseded-by reference existing ADR files, and the pair is
//     bidirectional (A superseded-by B ⇔ B supersedes A)
//
// Runs from the pre-push hook and CI; exits 1 with per-file errors on drift.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ADR_DIR = "docs/adr";
const ALLOWED_KEYS = [
  "status",
  "created",
  "last-updated",
  "supersedes",
  "superseded-by",
  "implemented-by",
];
const REQUIRED_KEYS = ["status", "created", "last-updated"];
const STATUSES = new Set(["proposed", "accepted", "rejected", "superseded"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REF_RE = /^ADR-(\d{4})$/;

const files = readdirSync(ADR_DIR)
  .filter((f) => /^\d{4}-.*\.md$/.test(f))
  .sort();

const errors = [];
const byNumber = new Map(); // "0018" -> { file, meta }

function fail(file, msg) {
  errors.push(`${join(ADR_DIR, file)}: ${msg}`);
}

for (const file of files) {
  const src = readFileSync(join(ADR_DIR, file), "utf8");
  const lines = src.split("\n");
  if (lines[0] !== "---") {
    fail(file, "missing front matter (file must start with `---`)");
    continue;
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    fail(file, "unterminated front matter (no closing `---`)");
    continue;
  }

  const meta = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const m = /^([a-z-]+):\s*(.+?)\s*$/.exec(line);
    if (!m) {
      fail(file, `unparseable front-matter line: ${JSON.stringify(line)}`);
      continue;
    }
    const [, key, rawValue] = m;
    if (!ALLOWED_KEYS.includes(key)) {
      fail(file, `unknown front-matter key "${key}" (allowed: ${ALLOWED_KEYS.join(", ")})`);
      continue;
    }
    if (key in meta) fail(file, `duplicate front-matter key "${key}"`);
    // Strip one layer of quotes (implemented-by values are quoted for `#`).
    meta[key] = rawValue.replace(/^"(.*)"$/, "$1");
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in meta)) fail(file, `missing required front-matter key "${key}"`);
  }
  if (meta.status !== undefined && !STATUSES.has(meta.status)) {
    fail(file, `invalid status "${meta.status}" (expected ${[...STATUSES].join(" | ")})`);
  }
  for (const key of ["created", "last-updated"]) {
    if (meta[key] !== undefined && !DATE_RE.test(meta[key])) {
      fail(file, `${key} is not a YYYY-MM-DD date: "${meta[key]}"`);
    }
  }
  if (
    DATE_RE.test(meta.created ?? "") &&
    DATE_RE.test(meta["last-updated"] ?? "") &&
    meta["last-updated"] < meta.created
  ) {
    fail(file, `last-updated (${meta["last-updated"]}) precedes created (${meta.created})`);
  }
  if (meta.status === "superseded" && !meta["superseded-by"]) {
    fail(file, 'status is "superseded" but superseded-by is missing');
  }
  if (meta["superseded-by"] && meta.status !== "superseded") {
    fail(file, `superseded-by is set but status is "${meta.status}" (expected "superseded")`);
  }

  byNumber.set(file.slice(0, 4), { file, meta });
}

// Cross-file: references exist and supersedes/superseded-by are bidirectional.
for (const [, { file, meta }] of byNumber) {
  for (const key of ["supersedes", "superseded-by"]) {
    const value = meta[key];
    if (value === undefined) continue;
    const m = REF_RE.exec(value);
    if (!m) {
      fail(file, `${key} must look like ADR-0008, got "${value}"`);
      continue;
    }
    const target = byNumber.get(m[1]);
    if (!target) {
      fail(file, `${key}: ${value} does not exist under ${ADR_DIR}/`);
      continue;
    }
    const inverseKey = key === "supersedes" ? "superseded-by" : "supersedes";
    const self = `ADR-${file.slice(0, 4)}`;
    if (target.meta[inverseKey] !== self) {
      fail(
        file,
        `${key}: ${value} must declare ${inverseKey}: ${self} (found "${target.meta[inverseKey] ?? "<unset>"}")`,
      );
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(
    `\nadr-front-matter-lint: ${errors.length} error(s) across ${files.length} ADR(s). See docs/adr/ADR-FORMAT.md > Front matter.`,
  );
  process.exit(1);
}
console.log(`✓ ADR front matter valid across ${files.length} ADR(s).`);
