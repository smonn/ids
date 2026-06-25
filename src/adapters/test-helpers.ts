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
  const fakeId = `${brand}_00000000000000000000000000` as unknown as Id<Brand>;
  return {
    safeParse: vi.fn(() => ({ ok: true as const, id: fakeId })) as unknown as (
      value: unknown,
    ) => ParseResult<Brand>,
    extractTimestamp: vi.fn() as unknown as () => void,
    wrap: vi.fn() as unknown as () => void,
    unwrap: vi.fn() as unknown as () => void,
  };
}
