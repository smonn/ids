import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Bench = {
  name: string;
  avg_ns: number;
  min_ns: number;
  p50_ns: number;
  p75_ns: number;
  p99_ns: number;
  samples: number;
};

export type Report = {
  schema: 1;
  node: string;
  platform: string;
  // Optional: reports produced before the model-keyed baseline cache (#1046)
  // predate this field, and the bench job's base-worktree fallback runs the
  // base commit's own bench script, which may be that old code. Absence is
  // valid, not an error.
  cpuModel?: string;
  benches: Bench[];
};

const WARN_THRESHOLD = 0.15;

// Severe-regression threshold for the *gating* benches. Only sync, ns-scale ops
// are eligible (see isBlockingEligible). The rationale assumes paired
// measurement: base and PR p50s come either from the same runner (the bench
// job's on-runner fallback) or from the same CPU model (the baseline cache is
// keyed by base sha *and* CPU model — see bench.yml, #1046). Same-runner
// run-to-run p50 drift is <1%, and same-model cross-VM drift stays well inside
// the warn threshold, so a 30% jump is real signal, not noise. Cross-model
// comparisons — where GitHub's heterogeneous fleet alone can move sync p50 by
// 10–30% — are structurally prevented by the cache key; if this script ever
// sees one anyway (standalone use, workflow drift), renderComment emits a
// cross-model caveat instead of silently trusting the thresholds.
const SEVERE_THRESHOLD = 0.3;

// opaque.* / wrapped.* / signed.* / digest.* operations use async crypto
// (AES-CBC, AES + HMAC, HMAC-SHA-256) whose p50 swings ±40% across GitHub's
// shared runners even on zero code changes — a property of OS scheduler and
// thermal jitter, not avoidable per-call overhead (keys are pre-imported once at
// codec construction, confirmed not a factor). That variance is wider than most
// genuine regressions, so these benches are reported for information only and
// never classified as severe. Their deltas still appear in the table (and can
// warn); they just never drive the severity summary.
const ASYNC_CRYPTO_PREFIXES = ["opaque.", "wrapped.", "signed.", "digest."];

/** Whether a bench's regression counts toward the severe-regression summary.
 * Async-crypto benches are excluded: their shared-runner variance is too high to
 * gate on. All other (sync, ns-scale) benches are eligible.
 */
export function isBlockingEligible(name: string): boolean {
  return !ASYNC_CRYPTO_PREFIXES.some((p) => name.startsWith(p));
}

const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;

function usage(): never {
  process.stderr.write("usage: compare <base.json> <pr.json>\n");
  process.exit(2);
}

function readReport(path: string): Report | null {
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (raw === "") return null;
    return JSON.parse(raw) as Report;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function fmtNs(ns: number): string {
  if (ns < 1) return `${(ns * 1000).toFixed(0)} ps`;
  if (ns < 1_000) return `${ns.toFixed(2)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
  return `${(ns / 1_000_000).toFixed(2)} ms`;
}

function fmtOpsPerSec(ns: number): string {
  const opsPerSec = 1e9 / ns;
  if (opsPerSec >= 1e6) return `${(opsPerSec / 1e6).toFixed(2)}M/s`;
  if (opsPerSec >= 1e3) return `${(opsPerSec / 1e3).toFixed(2)}k/s`;
  return `${opsPerSec.toFixed(0)}/s`;
}

function fmtDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)}%`;
}

/** Platform string for the footer, with CPU model appended when the report
 * carries one (reports from before #1046 don't).
 */
function provenance(r: Report): string {
  return r.cpuModel === undefined ? r.platform : `${r.platform} (${r.cpuModel})`;
}

type RowStatus = "severe" | "warn" | "improvement" | "new" | "removed" | "ok";

type Row = {
  status: RowStatus;
  cells: string; // "| bench | base | pr | delta | throughput" (no Notes cell)
};

const STATUS_NOTE: Record<Exclude<RowStatus, "ok">, string> = {
  severe: "🛑 **regression (severe)**",
  warn: "⚠️ regression (warn)",
  improvement: "🟢 improvement",
  new: "➕ new",
  removed: "➖ removed",
};

/** Render the PR comment for a bench comparison. `base === null` means the base
 * branch had no bench suite, so only absolute PR numbers are reported.
 */
export function renderComment(base: Report | null, pr: Report): string {
  const lines: string[] = [];

  if (base === null) {
    lines.push("## Benchmarks");
    lines.push("");
    lines.push(
      "_No baseline available (base branch has no bench suite yet). Reporting absolute numbers only._",
    );
    lines.push("");
    lines.push("| Bench | p50 | avg | Throughput | samples |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const b of pr.benches) {
      lines.push(
        `| \`${b.name}\` | ${fmtNs(b.p50_ns)} | ${fmtNs(b.avg_ns)} | ${fmtOpsPerSec(b.p50_ns)} | ${b.samples} |`,
      );
    }
    lines.push("");
    // Absolute numbers are only interpretable against the hardware that
    // produced them, so provenance matters here even more than on the
    // comparison path.
    lines.push(`<sub>PR: \`${pr.node}\` ${provenance(pr)}.</sub>`);
    return lines.join("\n") + "\n";
  }

  const baseByName = new Map(base.benches.map((b) => [b.name, b]));
  const rows: Row[] = [];
  let regressions = 0;
  let severe = 0;
  let improvements = 0;

  for (const cur of pr.benches) {
    const prev = baseByName.get(cur.name);
    if (prev === undefined) {
      rows.push({
        status: "new",
        cells: `| \`${cur.name}\` | — | ${fmtNs(cur.p50_ns)} | — | ${fmtOpsPerSec(cur.p50_ns)}`,
      });
      continue;
    }
    const delta = (cur.p50_ns - prev.p50_ns) / prev.p50_ns;
    let status: RowStatus = "ok";
    if (delta > WARN_THRESHOLD) {
      regressions++;
      if (isBlockingEligible(cur.name) && delta > SEVERE_THRESHOLD) {
        status = "severe";
        severe++;
      } else {
        status = "warn";
      }
    } else if (delta < -WARN_THRESHOLD) {
      status = "improvement";
      improvements++;
    }
    rows.push({
      status,
      cells: `| \`${cur.name}\` | ${fmtNs(prev.p50_ns)} | ${fmtNs(cur.p50_ns)} | ${fmtDelta(delta)} | ${fmtOpsPerSec(cur.p50_ns)}`,
    });
  }

  for (const prev of base.benches) {
    if (!pr.benches.some((b) => b.name === prev.name)) {
      rows.push({
        status: "removed",
        cells: `| \`${prev.name}\` | ${fmtNs(prev.p50_ns)} | — | — | —`,
      });
    }
  }

  const attention = rows.filter(
    (r): r is Row & { status: Exclude<RowStatus, "ok"> } => r.status !== "ok",
  );
  const quiet = rows.filter((r) => r.status === "ok");

  lines.push("## Benchmarks");
  lines.push("");

  // Headline: at-a-glance counts, worst first.
  const headline: string[] = [];
  if (severe > 0) headline.push(`🛑 **${severe} severe regression${severe === 1 ? "" : "s"}**`);
  if (regressions > severe)
    headline.push(
      `⚠️ ${regressions - severe} regression${regressions - severe === 1 ? "" : "s"} (warn)`,
    );
  if (improvements > 0)
    headline.push(`🟢 ${improvements} improvement${improvements === 1 ? "" : "s"}`);
  headline.push(`✅ ${quiet.length} within noise`);
  lines.push(headline.join(" · "));
  lines.push("");

  // Defense-in-depth: the model-keyed baseline cache (#1046) guarantees CI
  // never compares across CPU models, so this should not fire there. It exists
  // for standalone/local use of this script and as a tripwire against future
  // workflow drift. Informational only — classification above is unchanged,
  // because a second severity mode would complicate the contract for a path
  // that is structurally prevented in CI.
  if (base.cpuModel !== undefined && pr.cpuModel !== undefined && base.cpuModel !== pr.cpuModel) {
    lines.push(
      `> ⚠️ **Cross-model comparison**: the baseline was benched on a different CPU model ` +
        `(base \`${base.cpuModel}\` vs PR \`${pr.cpuModel}\`). Cross-model p50 differences of ` +
        `10–30% are common on shared runners, so the deltas and thresholds below are unreliable.`,
    );
    lines.push("");
  }

  if (attention.length > 0) {
    lines.push("| Bench | Base p50 | PR p50 | Δ p50 | PR throughput | Notes |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
    for (const r of attention) {
      lines.push(`${r.cells} | ${STATUS_NOTE[r.status]} |`);
    }
    lines.push("");
  }

  if (quiet.length > 0) {
    lines.push("<details>");
    lines.push(
      `<summary>✅ ${quiet.length} bench${quiet.length === 1 ? "" : "es"} within noise (±${pct(WARN_THRESHOLD)})</summary>`,
    );
    lines.push("");
    lines.push("| Bench | Base p50 | PR p50 | Δ p50 | PR throughput |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const r of quiet) {
      lines.push(`${r.cells} |`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  if (severe > 0) {
    lines.push(
      `⚠️ **${severe} severe regression${severe === 1 ? "" : "s"}** in sync benches (above +${pct(SEVERE_THRESHOLD)}).` +
        (regressions > severe
          ? ` ${regressions - severe} more above warn (±${pct(WARN_THRESHOLD)}).`
          : "") +
        ` This check is informational and does not block merge — please review before merging.`,
    );
    lines.push("");
  }

  lines.push(
    `<sub>Thresholds on p50: warn ±${pct(WARN_THRESHOLD)}; severe +${pct(SEVERE_THRESHOLD)} (sync benches only). ` +
      `opaque.* / wrapped.* / signed.* / digest.* are async-crypto and reported for information only — ` +
      `their shared-runner variance is too high to gate on. This check is informational and never fails. ` +
      `Base: \`${base.node}\` ${provenance(base)}. PR: \`${pr.node}\` ${provenance(pr)}.</sub>`,
  );

  return lines.join("\n") + "\n";
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const [, , basePath, prPath] = process.argv;
  if (basePath === undefined || prPath === undefined) usage();

  const base = readReport(basePath);
  const pr = readReport(prPath);

  if (pr === null) {
    process.stderr.write(`fatal: cannot read PR report at ${prPath}\n`);
    process.exit(2);
  }

  process.stdout.write(renderComment(base, pr));

  // Informational only: a regression never fails the check. Severe sync
  // regressions are flagged in the comment for a human to review. Genuine fatal
  // errors (e.g. an unreadable PR report) still exit non-zero above.
}
