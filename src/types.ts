/** The brand plus trailing separator — e.g. `usr_` for brand `usr`. */
export type Prefix<Brand extends string> = `${Brand}_`;

/** A canonical branded ID string for `Brand`. Produced by `generate()` and `safeParse()`. */
export type Id<Brand extends string> = `${Prefix<Brand>}${string}` & {
  readonly __brand: Brand;
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

/** Minimum contract every codec's layout-ops object satisfies. Used via `satisfies` in each `create*LayoutOps` binder. */
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
