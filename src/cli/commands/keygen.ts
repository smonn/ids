import { encodeOpaqueKey } from "../../opaque.js";
import { encodeSigningKey } from "../../signed.js";
import { encodeWrappingKey } from "../../wrapped.js";
import { parseBits, splitFlags, unsupportedFlagForCommand } from "../flags.js";
import { isKeyFormatError } from "../key-io.js";
import { parseKeygenFormat } from "../opaque-key.js";
import type { RunOpts } from "../types.js";

export function runKeygen(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals, errors } = splitFlags(
    args,
    new Set(["--count", "-c", "--bits", "--key-format", "--kind"]),
  );
  const unsupported = unsupportedFlagForCommand(
    "keygen",
    flags,
    new Set(["--signed", "--wrapped", "--bits", "--key-format"]),
  );
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return Promise.resolve(1);
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return Promise.resolve(1);
  }
  const extra = positionals[0];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return Promise.resolve(1);
  }
  const signed = flags.has("--signed");
  const wrapped = flags.has("--wrapped");
  if (signed && wrapped) {
    opts.stderr("cannot use --signed and --wrapped together\n");
    return Promise.resolve(1);
  }
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
  let encoded: string;
  if (signed) {
    encoded = encodeSigningKey(bytes, format);
  } else if (wrapped) {
    encoded = encodeWrappingKey(bytes, format);
  } else {
    encoded = encodeOpaqueKey(bytes, format);
  }
  opts.stdout(encoded + "\n");
  return Promise.resolve(0);
}
