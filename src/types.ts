export type Prefix<Brand extends string> = `${Brand}_`;

export type Id<Brand extends string> = `${Prefix<Brand>}${string}` & {
  readonly __brand: Brand;
};

export type ParseError = "not_string" | "invalid_prefix" | "invalid_base32";

export type ParseResult<Brand extends string> =
  | { ok: true; id: Id<Brand> }
  | { ok: false; error: ParseError };

export type JsonSchema = {
  readonly type: "string";
  readonly pattern: string;
  readonly description: string;
  readonly example: string;
};

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
