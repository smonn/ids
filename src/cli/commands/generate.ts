import { createTimestampId } from "../../timestamp.js";
import { createOpaqueTimestampId, type OpaqueKeyFormat } from "../../opaque.js";
import { codecOpts } from "../codec-options.js";
import { parseCount, splitFlags, unsupportedFlagForCommand } from "../flags.js";
import { isKeyFormatError, loadOpaqueKey, parseOpaqueKeyFormat } from "../opaque-key.js";
import type { RunOpts } from "../types.js";

export function runGenerate(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals, errors } = splitFlags(args);
  const unsupported = unsupportedFlagForCommand(
    "generate",
    flags,
    new Set(["--count", "-c", "--opaque", "--key-format"]),
  );
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return Promise.resolve(1);
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return Promise.resolve(1);
  }
  const extra = positionals[1];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return Promise.resolve(1);
  }
  const [brand] = positionals;
  const count = parseCount(values);
  if (typeof count === "string") {
    opts.stderr(count + "\n");
    return Promise.resolve(1);
  }
  const opaque = flags.has("--opaque");
  if (!opaque && flags.has("--key-format")) {
    opts.stderr("--key-format requires --opaque\n");
    return Promise.resolve(1);
  }
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
    codec = createTimestampId(brand ?? "", codecOpts(opts));
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
    codec = createOpaqueTimestampId(brand, { key: keyResult, ...codecOpts(opts) });
  } catch (err) {
    opts.stderr((err as Error).message + "\n");
    return 1;
  }
  for (let i = 0; i < count; i++) opts.stdout((await codec.generate()) + "\n");
  return 0;
}
