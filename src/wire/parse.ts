import { alphabet } from "../base32.js";
import type { Id, ParseError, ParseResult, Prefix } from "../types.js";
import { base32FinalCharClass, payloadBase32Length } from "./invariants.js";

const replacePattern = /[ilo]/g;
const aliasTestPattern = /[ilo]/;
const replacer = (match: string): string => (match === "o" ? "0" : "1");
const base32Pattern = new RegExp(
  `^[${alphabet}]{${payloadBase32Length - 1}}${base32FinalCharClass}$`,
);

export function safeParse<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
): ParseResult<Brand> {
  if (typeof value !== "string") return { ok: false, error: "not_string" };
  const lowercase = value.toLowerCase();
  if (!lowercase.startsWith(prefix)) return { ok: false, error: "invalid_prefix" };

  const sliced = lowercase.slice(prefix.length);
  const base32 = aliasTestPattern.test(sliced)
    ? sliced.replaceAll(replacePattern, replacer)
    : sliced;

  if (!base32Pattern.test(base32)) return { ok: false, error: "invalid_base32" };

  const id = (prefix + base32) as Id<Brand>;
  return { ok: true, id };
}

export function is<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
): value is Id<Brand> {
  if (typeof value !== "string") return false;
  if (!value.startsWith(prefix)) return false;
  return base32Pattern.test(value.slice(prefix.length));
}

function errorMessage<Brand extends string>(prefix: Prefix<Brand>, error: ParseError): string {
  switch (error) {
    case "not_string":
      return "expected string";
    case "invalid_prefix":
      return `expected prefix '${prefix}'`;
    case "invalid_base32":
      return "invalid base32 payload";
  }
}

export function standardValidate<Brand extends string>(
  prefix: Prefix<Brand>,
  value: unknown,
):
  | { readonly value: Id<Brand>; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> } {
  const result = safeParse(prefix, value);
  if (result.ok) return { value: result.id };
  return { issues: [{ message: errorMessage(prefix, result.error) }] };
}
