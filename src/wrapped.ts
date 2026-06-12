import { validateBrand } from "./brand.js";
import { createWrappedLayoutOps } from "./layouts/wrapped.js";
import { registerBrand } from "./registry.js";
import type {
  Id,
  JsonSchema,
  ParseError,
  ParseResult,
  Prefix,
  StandardSchemaProps,
} from "./types.js";
import { wireMethods } from "./wire/codec-shell.js";
import {
  decodeWrappingKey,
  encodeWrappingKey,
  getWrappingKeyMaterial,
  importWrappingKey,
  type WrappingKey,
  type WrappingKeyFormat,
  wrappingKeysEqual,
} from "./wrapping-key.js";

export {
  decodeWrappingKey,
  encodeWrappingKey,
  importWrappingKey,
  type WrappingKey,
  type WrappingKeyFormat,
};

export type WrappedKind = "u32" | "i32" | "u64" | "i64";

type LookupKeyForKind<K extends WrappedKind> = K extends "u32" | "i32" ? number : bigint;

export type UnwrapResult<Brand extends string, Kind extends WrappedKind> =
  | { ok: true; id: Id<Brand>; lookupKey: LookupKeyForKind<Kind> }
  | { ok: false; error: ParseError | "verification_failed" };

export type WrappedKeyCodec<Brand extends string, Kind extends WrappedKind> = {
  wrap(lookupKey: LookupKeyForKind<Kind>): Promise<Id<Brand>>;
  unwrap(id: Id<Brand>): Promise<LookupKeyForKind<Kind>>;
  safeUnwrap(input: unknown): Promise<UnwrapResult<Brand, Kind>>;
  is(value: unknown): value is Id<Brand>;
  parse(value: unknown): Id<Brand>;
  safeParse(value: unknown): ParseResult<Brand>;
  toJsonSchema(): JsonSchema;
  readonly "~standard": StandardSchemaProps<Brand>;
};

export type WrappedKeyOptions<K extends WrappedKind> = {
  kind: K;
  keys: [WrappingKey, ...WrappingKey[]];
  allowDuplicateBrand?: boolean;
};

const u32Max = 0xffff_ffff;
const i32Min = -0x8000_0000;
const i32Max = 0x7fff_ffff;
const u64Max = 0xffff_ffff_ffff_ffffn;
const i64Min = -(1n << 63n);
const i64Max = (1n << 63n) - 1n;

function assertSupportedKind(kind: WrappedKind): asserts kind is WrappedKind {
  if (kind !== "u32" && kind !== "i32" && kind !== "u64" && kind !== "i64") {
    throw new Error("invalid wrapped key kind: expected u32, i32, u64, or i64");
  }
}

function assertNonEmptyKeyring(keys: readonly WrappingKey[]): void {
  if (keys.length === 0) {
    throw new Error("wrapped keyring must contain at least one key");
  }
}

function assertNonDuplicateKeys(keys: readonly WrappingKey[]): void {
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (wrappingKeysEqual(keys[i]!, keys[j]!)) {
        throw new Error("duplicate wrapping key in keyring");
      }
    }
  }
}

function assertU32LookupKey(lookupKey: unknown): asserts lookupKey is number {
  if (
    typeof lookupKey !== "number" ||
    !Number.isInteger(lookupKey) ||
    Object.is(lookupKey, -0) ||
    lookupKey < 0 ||
    lookupKey > u32Max
  ) {
    throw new Error(`invalid u32 lookup key: expected integer in [0, ${u32Max}], got ${lookupKey}`);
  }
}

function assertI32LookupKey(lookupKey: unknown): asserts lookupKey is number {
  if (
    typeof lookupKey !== "number" ||
    !Number.isInteger(lookupKey) ||
    Object.is(lookupKey, -0) ||
    lookupKey < i32Min ||
    lookupKey > i32Max
  ) {
    throw new Error(
      `invalid i32 lookup key: expected integer in [${i32Min}, ${i32Max}], got ${lookupKey}`,
    );
  }
}

function assertU64LookupKey(lookupKey: unknown): asserts lookupKey is bigint {
  if (typeof lookupKey !== "bigint" || lookupKey < 0n || lookupKey > u64Max) {
    throw new Error(`invalid u64 lookup key: expected bigint in [0, ${u64Max}], got ${lookupKey}`);
  }
}

function assertI64LookupKey(lookupKey: unknown): asserts lookupKey is bigint {
  if (typeof lookupKey !== "bigint" || lookupKey < i64Min || lookupKey > i64Max) {
    throw new Error(
      `invalid i64 lookup key: expected bigint in [${i64Min}, ${i64Max}], got ${lookupKey}`,
    );
  }
}

function assertLookupKey<Kind extends WrappedKind>(
  kind: Kind,
  lookupKey: unknown,
): asserts lookupKey is LookupKeyForKind<Kind> {
  if (kind === "i32") {
    assertI32LookupKey(lookupKey);
    return;
  }
  if (kind === "u64") {
    assertU64LookupKey(lookupKey);
    return;
  }
  if (kind === "i64") {
    assertI64LookupKey(lookupKey);
    return;
  }
  assertU32LookupKey(lookupKey);
}

export function createWrappedKeyId<Brand extends string, Kind extends WrappedKind>(
  brand: Brand,
  opts: WrappedKeyOptions<Kind>,
): WrappedKeyCodec<Brand, Kind> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);
  assertSupportedKind(opts.kind);
  assertNonEmptyKeyring(opts.keys);
  const layoutKeys = opts.keys.map(getWrappingKeyMaterial);
  assertNonDuplicateKeys(opts.keys);

  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createWrappedLayoutOps(prefix, brand, opts.kind, layoutKeys);

  return {
    wrap: async (lookupKey) => {
      assertLookupKey(opts.kind, lookupKey);
      return layout.wrap(lookupKey);
    },
    unwrap: (id) => layout.unwrap(id),
    safeUnwrap: async (input) => {
      const parsed = wire.safeParse(input);
      if (!parsed.ok) return parsed;
      const lookupKey = await layout.tryUnwrap(parsed.id);
      if (lookupKey === null) return { ok: false, error: "verification_failed" };
      return { ok: true, id: parsed.id, lookupKey };
    },
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    toJsonSchema: () => wire.toJsonSchema(brand, layout.exampleWireId()),
    "~standard": wire["~standard"],
  };
}
