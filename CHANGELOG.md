# @smonn/ids

## 0.8.0

### Minor Changes

- 0aed62e: Surface typed `Id<Brand>` in `idParam` return signature so downstream route handlers see `request.params[paramName]` as `Id<Brand>` without casting.

  The return type is now `(request: FastifyRequest<{ Params: Record<string, Id<Brand>> }>, reply: FastifyReply) => Promise<void>`. Assigning the result to a Fastify `preHandler` slot remains backward-compatible. Consumers who store the return value in a locally-annotated variable typed as the bare `FastifyRequest` hook signature may see a TypeScript error under `--strictFunctionTypes` (contravariant parameter position); use `preHandler` assignment or type inference to avoid this.

- 8ea22e2: Add `createSignedTimestampId` Signed Timestamp codec to `@smonn/ids/signed`.

## 0.7.0

### Minor Changes

- 6f2842a: Add `@smonn/ids/fastify` subpath export: `idParam` preHandler hook factory for validating route params, with `IdParamError`, `IdParamFailure`, and `IdParamOptions` matching the Hono and Express adapter contract.
- 6fb17db: Convert all caller-reachable throw sites to IdsError with stable code values (ADR-0011).
- b3ed73d: Add `IdsError` class, `IdsErrorCode` union, and `isIdsError` branded guard (ADR-0011 foundation).
- ba55eca: Add `@smonn/ids/signed` subpath: `importSigningKey`, `encodeSigningKey`, `decodeSigningKey`, `SigningKey`, and `SigningKeyFormat` for the Signed Timestamp codec key-material foundation.

### Patch Changes

- efe36be: CLI now prefixes IdsError stderr output with the stable error code (e.g. `invalid_brand: ...`) so subprocess tests can assert on the contractual code string rather than the non-contractual message text.

## 0.6.0

### Minor Changes

- ac14f46: Add `--reverse` flag to `generate` and `inspect` CLI commands for the Reverse Timestamp codec.
- 0f63975: Add CLI support for the Wrapped key codec: `keygen --wrapped` emits wrapping key material, and `inspect --wrapped --kind <u32|i32|u64|i64>` recovers the lookup key from a wrapped ID via `IDS_WRAPPING_KEY`.
- 525f2ff: Add `@smonn/ids/drizzle` subpath export with `idColumn(codec)` helper for Drizzle ORM column adapters.
- 849bc4b: Add `@smonn/ids/express` subpath export with `idParam` middleware for Express route-param validation (404 on brand mismatch, 400 on malformed).
- 11fae19: Add `@smonn/ids/hono` subpath export with `idParam` middleware for validating route params against a codec (404 on brand mismatch, 400 on malformed or missing ID).
- 570c686: Add `@smonn/ids/kysely` subpath export with `idColumn(codec)` adapter and `IdColumnType<Brand>` for Kysely ORM integration.
- be06bcb: Introduce nominal `OpaqueKey` type for the Opaque Timestamp codec. `importOpaqueKey` now returns `Promise<OpaqueKey>` instead of `Promise<CryptoKey>`, and `OpaqueTimestampOptions.key` is typed as `OpaqueKey`. Mirrors the `WrappingKey` pattern from `@smonn/ids/wrapped`. Pre-v1 breaking change — callers must obtain a key handle via `importOpaqueKey(bytes)` rather than passing a raw `CryptoKey`.
- 757ca2d: Add `@smonn/ids/prisma` subpath export with `idField(codec)` adapter for Prisma `$extends` integration.
- 508c553: Add `createReverseTimestampId` codec variant (`@smonn/ids/reverse`) that bitwise-inverts the 48-bit timestamp field so IDs sort newest-first.

## 0.5.0

### Minor Changes

- 932ddf6: Add `@smonn/ids/wrapped` with the **Wrapped key codec**: `createWrappedKeyId`, `importWrappingKey`, and `encodeWrappingKey` / `decodeWrappingKey` for verified compact wrapping of lookup keys into public IDs (`wrap`, `unwrap`, `safeUnwrap`, plus structural wire methods). Supported lookup key kinds are `u32`, `i32`, `u64`, and `i64`; 32-bit kinds use `number` and 64-bit kinds use `bigint`.

## 0.4.0

### Minor Changes

- 98ddeac: Rename timestamp-family codec APIs before v1. The main-entry factory is now `createTimestampId` with `TimestampCodec` / `TimestampOptions`, and the opaque subpath factory is now `createOpaqueTimestampId` with `OpaqueTimestampCodec` / `OpaqueTimestampOptions`.

### Patch Changes

- 2bb41d6: Align exported option types with constructor defaults so reusable Timestamp and Opaque Timestamp option objects can omit defaulted injections.

## 0.3.5

### Patch Changes

- b190471: Bound `ids generate --count` to finite positive integers from 1 through 10000. Invalid, unsafe, or oversized counts now fail before the CLI emits any IDs.
- 4cd13e7: Split the CLI into command modules and shared plumbing while preserving existing `ids generate`, `ids inspect`, and `ids keygen` behavior.

## 0.3.4

### Patch Changes

- dc8db2c: Reject unsupported CLI arguments before running commands.

## 0.3.3

### Patch Changes

- 2a58bf9: Internal refactor: split `shared.ts` into `wire/` and `layouts/` layers with `create*LayoutOps` binders (ADR-0008). No public API or wire-format changes.

## 0.3.2

### Patch Changes

- 6a1153b: Add JSDoc to the public codec API. `Codec` and `OpaqueCodec` method tooltips now document the canonical-only `is()` vs lenient `safeParse()` split (ADR-0003), the `extractTimestamp` trust model (ADR-0002), and the opaque codec's async/sync method split.
- 4b7ff3c: Add opaque key helpers and CLI support for operating the Opaque codec from the shell. `encodeOpaqueKey` / `decodeOpaqueKey` round-trip key material in hex or base64url. New `keygen` subcommand emits keys; `generate --opaque` and `inspect --opaque` read the key from `IDS_KEY`.

## 0.3.1

### Patch Changes

- b0e54ec: Document the opaque codec in the README. Adds a new "Don't leak creation time" task-Q&A section covering `createOpaqueId` and `importOpaqueKey`, restructures the API surface into two import blocks with a unified sync/async methods table, notes the cross-codec brand registry, and fixes the "Hiding when your system launched" caveat to point at the opaque codec.

## 0.3.0

### Minor Changes

- 0a50194: Add `createOpaqueId(brand, { key })` and `importOpaqueKey(bytes)` under the new `@smonn/ids/opaque` subpath export. The Opaque codec produces IDs wire-compatible with the Timestamp codec — same prefix, same 26 base32 chars — but the 16-byte payload is AES-CBC-encrypted under the caller-supplied key. `extractTimestamp` becomes key-gated; the timestamp is unrecoverable without the key.

  Key-dependent methods (`generate`, `generateAt`, `extractTimestamp`) are async; `is`, `parse`, `safeParse`, `toJsonSchema`, and `~standard` stay sync because they operate on the wire form only. `OpaqueCodec` omits `minIdForTime` / `maxIdForTime` — lexicographic order over ciphertext doesn't correspond to time order. The construction uses AES-CBC with a zero IV and a single-block strip-and-reconstruct trick to preserve the 16-byte payload, the only WebCrypto primitive that lets us compute raw single-block AES while fitting the shared wire format.

  See ADRs 0004–0007 for the design: the strip-and-reconstruct trick and IV=0 security rationale, the subpath-export precedent for codec variants, the async contract for keyed codecs, and the shared brand registry with wire-indistinguishability.

## 0.2.0

### Minor Changes

- 7ab5dd6: Add `Codec.generateAt(date)` for minting an ID at a caller-supplied timestamp. The 6-byte timestamp portion is encoded from the supplied `Date`; the 10-byte random portion is filled by the codec's `rng`, so the result is canonical and round-trips through `extractTimestamp` exactly. Validation matches `generate()`: pre-epoch dates, dates past the 48-bit ceiling, and `Invalid Date` (`NaN`) all throw. This closes the gap that previously forced migration scripts and test fixtures to construct a throwaway codec with a fake `now` per timestamp — backfilling from UUIDv7 / ULID / Snowflake is now a few lines of user code.

  The `Invalid Date` guard is centralized in the shared timestamp encoder, so `minIdForTime`/`maxIdForTime` now also reject an `Invalid Date` (throwing `"timestamp is not a number"`) instead of silently producing an epoch-zero ID.

- d6549be: Add `Codec.toJsonSchema()` for exporting a brand's IDs as a JSON Schema fragment, ready to drop into an OpenAPI `components.schemas` entry, a JSON Schema document, or any tooling that derives sample payloads. It returns `{ type: "string", pattern, description, example }`, where `pattern` is anchored and brand-specific (e.g. `"^usr_[0-9a-hjkmnp-tv-z]{26}$"`) and `example` is a freshly generated canonical ID.

  The `pattern` describes the **canonical wire form only** — it matches `generate()` output and what `is()` accepts, but rejects the uppercase and Crockford-alias (`o`, `i`, `l`) input that `safeParse()` tolerates. Per ADR-0003, lenient normalisation is the codec's boundary job; artefacts that describe data at rest describe the canonical shape. The return type is exported as `JsonSchema` so consumers can type their OpenAPI builders.

## 0.1.0

### Minor Changes

- a2705a8: Add a CLI runnable as `npx @smonn/ids <subcommand>` with two brand-agnostic subcommands: `inspect <id>` decodes an existing ID and prints the brand, ISO timestamp with a relative-time tail, canonical form, and whether the input was already canonical (flagging uppercase and Crockford aliases). `generate <brand> [--count N]` mints one or more canonical IDs (default 1), one per line for pipeable output. Brand validation is delegated to `createId`; invalid input prints the parse error and exits non-zero.
- 3aefddc: `createId(brand)` now emits a one-shot `console.warn` in development when called a second time for the same brand in the same process — almost always a bundling or import bug (two module copies, accidental re-export, a test re-importing without resetting). Subsequent duplicate calls for the same brand stay silent so logs don't spam. The check is gated on `process.env.NODE_ENV !== "production"`, so production keeps the no-op behaviour. `Options` gains an optional `allowDuplicateBrand` flag: when `true`, the call skips both the warning and the brand registry, so tests that intentionally re-create codecs can opt out cleanly.
- 25ccb9a: Add `Codec.minIdForTime(date)` and `Codec.maxIdForTime(date)` for time-range queries against the ID column. Both build a synthetic `Id<Brand>` whose 6-byte timestamp encodes `date` and whose 10 random bytes are filled with `0x00` (min) or `0xFF` (max), giving the tight lower/upper bounds for any ID generated in that millisecond. Date validation matches `generate()` — pre-epoch or past the 48-bit ceiling throws with the same messages. No new RNG calls.

  ```ts
  sql`SELECT * FROM users WHERE id BETWEEN ${users.minIdForTime(
    start,
  )} AND ${users.maxIdForTime(end)}`;
  ```

- 2676fd3: Each `Codec<Brand>` now implements [Standard Schema v1](https://standardschema.dev/) via a `~standard` property, so a codec can be passed directly to any validator that consumes Standard Schema (Zod, Valibot, ArkType, tRPC inputs, Hono, etc.). `validate` is synchronous, wraps `safeParse`, and returns the canonical `Id<Brand>` on success. Each `ParseError` variant maps to a distinct, human-readable message: `not_string` → `"expected string"`, `invalid_prefix` → `"expected prefix '<brand>_'"`, `invalid_base32` → `"invalid base32 payload"`. No runtime dependency; the spec types are inlined.

## 0.0.2

### Patch Changes

- 4ac58fc: Correct the README's description of the default `rng`: it's an entropy harvester built on `crypto.randomUUID`, not a wrapper around `crypto.getRandomValues`.

## 0.0.1

### Patch Changes

- 424ac97: `encodeBase32` and `decodeBase32` rewritten for performance.

  `decodeBase32` swaps `for…of` over the string + `Map.get(char.toLowerCase())` for an indexed `for`-loop with `charCodeAt` and a precomputed 256-entry `Uint8Array` lookup. String `for…of` pays a Unicode-surrogate tax per character, and `Map.get` is ~10× slower than an array index for a small alphabet. The lookup table still accepts uppercase input and Crockford `o`/`i`/`l` aliases — behaviour is unchanged.

  `encodeBase32` swaps the `result += char` cons-string accumulation for writes into an `Array<number>` of char codes, finalised in one shot via `String.fromCharCode.apply(null, codes)`.

  Local benchmarks: `decodeBase32` −74%, `encodeBase32` −46%. `extractTimestamp` (which uses `decodeBase32`) cascades down another ~35%.

  Several alternatives were measured and rejected during development: `Array.push + join` (~2× slower), `Uint8Array` + spread (~3× slower), `Uint8Array` + `fromCharCode.apply` (~40% slower than `Array<number>`), hoisting the codes array module-level (no gain — V8 fast-paths the small allocation), and a fully-unrolled bit extraction (no faster than the loop — the bottleneck was string concat, not the loop form).

- 424ac97: `extractTimestamp` now decodes only the first 10 base32 characters (the bytes carrying the timestamp) instead of the entire 26-character payload. ~60% faster in local benchmarks; no behavioural change.
- 424ac97: Drop the `invariant` helper and inline `if (...) throw new Error(...)` checks where they remain. V8 declines to inline functions that contain `throw`, so each `invariant()` call cost ~10ns of un-amortised function-call overhead.

  Internal-only base32 functions no longer validate their input — callers in `id.ts` already guarantee shape (16 bytes for `encodeBase32`, alphabet characters for `decodeBase32`), and `Id<Brand>` provides a typed contract for `extractTimestamp` per ADR-0003. Bad input now produces silent garbage rather than a thrown error, which is consistent with the trust-the-type rule applied elsewhere.

  `decodeBase32` and `extractTimestamp` are ~5% faster as a result.

- 424ac97: **Breaking — `Options` reshaped for a zero-allocation `generate()`:**

  - `Options.now`: `() => Date` → `() => number` (ms since Unix epoch). The previous contract allocated a `Date` only to immediately call `.getTime()` on it. Default is now `Date.now`.
  - `Options.rng`: `(bytes: number) => Uint8Array` → `(target: Uint8Array) => void`. Matches `crypto.getRandomValues` and Node's `crypto.randomFillSync`. Custom RNGs no longer have to allocate.

  `createId` now allocates one 16-byte buffer per codec and an aliased 10-byte view over the random portion. `generate()` writes the timestamp into the buffer, then `options.rng(view)` fills the random tail in place. Zero allocations beyond the result string. The codec is stateful, but `generate()` is synchronous and `encodeBase32` produces an independent string before returning — the buffer is never exposed to callers.

  The default `rng` now sources entropy from `crypto.randomUUID()` instead of `crypto.getRandomValues()`. Same CSPRNG underneath, but `randomUUID` has a fixed-format fast path in Node 24 (~84 ns vs ~610 ns to fill 16 bytes). We hex-decode 10 fully-random bytes from positions where neither the version (hex 12) nor variant (hex 16) bits sit — bytes 0–5 from `string[0..7]+string[9..12]`, bytes 6–9 from `string[24..31]`. Custom `rng` implementations are unaffected.

  Combined effect on `generate()`: ~1.04 µs → ~333 ns locally (−68%); throughput from 1.04 M/s to 3.00 M/s.

  Migration:

  ```ts
  // before
  createId("usr", {
    now: () => new Date("2026-01-01"),
    rng: (n) => new Uint8Array(n),
  });

  // after
  createId("usr", {
    now: () => new Date("2026-01-01").getTime(), // or just a raw ms number
    rng: (target) => {}, // target arrives zero-filled the first time
  });
  ```

- 424ac97: `safeParse` and `parse` now skip the alias-replacement pass entirely when the input contains no `o`/`i`/`l` characters. ~35% faster on canonical input in local benchmarks; lenient input is unchanged.
