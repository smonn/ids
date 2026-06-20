import {
  decodeWrappingKey,
  importWrappingKey,
  type WrappingKey,
  type WrappingKeyFormat,
} from "../wrapped.js";
import type { RunOpts } from "./types.js";

function parseKeyFormatFlag(values: Map<string, string>): WrappingKeyFormat | string | undefined {
  const fromFlag = values.get("--key-format");
  if (fromFlag === undefined) return undefined;
  if (fromFlag === "") return "--key-format requires a value";
  if (fromFlag === "hex" || fromFlag === "base64url") return fromFlag;
  return `--key-format must be hex or base64url, got '${fromFlag}'`;
}

export function parseWrappingKeyFormat(
  values: Map<string, string>,
  opts: RunOpts,
): WrappingKeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag !== undefined) return fromFlag;
  const env = opts.env ?? process.env;
  const fromEnv = env.IDS_WRAPPING_KEY_FORMAT;
  if (fromEnv === undefined || fromEnv === "") return "hex";
  if (fromEnv === "hex" || fromEnv === "base64url") return fromEnv;
  return `IDS_WRAPPING_KEY_FORMAT must be hex or base64url, got '${fromEnv}'`;
}

export async function loadWrappingKey(
  opts: RunOpts,
  format: WrappingKeyFormat,
): Promise<WrappingKey | string> {
  const env = opts.env ?? process.env;
  const raw = env.IDS_WRAPPING_KEY;
  if (raw === undefined || raw === "") return "missing IDS_WRAPPING_KEY environment variable";
  try {
    return importWrappingKey(decodeWrappingKey(raw, format));
  } catch (err) {
    return (err as Error).message;
  }
}
