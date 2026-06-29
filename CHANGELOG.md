# @smonn/ids

## 1.0.0-rc.4

### Major Changes

- 8b5d20d: **Breaking — CLI redesigned to a codec-first grammar.** Commands are now `ids <codec> <verb> [args] [flags]` (e.g. `ids opaque generate usr`, `ids signed inspect <id> --key …`) instead of selecting the codec with a flag (`generate --opaque`). See [ADR-0032](https://github.com/smonn/ids/blob/main/docs/adr/0032-codec-first-cli-grammar.md) and the [CLI spec](https://github.com/smonn/ids/blob/main/docs/cli-spec.md). Closes #778.

  - **Verbs name their input:** `generate` (timestamp/reverse/signed/opaque), `wrap` (wrapped), `derive` (digest); read verbs `inspect` (all but digest) and `match` (digest, grep-like exit `0`/`1`/`2`).
  - **Codec-agnostic operations are top-level:** `keygen` (now codec-agnostic — `--bytes 16|24|32`, `--key-encoding`) and `convert <brand> --uuid <uuid>` (UUID → Id; the Id → UUID direction is the `uuid` field of `inspect`).
  - **Single key env var.** The per-codec `IDS_OPAQUE_KEY` / `IDS_SIGNING_KEY` / `IDS_WRAPPING_KEY` / `IDS_DIGEST_KEY` (and their `_FORMAT` partners) are removed; one `IDS_KEY` backs every keyed codec. Key value resolves as `--key` > `--key-file` > `IDS_KEY` (supplying both `--key` and `--key-file` is a usage error); encoding resolves as `--key-encoding` > `IDS_KEY_ENCODING` > `hex` (renamed from `--key-format`). See [ADR-0033](https://github.com/smonn/ids/blob/main/docs/adr/0033-cli-single-key-env-var.md), which supersedes ADR-0028.
  - **New behavior:** `generate --at <iso|epoch-ms>` stamps an explicit creation time (UTC); `inspect`/`match` gain `--json` (NDJSON when `inspect` batches IDs over stdin) and `--quiet`; digest material is read from `--material` or stdin; UUID interop is preserved via `convert` + the `inspect` `uuid` field.
  - **Internal:** the `Policy` / `Descriptor` / `InspectCapability` dispatch engine is deleted in favor of per-codec CLI modules and a thin router.

- 6394fdd: Remove IdsError/isIdsError/IdsErrorCode re-exports from all five codec subpaths; import error types from `@smonn/ids` only.
- aca8cf0: Raise the `@prisma/client` peer floor from `>=5.9.1` to `>=7.0.0`. Prisma 7 relocated the internal type entry point the adapter relies on from `@prisma/client/runtime/library` to `@prisma/client/runtime/client`; the `@smonn/ids/prisma` adapter now imports from the new path. Consumers must be on Prisma 7 or later — Prisma 5/6 are no longer supported.

## 1.0.0-rc.3

### Minor Changes

- a92f627: Add `nullableIdColumnMysql`, `nullableIdColumnSqlite`, `columnType` option on MySQL/SQLite generated columns; fix Express `idQuery` type cast; normalize NestJS `ParseIdPipe` exception body shape; document Kysely `idPlugin` unbranded-map constraint, `readIdColumn` ORM-boundary divergence, and Fastify-vs-Express storage divergence.
- fcf26d7: Add `IdParamError extends HTTPException` to the Hono adapter so `app.onError` handlers can discriminate `brand_mismatch` from `malformed` via `err.reason`.
- 234ae2d: Add `invalid_timestamp` IdsError code for invalid dates passed to `generateAt`, `minIdForTime`, and `maxIdForTime` on timestamp-family codecs.

### Patch Changes

- 4c2fd73: Reject non-canonical, whitespace-containing, and out-of-alphabet base64url key strings with `invalid_key_encoding`.
- 8c04c72: Fix CLI flag-parsing bugs: keygen selector flags no longer swallow positionals or accept inline values; `inspect --from-uuid` rejects codec-selector and `--key-format` flags; `--ns` with leading or trailing whitespace is now a usage error.
- fed2b7a: Validate the digest key before `generate --digest` blocks on stdin, so a missing or invalid key fails immediately (exit 2) instead of after stdin is read.
- 2e7de02: Fix `generate --digest` UX: print a hint to stderr when stdin is a TTY, and reject empty digest material with exit 1.
- ef0cb95: Fix `toJsonSchema().example` to be a stable structural placeholder for Timestamp and Reverse Timestamp codecs, matching all other codec families.
- 48f46ad: Cap graphql peerDependency to <18.0.0; add execution-engine inline-literal integration test.
- b11cc64: Extract shared `writeIdColumn` and `writeIdColumnNullable` helpers into `adapter-types.ts`; all five ORM adapters (Drizzle, Prisma, Kysely, TypeORM, MikroORM) now delegate their write paths to these helpers. Non-nullable writes throw `IdsError("invalid_id")` if `null` or `undefined` reaches the driver at runtime, closing the silent-propagation gap (#749).

## 1.0.0-rc.2

### Minor Changes

- 7b205db: Add `columnType` option to `nullableIdType` (mikro-orm) and `nullableIdColumn` (drizzle PG), and normalize `undefined`→`null` on all four nullable ORM adapter write paths.

### Patch Changes

- 599e91c: Fix CLI `--ns` flag to reject whitespace-only values with exit code 2 (usage error).
- d225ba6: `idScalar` `serialize` now validates via `codec.is()` (strict) and throws `GraphQLError` on a non-canonical outbound value instead of silently normalizing it. Error messages for all three hooks (`serialize`, `parseValue`, `parseLiteral`) are coarsened to `invalid <ScalarName>` with no internal parse-error code exposed to clients.

## 1.0.0-rc.1

### Minor Changes

- edde2d4: feat(drizzle): add generatedIdColumn, generatedIdColumnMysql, generatedIdColumnSqlite with client-side .$defaultFn wiring for auto-generated IDs on insert.
- c8f1bfa: feat(kysely): add `insertId` helper and `IdGeneratingCodec` export for insert-time ID generation
- 5aaac56: Add `idField` and `IdGeneratingCodec` to `@smonn/ids/mikro-orm` for automatic ID generation via the MikroORM `onCreate` lifecycle hook.
- 5a595b2: Add standalone `nullableIdField` and `NullableIdTransform` to `@smonn/ids/prisma` for adapter-surface symmetry with Drizzle, Kysely, MikroORM, and TypeORM.
- 13dd941: Add `beforeInsertHook` and `IdGeneratingCodec` to `@smonn/ids/typeorm` for auto-generation parity with the Prisma adapter.

## 1.0.0-rc.0

### Major Changes

- 9f03ba0: Rename CLI `IDS_KEY` → `IDS_OPAQUE_KEY` (and `IDS_KEY_FORMAT` → `IDS_OPAQUE_KEY_FORMAT`) for the Opaque codec; the freed `IDS_KEY` / `IDS_KEY_FORMAT` become a primary-secret fallback for all four keyed subcommands (opaque, wrapped, signed, digest).
- 9b363d2: **Breaking — Opaque Timestamp codec key derivation.** `importOpaqueKey` no longer imports the operator's bytes directly as the AES key. The bytes are now HKDF **input keying material**, and the codec derives an **AES-256** key from them via HKDF under the domain-separation label `@smonn/ids/opaque/aes` ([ADR-0027](https://github.com/smonn/ids/blob/main/docs/adr/0027-opaque-hkdf-uniform-key-derivation.md)).

  Consequences:

  - **Every existing Opaque ID is invalidated** — the encryption key changes, so previously issued IDs no longer decrypt. There is no wire key-id to trial the old construction against, so this is a hard cutover: regenerate all Opaque IDs.
  - Opaque encryption is **always AES-256** regardless of key length. 16/24/32-byte keys are still accepted but now set the entropy floor only (a 16-byte key yields AES-256 with a 128-bit entropy floor); AES-128/192 Opaque ciphertexts can no longer be produced.
  - `importOpaqueKey`'s signature is unchanged.

  This completes the uniform key-derivation model in which no operator secret is ever used directly as a primitive key, so one **primary secret** may safely feed all four keyed codecs (each derives independently under its own HKDF label).

### Minor Changes

- ecbcd71: Add optional `columnType` option to `idColumn` (Drizzle) and `idType` (MikroORM) to override the hardcoded `"text"` SQL column type.
- 4051383: Add `idColumnMysql` and `idColumnSqlite` to the Drizzle adapter for MySQL and SQLite dialect support alongside the existing `idColumn` (PostgreSQL).
- 52ae685: Add `idQuery` to Hono, Express, and Fastify adapters for validating query-string params with the same failure contract as `idParam`.
- 050c296: Add `idPlugin(map)` to the Kysely adapter — a `KyselyPlugin` that automatically runs `fromDriver` on configured columns in query results, eliminating per-call-site `fromDriver` invocations.
- e1dd636: Add nullable read helpers for all five ORM adapters (`readIdColumnNullable`, `nullableIdColumn`, `nullableIdTransformer`, `nullableIdType`, `readNullable`/`computeNullableField`) so optional foreign keys and `LEFT JOIN` results no longer throw on `null`.
- dd0c7fd: Add `defaultQuery` to the Prisma adapter's `IdTransform` for client-side ID auto-generation on `create`, `createMany`, and `upsert`.
- df5d1cc: Add `idFieldReadOnly` to `@smonn/ids/prisma` — a read-only sibling of `idField` that accepts any `IdColumnCodec` (no synchronous `generate()` required) and returns the full read/transform surface minus `defaultQuery`.

## 0.15.0

### Minor Changes

- a1e6d0b: Adapter surface consistency: `@smonn/ids/graphql` now re-exports `IdsError`, `isIdsError`, and `IdsErrorCode` for parity with the other adapters (catch-and-narrow without a second import), and `@smonn/ids/prisma` exposes the `computeField()` return shape as a named `IdComputeField<Brand>` type alongside `IdTransform<Brand>`. Both are additive — no existing export changed.

## 0.14.1

### Patch Changes

- 28d92a4: Add `spec/vectors.json` — a frozen, append-only conformance-vector file (v1) and its `toEqual` test harness. The vectors pin the reference implementation against known-answer cases for the shared wire layer (`canonicalize`, the raw UUID mapping) and the Timestamp and Reverse Timestamp codecs (`extract` / `generate`), so the reference implementation and any cross-language port can be checked against the same oracle. The file is published in the package `files` array; keyed-codec construction vectors are deferred to an additive v2 bump. See ADR-0025 (decision) and ADR-0026 (file schema).

## 0.14.0

### Minor Changes

- ae46950: Add `toUUID`, `fromUUID`, and `safeFromUUID` to all six codec variants (Timestamp, Reverse Timestamp, Opaque, Signed, Wrapped Key, Digest).

  - `toUUID(id)` converts any `Id<Brand>` to a lowercase RFC 9562 hyphenated UUID string (`8-4-4-4-12`) by treating the 16-byte payload verbatim as 128 bits. Never throws.
  - `safeFromUUID(value)` parses a case-insensitive UUID string and returns a `ParseResult<Brand>` — `{ ok: false, error: "not_string" }`, `{ ok: false, error: "invalid_uuid" }`, or `{ ok: true, id }`. Never throws.
  - `fromUUID(value)` is the throwing variant: returns `Id<Brand>` or throws `IdsError` with `code: "invalid_id"` and `cause` set to the `ParseError` string.
  - `ParseError` union gains the `"invalid_uuid"` member.
  - All three methods live in the shared wire layer (`src/wire/uuid.ts`) and are delegated from `wireMethods()`; no per-codec duplication.

- 5931c4f: Add UUID interop surface to the CLI: `inspect` now prints a `uuid:` line, `generate --uuid` emits the raw UUID form of each ID, and `inspect --from-uuid <uuid> --brand <brand>` converts a UUID back to a canonical `Id<Brand>`.

## 0.13.1

### Patch Changes

- bbf5f2c: fix(cli): map unexpected throws in run() to exit code 1 instead of unhandled rejection

## 0.13.0

### Minor Changes

- 86d6244: CLI: usage errors now exit 2, runtime errors exit 1; per-subcommand `--help` prints focused usage and exits 0.
- d6db5c7: **Breaking type change:** `Id<Brand>` now uses a module-private `unique symbol` for branding instead of the publicly-named `__brand` property. The runtime string representation is unchanged. Consumers that hand-constructed `Id` values via `as { __brand: "…" }` casts must switch to `as unknown as Id<"…">`.
- 550b2d8: Add `computeField(fieldName)` to the Prisma adapter's `IdTransform` so branded `Id<Brand>` types survive `$extends` without a per-call-site cast.
- 13e05ed: Add `ValidBrand<S>` type for compile-time brand validation on codec constructors.

### Patch Changes

- e46a4cb: Replace bare string returns from `buildCodec` with a typed `CodecError` discriminant so callers switch on `error.kind` instead of inspecting message text. Usage errors from `buildCodec` (missing key env-vars, bad `*_FORMAT` values) that previously exited 1 now correctly exit 2.
- 15fc03b: Add explicit `types` conditions to all `exports` entries and a top-level `types` field, fixing type resolution for node10 (root) and node16/bundler (all subpaths).
- 4da79d1: Fix GraphQL adapter `serialize` to validate via `codec.safeParse` and throw `GraphQLError` on a non-conforming value instead of an unchecked cast.
- 139ad51: Correct two peerDependencies floors that did not actually type-check against the adapter code: `hono` >=4.6.15 (the `ContentfulStatusCode` type the adapter imports lands in 4.6.15) and `@prisma/client` >=5.9.1 (the `GetPayloadResult`/`ResultArgs`/`ResultFieldDefinition` runtime types the adapter relies on are exported from 5.9.1). Caught by the new peer-dependency floor CI matrix, which installs each adapter's declared minimum and type-checks/tests against it.
- 46b4d69: Narrow `IdsError.cause` type to `ParseError | undefined` for typed access without unsafe casts.
- 5a3b8df: `ids keygen` now emits a sensitivity warning to stderr before printing the key, keeping stdout pipeable while alerting users to safe handling.
- 705ed73: Lift duplicated crypto primitives into a shared `_kernel/crypto` leaf to eliminate silent-drift risk.
- dba4913: Lower the `engines.node` floor from `>=24.0.0` to `>=22.0.0`. An exhaustive audit of `src/` found no Node 24-only API — the crypto surface (`crypto.subtle`, `crypto.randomUUID`, `crypto.getRandomValues`, HKDF) and the hand-rolled hex/base64url helpers all predate Node 22, and no Node 22+ additions (`Uint8Array.prototype.toHex`/`toBase64`, `Promise.withResolvers`, `RegExp.escape`, `node:sqlite`, etc.) are used. Node 22 (Jod) is the lowest non-EOL LTS — Node 20 reached end-of-life on 2026-03-24 — so the floor lands at 22. `@types/node` is re-pinned to `22.20.0` to match.
- 3b5dee7: Fix NestJS `ParseIdPipe` so the default exception block is skipped when a caller-supplied `onError` hook is provided.
- 6ab1ee6: Tighten peerDependencies floors to versions actually built and tested: typeorm >=1.0.0, @mikro-orm/core >=7.0.0, @nestjs/common >=11.0.0, drizzle-orm >=0.36.0. kysely >=0.27.0 is unchanged as ColumnType is stable since that version.

## 0.12.3

### Patch Changes

- 5d3c1d3: Publish the release SBOM as a signed CycloneDX attestation (`actions/attest-sbom`) bound to the published package, instead of uploading it as a GitHub release asset — release assets are rejected now that the repo uses immutable releases.

## 0.12.2

### Patch Changes

- b6cc09f: Fix the release SBOM step to generate the CycloneDX SBOM natively from `pnpm-lock.yaml` with cdxgen, instead of deriving a throwaway npm lockfile (which crashed under npm 11 on pnpm's symlinked `node_modules`).

## 0.12.1

### Patch Changes

- 096a9cc: Performance: bring the Reverse Timestamp codec's `generate` to parity with the Timestamp codec (~2.7× faster, ~1.98µs → ~0.73µs on the local bench). The reverse codec defaulted its random tail to `crypto.getRandomValues`, while the Timestamp codec used a faster `crypto.randomUUID` harvest for the identical 10-byte tail. The harvest fast path is now shared (`fastTenByteRng` in the codec kernel) and used as the default RNG for both codecs. Security-equivalent — both are CSPRNG-backed, fully-random 10-byte tails; only throughput changes. No wire-format or API change; callers passing a custom `rng` are unaffected.

  Also precompute the Wrapped key codec's HMAC-message prefix (`len32(brand) ‖ brand ‖ len32(kind) ‖ kind`) once at construction instead of allocating a `TextEncoder` and re-encoding the constant `brand`/`kind` on every `wrap` / `unwrap` trial, matching the Digest and Signed codecs. Per-call message buffers are still freshly allocated, preserving concurrency safety under parallel async signs. Byte-identical output — no wire-format change.

## 0.12.0

### Minor Changes

- 9a0bfca: Add `@smonn/ids/graphql` adapter — `idScalar` builds a `GraphQLScalarType` for any codec.
- f60ad8f: Add MikroORM adapter at `@smonn/ids/mikro-orm` with `idType(codec)` factory.
- 9ec89d4: Add `@smonn/ids/nestjs` subpath export with `ParseIdPipe` for NestJS route param validation.
- 552cf93: Add TypeORM column transformer adapter at `@smonn/ids/typeorm`.

## 0.11.0

### Minor Changes

- 8bf2b1a: **Breaking (pre-1.0):** standardize the HKDF domain-separation labels across the keyed codecs onto `@smonn/ids/<subpath>/<primitive>` (unversioned). The labels change as follows:

  - Signed Timestamp: `ids/signed-timestamp/hmac` → `@smonn/ids/signed/hmac`
  - Digest: `ids/digest/hmac` → `@smonn/ids/digest/hmac`
  - Wrapped key: `@smonn/ids/wrapped/aes/v1` → `@smonn/ids/wrapped/aes`, `@smonn/ids/wrapped/hmac/v1` → `@smonn/ids/wrapped/hmac`

  These labels feed HKDF key derivation, so renaming them re-derives every subkey. **Every existing Wrapped key ID, Signed Timestamp ID, and Digest ID produced under the old labels will fail to verify/decode after upgrading.** There is no migration path or compatibility shim — callers must regenerate all keyed IDs as a hard cutover. The Opaque Timestamp codec is unaffected (it imports its AES key directly, with no HKDF label). No change to any KDF, key length, algorithm, wire format, or API beyond the label strings. See ADR-0019.

- f06b49b: Replace ASCII-delimiter framing with length-prefix framing in the Wrapped key codec HMAC message. This is a wire-breaking change for pre-1.0 consumers of the Wrapped key codec: existing wrapped IDs produced before this change will fail verification after upgrading. The new framing (`len32(brand) ‖ brand ‖ len32(kind) ‖ kind ‖ lane`) makes domain separation structural rather than regex-dependent, hardening against a latent cross-domain MAC collision that could arise if the brand grammar were ever widened.

### Patch Changes

- 8d2243c: Align @types/node dev-dependency with engines.node >=24 floor; switch CryptoKey type annotations to webcrypto.CryptoKey.
- 5375f3d: Hono adapter: narrow `options.status` fields from `number` to `ContentfulStatusCode`, removing the unsafe cast that let invalid HTTP status codes reach `HTTPException` unchecked.
- b7aa9a1: Add @prisma/client devDependency and $extends result-component type assertions to the Prisma adapter test.

## 0.10.0

### Minor Changes

- 3b6dfe9: Add CLI support for the Digest codec: `ids keygen --digest` emits digest key material, `ids generate <brand> --digest --ns <ns>` reads material from stdin and produces a deterministic ID via `IDS_DIGEST_KEY`. Digest IDs are one-way; `inspect --digest` is unsupported by design.
- 226bbbc: Add Digest codec (`@smonn/ids/digest`): one-way deterministic keyed digest that maps caller material to a stable public ID under a single operator key.

### Patch Changes

- fe284b2: Reject `--count N > 1` with `--digest` (exit 1, error on stderr): same material always produces the same ID.
- 8fac997: `keygen --digest --ns <value>` now exits 1 with `unsupported flag for keygen: --ns` instead of silently ignoring the flag.

## 0.9.4

### Patch Changes

- 9561df7: docs: fix playground field sizing, codec tab alignment, and home card grid on the docs site

## 0.9.3

### Patch Changes

- e724772: Docs: fix undefined identifiers in the Wrapped key (`invoices`) and Hono adapter (`org`/`thing`/`handler`) examples, and align the CLI `--wrapped` inspect example brand with the wrapped-codec docs (`ord_…`). Documentation only — no runtime changes; the release exists to redeploy ids.smonn.se.

## 0.9.2

### Patch Changes

- 81bdcee: Documentation: launch the docs site at [ids.smonn.se](https://ids.smonn.se) with an interactive playground covering all six codecs, and slim the README to a landing page that links into the site. No runtime or API changes.

## 0.9.1

### Patch Changes

- 8d7a65d: fix(cli): unify inspect --signed verification contract — stdout always carries the report, stderr carries the diagnostic, exit code carries pass/fail; missing and malformed keys now exit 1 with `verification: unavailable` instead of silently exiting 0.

## 0.9.0

### Minor Changes

- c8b7d28: Add CLI support for the Signed Timestamp codec via `--signed` flag on `keygen`, `generate`, and `inspect`.

### Patch Changes

- 586953e: Fix: `is()` and `safeParse()` now reject non-canonical trailing-bit variants (final base32 char must have zero low 2 bits).

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

- d6549be: Add `Codec.toJsonSchema()` for exporting a brand's IDs as a JSON Schema fragment, ready to drop into an OpenAPI `components.schemas` entry, a JSON Schema document, or any tooling that derives sample payloads. It returns `{ type: "string", pattern, description, example }`, where `pattern` is anchored and brand-specific (e.g. `"^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$"`) and `example` is a freshly generated canonical ID. <em>(Note: the original pattern example `"^usr_[0-9a-hjkmnp-tv-z]{26}$"` predates the canonical trailing-bit fix shipped in 0.9.0; the final character is now constrained to the character class `[048cgmrw]`.)</em>

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
