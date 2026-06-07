import { createId } from "../../id.js";
import { createOpaqueId, type OpaqueKeyFormat } from "../../opaque.js";
import { codecOpts } from "../codec-options.js";
import { formatInspectOutput } from "../format.js";
import { splitFlags, unsupportedFlagForCommand } from "../flags.js";
import { isKeyFormatError, loadOpaqueKey, parseOpaqueKeyFormat } from "../opaque-key.js";
import type { RunOpts } from "../types.js";
import { usage } from "../usage.js";

export function runInspect(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals, errors } = splitFlags(args);
  const unsupported = unsupportedFlagForCommand(
    "inspect",
    flags,
    new Set(["--opaque", "--key-format"]),
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
  if (!opaque && flags.has("--key-format")) {
    opts.stderr("--key-format requires --opaque\n");
    return Promise.resolve(1);
  }
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
