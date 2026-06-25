import { fromAny } from "@total-typescript/shoehorn";
import { vi } from "vitest";
import type { Id, ParseResult } from "../types.js";

export function makeSpyCodec<Brand extends string>(
  brand: Brand,
): {
  safeParse: (value: unknown) => ParseResult<Brand>;
  extractTimestamp: () => void;
  wrap: () => void;
  unwrap: () => void;
} {
  const fakeId: Id<Brand> = fromAny(`${brand}_00000000000000000000000000`);
  return {
    safeParse: fromAny(vi.fn(() => ({ ok: true as const, id: fakeId }))),
    extractTimestamp: fromAny(vi.fn()),
    wrap: fromAny(vi.fn()),
    unwrap: fromAny(vi.fn()),
  };
}
