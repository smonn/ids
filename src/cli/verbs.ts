import { isIdsError } from "../error.js";
import type { Id } from "../types.js";
import { type FlagSpec, parseArgs } from "./args.js";
import { type CliError, exitCodeFor, isCliError, runtimeError, usageError } from "./errors.js";
import {
  isKindError,
  isNsError,
  parseCount,
  parseKind,
  parseNs,
  type WrappedKindValue,
} from "./flags.js";
import { formatCliError } from "./format.js";
import { type CodecKey, resolveKey } from "./key.js";
import {
  formatInspectHuman,
  formatInspectJson,
  formatMatchHuman,
  formatMatchJson,
  type InspectReport,
} from "./output.js";
import type { RunOpts } from "./types.js";

/** Minimal contract a generate verb needs from a constructed codec. */
type Minter = {
  generate(): string | Promise<string>;
  generateAt(date: Date): string | Promise<string>;
};

/** IdsError codes that signal a malformed invocation (exit 2) rather than a runtime fault (exit 1). */
const usageCodes: ReadonlySet<string> = new Set([
  "invalid_brand",
  "invalid_timestamp",
  "invalid_namespace",
  "invalid_kind",
  "invalid_lookup_key",
  "invalid_key_length",
  "invalid_key_encoding",
  "invalid_key_format",
]);

export function mapThrown(err: unknown): CliError {
  if (isIdsError(err)) {
    return usageCodes.has(err.code)
      ? usageError(formatCliError(err))
      : runtimeError(formatCliError(err));
  }
  return runtimeError(formatCliError(err));
}

/** Lowercased three-letter brand of an ID, or a runtime invalid_id error if it doesn't look like one. */
export function brandOfId(id: string): string | CliError {
  if (!/^[a-z]{3}_/i.test(id)) return runtimeError("invalid_id: not a valid ID");
  return id.slice(0, 3).toLowerCase();
}

export function fail(opts: RunOpts, error: CliError): number {
  opts.stderr(error.message + "\n");
  return exitCodeFor(error);
}

function parseCountValue(values: Map<string, string>): number | CliError {
  const result = parseCount(values);
  return typeof result === "string" ? usageError(result) : result;
}

function toUtcIso(raw: string): string {
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (hasTz) return raw;
  return raw.includes("T") ? `${raw}Z` : `${raw}T00:00:00Z`;
}

function parseAt(values: Map<string, string>): Date | undefined | CliError {
  const raw = values.get("--at");
  if (raw === undefined) return undefined;
  if (raw === "") return usageError("--at requires a value");
  // A leading-minus integer is still epoch-ms (a pre-epoch instant), not an ISO string;
  // generateAt then rejects it with invalid_timestamp (mapped to a usage error).
  const date = /^-?\d+$/.test(raw) ? new Date(Number(raw)) : new Date(toUtcIso(raw));
  if (Number.isNaN(date.getTime())) return usageError(`--at: invalid date '${raw}'`);
  return date;
}

function generateSpecs(keyed: boolean): FlagSpec[] {
  const specs: FlagSpec[] = [
    { name: "--count", alias: "-c", value: true },
    { name: "--at", value: true },
  ];
  if (keyed) {
    specs.push(
      { name: "--key", value: true },
      { name: "--key-file", value: true },
      { name: "--key-encoding", value: true },
    );
  }
  return specs;
}

async function runGenerate(
  keyed: boolean,
  resolveAndBuild: (
    brand: string,
    values: Map<string, string>,
    flags: Set<string>,
  ) => Promise<Minter | CliError>,
  argv: ReadonlyArray<string>,
  opts: RunOpts,
): Promise<number> {
  const { values, flags, positionals, error } = parseArgs(argv, generateSpecs(keyed));
  if (error !== undefined) return fail(opts, usageError(error));

  const brand = positionals[0];
  if (brand === undefined) return fail(opts, usageError("missing brand"));
  if (positionals.length > 1) {
    return fail(opts, usageError(`unexpected argument: ${positionals[1]!}`));
  }

  const count = parseCountValue(values);
  if (isCliError(count)) return fail(opts, count);
  const at = parseAt(values);
  if (isCliError(at)) return fail(opts, at);

  let minter: Minter;
  try {
    const built = await resolveAndBuild(brand, values, flags);
    if (isCliError(built)) return fail(opts, built);
    minter = built;
  } catch (err) {
    return fail(opts, mapThrown(err));
  }

  try {
    for (let i = 0; i < count; i++) {
      const id = at !== undefined ? await minter.generateAt(at) : await minter.generate();
      opts.stdout(`${id}\n`);
    }
  } catch (err) {
    return fail(opts, mapThrown(err));
  }
  return 0;
}

/** Generate verb for keyless codecs (timestamp, reverse). */
export function runGenerateKeyless(
  build: (brand: string, opts: RunOpts) => Minter,
  argv: ReadonlyArray<string>,
  opts: RunOpts,
): Promise<number> {
  return runGenerate(false, (brand) => Promise.resolve(build(brand, opts)), argv, opts);
}

/** Generate verb for keyed codecs (signed, opaque). */
export function runGenerateKeyed<K>(
  codecKey: CodecKey<K>,
  build: (brand: string, opts: RunOpts, key: K) => Minter,
  argv: ReadonlyArray<string>,
  opts: RunOpts,
): Promise<number> {
  return runGenerate(
    true,
    async (brand, values, flags) => {
      const key = await resolveKey(values, flags, opts, codecKey);
      if (isCliError(key)) return key;
      return build(brand, opts, key);
    },
    argv,
    opts,
  );
}

let stdinCache: Promise<string> | undefined;
/* v8 ignore start -- reads process.stdin; exercised only in the real binary, not unit tests */
function readProcessStdin(): Promise<string> {
  if (stdinCache === undefined) {
    stdinCache = new Promise<string>((resolve) => {
      const chunks: string[] = [];
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk: string) => chunks.push(chunk));
      process.stdin.on("end", () => resolve(chunks.join("")));
      process.stdin.resume();
    });
  }
  return stdinCache;
}
/* v8 ignore stop */

/**
 * Read all of stdin (injectable via `opts.readStdin`). Used for batch `inspect` IDs
 * and for digest material when `--material` is absent.
 */
function readAllStdin(opts: RunOpts): Promise<string> {
  return (opts.readStdin ?? readProcessStdin)();
}

/** Recovers a report from one ID, or a per-ID error (e.g. malformed input). */
type Recover = (id: string) => Promise<InspectReport | CliError>;

/**
 * Per-codec inspect configuration. `prepare` runs once with the resolved key (if any)
 * and returns either the per-ID recovery function or a setup-time {@link CliError}
 * (e.g. a bad `--kind`) — so an invocation-level error is reported once, not per line.
 */
export type InspectSpec<K> = {
  readonly keyed: boolean;
  readonly codecKey?: CodecKey<K>;
  readonly extraFlags?: readonly FlagSpec[];
  readonly prepare: (
    opts: RunOpts,
    key: K | undefined,
    values: Map<string, string>,
  ) => Recover | CliError;
};

/**
 * Shared `inspect` runner: one ID positional, or many via stdin (best-effort,
 * stdout = successes only). `--json` switches to NDJSON; `--quiet` silences stdout.
 */
export async function runInspect<K>(
  spec: InspectSpec<K>,
  argv: ReadonlyArray<string>,
  opts: RunOpts,
): Promise<number> {
  const specs: FlagSpec[] = [
    { name: "--json", value: false },
    { name: "--quiet", value: false },
    ...(spec.extraFlags ?? []),
  ];
  if (spec.keyed) {
    specs.push(
      { name: "--key", value: true },
      { name: "--key-file", value: true },
      { name: "--key-encoding", value: true },
    );
  }

  const { values, flags, positionals, error } = parseArgs(argv, specs);
  if (error !== undefined) return fail(opts, usageError(error));
  if (positionals.length > 1) {
    return fail(opts, usageError(`unexpected argument: ${positionals[1]!}`));
  }

  // Resolve the key and bind recovery BEFORE reading stdin, so a bad key or bad
  // setup flag fails fast rather than after consuming piped input (#766).
  let key: K | undefined;
  if (spec.keyed) {
    const resolved = await resolveKey(values, flags, opts, spec.codecKey!);
    if (isCliError(resolved)) return fail(opts, resolved);
    key = resolved;
  }
  const recover = spec.prepare(opts, key, values);
  if (isCliError(recover)) return fail(opts, recover);

  const single = positionals.length === 1;
  let inputs: string[];
  if (single) {
    inputs = [positionals[0]!];
  } else {
    const raw = await readAllStdin(opts);
    inputs = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (inputs.length === 0) {
      return fail(opts, usageError("missing id: provide an id argument or pipe ids on stdin"));
    }
  }

  const json = flags.has("--json");
  const quiet = flags.has("--quiet");
  let anyFail = false;
  for (const input of inputs) {
    let report: InspectReport | CliError;
    try {
      report = await recover(input);
    } catch (err) {
      report = mapThrown(err);
    }
    if (isCliError(report)) {
      if (single) return fail(opts, report);
      anyFail = true;
      opts.stderr(`${input}: ${report.message}\n`);
      continue;
    }
    if (!quiet) opts.stdout(json ? formatInspectJson(report) : formatInspectHuman(report));
  }
  return anyFail ? 1 : 0;
}

/**
 * InspectSpec for a keyless timestamp-family codec (Timestamp, Reverse Timestamp):
 * structural parse, then a plaintext timestamp read. Removes the per-codec duplication.
 */
export function keylessTimestampInspect(
  codecName: string,
  make: (
    brand: string,
    opts: RunOpts,
  ) => {
    safeParse(value: unknown): { ok: true; id: Id<string> } | { ok: false; error: string };
    extractTimestamp(id: Id<string>): Date;
    toUUID(id: Id<string>): string;
  },
): InspectSpec<never> {
  return {
    keyed: false,
    prepare: (o) => (id) => {
      const brand = brandOfId(id);
      if (isCliError(brand)) return Promise.resolve(brand);
      const codec = make(brand, o);
      const parsed = codec.safeParse(id);
      if (!parsed.ok) return Promise.resolve(runtimeError(`invalid_id: ${parsed.error}`));
      const ts = codec.extractTimestamp(parsed.id);
      return Promise.resolve({
        shape: "timestamp",
        brand,
        codec: codecName,
        ms: ts.getTime(),
        uuid: codec.toUUID(parsed.id),
      });
    },
  };
}

function parseLookupValue(kind: WrappedKindValue, raw: string): number | bigint | CliError {
  if (raw === "") return usageError("--value requires a value");
  if (kind === "u32" || kind === "i32") {
    if (!/^-?\d+$/.test(raw)) return usageError(`--value must be an integer, got '${raw}'`);
    const n = Number(raw);
    const [min, max] = kind === "u32" ? [0, 4_294_967_295] : [-2_147_483_648, 2_147_483_647];
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      return usageError(`--value out of range for ${kind}: ${raw}`);
    }
    return n;
  }
  // Guard before BigInt(): it would otherwise accept 0x/0o/0b prefixes and surrounding
  // whitespace, silently turning a typo'd value into a wrong-but-valid integer.
  if (!/^-?\d+$/.test(raw)) return usageError(`--value must be an integer, got '${raw}'`);
  const value = BigInt(raw);
  const [min, max] =
    kind === "u64"
      ? [0n, 18_446_744_073_709_551_615n]
      : [-9_223_372_036_854_775_808n, 9_223_372_036_854_775_807n];
  if (value < min || value > max) return usageError(`--value out of range for ${kind}: ${raw}`);
  return value;
}

function parseNsValue(values: Map<string, string>): string | CliError {
  const ns = parseNs(values);
  if (ns === undefined) return usageError("--ns is required");
  if (isNsError(ns)) return usageError(ns);
  return ns;
}

async function resolveMaterial(
  values: Map<string, string>,
  opts: RunOpts,
): Promise<string | CliError> {
  const flag = values.get("--material");
  let material: string;
  if (flag !== undefined) {
    if (flag === "") return usageError("--material requires a value");
    material = flag;
  } else {
    material = await readAllStdin(opts);
  }
  if (material === "") return usageError("material must not be empty");
  return material;
}

function keyedSpecs(...extra: FlagSpec[]): FlagSpec[] {
  return [
    ...extra,
    { name: "--key", value: true },
    { name: "--key-file", value: true },
    { name: "--key-encoding", value: true },
  ];
}

/** Wrap verb (wrapped codec): an integer + kind under a key. */
export async function runWrap<K>(
  codecKey: CodecKey<K>,
  build: (
    brand: string,
    key: K,
    kind: WrappedKindValue,
  ) => { wrap: (value: number | bigint) => Promise<string> },
  argv: ReadonlyArray<string>,
  opts: RunOpts,
): Promise<number> {
  const { values, flags, positionals, error } = parseArgs(
    argv,
    keyedSpecs({ name: "--value", value: true }, { name: "--kind", value: true }),
  );
  if (error !== undefined) return fail(opts, usageError(error));

  const brand = positionals[0];
  if (brand === undefined) return fail(opts, usageError("missing brand"));
  if (positionals.length > 1)
    return fail(opts, usageError(`unexpected argument: ${positionals[1]!}`));

  const kind = parseKind(values);
  if (kind === undefined) return fail(opts, usageError("--kind is required"));
  if (isKindError(kind)) return fail(opts, usageError(kind));

  const valueRaw = values.get("--value");
  if (valueRaw === undefined) return fail(opts, usageError("--value is required"));
  const value = parseLookupValue(kind, valueRaw);
  if (isCliError(value)) return fail(opts, value);

  const key = await resolveKey(values, flags, opts, codecKey);
  if (isCliError(key)) return fail(opts, key);

  try {
    const id = await build(brand, key, kind).wrap(value);
    opts.stdout(`${id}\n`);
  } catch (err) {
    return fail(opts, mapThrown(err));
  }
  return 0;
}

/** Derive verb (digest codec): material + namespace under a key. */
export async function runDerive<K>(
  codecKey: CodecKey<K>,
  build: (brand: string, key: K, ns: string) => { digest: (material: string) => Promise<string> },
  argv: ReadonlyArray<string>,
  opts: RunOpts,
): Promise<number> {
  const { values, flags, positionals, error } = parseArgs(
    argv,
    keyedSpecs({ name: "--ns", value: true }, { name: "--material", value: true }),
  );
  if (error !== undefined) return fail(opts, usageError(error));

  const brand = positionals[0];
  if (brand === undefined) return fail(opts, usageError("missing brand"));
  if (positionals.length > 1)
    return fail(opts, usageError(`unexpected argument: ${positionals[1]!}`));

  // Resolve the key before reading material from stdin, so a missing/invalid key
  // fails fast instead of after consuming (possibly sensitive) piped input (#766).
  const ns = parseNsValue(values);
  if (isCliError(ns)) return fail(opts, ns);
  const key = await resolveKey(values, flags, opts, codecKey);
  if (isCliError(key)) return fail(opts, key);
  const material = await resolveMaterial(values, opts);
  if (isCliError(material)) return fail(opts, material);

  try {
    const id = await build(brand, key, ns).digest(material);
    opts.stdout(`${id}\n`);
  } catch (err) {
    return fail(opts, mapThrown(err));
  }
  return 0;
}

type Matchable = {
  digest: (material: string) => Promise<string>;
  safeParse: (value: unknown) => { ok: true; id: string } | { ok: false; error: string };
};

/** Match verb (digest codec): recompute and compare; grep-like exit (0 match / 1 no match / 2 error). */
export async function runMatch<K>(
  codecKey: CodecKey<K>,
  build: (brand: string, key: K, ns: string) => Matchable,
  argv: ReadonlyArray<string>,
  opts: RunOpts,
): Promise<number> {
  const { values, flags, positionals, error } = parseArgs(
    argv,
    keyedSpecs(
      { name: "--ns", value: true },
      { name: "--material", value: true },
      { name: "--json", value: false },
      { name: "--quiet", value: false },
    ),
  );
  if (error !== undefined) return fail(opts, usageError(error));

  const id = positionals[0];
  if (id === undefined) return fail(opts, usageError("missing id"));
  if (positionals.length > 1)
    return fail(opts, usageError(`unexpected argument: ${positionals[1]!}`));
  // A malformed ID is a usage error for match's grep-like contract (exit 2), so
  // re-tag brandOfId's runtime error as usage.
  const brand = brandOfId(id);
  if (isCliError(brand)) return fail(opts, usageError(brand.message));

  // Key before material so a bad key fails fast, before consuming stdin (#766).
  const ns = parseNsValue(values);
  if (isCliError(ns)) return fail(opts, ns);
  const key = await resolveKey(values, flags, opts, codecKey);
  if (isCliError(key)) return fail(opts, key);
  const material = await resolveMaterial(values, opts);
  if (isCliError(material)) return fail(opts, material);

  let matched: boolean;
  let canonical: string;
  try {
    const codec = build(brand, key, ns);
    const parsed = codec.safeParse(id);
    if (!parsed.ok) return fail(opts, usageError(`invalid_id: ${parsed.error}`));
    canonical = parsed.id;
    matched = (await codec.digest(material)) === parsed.id;
  } catch (err) {
    return fail(opts, mapThrown(err));
  }

  if (!flags.has("--quiet")) {
    const report = { id: canonical, matched };
    opts.stdout(flags.has("--json") ? formatMatchJson(report) : formatMatchHuman(report));
  }
  return matched ? 0 : 1;
}
