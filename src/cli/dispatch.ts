import type { IdCodec } from "../adapter-types.js";
import { isKeyFormatError, loadKey, parseKeyFormat } from "./key-io.js";
import type { RunOpts } from "./types.js";
import { conflictPriorityOrder, type Descriptor, type Policy } from "./variants.js";

export function deriveAllowedFlags(policy: Policy): Set<string> {
  const flags = new Set<string>(policy.intrinsicFlags);
  let hasKeyed = policy.default.key !== undefined;
  for (const v of policy.selectable) {
    if (v.flag !== undefined) flags.add(v.flag);
    if (v.key !== undefined) hasKeyed = true;
    if (v.extraFlags !== undefined) {
      for (const f of v.extraFlags) flags.add(f);
    }
  }
  if (hasKeyed) flags.add("--key-format");
  return flags;
}

export function resolveVariant(policy: Policy, flags: Set<string>): Descriptor | string {
  const selected = conflictPriorityOrder.filter(
    (v) => policy.selectable.includes(v) && v.flag !== undefined && flags.has(v.flag),
  );
  if (selected.length === 0) return policy.default;
  if (selected.length === 1) return selected[0]!;
  return `cannot use ${selected[0]!.flag} and ${selected[1]!.flag} together`;
}

export async function buildCodec(
  variant: Descriptor,
  brand: string,
  values: Map<string, string>,
  opts: RunOpts,
): Promise<IdCodec<string> | string> {
  let key: unknown;
  if (variant.key !== undefined) {
    const format = parseKeyFormat(values, opts, variant.key);
    if (isKeyFormatError(format)) return format;
    const keyResult = await loadKey(opts, format, variant.key);
    if (typeof keyResult === "string") return keyResult;
    key = keyResult;
  }
  return variant.construct(brand, opts, key, values);
}
