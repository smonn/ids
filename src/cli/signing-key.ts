import {
  decodeSigningKey,
  importSigningKey,
  type SigningKey,
  type SigningKeyFormat,
} from "../signed.js";
import type { RunOpts } from "./types.js";

function parseKeyFormatFlag(values: Map<string, string>): SigningKeyFormat | string | undefined {
  const fromFlag = values.get("--key-format");
  if (fromFlag === undefined) return undefined;
  if (fromFlag === "") return "--key-format requires a value";
  if (fromFlag === "hex" || fromFlag === "base64url") return fromFlag;
  return `--key-format must be hex or base64url, got '${fromFlag}'`;
}

export function parseSigningKeyFormat(
  values: Map<string, string>,
  opts: RunOpts,
): SigningKeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag !== undefined) return fromFlag;
  const env = opts.env ?? process.env;
  const fromEnv = env.IDS_SIGNING_KEY_FORMAT;
  if (fromEnv === undefined || fromEnv === "") return "hex";
  if (fromEnv === "hex" || fromEnv === "base64url") return fromEnv;
  return `IDS_SIGNING_KEY_FORMAT must be hex or base64url, got '${fromEnv}'`;
}

export async function loadSigningKey(
  opts: RunOpts,
  format: SigningKeyFormat,
): Promise<SigningKey | string> {
  const env = opts.env ?? process.env;
  const raw = env.IDS_SIGNING_KEY;
  if (raw === undefined || raw === "") return "missing IDS_SIGNING_KEY environment variable";
  try {
    return await importSigningKey(decodeSigningKey(raw, format));
  } catch (err) {
    return (err as Error).message;
  }
}
