import { validateBrand } from "./brand.js";
import { createWrappedLayoutOps, type WrappedKind } from "./layouts/wrapped.js";
import { registerBrand } from "./registry.js";
import type { Id, JsonSchema, ParseError, ParseResult, Prefix, StandardSchemaProps } from "./types.js";
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

function assertSupportedKind(kind: WrappedKind): asserts kind is "u32" {
  if (kind !== "u32") {
    throw new Error("unsupported wrapped key kind: expected u32");
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

function assertU32LookupKey(lookupKey: number): void {
  if (!Number.isInteger(lookupKey) || lookupKey < 0 || lookupKey > u32Max) {
    throw new Error(`invalid u32 lookup key: expected integer in [0, ${u32Max}], got ${lookupKey}`);
  }
}

export function createWrappedKeyId<Brand extends string>(
  brand: Brand,
  opts: WrappedKeyOptions<"u32">,
): WrappedKeyCodec<Brand, "u32"> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);
  assertSupportedKind(opts.kind);
  assertNonEmptyKeyring(opts.keys);
  const layoutKeys = opts.keys.map(getWrappingKeyMaterial);
  assertNonDuplicateKeys(opts.keys);

  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createWrappedLayoutOps(prefix, brand, layoutKeys);

  return {
    wrap: async (lookupKey) => {
      assertU32LookupKey(lookupKey);
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
