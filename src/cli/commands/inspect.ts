import { createTimestampId } from "../../timestamp.js";
import { createOpaqueTimestampId, type OpaqueKeyFormat } from "../../opaque.js";
import { createWrappedKeyId, type WrappingKey } from "../../wrapped.js";
import { codecOpts } from "../codec-options.js";
import { formatInspectOutput, formatWrappedInspectOutput } from "../format.js";
import {
  isKindError,
  parseKind,
  splitFlags,
  unsupportedFlagForCommand,
  type WrappedKindValue,
} from "../flags.js";
import { isKeyFormatError, loadOpaqueKey, parseOpaqueKeyFormat } from "../opaque-key.js";
import { loadWrappingKey, parseWrappingKeyFormat } from "../wrapping-key.js";
import type { RunOpts } from "../types.js";
import { usage } from "../usage.js";

export function runInspect(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals, errors } = splitFlags(args);
  const unsupported = unsupportedFlagForCommand(
    "inspect",
    flags,
    new Set(["--opaque", "--wrapped", "--kind", "--key-format"]),
  );
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return Promise.resolve(1);
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return Promise.resolve(1);
  }
  const [input] = positionals;
  if (input === undefined) {
    opts.stderr(usage());
    return Promise.resolve(1);
  }
  const extra = positionals[1];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return Promise.resolve(1);
  }
  const opaque = flags.has("--opaque");
  const wrapped = flags.has("--wrapped");
  if (opaque && wrapped) {
    opts.stderr("cannot use --wrapped and --opaque together\n");
    return Promise.resolve(1);
  }
  if (!opaque && !wrapped && flags.has("--key-format")) {
    opts.stderr("--key-format requires --opaque or --wrapped\n");
    return Promise.resolve(1);
  }
  const brand = input.slice(0, 3).toLowerCase();
  if (wrapped) {
    const kind = parseKind(values);
    if (kind === undefined) {
      opts.stderr("--kind is required with --wrapped\n");
      return Promise.resolve(1);
    }
    if (isKindError(kind)) {
      opts.stderr(kind + "\n");
      return Promise.resolve(1);
    }
    const format = parseWrappingKeyFormat(values, opts);
    if (isKeyFormatError(format)) {
      opts.stderr(format + "\n");
      return Promise.resolve(1);
    }
    return runWrappedInspect(brand, input, kind, format, opts);
  }
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
    codec = createTimestampId(brand, codecOpts(opts));
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
  opts.stdout(
    formatInspectOutput({
      brand,
      timestamp,
      canonical,
      input,
      nowMs,
    }),
  );
  return Promise.resolve(0);
}

async function runWrappedInspect(
  brand: string,
  input: string,
  kind: WrappedKindValue,
  format: string,
  opts: RunOpts,
): Promise<number> {
  const keyResult = await loadWrappingKey(opts, format as "hex" | "base64url");
  if (typeof keyResult === "string") {
    opts.stderr(keyResult + "\n");
    return 1;
  }
  let codec;
  try {
    codec = createWrappedKeyId(brand, {
      kind,
      keys: [keyResult as WrappingKey],
      allowDuplicateBrand: true,
    });
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
  let lookupKey;
  try {
    lookupKey = await codec.unwrap(canonical);
  } catch (err) {
    opts.stderr((err as Error).message + "\n");
    return 1;
  }
  opts.stdout(
    formatWrappedInspectOutput({
      brand,
      lookupKey,
      canonical,
      input,
    }),
  );
  return 0;
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
    codec = createOpaqueTimestampId(brand, { key: keyResult, ...codecOpts(opts) });
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
  opts.stderr(
    "note: timestamp assumes IDS_KEY matches the key used at generation; a wrong key yields a plausible but incorrect timestamp\n",
  );
  opts.stdout(
    formatInspectOutput({
      brand,
      timestamp,
      canonical,
      input,
      nowMs,
    }),
  );
  return 0;
}
