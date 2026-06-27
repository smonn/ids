# Coded `IdsError` for caller-reachable throws

Public API failures that **throw** today raise plain `Error` instances whose only machine-readable signal is the message string. Non-throwing parse paths already return string codes — `ParseError` (`not_string` | `invalid_prefix` | `invalid_base32`) and the Wrapped key `safeUnwrap` adds `verification_failed`. Programmatic callers can branch on those result codes but have no stable way to distinguish a thrown invalid-brand from invalid key material, an out-of-range lookup key, or a verification failure that throws — except by matching message substrings, which the library does not want to freeze.

This ADR records the **shape** of a coded throwing-error surface. It does not change wire format, validation semantics, or the success-path result shapes. Implementation is a separate, blocked follow-up: **[#145](https://github.com/smonn/ids/issues/145)** (blocked by [#78](https://github.com/smonn/ids/issues/78)) — message strings are only restated, and exact text only frozen, at implementation time.

## Decision

Throwing failures that a caller can provoke with bad input raise a single package error class, **`IdsError extends Error`**, carrying a stable `readonly code: IdsErrorCode` (an exported string-literal union). A branded **`isIdsError(value): value is IdsError`** type guard is the supported way to recognize one. The `code` is the stability contract; the human-readable `message` is explicitly **non-contractual** and may be restated.

### One class with a `code`, not enums or subclasses

`IdsError` is the only error class. Callers discriminate on `err.code`, narrowed against the `IdsErrorCode` union for exhaustive `switch` checking — the same ergonomics the `ParseError` union already gives non-throwing paths ([ADR-0003](./0003-canonical-strict-is.md) established that exhaustive-union style). A single class keeps one `instanceof`/guard surface and one place to document, while the `code` field carries the discrimination.

### Caller-reachable boundaries are coded; internal invariants stay plain

Only throws a caller can trigger with the values they pass become `IdsError`. Guards that protect an internal invariant — reachable only via a forged handle, a pathological injected clock, or a bug — stay plain `Error`: they signal a library/integration defect, not a caller mistake, and giving them a stable public `code` would freeze a contract on a path that should never fire in correct use.

### Codes collapse by caller remedy

Where several throw sites share the same fix, they share one code; the specifics (which kind, which range, how many bytes) live in the `message`, not in a proliferation of codes. This yields a small union that is cheap to freeze and document, without losing the per-case detail a human reader needs.

### One vocabulary across throwing and non-throwing surfaces

The same token means the same thing whether it is returned or thrown. `verification_failed` is simultaneously the `IdsError.code` thrown by `unwrap` and the existing `safeUnwrap` result string — one concept, one spelling. `parse()` (and the database read adapters) throw `invalid_id` and attach the underlying `ParseError` on `cause`. The **shapes** of `safeParse` / `safeUnwrap` results are unchanged — they keep returning their existing `ParseError` / `ParseError | "verification_failed"` unions; only the spellings are guaranteed to line up so the docs describe one vocabulary.

### `code` is the contract; `message` is not

Because `code` carries the discrimination, message text is freed to be standardized and improved, and is documented as non-contractual. This is a deliberate, allowed break for callers currently matching message substrings: the package is pre-`1.0`, so it ships under a minor bump with no migration shim ([#78](https://github.com/smonn/ids/issues/78) acceptance).

### The code union

| `code` | meaning | thrown by | caller remedy |
| --- | --- | --- | --- |
| `invalid_brand` | brand isn't three lowercase `a–z` characters | `create*Id(brand)` construction | fix the brand literal |
| `invalid_key_format` | declared key format isn't `hex` / `base64url` | `decodeOpaqueKey`, `decodeWrappingKey` | pass a supported format |
| `invalid_key_encoding` | encoded key string is malformed for its format (odd-length / non-hex, bad base64url) | `decodeOpaqueKey`, `decodeWrappingKey` | fix the encoded key string |
| `invalid_key_length` | raw key isn't 16 / 24 / 32 bytes | `importOpaqueKey`, `importWrappingKey`, decoders | supply 128 / 192 / 256-bit material |
| `invalid_kind` | wrapped `kind` isn't `u32` / `i32` / `u64` / `i64` | `createWrappedKeyId({ kind })` | pass a supported kind |
| `empty_keyring` | wrapping keyring has no entries | `createWrappedKeyId({ keys })` | supply at least one key |
| `duplicate_keyring_entry` | two keyring entries share raw secret material | `createWrappedKeyId({ keys })` | de-duplicate the ring |
| `invalid_lookup_key` | lookup key out of range / wrong type for the kind | `wrap(lookupKey)` | pass an in-range value of the kind's JS type |
| `verification_failed` | no keyring entry verifies the payload tag | `unwrap(id)` | wrong/revoked key, or a tampered ID |
| `invalid_id` | string isn't a valid ID for the brand (carries the `ParseError` on `cause`) | `parse()`, prisma/drizzle/kysely read hooks | use `safeParse`/`safeUnwrap`, or fix the source |
| `invalid_namespace` | ns is empty or whitespace-only | `createDigestId({ ns })` construction | supply a non-empty, non-whitespace namespace |
| `invalid_timestamp` | date passed to `generateAt`, `minIdForTime`, or `maxIdForTime` is Invalid Date, pre-epoch, or exceeds the 48-bit range | `generateAt(date)`, `minIdForTime(date)`, `maxIdForTime(date)` on all timestamp-family codecs | pass a valid, in-range `Date` |

All twelve codes are **public stability contract**. The shape is, in TypeScript terms:

```ts
export type IdsErrorCode =
  | "invalid_brand"
  | "invalid_key_format"
  | "invalid_key_encoding"
  | "invalid_key_length"
  | "invalid_kind"
  | "empty_keyring"
  | "duplicate_keyring_entry"
  | "invalid_lookup_key"
  | "verification_failed"
  | "invalid_id"
  | "invalid_namespace"
  | "invalid_timestamp";

export class IdsError extends Error {
  readonly code: IdsErrorCode;
  // plus a non-enumerable brand so isIdsError survives realm/dual-package duplication
}

export function isIdsError(value: unknown): value is IdsError;
```

### What stays plain `Error`

| site | message today | why it stays plain |
| --- | --- | --- |
| `bytes.ts` `decodeHex` | `invalid hex` | internal helper; the public key decoders validate hex themselves and raise `invalid_key_encoding` before this is reached on a public path |
| `opaque-key.ts` / `wrapping-key.ts` handle-not-found | `invalid opaque key` / `invalid wrapping key` | only reachable with a forged/foreign handle (requires a cast past the branded type); a misuse/bug, not caller data |
| `hono.ts` | `HTTPException` | deliberately a framework error on the no-`onError` path; converting it would break the adapter's contract |

## Considered Options

### Error shape

- **Single class + `code` field** — chosen. One discrimination surface; the union type gives exhaustive `switch`; mirrors the existing `ParseError` union style.
- **One subclass per failure (`InvalidBrandError`, `VerificationFailedError`, …)** — rejected: ~10 exported classes to import and keep in lockstep, and `instanceof` chains are more fragile across dual-package duplication than a single branded class with a `code`.
- **A TypeScript `enum` for codes** — rejected: enums emit runtime objects and are awkward to widen/serialize; a string-literal union is erasable, JSON-friendly, and matches how `ParseError` is already modeled.
- **Keep plain `Error`, document message substrings** — rejected: that is the status quo the issue exists to fix; it leaves programmatic callers depending on text the library wants to keep free to change.

### Scope

- **Caller-reachable boundaries only** — chosen (see Decision). Internal invariants and forged-handle/injected-clock misuse stay plain.
- **Every throw site** — rejected: freezes public codes on paths that only fire on internal bugs and inflates the union.
- **Crypto boundaries only** (just `verification_failed` + key import) — rejected: leaves argument-validation throws (bad brand, bad lookup-key, bad kind) uncatchable by code, which is inconsistent at the same boundary.

### Code granularity

- **Collapse by caller remedy (~10)** — chosen. Specifics live in the message.
- **One code per throw site (~18+)** — rejected: a much larger union to freeze, more churn when sites are added, for discrimination most callers don't need.
- **~5 broad codes** — rejected: the collapse lines (e.g. folding key-length into key-encoding) erase remedies that genuinely differ.

### Vocabulary

- **Align tokens, keep current result shapes** — chosen. `verification_failed` is shared; `invalid_id` wraps `ParseError` on `cause`; `safeParse`/`safeUnwrap` shapes untouched.
- **Two separate vocabularies** — rejected: callers would learn `verification_failed`-the-string and `verification_failed`-the-code as unrelated, and the two would drift.
- **One unified enum everywhere** — rejected: forces shape/type changes on `safeParse`/`safeUnwrap` and risks breaking existing string-literal matchers.

### Message-text compatibility

- **`code` is the contract; restate messages** — chosen. Messages declared non-contractual; allowed pre-`1.0` break under a minor bump.
- **Preserve every message verbatim** — rejected: freezes today's sometimes-terse wording (e.g. bare `verification failed`) as a de-facto contract alongside the code.

### Discrimination surface

- **Class + `IdsErrorCode` union + branded `isIdsError`** — chosen. The guard checks a brand, not bare `instanceof`, so it survives two copies of the package being loaded.
- **`instanceof` only** — rejected: silently fails under dual-package duplication, sending real `IdsError`s down the unrecognized branch.
- **Per-code predicate helpers** — rejected: ~10 helpers bloat the surface and must grow lockstep with the union.

## Consequences

- **Public exports.** `IdsError`, `IdsErrorCode`, and `isIdsError` join the public surface. Per [ADR-0005](./0005-codec-variant-subpath-exports.md) they are exported from the main entry and re-exported where a subpath throws them; `CONTRIBUTING.md` requires the README API section to grow with them.
- **Catching.** Callers write `if (isIdsError(e) && e.code === "verification_failed")`; the union type makes a `switch (e.code)` exhaustive at compile time, paralleling the documented `ParseError` switch.
- **`cause` chain.** `invalid_id` carries the originating `ParseError` on `cause`, so the structural reason (`not_string` / `invalid_prefix` / `invalid_base32`) remains available without parsing message text.
- **No success-path change.** `safeParse` / `safeUnwrap` keep returning their existing result unions. Only the throwing paths gain `IdsError`, and only the listed boundary sites change.
- **Pre-`1.0` break.** Restated messages and the switch from `Error` to `IdsError extends Error` ship under a minor bump. `instanceof Error`, `try/catch`, and `.message` access all keep working; only code that string-matched specific messages must move to `code`. No migration shim is provided.
- **Implementation is gated.** This ADR is the accepted design; the code, README error-code table, JSDoc, and tests land in **[#145](https://github.com/smonn/ids/issues/145)**, which is blocked by [#78](https://github.com/smonn/ids/issues/78). Tests assert on `code`, never on message text.
- **Adding a code later** is a minor, additive change (a new union member); removing or renaming one is breaking and needs its own decision once the package reaches `1.0`.
