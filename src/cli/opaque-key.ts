import {
  decodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKey,
  type OpaqueKeyFormat,
} from "../opaque.js";
import type { RunOpts } from "./types.js";

function parseKeyFormatFlag(values: Map<string, string>): OpaqueKeyFormat | string | undefined {
  const fromFlag = values.get("--key-format");
  if (fromFlag === undefined) return undefined;
  if (fromFlag === "") return "--key-format requires a value";
  if (fromFlag === "hex" || fromFlag === "base64url") return fromFlag;
  return `--key-format must be hex or base64url, got '${fromFlag}'`;
}

export function parseKeygenFormat(values: Map<string, string>): OpaqueKeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag === undefined) return "hex";
  return fromFlag;
}

export function parseOpaqueKeyFormat(
  values: Map<string, string>,
  opts: RunOpts,
): OpaqueKeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag !== undefined) return fromFlag;
  const env = opts.env ?? process.env;
  const fromEnv = env.IDS_KEY_FORMAT;
  if (fromEnv === undefined || fromEnv === "") return "hex";
  if (fromEnv === "hex" || fromEnv === "base64url") return fromEnv;
  return `IDS_KEY_FORMAT must be hex or base64url, got '${fromEnv}'`;
}

export async function loadOpaqueKey(
  opts: RunOpts,
  format: OpaqueKeyFormat,
): Promise<OpaqueKey | string> {
  const env = opts.env ?? process.env;
  const raw = env.IDS_KEY;
  if (raw === undefined || raw === "") return "missing IDS_KEY environment variable";
  try {
    return importOpaqueKey(decodeOpaqueKey(raw, format));
  } catch (err) {
    return (err as Error).message;
  }
}
