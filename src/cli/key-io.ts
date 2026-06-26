import { formatCliError } from "./format.js";
import type { RunOpts } from "./types.js";

export type KeyFormat = "hex" | "base64url";

export type LoadKeyError = { kind: "missing" | "import-failure"; message: string };

export function isLoadKeyError(value: unknown): value is LoadKeyError {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as Record<string, unknown>).kind;
  return kind === "missing" || kind === "import-failure";
}

export type KeyFacet<K> = {
  envVar: string;
  formatEnvVar: string;
  // Not yet consumed by any helper here; the keygen-delegation chunk wires it.
  encode: (bytes: Uint8Array, format: KeyFormat) => string;
  decode: (raw: string, format: KeyFormat) => Uint8Array;
  import: (bytes: Uint8Array) => K | Promise<K>;
};

export function isKeyFormatError(result: KeyFormat | string): result is string {
  return result !== "hex" && result !== "base64url";
}

function parseKeyFormatFlag(values: Map<string, string>): KeyFormat | string | undefined {
  const fromFlag = values.get("--key-format");
  if (fromFlag === undefined) return undefined;
  if (fromFlag === "") return "--key-format requires a value";
  if (fromFlag === "hex" || fromFlag === "base64url") return fromFlag;
  return `--key-format must be hex or base64url, got '${fromFlag}'`;
}

export function parseKeyFormatFromFlag(values: Map<string, string>): KeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag === undefined) return "hex";
  return fromFlag;
}

const PRIMARY_KEY_VAR = "IDS_KEY";
const PRIMARY_FORMAT_VAR = "IDS_KEY_FORMAT";

export function parseKeyFormat(
  values: Map<string, string>,
  opts: RunOpts,
  facet: Pick<KeyFacet<unknown>, "envVar" | "formatEnvVar">,
): KeyFormat | string {
  const fromFlag = parseKeyFormatFlag(values);
  if (fromFlag !== undefined) return fromFlag;
  const env = opts.env ?? process.env;
  // format must travel with its paired key var, never cross-paired
  const specificRaw = env[facet.envVar];
  const specificSet = specificRaw !== undefined && specificRaw !== "";
  const activeFormatVar = specificSet ? facet.formatEnvVar : PRIMARY_FORMAT_VAR;
  const fromEnv = env[activeFormatVar];
  if (fromEnv === undefined || fromEnv === "") return "hex";
  if (fromEnv === "hex" || fromEnv === "base64url") return fromEnv;
  return `${activeFormatVar} must be hex or base64url, got '${fromEnv}'`;
}

export async function loadKey<K>(
  opts: RunOpts,
  format: KeyFormat,
  facet: Pick<KeyFacet<K>, "envVar" | "decode" | "import">,
): Promise<K | LoadKeyError> {
  const env = opts.env ?? process.env;
  const specificRaw = env[facet.envVar];
  const specificSet = specificRaw !== undefined && specificRaw !== "";
  const raw = specificSet ? specificRaw : env[PRIMARY_KEY_VAR];
  if (raw === undefined || raw === "") {
    const varDesc =
      !specificSet && facet.envVar !== PRIMARY_KEY_VAR
        ? `${facet.envVar} or ${PRIMARY_KEY_VAR}`
        : facet.envVar;
    return { kind: "missing", message: `missing ${varDesc} environment variable` };
  }
  try {
    return await facet.import(facet.decode(raw, format));
  } catch (err) {
    return { kind: "import-failure", message: formatCliError(err) };
  }
}
