import { timingSafeEqual } from "node:crypto";
import { isIdsError, type IdsErrorCode } from "../error.js";
import type { Id } from "../types.js";
import { type FlagSpec, parseArgs } from "./args.js";
import { type CliError, exitCodeFor, isCliError, runtimeError, usageError } from "./errors.js";
import { parseCount, parseKind, parseNs, type WrappedKindValue } from "./flags.js";
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

/** Maps every IdsErrorCode to its CLI exit bucket — "usage" (exit 2) or "runtime" (exit 1).
 *  TypeScript enforces exhaustiveness: adding a new IdsErrorCode without an entry here is a type error. */
const usageCodeBuckets: Record<IdsErrorCode, "usage" | "runtime"> = {
  invalid_brand: "usage",
  invalid_timestamp: "usage",
  invalid_namespace: "usage",
  invalid_kind: "usage",
  invalid_lookup_key: "usage",
  invalid_key_length: "usage",
  invalid_key_encoding: "usage",
  invalid_key_format: "usage",
  empty_keyring: "runtime",
  duplicate_keyring_entry: "runtime",
  verification_failed: "runtime",
  invalid_id: "runtime",
};

/** Truncates a stray positional token so it never echoes verbatim in error messages.
 *  Strips C0 (U+0000–U+001F), DEL (U+007F), and C1 (U+0080–U+009F) before truncating. */
export function redactToken(token: string): string {
  // oxlint-disable-next-line no-control-regex -- intentional: strip C0/DEL/C1 before echoing
  const stripped = token.replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, "");
  return stripped.length > 20 ? `${stripped.slice(0, 20)}…` : stripped;
}

export function mapThrown(err: unknown): CliError {
  if (isIdsError(err) && usageCodeBuckets[err.code] === "usage") {
    return usageError(formatCliError(err));
  }
  return runtimeError(formatCliError(err));
}

/** Lowercased three-letter brand of an ID, or `undefined` if it doesn't look like one. */
export function brandOfId(id: string): string | undefined {
  if (!/^[a-z]{3}_/i.test(id)) return undefined;
  return id.slice(0, 3).toLowerCase();
}

export function fail(opts: RunOpts, error: CliError): number {
  opts.stderr(error.message + "\n");
  return exitCodeFor(error);
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
    return fail(opts, usageError(`unexpected argument: ${redactToken(positionals[1]!)}`));
  }

  const count = parseCount(values);
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
  /* v8 ignore next -- the process.stdin reader is only used by the real binary; tests inject readStdin */
  return (opts.readStdin ?? readProcessStdin)();
}

/** Recovers a report from one ID, or a per-ID error (e.g. malformed input). */
type Recover = (id: string) => Promise<InspectReport | CliError>;

/**
 * Per-codec inspect configuration. `prepare` runs once with the resolved key (if any)
 * and returns either the per-ID recovery function or a setup-time {@link CliError}
 * (e.g. a bad `--kind`) — so an invocation-level error is reported once, not per line.
 *
 * Discriminated on `keyed`: the `true` arm requires `codecKey` and types `key` as `K`;
 * the `false` arm forbids `codecKey` and types `key` as `undefined`.
 */
export type InspectSpec<K> =
  | {
      readonly keyed: true;
      readonly codecKey: CodecKey<K>;
      readonly extraFlags?: readonly FlagSpec[];
      readonly prepare: (opts: RunOpts, key: K, values: Map<string, string>) => Recover | CliError;
    }
  | {
      readonly keyed: false;
      readonly codecKey?: never;
      readonly extraFlags?: readonly FlagSpec[];
      readonly prepare: (
        opts: RunOpts,
        key: undefined,
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
    return fail(opts, usageError(`unexpected argument: ${redactToken(positionals[1]!)}`));
  }

  // Resolve the key and bind recovery BEFORE reading stdin, so a bad key or bad
  // setup flag fails fast rather than after consuming piped input (#766).
  let recover: Recover | CliError;
  if (spec.keyed) {
    const resolved = await resolveKey(values, flags, opts, spec.codecKey);
    if (isCliError(resolved)) return fail(opts, resolved);
    recover = spec.prepare(opts, resolved, values);
  } else {
    recover = spec.prepare(opts, undefined, values);
  }
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
      /* v8 ignore next -- defensive: recover returns CliError for known failures; codec
         methods don't throw on structurally-parsed input */
      report = mapThrown(err);
    }
    if (isCliError(report)) {
      if (single) return fail(opts, report);
      anyFail = true;
      opts.stderr(`${redactToken(input)}: ${report.message}\n`);
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
      if (brand === undefined) return Promise.resolve(runtimeError("invalid_id: not a valid ID"));
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

async function resolveMaterial(
  values: Map<string, string>,
  opts: RunOpts,
): Promise<string | CliError> {
  const flag = values.get("--material");
  let material: string;
  if (flag !== undefined) {
    if (flag === "") return usageError("--material requires a value");
    opts.stderr(
      "Warning: --material puts digest input on argv/shell history; pass material on stdin instead.\n",
    );
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
    return fail(opts, usageError(`unexpected argument: ${redactToken(positionals[1]!)}`));

  const kind = parseKind(values);
  if (kind === undefined) return fail(opts, usageError("--kind is required"));
  if (isCliError(kind)) return fail(opts, kind);

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
    return fail(opts, usageError(`unexpected argument: ${redactToken(positionals[1]!)}`));

  // Resolve the key before reading material from stdin, so a missing/invalid key
  // fails fast instead of after consuming (possibly sensitive) piped input (#766).
  const rawNs = parseNs(values);
  if (rawNs === undefined) return fail(opts, usageError("--ns is required"));
  if (isCliError(rawNs)) return fail(opts, rawNs);
  const key = await resolveKey(values, flags, opts, codecKey);
  if (isCliError(key)) return fail(opts, key);
  const material = await resolveMaterial(values, opts);
  if (isCliError(material)) return fail(opts, material);

  try {
    const id = await build(brand, key, rawNs).digest(material);
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
    return fail(opts, usageError(`unexpected argument: ${redactToken(positionals[1]!)}`));
  // A malformed ID is a usage error for match's grep-like contract (exit 2).
  const brand = brandOfId(id);
  if (brand === undefined) return fail(opts, usageError("invalid_id: not a valid ID"));

  // Key before material so a bad key fails fast, before consuming stdin (#766).
  const rawNs = parseNs(values);
  if (rawNs === undefined) return fail(opts, usageError("--ns is required"));
  if (isCliError(rawNs)) return fail(opts, rawNs);
  const key = await resolveKey(values, flags, opts, codecKey);
  if (isCliError(key)) return fail(opts, key);
  const material = await resolveMaterial(values, opts);
  if (isCliError(material)) return fail(opts, material);

  let matched: boolean;
  let canonical: string;
  try {
    const codec = build(brand, key, rawNs);
    const parsed = codec.safeParse(id);
    if (!parsed.ok) return fail(opts, usageError(`invalid_id: ${parsed.error}`));
    canonical = parsed.id;
    matched = timingSafeEqual(Buffer.from(await codec.digest(material)), Buffer.from(parsed.id));
  } catch (err) {
    /* v8 ignore next -- defensive: brand/ns/key are pre-validated and digest does not
       throw on a structurally-parsed id, so this guard is unreachable in practice */
    return fail(opts, mapThrown(err));
  }

  if (!flags.has("--quiet")) {
    const report = { id: canonical, matched };
    opts.stdout(flags.has("--json") ? formatMatchJson(report) : formatMatchHuman(report));
  }
  return matched ? 0 : 1;
}
