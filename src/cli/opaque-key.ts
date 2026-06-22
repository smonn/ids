import {
  decodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKey,
  type OpaqueKeyFormat,
} from "../opaque.js";
import { loadKey, parseKeyFormat, parseKeyFormatFromFlag } from "./key-io.js";
import type { RunOpts } from "./types.js";

const opaqueFacet = {
  envVar: "IDS_KEY",
  formatEnvVar: "IDS_KEY_FORMAT",
  decode: decodeOpaqueKey,
  import: importOpaqueKey,
};

export function parseKeygenFormat(values: Map<string, string>): OpaqueKeyFormat | string {
  return parseKeyFormatFromFlag(values);
}

export function parseOpaqueKeyFormat(
  values: Map<string, string>,
  opts: RunOpts,
): OpaqueKeyFormat | string {
  return parseKeyFormat(values, opts, opaqueFacet);
}

export async function loadOpaqueKey(
  opts: RunOpts,
  format: OpaqueKeyFormat,
): Promise<OpaqueKey | string> {
  return loadKey(opts, format, opaqueFacet);
}
