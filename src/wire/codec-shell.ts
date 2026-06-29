import { IdsError } from "../error.js";
import type { Id, JsonSchema, ParseResult, Prefix, StandardSchemaProps } from "../types.js";
import { base32CharClass, base32FinalCharClass, payloadBase32Length } from "./invariants.js";
import { is, safeParse, standardValidate } from "./parse.js";
import { fromUUID, safeFromUUID, toUUID } from "./uuid.js";
export { schemaExampleId } from "./invariants.js";

type WireMethods<Brand extends string> = {
  is: (value: unknown) => value is Id<Brand>;
  parse: (value: unknown) => Id<Brand>;
  safeParse: (value: unknown) => ParseResult<Brand>;
  toJsonSchema: (brand: Brand, example: string) => JsonSchema;
  "~standard": StandardSchemaProps<Brand>;
  toUUID: (id: Id<Brand>) => string;
  fromUUID: (value: string) => Id<Brand>;
  safeFromUUID: (value: unknown) => ParseResult<Brand>;
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
    parse: (value: unknown): Id<Brand> => {
      const result = safeParse(prefix, value);
      if (result.ok) return result.id;
      throw new IdsError("invalid_id", `invalid ID: ${result.error}`, { cause: result.error });
    },
    safeParse: (value: unknown): ParseResult<Brand> => safeParse(prefix, value),
    toJsonSchema: (brand: Brand, example: string): JsonSchema => ({
      type: "string",
      pattern: `^${prefix}${base32CharClass}{${payloadBase32Length - 1}}${base32FinalCharClass}$`,
      description: `Branded ID for '${brand}'`,
      example,
    }),
    "~standard": standard,
    toUUID: (id: Id<Brand>): string => toUUID(prefix, id),
    fromUUID: (value: string): Id<Brand> => fromUUID(prefix, value),
    safeFromUUID: (value: unknown): ParseResult<Brand> => safeFromUUID(prefix, value),
  };
}
