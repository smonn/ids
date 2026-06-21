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

// opaque.* operations use AES-CBC async crypto whose p50 swings ±40% across
// GitHub's shared runners even on zero code changes — a property of OS scheduler
// and thermal jitter, not avoidable per-call overhead (the OpaqueKey handle is
// pre-imported once at codec construction, confirmed not a factor). 50% absorbs
// that noise floor while still catching a genuine severe regression (e.g.
// switching from a pre-imported to per-call key import would roughly double
// latency). All other benches operate in the ns range and tolerate the tighter
// 30% default.
const FAIL_THRESHOLD_OPAQUE = 0.5;
const FAIL_THRESHOLD_DEFAULT = 0.3;

// wrapped.* operations use AES + HMAC async crypto (WebCrypto) whose p50 swings on shared CI
// runners for the same reason as opaque.*. Same 50% threshold applied for consistency.
// Digest bench issues should follow the same async-bench variance pattern when added.
const FAIL_THRESHOLD_WRAPPED = FAIL_THRESHOLD_OPAQUE;

// signed.* operations use HMAC-SHA-256 async crypto whose p50 swings on shared CI
// runners for the same reason as opaque.* and wrapped.*. Same 50% threshold applied.
const FAIL_THRESHOLD_SIGNED = FAIL_THRESHOLD_OPAQUE;

/** Returns the blocking fail threshold for the given bench name.
 * opaque.*, wrapped.*, and signed.* benches get a higher threshold due to async crypto variance on shared CI runners.
 */
export function failThreshold(name: string): number {
  if (name.startsWith("opaque.")) return FAIL_THRESHOLD_OPAQUE;
  if (name.startsWith("wrapped.")) return FAIL_THRESHOLD_WRAPPED;
  if (name.startsWith("signed.")) return FAIL_THRESHOLD_SIGNED;
  return FAIL_THRESHOLD_DEFAULT;
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
  let blocking = 0;
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
      `Thresholds on p50: warn ±${pct(WARN_THRESHOLD)}, blocking +${pct(FAIL_THRESHOLD_DEFAULT)} (opaque.* / wrapped.* / signed.* +${pct(FAIL_THRESHOLD_OPAQUE)}). Base: \`${base.node}\` ${base.platform}. PR: \`${pr.node}\` ${pr.platform}.`,
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
      const threshold = failThreshold(cur.name);
      const delta = (cur.p50_ns - prev.p50_ns) / prev.p50_ns;
      let note = "";
      if (delta > WARN_THRESHOLD) {
        regressions++;
        if (delta > threshold) {
          note = "**regression (blocking)**";
          blocking++;
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
    if (blocking > 0) {
      lines.push(
        `**${blocking} blocking regression${blocking === 1 ? "" : "s"}** above the fail threshold.` +
          (regressions > blocking
            ? ` ${regressions - blocking} more above warn (±${pct(WARN_THRESHOLD)}).`
            : ""),
      );
    } else if (regressions > 0) {
      lines.push(
        `${regressions} regression${regressions === 1 ? "" : "s"} above warn (±${pct(WARN_THRESHOLD)}) but under the blocking threshold — not failing the check.`,
      );
    } else {
      lines.push(
        `No regressions above warn (±${pct(WARN_THRESHOLD)}).${improvements > 0 ? ` ${improvements} improvement${improvements === 1 ? "" : "s"}.` : ""}`,
      );
    }
  }

  process.stdout.write(lines.join("\n") + "\n");

  // Only a blocking-tier regression fails the check (and is therefore autofix-eligible).
  if (blocking > 0) process.exit(1);
}
