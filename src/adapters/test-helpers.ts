import { fromAny } from "@total-typescript/shoehorn";
import { vi } from "vitest";
import type { Id, ParseError, ParseResult } from "../types.js";

type SpyCodec<Brand extends string> = {
  safeParse: (value: unknown) => ParseResult<Brand>;
  is: (value: unknown) => value is Id<Brand>;
  extractTimestamp: () => void;
  wrap: () => void;
  unwrap: () => void;
  generate: () => Id<Brand>;
};

export function makeSpyCodec<Brand extends string>(brand: Brand): SpyCodec<Brand> {
  const fakeId: Id<Brand> = fromAny(`${brand}_00000000000000000000000000`);
  return {
    safeParse: fromAny(vi.fn(() => ({ ok: true as const, id: fakeId }))),
    is: fromAny(vi.fn(() => true)),
    extractTimestamp: fromAny(vi.fn()),
    wrap: fromAny(vi.fn()),
    unwrap: fromAny(vi.fn()),
    generate: fromAny(vi.fn(() => fakeId)),
  };
}

export function makeFailingSpyCodec<Brand extends string>(
  brand: Brand,
  error: ParseError = "not_string",
): SpyCodec<Brand> {
  const fakeId: Id<Brand> = fromAny(`${brand}_00000000000000000000000000`);
  return {
    safeParse: fromAny(vi.fn(() => ({ ok: false as const, error }))),
    is: fromAny(vi.fn(() => false)),
    extractTimestamp: fromAny(vi.fn()),
    wrap: fromAny(vi.fn()),
    unwrap: fromAny(vi.fn()),
    generate: fromAny(vi.fn(() => fakeId)),
  };
}
