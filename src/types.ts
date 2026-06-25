type LowerChar =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

/**
 * Validator-style conditional type: resolves to `S` when `S` is exactly three
 * lowercase `a–z` characters, and to `never` otherwise.
 *
 * When passed the generic `string` type it resolves to `string`, so existing
 * dynamic-brand call sites (e.g. CLI, ORM adapters) are unaffected.
 *
 * Apply as a parameter intersection on codec constructors:
 * ```ts
 * function createTimestampId<Brand extends string>(brand: Brand & ValidBrand<Brand>, ...)
 * ```
 * TypeScript then validates the specific brand literal at each call site without
 * materialising the 17 576-member all-brands union.
 */
export type ValidBrand<S extends string> = string extends S
  ? S
  : S extends `${infer _A extends LowerChar}${infer _B extends LowerChar}${infer _C extends LowerChar}`
    ? S
    : never;

/** The brand plus trailing separator — e.g. `usr_` for brand `usr`. */
export type Prefix<Brand extends string> = `${Brand}_`;

declare const idBrand: unique symbol;

/** A canonical branded ID string for `Brand`. Produced by `generate()` and `safeParse()`. */
export type Id<Brand extends string> = `${Prefix<Brand>}${string}` & {
  readonly [idBrand]: Brand;
};

/** Parse failure reason returned by `safeParse()`. */
export type ParseError = "not_string" | "invalid_prefix" | "invalid_base32";

/** Result of `safeParse()`: canonical `Id<Brand>` or a `ParseError`. */
export type ParseResult<Brand extends string> =
  | { ok: true; id: Id<Brand> }
  | { ok: false; error: ParseError };

/** JSON Schema for the canonical wire form returned by `toJsonSchema()`. */
export type JsonSchema = {
  readonly type: "string";
  readonly pattern: string;
  readonly description: string;
  readonly example: string;
};

/** Minimum contract every codec's layout-ops object satisfies. Enforced via explicit return-type annotation on each `create*LayoutOps` binder. */
export type LayoutOps<Brand extends string> = {
  exampleWireId: (ms?: number) => Id<Brand>;
};

/** Standard Schema validate entry point exposed on a codec's `~standard` property. */
export type StandardSchemaProps<Brand extends string> = {
  readonly version: 1;
  readonly vendor: "@smonn/ids";
  readonly validate: (
    value: unknown,
    options?: { readonly libraryOptions?: Record<string, unknown> | undefined },
  ) =>
    | { readonly value: Id<Brand>; readonly issues?: undefined }
    | { readonly issues: ReadonlyArray<{ readonly message: string }> };
  readonly types?: { readonly input: unknown; readonly output: Id<Brand> };
};
