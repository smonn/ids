import { createId, type Id, type Options } from "./id.js";

export type RunOpts = {
  argv: ReadonlyArray<string>;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  now?: Options["now"];
  rng?: Options["rng"];
};

export function run(opts: RunOpts): number {
  const [subcommand, ...rest] = opts.argv;
  if (subcommand === "generate" || subcommand === "g") return runGenerate(rest, opts);
  if (subcommand === "inspect" || subcommand === "i") return runInspect(rest, opts);
  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    opts.stdout(usage());
    return 0;
  }
  opts.stderr(usage());
  return 1;
}

function usage(): string {
  return [
    "Usage: ids <subcommand> [args]",
    "",
    "Subcommands:",
    "  inspect, i <id>                       Decode an ID and print brand, timestamp, and canonical form.",
    "  generate, g <brand> [--count, -c N]   Mint one or more canonical IDs for the given brand.",
    "",
  ].join("\n");
}

function runInspect(args: ReadonlyArray<string>, opts: RunOpts): number {
  const [input] = args;
  if (input === undefined) {
    opts.stderr(usage());
    return 1;
  }
  const brand = input.slice(0, 3).toLowerCase();
  let codec;
  try {
    codec = createId(brand, codecOpts(opts));
  } catch (err) {
    opts.stderr((err as Error).message + "\n");
    return 1;
  }
  const validation = codec["~standard"].validate(input);
  if (validation.issues) {
    opts.stderr(validation.issues[0]!.message + "\n");
    return 1;
  }
  const canonical = validation.value;
  const timestamp = codec.extractTimestamp(canonical);
  const nowMs = (opts.now ?? Date.now)();
  const relative = formatRelative(timestamp.getTime(), nowMs);
  const inputLine = describeInputForm(input, canonical);
  opts.stdout(
    [
      `brand:     ${brand}`,
      `timestamp: ${timestamp.toISOString()} (${relative})`,
      `canonical: ${canonical}`,
      `input:     ${inputLine}`,
      "",
    ].join("\n"),
  );
  return 0;
}

function describeInputForm(input: string, canonical: Id<string>): string {
  if (input === canonical) return "canonical";
  const notes: string[] = [];
  if (input !== input.toLowerCase()) notes.push("was uppercase");
  if (/[ilo]/i.test(input.slice(4))) notes.push("used Crockford aliases");
  return `not canonical (${notes.join(" + ")})`;
}

const msPerSecond = 1000;
const msPerMinute = 60 * msPerSecond;
const msPerHour = 60 * msPerMinute;
const msPerDay = 24 * msPerHour;
const daysPerMonth = 30.44;
const monthsPerYear = 12;

function formatRelative(thenMs: number, nowMs: number): string {
  const diff = nowMs - thenMs;
  const abs = Math.abs(diff);
  const suffix = diff < 0 ? "from now" : "ago";

  const head = headUnits(abs);
  return head === "" ? "just now" : `${head} ${suffix}`;
}

function headUnits(abs: number): string {
  if (abs < msPerMinute) return "";
  if (abs < msPerHour) return unit(Math.round(abs / msPerMinute), "minute");
  if (abs < msPerDay) return unit(Math.round(abs / msPerHour), "hour");
  if (abs < msPerDay * daysPerMonth) return unit(Math.round(abs / msPerDay), "day");

  const totalMonths = Math.round(abs / (msPerDay * daysPerMonth));
  if (totalMonths < monthsPerYear) return unit(totalMonths, "month");

  const years = Math.floor(totalMonths / monthsPerYear);
  const months = totalMonths % monthsPerYear;
  return months === 0 ? unit(years, "year") : `${unit(years, "year")} ${unit(months, "month")}`;
}

function unit(n: number, name: string): string {
  return `${n} ${n === 1 ? name : `${name}s`}`;
}

function runGenerate(args: ReadonlyArray<string>, opts: RunOpts): number {
  const [brand, ...flags] = args;
  const count = parseCount(flags);
  if (typeof count === "string") {
    opts.stderr(count + "\n");
    return 1;
  }
  let codec;
  try {
    codec = createId(brand ?? "", codecOpts(opts));
  } catch (err) {
    opts.stderr((err as Error).message + "\n");
    return 1;
  }
  for (let i = 0; i < count; i++) opts.stdout(codec.generate() + "\n");
  return 0;
}

function parseCount(flags: ReadonlyArray<string>): number | string {
  const idx = flags.findIndex((f) => f === "--count" || f === "-c");
  if (idx === -1) return 1;
  const raw = flags[idx + 1];
  if (raw === undefined) return "--count requires a value";
  if (!/^[1-9][0-9]*$/.test(raw)) return `--count must be a positive integer, got '${raw}'`;
  return Number(raw);
}

function codecOpts(opts: RunOpts): Partial<Options> {
  const o: Partial<Options> = {};
  if (opts.now !== undefined) o.now = opts.now;
  if (opts.rng !== undefined) o.rng = opts.rng;
  return o;
}
