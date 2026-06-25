import type { IdCodec } from "../adapters/adapter-types.js";
import { isKeyFormatError, loadKey, parseKeyFormat } from "./key-io.js";
import type { RunOpts } from "./types.js";
import {
  conflictPriorityOrder,
  type Descriptor,
  type GeneratorDescriptor,
  type Policy,
} from "./variants.js";

export type CodecError = { kind: "usage"; message: string } | { kind: "runtime"; message: string };

export function isCodecError(v: unknown): v is CodecError {
  return typeof v === "object" && v !== null && "kind" in v && "message" in v;
}

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

export function resolveVariant<D extends Descriptor>(
  policy: Policy<D>,
  flags: Set<string>,
): D | string {
  const selected = conflictPriorityOrder.filter(
    (v): v is D =>
      policy.selectable.some((d) => d === v) && v.flag !== undefined && flags.has(v.flag),
  );
  if (selected.length === 0) return policy.default;
  if (selected.length === 1) return selected[0]!;
  return `cannot use ${selected[0]!.flag} and ${selected[1]!.flag} together`;
}

export async function buildCodec(
  variant: GeneratorDescriptor,
  brand: string,
  values: Map<string, string>,
  opts: RunOpts,
): Promise<(IdCodec<string> & { generate(): string | Promise<string> }) | CodecError>;
export async function buildCodec(
  variant: Descriptor,
  brand: string,
  values: Map<string, string>,
  opts: RunOpts,
): Promise<IdCodec<string> | CodecError>;
export async function buildCodec(
  variant: Descriptor,
  brand: string,
  values: Map<string, string>,
  opts: RunOpts,
): Promise<(IdCodec<string> & { generate?(): string | Promise<string> }) | CodecError> {
  let key: unknown;
  if (variant.key !== undefined) {
    const format = parseKeyFormat(values, opts, variant.key);
    if (isKeyFormatError(format)) return { kind: "usage", message: format };
    const keyResult = await loadKey(opts, format, variant.key);
    if (typeof keyResult === "string") {
      return {
        kind: keyResult.startsWith("missing ") ? "usage" : "runtime",
        message: keyResult,
      };
    }
    key = keyResult;
  }
  const codecOrError = variant.construct(brand, opts, key, values);
  if (typeof codecOrError === "string") {
    return {
      kind: codecOrError.startsWith("--") ? "usage" : "runtime",
      message: codecOrError,
    };
  }
  return codecOrError;
}
