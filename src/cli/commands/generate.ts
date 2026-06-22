import { buildCodec, deriveAllowedFlags, resolveVariant } from "../dispatch.js";
import { parseCount, splitFlags, unsupportedFlagForCommand } from "../flags.js";
import type { RunOpts } from "../types.js";
import { generatePolicy } from "../variants.js";

type WithGenerate = { generate(): string | Promise<string> };

export async function runGenerate(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const allowedFlags = deriveAllowedFlags(generatePolicy);
  const selectorFlags = new Set(
    generatePolicy.selectable.map((v) => v.flag).filter((f): f is string => f !== undefined),
  );
  const valueFlags = new Set([...allowedFlags].filter((f) => !selectorFlags.has(f)));
  const { flags, values, positionals, errors } = splitFlags(args, valueFlags);
  const unsupported = unsupportedFlagForCommand("generate", flags, allowedFlags);
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return 1;
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return 1;
  }
  const extra = positionals[1];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return 1;
  }
  const [brand] = positionals;
  const count = parseCount(values);
  if (typeof count === "string") {
    opts.stderr(count + "\n");
    return 1;
  }
  const variant = resolveVariant(generatePolicy, flags);
  if (typeof variant === "string") {
    opts.stderr(variant + "\n");
    return 1;
  }
  if (variant.key === undefined && flags.has("--key-format")) {
    opts.stderr("--key-format requires --opaque or --signed\n");
    return 1;
  }
  const codec = await buildCodec(variant, brand ?? "", values, opts);
  if (typeof codec === "string") {
    opts.stderr(codec + "\n");
    return 1;
  }
  const genCodec = codec as unknown as WithGenerate;
  for (let i = 0; i < count; i++) opts.stdout((await genCodec.generate()) + "\n");
  return 0;
}
