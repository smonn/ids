---
title: CLI
description: Codec-first command-line interface for generating, inspecting, and matching IDs — no install required.
---

A codec-first CLI, no install required. The codec is the **first token** and is
never inferred — every command is `ids <codec> <verb>`. Run `npx @smonn/ids --help`
for the full list, or `npx @smonn/ids <codec> --help` for one codec's verbs.

```
ids <codec> <verb> [args] [flags]
ids keygen [--bytes 16|24|32] [--key-encoding hex|base64url]
ids convert <brand> --uuid <uuid>
ids --version | --help
```

The full contract lives in the repo's [CLI specification](https://github.com/smonn/ids/blob/main/docs/cli-spec.md);
the rationale is in [ADR-0032](https://github.com/smonn/ids/blob/main/docs/adr/0032-codec-first-cli-grammar.md)
(grammar) and [ADR-0033](https://github.com/smonn/ids/blob/main/docs/adr/0033-cli-single-key-env-var.md)
(key model).

## Codec / verb matrix

| codec       | write verb | read verb | needs key | write input            |
| ----------- | ---------- | --------- | --------- | ---------------------- |
| `timestamp` | `generate` | `inspect` | no        | brand only             |
| `reverse`   | `generate` | `inspect` | no        | brand only             |
| `signed`    | `generate` | `inspect` | yes       | brand only             |
| `opaque`    | `generate` | `inspect` | yes       | brand only             |
| `wrapped`   | `wrap`     | `inspect` | yes       | brand + integer + kind |
| `digest`    | `derive`   | `match`   | yes       | brand + material + ns  |

## Write verbs

Write verbs name their input, because it differs per codec. All write output is the
bare ID(s), one per line — directly pipeable.

```bash
# Timestamp / Reverse (no key)
$ npx @smonn/ids timestamp generate usr --count 3
usr_…
usr_…
usr_…

# Backfill at an explicit creation time (ISO 8601 or epoch-ms, interpreted UTC)
$ npx @smonn/ids timestamp generate usr --at 2026-06-01T00:00:00Z

# Signed / Opaque (keyed)
$ npx @smonn/ids signed generate usr --key-file ./key.hex

# Wrapped — wrap an integer; --kind is required (ranges overlap, so it can't be inferred)
$ npx @smonn/ids wrapped wrap ord --value 18446744073709551615 --kind u64 --key-file ./key.hex

# Digest — derive a stable ID from material; material via --material or stdin (stdin keeps PII off argv)
$ printf '%s' "user@example.com" | npx @smonn/ids digest derive psd --ns billing --key-file ./key.hex
```

- `--count N` (`generate` only, default 1, max 10000): mint N independent IDs.
- `--at WHEN` (`generate` only): ISO 8601 datetime or integer epoch-ms, interpreted as
  **UTC**. With `--count`, all share the timestamp but keep distinct random tails.
- `--value` / `--kind` (`wrap`): the integer and its width/signedness (`u32`/`i32`/`u64`/`i64`).
  `--value` is parsed as a string then range-checked.
- `--ns` / `--material` (`derive`): the namespace (required, non-empty) and the material
  (via `--material`, or stdin when absent).

## Read verbs

`inspect` reads an ID and reports what the codec can recover; `match` (digest only)
recomputes the digest and compares. Human output is aligned `key: value` lines;
`--json` switches to a machine object, `--quiet` silences stdout (exit code remains
the signal).

```bash
$ npx @smonn/ids timestamp inspect usr_06f80z92d2dbsqqg28t5cy4tqg
brand:     usr
codec:     timestamp
timestamp: 1780012945000 (2026-06-01T00:02:25.000Z)
uuid:      019e807d-2268-9abc-def0-123456789abc

$ npx @smonn/ids wrapped inspect ord_… --key-file ./key.hex --json
{"brand":"ord","codec":"wrapped","value":"18446744073709551615","kind":"u64","uuid":"…"}
```

Per codec:

| codec       | operation                        | fields reported                                   |
| ----------- | -------------------------------- | ------------------------------------------------- |
| `timestamp` | decode timestamp                 | `brand`, `codec`, `timestamp`, `uuid`             |
| `reverse`   | decode timestamp                 | `brand`, `codec`, `timestamp`, `uuid`             |
| `signed`    | verify signature, then decode ts | `brand`, `codec`, `timestamp`, `verified`, `uuid` |
| `opaque`    | decrypt, then decode timestamp   | `brand`, `codec`, `timestamp`, `uuid`             |
| `wrapped`   | unwrap to the original integer   | `brand`, `codec`, `value`, `kind`, `uuid`         |

Notes:

- Every `inspect` reports a `uuid` field. The reverse direction (uuid → id) is the
  top-level [`convert`](#convert) command.
- `signed inspect` couples verification with extraction: it requires the key, and only
  on a verified signature does it emit the report (`verified: true`) with exit 0. A
  failed signature, missing/invalid key, or malformed ID is a failure — a stderr
  diagnostic, a non-zero exit, and **no** stdout report (there is no `verified: false`).
- `opaque inspect` reports whatever the (unauthenticated) codec decrypts: a wrong key
  yields a plausible-but-wrong timestamp, not an error — Opaque and plaintext Timestamp
  IDs are wire-indistinguishable.
- `wrapped inspect` is self-describing: the kind is recovered by trial (each of
  `u32`/`i32`/`u64`/`i64` is verified against the tag), so no `--kind` is needed on read —
  though an optional `--kind` skips the trial. A `u64`/`i64` value is emitted in JSON as a
  **string** to avoid precision loss above 2^53.

### Batch input (stdin)

`inspect` reads many IDs from stdin (one per line) in addition to a single positional —
best-effort: stdout carries only successes (`--json` ⇒ NDJSON), stderr a per-line
diagnostic, and the exit code is 0 only if every line succeeded.

```bash
grep -o 'usr_[0-9a-z]*' app.log | npx @smonn/ids opaque inspect --key-file ./key.hex --json
```

`match` is single-shot (one ID per invocation) with a grep-like exit: `0` matched,
`1` no match, `2` error.

```bash
$ printf '%s' "user@example.com" | npx @smonn/ids digest match psd_… --ns billing --key-file ./key.hex
match: true
```

## Top-level commands

These are codec-agnostic, so they sit outside the codec tree.

### `keygen`

Emit fresh random key material for any keyed codec. **A secret — do not log or commit.**
One key backs every keyed codec (the library derives per-codec subkeys internally). A
reminder is printed to stderr, so `export IDS_KEY=$(npx @smonn/ids keygen)` and pipes are
unaffected.

```bash
$ npx @smonn/ids keygen
a1b2c3…                                  # 32 bytes, hex

$ npx @smonn/ids keygen --bytes 16 --key-encoding base64url
AbCdEf…
```

- `--bytes 16|24|32` (default 32). Shorter keys only lower the entropy floor — the
  library always derives AES-256 via HKDF (per
  [ADR-0027](https://github.com/smonn/ids/blob/main/docs/adr/0027-opaque-hkdf-uniform-key-derivation.md)),
  so `--bytes 16` does not yield AES-128.
- `--key-encoding hex|base64url` (default `hex`, or `IDS_KEY_ENCODING`).

### `convert`

Re-express a UUID as an `Id` for a brand (uuid → id). Codec-agnostic — the mapping is a
view over the shared payload. The reverse direction (id → uuid) is the `uuid` field of
`inspect`.

```bash
$ npx @smonn/ids convert usr --uuid 0190ab12-3456-789a-bcde-f0123456789a
usr_…
```

## Keys

Keyed commands resolve **one** key. It is a bare encoded blob — there is no format prefix
or codec tag, and **no per-codec key env vars** (the codec is the command token).

**Value** — first present wins: `--key STRING` › `--key-file PATH` › `IDS_KEY`. Supplying
both `--key` and `--key-file` is a usage error. Prefer `--key-file`/`IDS_KEY` over `--key`,
which is visible in `ps` and shell history.

**Encoding** — independent of the value source: `--key-encoding hex|base64url` ›
`IDS_KEY_ENCODING` › `hex`. So a `base64url` key can be fully env-configured:

```bash
export IDS_KEY_ENCODING=base64url
export IDS_KEY=$(npx @smonn/ids keygen --bytes 32)
npx @smonn/ids signed generate usr
```

The decoded key must be 16, 24, or 32 bytes; any other length is a usage error (this
catches truncated or wrong-encoding pastes).

## Exit codes

| code | meaning                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------- |
| `0`  | success (all lines succeeded in a batch)                                                              |
| `1`  | operational failure (malformed ID, failed verify/decrypt, wrong key); for `match`, "no match"         |
| `2`  | usage error (unknown/missing/conflicting flag, bad brand, unsupported key length, out-of-range value) |

```

```
