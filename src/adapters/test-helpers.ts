import { fromAny } from "@total-typescript/shoehorn";
import { vi } from "vitest";
import type { Id, ParseError, ParseResult, ValidBrand } from "../types.js";
import { createSignedTimestampId, importSigningKey } from "../codecs/signed/index.js";
import type { SignedTimestampCodec } from "../codecs/signed/index.js";
import { createWrappedKeyId, importWrappingKey } from "../codecs/wrapped/index.js";
import type { WrappedKeyCodec } from "../codecs/wrapped/index.js";

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

/** Real Signed Timestamp codec backed by a freshly imported signing key. Satisfies `IdVerifiableCodec`. */
export async function makeRealSignedCodec<Brand extends string>(
  brand: Brand,
): Promise<SignedTimestampCodec<Brand>> {
  const key = await importSigningKey(new Uint8Array(32));
  return createSignedTimestampId<Brand>(brand as unknown as Brand & ValidBrand<Brand>, {
    keys: [key],
    allowDuplicateBrand: true,
  });
}

/** Real Wrapped key codec (kind: u32) backed by a freshly imported wrapping key. Satisfies `IdVerifiableCodec`. */
export async function makeRealWrappedCodec<Brand extends string>(
  brand: Brand,
): Promise<WrappedKeyCodec<Brand, "u32">> {
  const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
  return createWrappedKeyId<Brand, "u32">(brand as unknown as Brand & ValidBrand<Brand>, {
    kind: "u32",
    keys: [key],
    allowDuplicateBrand: true,
  });
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
