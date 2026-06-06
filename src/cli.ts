import { createId, type Options } from "./id.js";
import {
  createOpaqueId,
  decodeOpaqueKey,
  encodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKeyFormat,
} from "./opaque.js";
import type { Id } from "./types.js";

export type RunOpts = {
  argv: ReadonlyArray<string>;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  now?: Options["now"];
  rng?: Options["rng"];
  /** Defaults to `process.env`. Injected in tests for `IDS_KEY`. */
  env?: Readonly<Record<string, string | undefined>>;
};

export async function run(opts: RunOpts): Promise<number> {
  const [subcommand, ...rest] = opts.argv;
  if (subcommand === "generate" || subcommand === "g") return runGenerate(rest, opts);
  if (subcommand === "inspect" || subcommand === "i") return runInspect(rest, opts);
  if (subcommand === "keygen" || subcommand === "k") return runKeygen(rest, opts);
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
    "  inspect, i <id> [--opaque] [--key-format hex|base64url]",
    "    Decode an ID and print brand, timestamp, and canonical form.",
    "    --opaque reads the AES key from IDS_KEY (default format: hex).",
    "  generate, g <brand> [--count, -c N] [--opaque] [--key-format hex|base64url]",
    "    Mint one or more canonical IDs for the given brand.",
    "    --opaque reads the AES key from IDS_KEY (default format: hex).",
    "  keygen, k [--bits 128|256] [--key-format hex|base64url]",
    "    Emit a random AES key for importOpaqueKey (stdout only).",
    "",
  ].join("\n");
}

function runInspect(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals } = splitFlags(args);
  const [input] = positionals;
  if (input === undefined) {
    opts.stderr(usage());
    return Promise.resolve(1);
  }
  const opaque = flags.has("--opaque");
  const brand = input.slice(0, 3).toLowerCase();
  if (opaque) {
    const format = parseOpaqueKeyFormat(values, opts);
    if (isKeyFormatError(format)) {
      opts.stderr(format + "\n");
      return Promise.resolve(1);
    }
    return runOpaqueInspect(brand, input, format, opts);
  }
  let codec;
  try {
    codec = createId(brand, codecOpts(opts));
  } catch (err) {
    opts.stderr((err as Error).message + "\n");
    return Promise.resolve(1);
  }
  const validation = codec["~standard"].validate(input);
  if (validation.issues) {
    opts.stderr(validation.issues[0]!.message + "\n");
    return Promise.resolve(1);
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
  return Promise.resolve(0);
}

async function runOpaqueInspect(
  brand: string,
  input: string,
  format: OpaqueKeyFormat,
  opts: RunOpts,
): Promise<number> {
  const keyResult = await loadOpaqueKey(opts, format);
  if (typeof keyResult === "string") {
    opts.stderr(keyResult + "\n");
    return 1;
  }
  let codec;
  try {
    codec = createOpaqueId(brand, { key: keyResult, ...codecOpts(opts) });
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
  const timestamp = await codec.extractTimestamp(canonical);
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

function runGenerate(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals } = splitFlags(args);
  const [brand] = positionals;
  const count = parseCount(values);
  if (typeof count === "string") {
    opts.stderr(count + "\n");
    return Promise.resolve(1);
  }
  const opaque = flags.has("--opaque");
  if (opaque) {
    const format = parseOpaqueKeyFormat(values, opts);
    if (isKeyFormatError(format)) {
      opts.stderr(format + "\n");
      return Promise.resolve(1);
    }
    return runOpaqueGenerate(brand ?? "", count, format, opts);
  }
  let codec;
  try {
    codec = createId(brand ?? "", codecOpts(opts));
  } catch (err) {
    opts.stderr((err as Error).message + "\n");
    return Promise.resolve(1);
  }
  for (let i = 0; i < count; i++) opts.stdout(codec.generate() + "\n");
  return Promise.resolve(0);
}

async function runOpaqueGenerate(
  brand: string,
  count: number,
  format: OpaqueKeyFormat,
  opts: RunOpts,
): Promise<number> {
  const keyResult = await loadOpaqueKey(opts, format);
  if (typeof keyResult === "string") {
    opts.stderr(keyResult + "\n");
    return 1;
  }
  let codec;
  try {
    codec = createOpaqueId(brand, { key: keyResult, ...codecOpts(opts) });
  } catch (err) {
    opts.stderr((err as Error).message + "\n");
    return 1;
  }
  for (let i = 0; i < count; i++) opts.stdout((await codec.generate()) + "\n");
  return 0;
}

function runKeygen(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { values } = splitFlags(args);
  const bits = parseBits(values);
  if (typeof bits === "string") {
    opts.stderr(bits + "\n");
    return Promise.resolve(1);
  }
  const format = parseKeygenFormat(values);
  if (isKeyFormatError(format)) {
    opts.stderr(format + "\n");
    return Promise.resolve(1);
  }
  const bytes = new Uint8Array(bits / 8);
  crypto.getRandomValues(bytes);
  opts.stdout(encodeOpaqueKey(bytes, format) + "\n");
  return Promise.resolve(0);
}

async function loadOpaqueKey(opts: RunOpts, format: OpaqueKeyFormat): Promise<CryptoKey | string> {
  const env = opts.env ?? process.env;
  const raw = env.IDS_KEY;
  if (raw === undefined || raw === "") return "missing IDS_KEY environment variable";
  try {
    return importOpaqueKey(decodeOpaqueKey(raw, format));
  } catch (err) {
    return (err as Error).message;
  }
}

function parseCount(values: Map<string, string>): number | string {
  const raw = values.get("--count") ?? values.get("-c");
  if (raw === undefined) return 1;
  if (raw === "") return "--count requires a value";
  if (!/^[1-9][0-9]*$/.test(raw)) return `--count must be a positive integer, got '${raw}'`;
  return Number(raw);
}

function parseBits(values: Map<string, string>): number | string {
  const raw = values.get("--bits");
  if (raw === undefined) return 256;
  if (raw === "") return "--bits requires a value";
  if (raw === "128") return 128;
  if (raw === "256") return 256;
  return `--bits must be 128 or 256, got '${raw}'`;
}

function isKeyFormatError(result: OpaqueKeyFormat | string): result is string {
  return result !== "hex" && result !== "base64url";
}

function parseKeyFormatFlag(values: Map<string, string>): OpaqueKeyFormat | string | undefined {
  const fromFlag = values.get("--key-format");
  if (fromFlag === undefined) return undefined;
  if (fromFlag === "") return "--key-format requires a value";
  if (fromFlag === "hex" || fromFlag === "base64url") return fromFlag;
  return `--key-format must be hex or base64url, got '${fromFlag}'`;
}

function parseKeygenFormat(values: Map<string, string>): OpaqueKeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag === undefined) return "hex";
  return fromFlag;
}

function parseOpaqueKeyFormat(values: Map<string, string>, opts: RunOpts): OpaqueKeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag !== undefined) return fromFlag;
  const env = opts.env ?? process.env;
  const fromEnv = env.IDS_KEY_FORMAT;
  if (fromEnv === undefined || fromEnv === "") return "hex";
  if (fromEnv === "hex" || fromEnv === "base64url") return fromEnv;
  return `IDS_KEY_FORMAT must be hex or base64url, got '${fromEnv}'`;
}

type ParsedFlags = {
  flags: Set<string>;
  values: Map<string, string>;
  positionals: string[];
};

function splitFlagToken(arg: string): { flag: string; inlineValue: string | undefined } {
  const eq = arg.indexOf("=");
  if (eq <= 0) return { flag: arg, inlineValue: undefined };
  return { flag: arg.slice(0, eq), inlineValue: arg.slice(eq + 1) };
}

function splitFlags(args: ReadonlyArray<string>): ParsedFlags {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];
  const valueFlags = new Set(["--count", "-c", "--bits", "--key-format"]);
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]!;
    const { flag, inlineValue } = splitFlagToken(raw);
    if (flag === "--opaque") {
      flags.add(flag);
      continue;
    }
    if (valueFlags.has(flag)) {
      if (inlineValue !== undefined) {
        flags.add(flag);
        values.set(flag, inlineValue);
        continue;
      }
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        values.set(flag, "");
        continue;
      }
      flags.add(flag);
      values.set(flag, value);
      i++;
      continue;
    }
    if (flag.startsWith("-")) {
      flags.add(flag);
      continue;
    }
    positionals.push(raw);
  }
  return { flags, values, positionals };
}

function codecOpts(opts: RunOpts): Partial<Options> {
  // CLI invocations are intentionally ephemeral — one codec per run, never
  // retained — so a repeated `createId(brand)` here is not the bundling/import
  // bug that the duplicate-brand warning is designed to catch.
  const o: Partial<Options> = { allowDuplicateBrand: true };
  if (opts.now !== undefined) o.now = opts.now;
  if (opts.rng !== undefined) o.rng = opts.rng;
  return o;
}
