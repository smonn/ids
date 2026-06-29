import { alphabet } from "./base32.js";
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
  if (value.startsWith(prefix) && base32Pattern.test(value.slice(prefix.length))) {
    return { ok: true, id: value as Id<Brand> };
  }
  if (value.length > prefix.length + payloadBase32Length) {
    return { ok: false, error: "invalid_base32" };
  }
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

const parseErrorMessages: Record<Exclude<ParseError, "invalid_prefix">, string> = {
  not_string: "expected string",
  invalid_base32: "invalid base32 payload",
  invalid_uuid: "invalid UUID",
};

function errorMessage<Brand extends string>(prefix: Prefix<Brand>, error: ParseError): string {
  if (error === "invalid_prefix") return `expected prefix '${prefix}'`;
  return parseErrorMessages[error];
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
