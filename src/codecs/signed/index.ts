import { validateBrand } from "../_kernel/brand.js";
import { IdsError, isIdsError, type IdsErrorCode } from "../../error.js";
import { createSignedTimestampLayoutOps } from "./layout.js";
import { registerBrand } from "../_kernel/registry.js";
import { defaultRng } from "../_kernel/rng.js";
import type {
  Id,
  JsonSchema,
  ParseError,
  ParseResult,
  Prefix,
  StandardSchemaProps,
} from "../../types.js";
import { wireMethods } from "../../wire/codec-shell.js";
import {
  assertValidKeyring,
  decodeSigningKey,
  encodeSigningKey,
  getSigningKeyHmacKey,
  importSigningKey,
  signingKeysEqual,
  type SigningKey,
  type SigningKeyFormat,
} from "./key.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported for convenience. */
export { IdsError, isIdsError, type IdsErrorCode };
export {
  decodeSigningKey,
  encodeSigningKey,
  importSigningKey,
  type SigningKey,
  type SigningKeyFormat,
};

/**
 * Configuration options for a Signed Timestamp codec instance.
 */
export type SignedTimestampOptions = {
  /**
   * Non-empty ordered signing keyring. The first entry is current — the only one
   * `generate` / `generateAt` sign with. `verify` / `safeVerify` trial every entry
   * until the tag matches. Duplicate raw secrets are rejected at construction.
   */
  keys: [SigningKey, ...SigningKey[]];
  /** Returns the current timestamp in milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** Writes 5 random bytes into `target` for the random tail. Defaults to `crypto.getRandomValues`. */
  rng?: (target: Uint8Array) => void;
  /** If true, silences the duplicate-brand warning in non-production environments. */
  allowDuplicateBrand?: boolean;
};

/**
 * Result returned by {@link SignedTimestampCodec.safeVerify}.
 *
 * On success, `id` is the canonical {@link Id}.
 * On failure, `error` is a {@link ParseError} for structural problems or
 * `"verification_failed"` when the HMAC tag does not match any entry in the
 * signing keyring.
 */
export type SafeVerifyResult<Brand extends string> =
  | { ok: true; id: Id<Brand> }
  | { ok: false; error: ParseError | "verification_failed" };

/**
 * Codec returned by {@link createSignedTimestampId}.
 *
 * Keeps the 6-byte millisecond timestamp **readable and sortable** like the
 * Timestamp codec, but replaces half of the 10-byte random tail with a truncated
 * HMAC tag, making IDs **tamper-evident and verifiable without a database lookup**.
 *
 * Byte layout: `ts6 ‖ rand5 ‖ tag5` where the 40-bit tag =
 * `trunc(HMAC-SHA256(hmacKey, brand ‖ ts6 ‖ rand5), 40)`.
 *
 * - Async (HMAC): `generate`, `generateAt`, `verify`, `safeVerify`.
 * - Sync (no key / plaintext timestamp): all other methods.
 */
export type SignedTimestampCodec<Brand extends string> = {
  /** Produces a canonical ID signed with the current (first) key. */
  generate(): Promise<Id<Brand>>;
  /**
   * Produces a canonical ID with timestamp from `date`, signed with the current key.
   * Throws on invalid dates.
   */
  generateAt(date: Date): Promise<Id<Brand>>;
  /**
   * Recomputes the HMAC tag across every keyring entry.
   *
   * Throws `IdsError` with `code: "verification_failed"` if no entry matches.
   * Tamper of the brand, timestamp bytes, or random bytes all fail here.
   */
  verify(id: Id<Brand>): Promise<void>;
  /**
   * Non-throwing path for untrusted input.
   *
   * Structurally parses `input` first (same rules as {@link safeParse}), then
   * verifies the HMAC tag. Returns `{ ok: false, error }` on any failure —
   * {@link ParseError} for structural problems or `"verification_failed"` for tag
   * mismatch — without throwing.
   */
  safeVerify(input: unknown): Promise<SafeVerifyResult<Brand>>;
  /**
   * Decodes the creation `Date` from an `Id<Brand>`.
   * Sync — the 6-byte timestamp is plaintext. Trusts the type; use `safeParse()` at boundaries first.
   *
   * Best-effort: the timestamp is returned **without checking the HMAC tag** — a tampered
   * or unsigned ID yields the attacker-controlled timestamp without error. Call
   * `verify()` / `safeVerify()` first if you need an authenticated timestamp.
   */
  extractTimestamp(id: Id<Brand>): Date;
  /**
   * Tight lower bound sentinel for range scans (`ts(t) ‖ 0x00×10`).
   * **Not verifiable** — carries no valid tag.
   */
  minIdForTime(date: Date): Id<Brand>;
  /**
   * Tight upper bound sentinel for range scans (`ts(t) ‖ 0xff×10`).
   * **Not verifiable** — carries no valid tag.
   */
  maxIdForTime(date: Date): Id<Brand>;
  /**
   * Strict type guard: `true` only for already-canonical `Id<Brand>` strings.
   * For untrusted input, use `safeParse()` or `safeVerify()` instead.
   */
  is(value: unknown): value is Id<Brand>;
  /** Normalise to canonical form, or throw on parse failure. */
  parse(value: unknown): Id<Brand>;
  /** Normalise to canonical form, or return `{ ok: false, error }`. */
  safeParse(value: unknown): ParseResult<Brand>;
  /**
   * JSON Schema for the canonical wire form. The `pattern` matches the canonical stored
   * form only and is deliberately stricter than `parse()`/`safeParse()`, which accept
   * uppercase letters and Crockford aliases (`o`/`i`/`l`) before normalising. See ADR-0003.
   */
  toJsonSchema(): JsonSchema;
  /** Standard Schema validate entry point. */
  readonly "~standard": StandardSchemaProps<Brand>;
};

/**
 * Construct a {@link SignedTimestampCodec} for `brand`.
 *
 * `opts.keys` is a non-empty ordered signing keyring — the first entry is current
 * (used by `generate` / `generateAt`); all entries are tried on `verify` /
 * `safeVerify`; duplicate operator secrets are rejected at construction.
 *
 * @example
 * ```ts
 * const key = await importSigningKey(new Uint8Array(32));
 * const usr = createSignedTimestampId("usr", { keys: [key] });
 *
 * const id = await usr.generate();        // Id<"usr">
 * await usr.verify(id);                   // passes
 * usr.extractTimestamp(id);               // Date — sync, timestamp is plaintext
 * ```
 */
export function createSignedTimestampId<Brand extends string>(
  brand: Brand,
  opts: SignedTimestampOptions,
): SignedTimestampCodec<Brand> {
  validateBrand(brand);
  registerBrand(brand, opts.allowDuplicateBrand);
  assertValidKeyring(opts.keys, signingKeysEqual, "signing");

  const hmacKeys = opts.keys.map(getSigningKeyHmacKey);
  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? defaultRng;
  const prefix: Prefix<Brand> = `${brand}_`;
  const wire = wireMethods(prefix);
  const layout = createSignedTimestampLayoutOps(prefix, brand, rng, hmacKeys);

  return {
    generate: () => layout.generateAt(now()),
    generateAt: (date: Date) => layout.generateAt(date.getTime()),
    verify: async (id) => {
      const ok = await layout.tryVerify(id);
      if (!ok) throw new IdsError("verification_failed", "verification failed");
    },
    safeVerify: async (input) => {
      const parsed = wire.safeParse(input);
      if (!parsed.ok) return parsed;
      const ok = await layout.tryVerify(parsed.id);
      if (!ok) return { ok: false, error: "verification_failed" };
      return { ok: true, id: parsed.id };
    },
    extractTimestamp: layout.extractTimestamp,
    minIdForTime: (date: Date) => layout.minIdForTime(date.getTime()),
    maxIdForTime: (date: Date) => layout.maxIdForTime(date.getTime()),
    is: wire.is,
    parse: wire.parse,
    safeParse: wire.safeParse,
    toJsonSchema: () => wire.toJsonSchema(brand, layout.exampleWireId()),
    "~standard": wire["~standard"],
  };
}
