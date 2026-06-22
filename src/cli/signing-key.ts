import {
  decodeSigningKey,
  importSigningKey,
  type SigningKey,
  type SigningKeyFormat,
} from "../signed.js";
import { loadKey, parseKeyFormat } from "./key-io.js";
import type { RunOpts } from "./types.js";

const signingFacet = {
  envVar: "IDS_SIGNING_KEY",
  formatEnvVar: "IDS_SIGNING_KEY_FORMAT",
  decode: decodeSigningKey,
  import: importSigningKey,
};

export function parseSigningKeyFormat(
  values: Map<string, string>,
  opts: RunOpts,
): SigningKeyFormat | string {
  return parseKeyFormat(values, opts, signingFacet);
}

export async function loadSigningKey(
  opts: RunOpts,
  format: SigningKeyFormat,
): Promise<SigningKey | string> {
  return loadKey(opts, format, signingFacet);
}
