import { digestCli } from "./codecs/digest.js";
import { opaqueCli } from "./codecs/opaque.js";
import { reverseCli } from "./codecs/reverse.js";
import { signedCli } from "./codecs/signed.js";
import { timestampCli } from "./codecs/timestamp.js";
import { wrappedCli } from "./codecs/wrapped.js";
import { runConvert } from "./commands/convert.js";
import { runKeygen } from "./commands/keygen.js";
import { formatCliError } from "./format.js";
import { helpForCodec, helpForCommand, usage } from "./help.js";
import type { CodecModule, RunOpts, VerbHandler } from "./types.js";

export const codecModules: readonly CodecModule[] = [
  timestampCli,
  reverseCli,
  signedCli,
  opaqueCli,
  wrappedCli,
  digestCli,
];

const topCommands: Readonly<Record<string, VerbHandler>> = {
  keygen: runKeygen,
  convert: runConvert,
};

function isHelp(token: string | undefined): boolean {
  return token === "--help" || token === "-h";
}

export async function run(opts: RunOpts): Promise<number> {
  try {
    const argv = opts.argv;
    const first = argv[0];

    const codecNames = codecModules.map((m) => m.codec);
    if (first === undefined) {
      opts.stdout(usage(codecNames));
      return 2;
    }
    if (isHelp(first)) {
      opts.stdout(usage(codecNames));
      return 0;
    }
    if (first === "--version") {
      opts.stdout(`${opts.version ?? "0.0.0"}\n`);
      return 0;
    }

    const top = topCommands[first];
    if (top !== undefined) {
      const topArgs = argv.slice(1);
      if (topArgs.some(isHelp)) {
        opts.stdout(helpForCommand(first));
        return 0;
      }
      return await top(topArgs, opts);
    }

    const mod = codecModules.find((m) => m.codec === first);
    if (mod === undefined) {
      opts.stderr(`unknown command: ${first}\n`);
      opts.stderr(usage(codecNames));
      return 2;
    }

    const rest = argv.slice(1);
    const verbName = rest[0];
    if (verbName === undefined) {
      opts.stderr(helpForCodec(mod.codec, Object.keys(mod.verbs)));
      return 2;
    }
    if (isHelp(verbName)) {
      opts.stdout(helpForCodec(mod.codec, Object.keys(mod.verbs)));
      return 0;
    }

    const handler = mod.verbs[verbName];
    if (handler === undefined) {
      opts.stderr(`unknown verb for ${mod.codec}: ${verbName}\n`);
      opts.stderr(helpForCodec(mod.codec, Object.keys(mod.verbs)));
      return 2;
    }

    const verbArgs = rest.slice(1);
    if (verbArgs.some(isHelp)) {
      opts.stdout(helpForCodec(mod.codec, Object.keys(mod.verbs)));
      return 0;
    }
    return await handler(verbArgs, opts);
    // Defensive: every verb handler catches its own errors and returns an exit code,
    // so this top-level guard is unreachable in practice.
    /* v8 ignore start */
  } catch (err) {
    opts.stderr(`${formatCliError(err)}\n`);
    return 1;
  }
  /* v8 ignore stop */
}
