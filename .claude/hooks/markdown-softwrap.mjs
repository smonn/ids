#!/usr/bin/env node
// PostToolUse check for Markdown soft-wrap.
//
// Prose in this repo's Markdown is soft-wrapped: one source line per paragraph,
// no hard line breaks mid-paragraph (see AGENTS.md "Markdown style"). This is
// enforced statically by oxfmt's `proseWrap: "never"` override in .oxfmtrc.json
// and in CI via `pnpm fmt:check`.
//
// This hook closes the loop for agents: after an agent writes or edits a
// Markdown file, it runs `oxfmt --check` on just that file and — if the file is
// not soft-wrapped (or otherwise drifts from oxfmt's Markdown format) — feeds
// the fix back so the agent corrects it in the same turn instead of waiting for
// CI. The Starlight site under website/ is exempt (oxfmt's CommonMark/GFM
// formatter corrupts Starlight ::: directives), and the hook honors that
// automatically because oxfmt reads the same .oxfmtrc.json.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { relative, isAbsolute, join } from "node:path";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // unparseable stdin — fail open, don't block
}

const filePath = input?.tool_input?.file_path;
if (typeof filePath !== "string" || !/\.mdx?$/.test(filePath)) {
  process.exit(0); // not a Markdown edit — nothing to check
}

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = isAbsolute(filePath) ? relative(projectDir, filePath) : filePath;

// Outside the project tree (e.g. a scratch file) — not our concern.
if (rel.startsWith("..")) process.exit(0);

const oxfmt = join(projectDir, "node_modules", ".bin", "oxfmt");
const result = spawnSync(oxfmt, ["--check", rel], {
  cwd: projectDir,
  encoding: "utf8",
});

// oxfmt missing or crashed — fail open rather than nag with a false positive.
if (result.error || typeof result.status !== "number") process.exit(0);
if (result.status === 0) process.exit(0); // already soft-wrapped — all good

// oxfmt exits 2 ("Expected at least one target file") when every matched file
// was excluded by .oxfmtrc.json ignore rules — i.e. the edited file lives under
// an ephemeral/generated dir we deliberately don't format (.impl/, .address/,
// .impl-context/, .address-context/, .review-context/, .claude/). There is
// nothing to check, so fail open rather than nagging the agent into editing
// .oxfmtrc.json or .gitignore to "fix" the false positive. Only a genuine
// format drift (exit 1) should block.
if (result.status !== 1) process.exit(0);

const reason =
  `${rel} is not soft-wrapped. This repo wraps Markdown prose with oxfmt's ` +
  `proseWrap: "never" — one source line per paragraph, no hard line breaks ` +
  `mid-paragraph (see AGENTS.md "Markdown style"). Run ` +
  `\`node_modules/.bin/oxfmt --write ${rel}\` (or \`pnpm fmt\`) to fix it, then ` +
  `re-read the file before editing further. CI runs \`pnpm fmt:check\` and will ` +
  `fail until this is fixed.`;

process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason,
  }),
);
process.exit(0);
