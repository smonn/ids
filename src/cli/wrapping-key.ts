import {
  decodeWrappingKey,
  importWrappingKey,
  type WrappingKey,
  type WrappingKeyFormat,
} from "../wrapped.js";
import { loadKey, parseKeyFormat } from "./key-io.js";
import type { RunOpts } from "./types.js";

const wrappingFacet = {
  envVar: "IDS_WRAPPING_KEY",
  formatEnvVar: "IDS_WRAPPING_KEY_FORMAT",
  decode: decodeWrappingKey,
  import: importWrappingKey,
};

export function parseWrappingKeyFormat(
  values: Map<string, string>,
  opts: RunOpts,
): WrappingKeyFormat | string {
  return parseKeyFormat(values, opts, wrappingFacet);
}

export async function loadWrappingKey(
  opts: RunOpts,
  format: WrappingKeyFormat,
): Promise<WrappingKey | string> {
  return loadKey(opts, format, wrappingFacet);
}
