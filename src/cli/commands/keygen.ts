import { deriveAllowedFlags, resolveVariant } from "../dispatch.js";
import { parseBits, splitFlags, unsupportedFlagForCommand } from "../flags.js";
import { isKeyFormatError, parseKeyFormatFromFlag } from "../key-io.js";
import type { RunOpts } from "../types.js";
import { usageKeygen } from "../usage.js";
import { keygenPolicy } from "../variants.js";

export function runKeygen(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    opts.stdout(usageKeygen());
    return Promise.resolve(0);
  }
  const allowedFlags = deriveAllowedFlags(keygenPolicy);
  const variantExtraFlags = new Set(keygenPolicy.selectable.flatMap((v) => v.extraFlags ?? []));
  const { flags, values, positionals, errors } = splitFlags(args, allowedFlags);
  const unsupported = unsupportedFlagForCommand(
    "keygen",
    flags,
    new Set([...allowedFlags].filter((f) => !variantExtraFlags.has(f))),
  );
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return Promise.resolve(2);
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return Promise.resolve(2);
  }
  const extra = positionals[0];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return Promise.resolve(2);
  }
  const variant = resolveVariant(keygenPolicy, flags);
  if (typeof variant === "string") {
    opts.stderr(variant + "\n");
    return Promise.resolve(2);
  }
  const bits = parseBits(values);
  if (typeof bits === "string") {
    opts.stderr(bits + "\n");
    return Promise.resolve(2);
  }
  const format = parseKeyFormatFromFlag(values);
  if (isKeyFormatError(format)) {
    opts.stderr(format + "\n");
    return Promise.resolve(2);
  }
  /* v8 ignore next 4 -- defensive guard; all keygenPolicy variants have key defined */
  if (variant.key === undefined) {
    opts.stderr("internal: keygen policy variant has no key facet\n");
    return Promise.resolve(1);
  }
  const bytes = new Uint8Array(bits / 8);
  crypto.getRandomValues(bytes);
  opts.stderr(
    "Warning: secret key material — redirect to a file (chmod 0600) and avoid shell history.\n",
  );
  opts.stdout(variant.key.encode(bytes, format) + "\n");
  return Promise.resolve(0);
}
