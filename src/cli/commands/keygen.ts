import { encodeOpaqueKey } from "../../codecs/opaque/index.js";
import { type FlagSpec, parseArgs } from "../args.js";
import { type CliError, isCliError, usageError } from "../errors.js";
import { resolveKeyEncoding } from "../key.js";
import type { RunOpts } from "../types.js";
import { fail } from "../verbs.js";

function parseBytes(values: Map<string, string>): 16 | 24 | 32 | CliError {
  const raw = values.get("--bytes");
  if (raw === undefined) return 32;
  if (raw === "16") return 16;
  if (raw === "24") return 24;
  if (raw === "32") return 32;
  return usageError(
    raw === "" ? "--bytes requires a value" : `--bytes must be 16, 24, or 32, got '${raw}'`,
  );
}

/**
 * Emit fresh random key material. Codec-agnostic: one key backs every keyed codec, so
 * any codec's encoder works (`encodeOpaqueKey` is used as the shared hex/base64url codec).
 */
export async function runKeygen(argv: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const specs: FlagSpec[] = [
    { name: "--bytes", value: true },
    { name: "--key-encoding", value: true },
  ];
  const { values, positionals, error } = parseArgs(argv, specs);
  if (error !== undefined) return fail(opts, usageError(error));
  if (positionals.length > 0)
    return fail(opts, usageError(`unexpected argument: ${positionals[0]!}`));

  const bytes = parseBytes(values);
  if (isCliError(bytes)) return fail(opts, bytes);
  const encoding = resolveKeyEncoding(values, opts);
  if (isCliError(encoding)) return fail(opts, encoding);

  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  opts.stderr(
    "Warning: secret key material — redirect to a file (chmod 0600) and avoid shell history.\n",
  );
  opts.stdout(`${encodeOpaqueKey(raw, encoding)}\n`);
  return Promise.resolve(0);
}
