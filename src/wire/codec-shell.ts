import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "../types.js";
import { payloadBase32Length } from "./envelope.js";
import { base32CharClass, is, parse, safeParse, standardValidate } from "./parse.js";

type WireMethods<Brand extends string> = {
  is: (value: unknown) => value is Id<Brand>;
  parse: (value: unknown) => Id<Brand>;
  safeParse: (value: unknown) => ParseResult<Brand>;
  toJsonSchema: (brand: Brand, example: string) => JsonSchema;
  "~standard": StandardSchemaProps<Brand>;
};

/** Wire-only methods shared by every codec variant for a fixed prefix. */
export function wireMethods<Brand extends string>(prefix: Prefix<Brand>): WireMethods<Brand> {
  const standard: StandardSchemaProps<Brand> = {
    version: 1,
    vendor: "@smonn/ids",
    validate: (value: unknown) => standardValidate(prefix, value),
  };
  return {
    is: (value: unknown): value is Id<Brand> => is(prefix, value),
    parse: (value: unknown): Id<Brand> => parse(prefix, value),
    safeParse: (value: unknown): ParseResult<Brand> => safeParse(prefix, value),
    toJsonSchema: (brand: Brand, example: string): JsonSchema => ({
      type: "string",
      pattern: `^${prefix}${base32CharClass}{${payloadBase32Length}}$`,
      description: `Branded ID for '${brand}'`,
      example,
    }),
    "~standard": standard,
  };
}
