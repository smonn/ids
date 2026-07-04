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

type VerifiableSpyCodec<Brand extends string> = SpyCodec<Brand> & {
  safeVerify: (
    input: unknown,
  ) => Promise<{ ok: true; id: Id<Brand> } | { ok: false; error: unknown }>;
};

type WrappedVerifiableSpyCodec<Brand extends string> = {
  safeParse: (value: unknown) => ParseResult<Brand>;
  is: (value: unknown) => value is Id<Brand>;
  wrap: () => void;
  unwrap: () => void;
  safeUnwrap: (
    input: unknown,
  ) => Promise<{ ok: true; id: Id<Brand>; lookupKey: number } | { ok: false; error: unknown }>;
  safeVerify: (
    input: unknown,
  ) => Promise<{ ok: true; id: Id<Brand> } | { ok: false; error: unknown }>;
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

/** Spy codec that satisfies `IdVerifiableCodec`. `verifyResult` controls whether `safeVerify` succeeds or returns `"verification_failed"`. */
export function makeVerifiableSpyCodec<Brand extends string>(
  brand: Brand,
  verifyResult: "ok" | "fail" = "ok",
): VerifiableSpyCodec<Brand> {
  const fakeId: Id<Brand> = fromAny(`${brand}_00000000000000000000000000`);
  return {
    safeParse: fromAny(vi.fn(() => ({ ok: true as const, id: fakeId }))),
    is: fromAny(vi.fn(() => true)),
    extractTimestamp: fromAny(vi.fn()),
    wrap: fromAny(vi.fn()),
    unwrap: fromAny(vi.fn()),
    generate: fromAny(vi.fn(() => fakeId)),
    safeVerify: fromAny(
      vi.fn(() =>
        verifyResult === "ok"
          ? Promise.resolve({ ok: true as const, id: fakeId })
          : Promise.resolve({ ok: false as const, error: "verification_failed" as const }),
      ),
    ),
  };
}

/**
 * Spy shaped like the **Wrapped key codec**: exposes `safeUnwrap` plus the
 * `safeVerify` alias (dropping `lookupKey`), so it satisfies `IdVerifiableCodec`
 * structurally. `verifyResult` controls whether `safeVerify` succeeds.
 */
export function makeWrappedVerifiableSpyCodec<Brand extends string>(
  brand: Brand,
  verifyResult: "ok" | "fail" = "ok",
): WrappedVerifiableSpyCodec<Brand> {
  const fakeId: Id<Brand> = fromAny(`${brand}_00000000000000000000000000`);
  return {
    safeParse: fromAny(vi.fn(() => ({ ok: true as const, id: fakeId }))),
    is: fromAny(vi.fn(() => true)),
    wrap: fromAny(vi.fn()),
    unwrap: fromAny(vi.fn()),
    safeUnwrap: fromAny(
      vi.fn(() =>
        verifyResult === "ok"
          ? Promise.resolve({ ok: true as const, id: fakeId, lookupKey: 42 })
          : Promise.resolve({ ok: false as const, error: "verification_failed" as const }),
      ),
    ),
    safeVerify: fromAny(
      vi.fn(() =>
        verifyResult === "ok"
          ? Promise.resolve({ ok: true as const, id: fakeId })
          : Promise.resolve({ ok: false as const, error: "verification_failed" as const }),
      ),
    ),
  };
}
