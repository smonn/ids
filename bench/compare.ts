import { readFileSync } from "node:fs";

type Bench = {
  name: string;
  min_ns: number;
  avg_ns: number;
  p50_ns: number;
  p99_ns: number;
  max_ns: number;
  samples: number;
};

type Report = {
  schema: 1;
  node: string;
  platform: string;
  benches: Bench[];
};

// Gate on `min`, not p50. Shared-CI noise is upward-only (contention, GC, thermal
// throttling can only make a sample slower), so the minimum approximates the
// uncontended intrinsic cost and is far more stable run-to-run than the median —
// which drifts with the whole distribution. A real regression raises the floor;
// noise does not. The table still shows p50/mean/p99/max so the spread is visible.
const WARN_THRESHOLD = 0.15;
const FAIL_THRESHOLD = 0.3;

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

function fmtDelta(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

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
  lines.push("| Bench | min | mean | p50 | p99 | max | samples |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const b of pr.benches) {
    lines.push(
      `| \`${b.name}\` | ${fmtNs(b.min_ns)} | ${fmtNs(b.avg_ns)} | ${fmtNs(b.p50_ns)} | ${fmtNs(b.p99_ns)} | ${fmtNs(b.max_ns)} | ${b.samples} |`,
    );
  }
} else {
  const baseByName = new Map(base.benches.map((b) => [b.name, b]));
  lines.push("## Benchmarks");
  lines.push("");
  lines.push(
    `Gated on **min** (Δ min): warn ±${pct(WARN_THRESHOLD)}, blocking +${pct(FAIL_THRESHOLD)}. ` +
      `p50/mean/p99/max are PR-side context only. Base: \`${base.node}\` ${base.platform}. PR: \`${pr.node}\` ${pr.platform}.`,
  );
  lines.push("");
  lines.push("| Bench | Base min | PR min | Δ min | p50 | mean | p99 | max | Notes |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");

  for (const cur of pr.benches) {
    const prev = baseByName.get(cur.name);
    if (prev === undefined) {
      lines.push(
        `| \`${cur.name}\` | — | ${fmtNs(cur.min_ns)} | new | ${fmtNs(cur.p50_ns)} | ${fmtNs(cur.avg_ns)} | ${fmtNs(cur.p99_ns)} | ${fmtNs(cur.max_ns)} | — |`,
      );
      continue;
    }
    const delta = (cur.min_ns - prev.min_ns) / prev.min_ns;
    let note = "";
    if (delta > WARN_THRESHOLD) {
      regressions++;
      if (delta > FAIL_THRESHOLD) {
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
      `| \`${cur.name}\` | ${fmtNs(prev.min_ns)} | ${fmtNs(cur.min_ns)} | ${fmtDelta(delta)} | ${fmtNs(cur.p50_ns)} | ${fmtNs(cur.avg_ns)} | ${fmtNs(cur.p99_ns)} | ${fmtNs(cur.max_ns)} | ${note} |`,
    );
  }

  for (const prev of base.benches) {
    if (!pr.benches.some((b) => b.name === prev.name)) {
      lines.push(`| \`${prev.name}\` | ${fmtNs(prev.min_ns)} | — | removed | — | — | — | — | — |`);
    }
  }

  lines.push("");
  if (blocking > 0) {
    lines.push(
      `**${blocking} blocking regression${blocking === 1 ? "" : "s"}** above the fail threshold (+${pct(FAIL_THRESHOLD)} on min).` +
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
