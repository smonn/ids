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

type Report = {
  schema: 1;
  node: string;
  platform: string;
  benches: Bench[];
};

const WARN_THRESHOLD = 0.15;

// Severe-regression threshold for the *gating* benches. Only sync, ns-scale ops
// are eligible (see isBlockingEligible): their run-to-run p50 drift is <1% on
// shared CI runners, so a 30% jump is real signal, not noise.
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

  const lines: string[] = [];
  let regressions = 0;
  let severe = 0;
  let improvements = 0;

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
  } else {
    const baseByName = new Map(base.benches.map((b) => [b.name, b]));
    lines.push("## Benchmarks");
    lines.push("");
    lines.push(
      `Thresholds on p50: warn ±${pct(WARN_THRESHOLD)}; severe +${pct(SEVERE_THRESHOLD)} (sync benches only). ` +
        `opaque.* / wrapped.* / signed.* / digest.* are async-crypto and reported for information only — ` +
        `their shared-runner variance is too high to gate on. This check is informational and never fails. ` +
        `Base: \`${base.node}\` ${base.platform}. PR: \`${pr.node}\` ${pr.platform}.`,
    );
    lines.push("");
    lines.push("| Bench | Base p50 | PR p50 | Δ p50 | PR throughput | Notes |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- |");

    for (const cur of pr.benches) {
      const prev = baseByName.get(cur.name);
      if (prev === undefined) {
        lines.push(
          `| \`${cur.name}\` | — | ${fmtNs(cur.p50_ns)} | new | ${fmtOpsPerSec(cur.p50_ns)} | — |`,
        );
        continue;
      }
      const delta = (cur.p50_ns - prev.p50_ns) / prev.p50_ns;
      let note = "";
      if (delta > WARN_THRESHOLD) {
        regressions++;
        if (isBlockingEligible(cur.name) && delta > SEVERE_THRESHOLD) {
          note = "**regression (severe)**";
          severe++;
        } else {
          note = "regression (warn)";
        }
      } else if (delta < -WARN_THRESHOLD) {
        note = "improvement";
        improvements++;
      }
      lines.push(
        `| \`${cur.name}\` | ${fmtNs(prev.p50_ns)} | ${fmtNs(cur.p50_ns)} | ${fmtDelta(delta)} | ${fmtOpsPerSec(cur.p50_ns)} | ${note} |`,
      );
    }

    for (const prev of base.benches) {
      if (!pr.benches.some((b) => b.name === prev.name)) {
        lines.push(`| \`${prev.name}\` | ${fmtNs(prev.p50_ns)} | — | removed | — | — |`);
      }
    }

    lines.push("");
    if (severe > 0) {
      lines.push(
        `⚠️ **${severe} severe regression${severe === 1 ? "" : "s"}** in sync benches (above +${pct(SEVERE_THRESHOLD)}).` +
          (regressions > severe
            ? ` ${regressions - severe} more above warn (±${pct(WARN_THRESHOLD)}).`
            : "") +
          ` This check is informational and does not block merge — please review before merging.`,
      );
    } else if (regressions > 0) {
      lines.push(
        `${regressions} regression${regressions === 1 ? "" : "s"} above warn (±${pct(WARN_THRESHOLD)}), none severe. Informational only.`,
      );
    } else {
      lines.push(
        `No regressions above warn (±${pct(WARN_THRESHOLD)}).${improvements > 0 ? ` ${improvements} improvement${improvements === 1 ? "" : "s"}.` : ""}`,
      );
    }
  }

  process.stdout.write(lines.join("\n") + "\n");

  // Informational only: a regression never fails the check. Severe sync
  // regressions are flagged in the comment for a human to review. Genuine fatal
  // errors (e.g. an unreadable PR report) still exit non-zero above.
}
