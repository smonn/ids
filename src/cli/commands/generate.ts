import { buildCodec, deriveAllowedFlags, isCodecError, resolveVariant } from "../dispatch.js";
import { parseCount, splitFlags, unsupportedFlagForCommand } from "../flags.js";
import type { RunOpts } from "../types.js";
import { usageGenerate } from "../usage.js";
import { generatePolicy } from "../variants.js";

let stdinCache: Promise<string> | undefined;
/* v8 ignore next 12 -- reads from process.stdin; not exercised in unit tests, only in the real binary */
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

export async function runGenerate(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    opts.stdout(usageGenerate());
    return 0;
  }
  const allowedFlags = deriveAllowedFlags(generatePolicy);
  const selectorFlags = new Set(
    generatePolicy.selectable.map((v) => v.flag).filter((f): f is string => f !== undefined),
  );
  const valueFlags = new Set([...allowedFlags].filter((f) => !selectorFlags.has(f)));
  const { flags, values, positionals, errors } = splitFlags(args, valueFlags);
  const unsupported = unsupportedFlagForCommand("generate", flags, allowedFlags);
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return 2;
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return 2;
  }
  const extra = positionals[1];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return 2;
  }
  const [brand] = positionals;
  const count = parseCount(values);
  if (typeof count === "string") {
    opts.stderr(count + "\n");
    return 2;
  }
  const variant = resolveVariant(generatePolicy, flags);
  if (typeof variant === "string") {
    opts.stderr(variant + "\n");
    return 2;
  }
  if (variant.key === undefined && flags.has("--key-format")) {
    opts.stderr("--key-format requires --opaque, --signed, or --digest\n");
    return 2;
  }
  if (flags.has("--digest") && count > 1) {
    opts.stderr(
      "--count N > 1 is rejected with --digest: same material always produces the same ID\n",
    );
    return 2;
  }
  const rawReadStdin = opts.readStdin ?? readProcessStdin;
  let resolvedReadStdin: () => Promise<string> = rawReadStdin;
  if (flags.has("--digest")) {
    /* v8 ignore next -- process.stdin.isTTY is only true in the real binary, never in unit tests */
    if (opts.isTTY ?? process.stdin.isTTY) {
      opts.stderr("hint: reading material from stdin — pipe input or press Ctrl-D to end\n");
    }
    const material = await rawReadStdin();
    if (material === "") {
      opts.stderr("error: digest material must not be empty\n");
      return 1;
    }
    resolvedReadStdin = () => Promise.resolve(material);
  }
  const optsWithStdin: RunOpts = { ...opts, readStdin: resolvedReadStdin };
  const codec = await buildCodec(variant, brand ?? "", values, optsWithStdin);
  if (isCodecError(codec)) {
    opts.stderr(codec.message + "\n");
    return codec.kind === "usage" ? 2 : 1;
  }
  const emitUuid = flags.has("--uuid");
  for (let i = 0; i < count; i++) {
    const id = await codec.generate();
    if (emitUuid) {
      // BuildCodecResult does not expose toUUID in its type; cast required because every codec variant implements the method (ADR-0024)
      const uuid = (codec as unknown as { toUUID(id: string): string }).toUUID(id);
      opts.stdout(uuid + "\n");
    } else {
      opts.stdout(id + "\n");
    }
  }
  return 0;
}
