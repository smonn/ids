import type { IdCodec } from "../adapters/adapter-types.js";
import { isKeyFormatError, isLoadKeyError, loadKey, parseKeyFormat } from "./key-io.js";
import type { RunOpts } from "./types.js";
import {
  conflictPriorityOrder,
  type Descriptor,
  type GeneratorDescriptor,
  type Policy,
} from "./variants.js";

export type CodecError = { kind: "usage"; message: string } | { kind: "runtime"; message: string };

export function isCodecError(v: unknown): v is CodecError {
  if (typeof v !== "object" || v === null) return false;
  const kind = (v as Record<string, unknown>).kind;
  return (kind === "usage" || kind === "runtime") && "message" in v;
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
  const key = await resolveCodecKey(variant, values, opts);
  if (isCodecError(key)) return key;
  return constructCodec(variant, brand, opts, key, values);
}

/**
 * Resolve and import the operator key a variant requires, reading only flags and
 * env vars — never stdin. Returns `undefined` for keyless variants, the imported
 * key handle on success, or a CodecError (usage for a missing key or bad format,
 * runtime for a bad encoding). Split out from {@link buildCodec} so callers can
 * validate the key before blocking on stdin material (#766).
 */
export async function resolveCodecKey(
  variant: Descriptor,
  values: Map<string, string>,
  opts: RunOpts,
): Promise<unknown | CodecError> {
  if (variant.key === undefined) return undefined;
  const format = parseKeyFormat(values, opts, variant.key);
  if (isKeyFormatError(format)) return { kind: "usage", message: format };
  const keyResult = await loadKey(opts, format, variant.key);
  if (isLoadKeyError(keyResult)) {
    return {
      kind: keyResult.kind === "missing" ? "usage" : "runtime",
      message: keyResult.message,
    };
  }
  return keyResult;
}

export function constructCodec(
  variant: GeneratorDescriptor,
  brand: string,
  opts: RunOpts,
  key: unknown,
  values: Map<string, string>,
): (IdCodec<string> & { generate(): string | Promise<string> }) | CodecError;
export function constructCodec(
  variant: Descriptor,
  brand: string,
  opts: RunOpts,
  key: unknown,
  values: Map<string, string>,
): IdCodec<string> | CodecError;
export function constructCodec(
  variant: Descriptor,
  brand: string,
  opts: RunOpts,
  key: unknown,
  values: Map<string, string>,
): (IdCodec<string> & { generate?(): string | Promise<string> }) | CodecError {
  const codecOrError = variant.construct(brand, opts, key, values);
  if (typeof codecOrError === "string") {
    return {
      kind: codecOrError.startsWith("--") ? "usage" : "runtime",
      message: codecOrError,
    };
  }
  return codecOrError;
}
