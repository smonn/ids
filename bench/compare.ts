import { readFileSync } from "node:fs";

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

const REGRESSION_THRESHOLD = 0.15;

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
    `Threshold: ±${(REGRESSION_THRESHOLD * 100).toFixed(0)}% on p50. Base: \`${base.node}\` ${base.platform}. PR: \`${pr.node}\` ${pr.platform}.`,
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
    if (delta > REGRESSION_THRESHOLD) {
      note = "**regression**";
      regressions++;
    } else if (delta < -REGRESSION_THRESHOLD) {
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
  if (regressions > 0) {
    lines.push(
      `**${regressions} regression${regressions === 1 ? "" : "s"} above the ${(REGRESSION_THRESHOLD * 100).toFixed(0)}% threshold.**`,
    );
  } else {
    lines.push(
      `No regressions above the ${(REGRESSION_THRESHOLD * 100).toFixed(0)}% threshold.${improvements > 0 ? ` ${improvements} improvement${improvements === 1 ? "" : "s"}.` : ""}`,
    );
  }
}

process.stdout.write(lines.join("\n") + "\n");

if (regressions > 0) process.exit(1);
