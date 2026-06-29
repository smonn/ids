import { readFile as fsReadFile } from "node:fs/promises";
import { type CliError, isCliError, usageError } from "./errors.js";
import { formatCliError } from "./format.js";
import type { RunOpts } from "./types.js";

/** The byte-to-string encoding of a key on the CLI boundary. See the Key encoding glossary entry. */
export type KeyEncoding = "hex" | "base64url";

/**
 * Resolve the key encoding: `--key-encoding` flag, then `IDS_KEY_ENCODING`, then `hex`.
 * Orthogonal to the key *value* source (see {@link resolveKey}).
 */
export function resolveKeyEncoding(
  values: Map<string, string>,
  opts: RunOpts,
): KeyEncoding | CliError {
  const flag = values.get("--key-encoding");
  if (flag !== undefined) {
    if (flag === "hex" || flag === "base64url") return flag;
    return usageError(
      flag === ""
        ? "--key-encoding requires a value"
        : `--key-encoding must be hex or base64url, got '${flag}'`,
    );
  }
  const env = (opts.env ?? process.env)["IDS_KEY_ENCODING"];
  if (env === undefined || env === "") return "hex";
  if (env === "hex" || env === "base64url") return env;
  return usageError(`IDS_KEY_ENCODING must be hex or base64url, got '${env}'`);
}

async function resolveKeyString(
  values: Map<string, string>,
  flags: Set<string>,
  opts: RunOpts,
): Promise<string | CliError> {
  const hasKey = flags.has("--key");
  const hasFile = flags.has("--key-file");
  if (hasKey && hasFile) return usageError("cannot use --key and --key-file together");

  if (hasKey) {
    const v = values.get("--key");
    if (v === undefined || v === "") return usageError("--key requires a value");
    return v;
  }

  if (hasFile) {
    const path = values.get("--key-file");
    if (path === undefined || path === "") return usageError("--key-file requires a value");
    let content: string;
    try {
      content =
        opts.readFile !== undefined ? await opts.readFile(path) : await fsReadFile(path, "utf8");
    } catch (err) {
      return usageError(`cannot read --key-file: ${formatCliError(err)}`);
    }
    const trimmed = content.trim();
    if (trimmed === "") return usageError(`--key-file is empty: ${path}`);
    return trimmed;
  }

  const env = (opts.env ?? process.env)["IDS_KEY"];
  if (env !== undefined && env !== "") return env;
  return usageError("missing key: provide --key, --key-file, or IDS_KEY");
}

/**
 * The codec-specific decode + import pair, taken from a codec's public `index.ts`
 * (e.g. `decodeSigningKey` + `importSigningKey`). Decoding/length validation is shared
 * across codecs; importing derives the codec's own key handle.
 */
export type CodecKey<K> = {
  decode: (encoded: string, encoding: KeyEncoding) => Uint8Array;
  import: (bytes: Uint8Array) => K | Promise<K>;
};

/**
 * Resolve one operator key for a keyed command: pick the value source
 * (`--key` > `--key-file` > `IDS_KEY`, with `--key`+`--key-file` rejected as a
 * conflict), decode it under the resolved encoding, and import it into the codec's
 * key handle. Every failure is a usage error — a bad source, encoding, length, or
 * encoding-mismatch all signal a malformed invocation, not a runtime fault.
 */
export async function resolveKey<K>(
  values: Map<string, string>,
  flags: Set<string>,
  opts: RunOpts,
  codecKey: CodecKey<K>,
): Promise<K | CliError> {
  const encoding = resolveKeyEncoding(values, opts);
  if (isCliError(encoding)) return encoding;

  const str = await resolveKeyString(values, flags, opts);
  if (isCliError(str)) return str;

  let bytes: Uint8Array;
  try {
    bytes = codecKey.decode(str, encoding);
  } catch (err) {
    return usageError(formatCliError(err));
  }
  try {
    return await codecKey.import(bytes);
  } catch (err) {
    return usageError(formatCliError(err));
  }
}
