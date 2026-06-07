import { encodeOpaqueKey } from "../../opaque.js";
import { parseBits, splitFlags, unsupportedFlagForCommand } from "../flags.js";
import { isKeyFormatError, parseKeygenFormat } from "../opaque-key.js";
import type { RunOpts } from "../types.js";

export function runKeygen(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals, errors } = splitFlags(args);
  const unsupported = unsupportedFlagForCommand(
    "keygen",
    flags,
    new Set(["--bits", "--key-format"]),
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
