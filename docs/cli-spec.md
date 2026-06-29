# `ids` CLI specification

A command-line interface for the `@smonn/ids` library. This document specifies the command grammar, subcommands, arguments, flags, and behavioral contracts. It does not specify implementation. The rationale for the overall shape lives in [ADR-0032](./adr/0032-codec-first-cli-grammar.md) (grammar) and [ADR-0033](./adr/0033-cli-single-key-env-var.md) (key model).

## Design principles

- **Codec-first grammar.** The codec is load-bearing for every operation and is orthogonal to the brand. It MUST be stated explicitly; the CLI MUST NOT infer it. Therefore the codec is the first token, not a flag.
- **Codec-agnostic operations are top-level.** An operation whose behavior does not depend on the codec lives outside the codec tree, as a sibling of the codec token: `keygen` (one key backs every codec) and `convert` (a view over the shared payload). Everything codec-bearing goes through the codec tree.
- **`key` is codec-agnostic.** One key backs all keyed codecs (the library derives per-codec subkeys internally), so key creation is `keygen`, a top-level command, and key _input_ is one `IDS_KEY` / `--key`, never per-codec.
- **Honest verbs.** Write verbs name their input (`generate` takes nothing, `wrap` takes an integer, `derive` takes a string + namespace), because the input type differs per codec and a uniform verb would hide that. The read verb is uniform (`inspect`) wherever a value is recoverable, because the codec already scopes what "read" means; digest is the one exception (`match`), since its input is unrecoverable.
- **Predictable output.** Output format does not change based on TTY detection. Human format is the default; `--json` is an explicit opt-in.

## Synopsis

```
ids <codec> <verb> [args] [flags]
ids keygen [flags]
ids convert <brand> --uuid <uuid> [flags]
ids --version
ids --help
```

There is no top-level `inspect` or `match`. All codec-bearing read operations go through the codec tree. The only top-level commands are the codec-agnostic ones (`keygen`, `convert`).

## Codec / verb matrix

| codec       | write verb | read verb | needs key | write input            |
| ----------- | ---------- | --------- | --------- | ---------------------- |
| `timestamp` | `generate` | `inspect` | no        | brand only             |
| `reverse`   | `generate` | `inspect` | no        | brand only             |
| `signed`    | `generate` | `inspect` | yes       | brand only             |
| `opaque`    | `generate` | `inspect` | yes       | brand only             |
| `wrapped`   | `wrap`     | `inspect` | yes       | brand + integer + kind |
| `digest`    | `derive`   | `match`   | yes       | brand + material + ns  |

---

## Write commands

### `generate` (timestamp, reverse, signed, opaque)

Mints a fresh ID. The payload leads with a 48-bit millisecond timestamp.

```
ids timestamp generate <brand> [--count N] [--at WHEN]
ids reverse   generate <brand> [--count N] [--at WHEN]
ids signed    generate <brand> --key ...  [--count N] [--at WHEN]
ids opaque    generate <brand> --key ...  [--count N] [--at WHEN]
```

- `<brand>` (positional, required). Validated against the brand grammar (see Brands).
- `--count N` (optional, default `1`). Emits N IDs, one per line, in a single invocation. Each ID is independently minted (fresh entropy). Capped at the library's maximum generate count; over the cap is a usage error. `-c` is an alias.
- `--at WHEN` (optional). Stamps the IDs with an explicit creation time instead of the current clock (surfaces the library's `generateAt`). Accepts either an **ISO 8601** datetime or an integer **epoch-milliseconds**. All input is interpreted as **UTC** — a naive ISO datetime (no offset) is treated as UTC, not local time, so the result is machine-independent. With `--count N`, all N IDs share the timestamp but keep distinct random tails (so they remain unique). Unparseable, pre-epoch, or beyond the 48-bit ms range is a usage error. Only valid for the four timestamp-family codecs.
- `--key` (required for `signed` and `opaque`; rejected for `timestamp` and `reverse`).

Output: bare ID(s), newline-terminated, to stdout.

### `wrap` (wrapped)

Reversibly wraps an integer under the key. Deterministic: the same value, kind, brand, and key always yield the same ID. `--count` and `--at` do not apply.

```
ids wrapped wrap <brand> --value V --kind u32|i32|u64|i64 --key ...
```

- `<brand>` (positional, required).
- `--value V` (required flag). Parsed as a **string**, never as a JS number, then range-checked against `--kind`. A value outside the kind's range is a usage error.
- `--kind` (required flag, no default). One of `u32`, `i32`, `u64`, `i64`. The ranges overlap, so the kind cannot be inferred and MUST be supplied. The kind is encoded into the wrapped payload.
- `--key` (required).

Kind ranges:

| kind  | JS type | range                                         |
| ----- | ------- | --------------------------------------------- |
| `u32` | number  | `[0, 4294967295]`                             |
| `i32` | number  | `[-2147483648, 2147483647]`                   |
| `u64` | bigint  | `[0, 18446744073709551615]`                   |
| `i64` | bigint  | `[-9223372036854775808, 9223372036854775807]` |

Output: bare ID, newline-terminated.

### `derive` (digest)

Maps caller material to a stable public ID under the key. One-way: the material cannot be recovered. Deterministic: same material, namespace, brand, and key always yield the same ID. Different namespaces yield unlinkable IDs from the same key. `--count` and `--at` do not apply.

```
ids digest derive <brand> --ns STR --key ...  [--material STR]
echo -n "STR" | ids digest derive <brand> --ns STR --key ...
```

- `<brand>` (positional, required).
- **Material** — the caller material, non-empty. Supplied either as `--material STR` (convenient for scripting; visible in `ps`/shell history) or, when `--material` is absent, read from **stdin** (keeps sensitive material such as PII off argv — the recommended path). `--material` wins when both are present. Empty material is an error.
- `--ns STR` (required flag). The namespace mixed into every digest. Non-empty, no leading/trailing whitespace. Required and order-ambiguous with the material, hence a named flag.
- `--key` (required).

Output: bare ID, newline-terminated.

---

## Read commands

### `inspect` (timestamp, reverse, signed, opaque, wrapped)

Reads an ID and reports what the codec can recover. Accepts one ID as a positional, or many via stdin (see Batch input). Exits nonzero on any failure (malformed ID, wrong key, failed verification, failed decryption).

```
ids timestamp inspect <id>            [--json] [--quiet]
ids reverse   inspect <id>            [--json] [--quiet]
ids signed    inspect <id> --key ...  [--json] [--quiet]
ids opaque    inspect <id> --key ...  [--json] [--quiet]
ids wrapped   inspect <id> --key ...  [--kind u32|i32|u64|i64] [--json] [--quiet]
```

Per-codec behavior and reported fields:

| codec | operation | fields reported |
| --- | --- | --- |
| `timestamp` | decode timestamp | `brand`, `codec`, `timestamp`, `uuid` |
| `reverse` | decode timestamp | `brand`, `codec`, `timestamp`, `uuid` |
| `signed` | verify signature, then decode ts | `brand`, `codec`, `timestamp`, `verified`, `uuid` |
| `opaque` | decrypt, then decode timestamp | `brand`, `codec`, `timestamp`, `uuid` |
| `wrapped` | unwrap to original integer | `brand`, `codec`, `value`, `kind`, `uuid` |

Notes:

- Every `inspect` reports a `uuid` field — the [Raw UUID mapping](./adr/0024-uuid-interop-raw-mapping.md) of the ID's payload. It is total and free on every codec. The reverse direction (uuid → id) is the top-level `convert` command.
- `signed inspect` couples verification and extraction. Reaching output implies the signature verified; `verified: true` is reported explicitly. A failed signature is a failure (stderr diagnostic, nonzero exit), not a printed `verified: false`.
- `wrapped inspect` is self-describing: no `--kind` flag is needed on read. The kind is **not stored in the ID** — it is folded into the verification tag — so it is recovered by **trial**: each of `u32`/`i32`/`u64`/`i64` is attempted in turn and the one whose tag verifies wins (false-cross ≈ 2⁻⁶⁴ per kind, so the result is unambiguous). An optional `--kind u32|i32|u64|i64` may be supplied to skip the trial and verify against that kind only. `value` is the recovered integer; `kind` is its type.
- `--quiet` suppresses stdout. The exit code remains the signal. Useful for gating: `if ids signed inspect "$id" --key ... --quiet; then ...`.

### `match` (digest)

Recomputes the digest from candidate material and compares it to a given ID. This is the only meaningful read for digest, since the material is unrecoverable. **Single-shot**: one ID per invocation (batch the _ID_ axis with `derive | grep`; the material axis with a shell loop).

```
ids digest match <id> --ns STR --key ...  [--material STR] [--json] [--quiet]
echo -n "STR" | ids digest match <id> --ns STR --key ...
```

- `<id>` (positional, required). The candidate ID. The brand is taken from the ID.
- **Material** — as for `derive`: `--material STR` or, when absent, stdin.
- `--ns STR` (required flag).
- `--key` (required).

Output (human): `match: true` / `match: false`. `--json`: `{ "id": ..., "match": bool }`.

Exit code for `match` follows a grep-like convention rather than the `inspect` contract:

- `0` the candidate matched.
- `1` no match (a clean non-match is a valid result, not an error).
- `2` operational/usage error (malformed ID, bad key, missing flag).

---

## Top-level commands

### `keygen`

Emits fresh random key material in a paste-able encoding. Codec-agnostic: one key backs every keyed codec.

```
ids keygen [--bytes 16|24|32] [--key-encoding hex|base64url]
```

- `--bytes` (optional, default `32`). Key length. `32` (256-bit) is the default and the recommended strength. `16` (128-bit) and `24` (192-bit) are accepted; the library always derives AES-256 internally, so shorter keys only lower the entropy floor. No warning is emitted for short keys.
- `--key-encoding` (optional, default `hex`, also settable via `IDS_KEY_ENCODING`). `hex` or `base64url`. Governs the encoding of the emitted key. See Key encoding.

Output: the encoded key, newline-terminated, to stdout. A one-line reminder that this is secret material (redirect to a file, avoid shell history) is written to **stderr**, so `export IDS_KEY=$(ids keygen)` and pipes are unaffected.

### `convert`

Re-expresses a UUID as an `Id` for a given brand (the uuid → id direction of the [Raw UUID mapping](./adr/0024-uuid-interop-raw-mapping.md)). Codec-agnostic — the mapping is a view over the shared 16-byte payload, identical across codecs. The reverse direction (id → uuid) is the `uuid` field of `inspect`.

```
ids convert <brand> --uuid <uuid>
```

- `<brand>` (positional, required). Validated against the brand grammar.
- `--uuid <uuid>` (required flag). A canonical `8-4-4-4-12` hyphenated UUID, case-insensitive. A malformed UUID is a usage error.

Output: a bare `Id`, newline-terminated, to stdout.

---

## Cross-cutting conventions

### Brands

- A brand is exactly three lowercase ASCII letters: `[a-z]{3}` (e.g. `usr`, `org`). This is a library invariant (`validateBrand`), not a CLI choice — digits and uppercase are not permitted, and the length is fixed at three.
- The CLI validates the brand on write/convert and rejects a malformed brand as a usage error.
- On read, the brand is reported as a decoded field. There is no brand assertion flag.

### Key input

For any keyed command, the key value is resolved from the first source present, in this precedence order:

1. `--key STRING` (the encoded key directly).
2. `--key-file PATH` (read the encoded key from a file; surrounding whitespace, including a trailing newline, is trimmed).
3. `IDS_KEY` environment variable.

Rules:

- If none is present on a keyed command, that is a usage error.
- Supplying **both** `--key` and `--key-file` is a usage error — two explicit sources colliding signals a mistake. (`IDS_KEY` remains a silent fallback under either flag.)
- The key is decoded under the resolved key encoding (see Key encoding).
- The decoded length MUST be 16, 24, or 32 bytes. Any other length is a usage error. This guards against truncated or wrong-encoding paste errors, which almost never land on one of the three exact lengths.
- The key is a bare encoded blob. There is no format prefix or codec tag, and there are **no per-codec key env vars** — the codec is the command token, not part of the variable name (see [ADR-0033](./adr/0033-cli-single-key-env-var.md)).

Source note: `--key` places the key on the command line, where it is visible in process listings (`ps`) and shell history. `--key-file` and `IDS_KEY` avoid that argv exposure and SHOULD be preferred for real keys.

### Key encoding

Both `keygen` (output) and keyed commands (input) encode/decode the key as either `hex` or `base64url`. The encoding is resolved independently of the key value's source:

1. `--key-encoding hex|base64url` (flag).
2. `IDS_KEY_ENCODING` environment variable.
3. Default `hex`.

This is orthogonal to the key-value precedence above: a key from `--key-file` and an encoding from `IDS_KEY_ENCODING` combine without conflict. The pairing of `IDS_KEY` with `IDS_KEY_ENCODING` lets a base64url key be fully env-configured with no per-call flags.

Terminology: this governs the byte-to-string **encoding** only (hex vs base64url). It is not a structured key format (no PEM/JWK/DER); the library consumes raw bytes. (The flag was previously `--key-format`; see the **Key encoding** glossary entry.)

### Output format

- **Write commands** (`generate`, `wrap`, `derive`) and `convert` always emit the bare ID(s), one per line, newline-terminated, to stdout. No decoration. This makes write output directly pipeable.
- **Read commands** (`inspect`, `match`) default to human-readable aligned `key: value` lines. `--json` switches to a machine object.
- `timestamp` is reported in human mode as both epoch milliseconds and ISO 8601 UTC. In JSON it is a nested object: `"timestamp": { "ms": 1700000000000, "iso": "2023-11-14T22:13:20.000Z" }`.
- A `value` of kind `u64`/`i64` is emitted in JSON as a **string** (always, regardless of magnitude) to avoid precision loss above 2^53; `u32`/`i32` are emitted as numbers. The `kind` field signals the intended type. In human mode the value is printed bare.

### Batch input (stdin)

`inspect` accepts many inputs via stdin, one ID per line, in addition to a single positional. If a positional ID is given, it is used; otherwise stdin is read. This makes the tool a pipeline citizen:

```
grep -o 'usr_[0-9a-z]*' app.log | ids opaque inspect --key ...
```

(`match` is single-shot and does not batch over IDs; its stdin carries the candidate material instead. `derive` likewise reads material, not IDs, from stdin.)

Batch processing for `inspect` is **best-effort**:

- stdout carries only successes (their normal output).
- stderr carries a per-line diagnostic for each failure: the offending input and a reason.
- The exit code aggregates: `0` only if every line succeeded; nonzero if any line failed.

This invariant holds in both formats: a downstream consumer reading stdout sees only successful results, never error text.

### `--json` under batch

- For `inspect` over stdin, output is NDJSON: one JSON object per input line, emitted as processing proceeds (streaming, no buffering of the whole input).
- Failures remain on stderr as plain-text diagnostics. stdout holds only success objects. The "stdout = successes" invariant is preserved in JSON mode.

### `--quiet`

- Silences stdout only. stderr diagnostics still flow, so a quiet batch still reports which lines failed.
- Does not affect the exit code.

### Exit codes

| code | meaning |
| --- | --- |
| `0` | success (all lines succeeded in a batch) |
| `1` | operational failure (malformed ID, failed verify/decrypt, wrong key); for `match`, "no match" |
| `2` | usage error (unknown/missing/conflicting flag, bad brand, unsupported key length, out-of-range value) |

### Help and version

- Every node supports `--help` / `-h`, scoped to that node. Because the tree is codec-first, each codec's help lists only the verbs and flags that codec actually supports (no impossible combinations).
- `ids --version` prints the version at the top level.

---

## Examples

```
# Generate a plaintext ID
ids timestamp generate usr
# -> usr_06f80z92d2dbsqqg28t5cy4tqg

# Generate ten reverse-ordered IDs
ids reverse generate evt --count 10

# Backfill an ID at a specific creation time (UTC)
ids timestamp generate usr --at 2023-11-14T22:13:20Z

# Generate a signed ID, key from env
export IDS_KEY=$(ids keygen)
ids signed generate usr
ids signed inspect usr_06f8...

# Fully env-configured base64url key (no per-call flags)
export IDS_KEY_ENCODING=base64url
export IDS_KEY=$(ids keygen --bytes 32)
ids signed generate usr

# Inspect a signed ID (verifies + extracts), quiet gate
ids signed inspect usr_06f8... --key-file ./key.hex --quiet && echo ok

# Wrap a 64-bit integer
ids wrapped wrap ord --value 18446744073709551615 --kind u64 --key-file ./key.hex

# Inspect the wrapped ID (self-describing kind)
ids wrapped inspect ord_06f8... --key-file ./key.hex
# brand: ord
# codec: wrapped
# value: 18446744073709551615
# kind:  u64
# uuid:  0190ab...-....

# Derive a stable pseudonym, material off argv via stdin
printf '%s' "user@example.com" | ids digest derive psd --ns billing --key-file ./key.hex

# Check whether material maps to a given ID
printf '%s' "user@example.com" | ids digest match psd_06f8... --ns billing --key-file ./key.hex
# match: true   (exit 0)

# Decrypt a stream of opaque IDs from a log, as NDJSON
grep -o 'usr_[0-9a-z]*' app.log | ids opaque inspect --key-file ./key.hex --json

# Convert a UUID into a branded Id
ids convert usr --uuid 0190ab12-3456-789a-bcde-f0123456789a

# Generate a 128-bit key in base64url
ids keygen --bytes 16 --key-encoding base64url
```
