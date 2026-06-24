---
title: CLI
description: Brand-agnostic inspect, generate, and keygen subcommands — no install required.
---

Brand-agnostic subcommands, no install required. Run `npx @smonn/ids --help` for
the full flag list.

## `inspect` (`i`)

Decode an ID and print brand, timestamp (or lookup key), canonical form, and
whether the input was already canonical.

```bash
$ npx @smonn/ids inspect usr_01h7b3k9rqxn1cw3p9r8t2sgkz
brand:     usr
timestamp: 1983-05-27T10:24:22.469Z (43 years ago)
canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz
input:     canonical
```

Accepts non-canonical input (uppercase, Crockford aliases). Pass the flag that
matches the codec used at generation — without a flag, the **Timestamp codec** is
assumed.

| Flag                   | Codec variant     | Env var                      | Notes                                                                   |
| ---------------------- | ----------------- | ---------------------------- | ----------------------------------------------------------------------- |
| _(none)_               | Timestamp         | —                            | Timestamp readable directly                                             |
| `--opaque`             | Opaque Timestamp  | `IDS_KEY`                    | Wrong key yields a plausible-but-wrong timestamp, not an error          |
| `--reverse`            | Reverse Timestamp | —                            | No key; timestamp decoded from inverted bytes                           |
| `--wrapped --kind <k>` | Wrapped key       | `IDS_WRAPPING_KEY`           | `--kind` required: `u32`/`i32`/`u64`/`i64`; prints `lookup-key`         |
| `--signed`             | Signed Timestamp  | `IDS_SIGNING_KEY` (optional) | Without key: timestamp only. With key: adds `verification: ok`/`failed` |

```bash
# Opaque Timestamp (IDS_KEY required):
IDS_KEY=<hex-or-base64url-key> npx @smonn/ids inspect inv_… --opaque

# Wrapped key (IDS_WRAPPING_KEY and --kind required):
IDS_WRAPPING_KEY=<hex-or-base64url-key> npx @smonn/ids inspect ord_… --wrapped --kind u64

# Signed Timestamp — with verification:
IDS_SIGNING_KEY=<hex-or-base64url-key> npx @smonn/ids inspect evt_… --signed
```

## `generate` (`g`)

Mint one or more canonical IDs for a brand. Output is one ID per line
(pipeable).

```bash
$ npx @smonn/ids generate usr --count 3
usr_…
usr_…
usr_…
```

| Flag                 | Codec variant     | Env var           | Notes                                                                                                                                                                                                                                                           |
| -------------------- | ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(none)_             | Timestamp         | —                 | Default; one ID per `--count`                                                                                                                                                                                                                                   |
| `--opaque`           | Opaque Timestamp  | `IDS_KEY`         | Same env var and format rules as `inspect --opaque`                                                                                                                                                                                                             |
| `--reverse`          | Reverse Timestamp | —                 | Newest-first sort order                                                                                                                                                                                                                                         |
| `--signed`           | Signed Timestamp  | `IDS_SIGNING_KEY` | Same env var and format rules as `inspect --signed`                                                                                                                                                                                                             |
| `--digest --ns <ns>` | Digest            | `IDS_DIGEST_KEY`  | Reads material from stdin; `--ns` (non-secret namespace) required. Key format set by `IDS_DIGEST_KEY_FORMAT` or `--key-format`. Same `(material, ns, key)` always produces the same ID. `--count N > 1` is rejected: same material always produces the same ID. |

Flags: `--count` / `-c N` (default 1, max 10000); `--key-format hex|base64url`.

## `keygen` (`k`)

Emit a random key to stdout — for use with `importOpaqueKey`,
`importWrappingKey`, `importSigningKey`, or `importDigestKey`. **A secret — do not log or commit.**
Default: 256-bit hex for the Opaque key domain.

```bash
$ npx @smonn/ids keygen
a1b2c3…

$ npx @smonn/ids keygen --wrapped --bits 128 --key-format base64url
AbCdEf…
```

| Flag        | Key domain | Intended for       | Import function     |
| ----------- | ---------- | ------------------ | ------------------- |
| _(none)_    | Opaque     | `IDS_KEY`          | `importOpaqueKey`   |
| `--wrapped` | Wrapping   | `IDS_WRAPPING_KEY` | `importWrappingKey` |
| `--signed`  | Signing    | `IDS_SIGNING_KEY`  | `importSigningKey`  |
| `--digest`  | Digest     | `IDS_DIGEST_KEY`   | `importDigestKey`   |

Flags: `--bits 128|192|256` (default 256), `--key-format hex|base64url` (default
`hex`).

## Environment variables

All keyed modes read secrets from environment variables — **not from argv**
(argv leaks via `ps` and shell history). Missing or malformed key env vars print
a clear stderr message and exit non-zero.

| Env var                   | Used by                       | Default format |
| ------------------------- | ----------------------------- | -------------- |
| `IDS_KEY`                 | `--opaque`                    | `hex`          |
| `IDS_KEY_FORMAT`          | `--opaque` (format override)  | —              |
| `IDS_WRAPPING_KEY`        | `--wrapped`                   | `hex`          |
| `IDS_WRAPPING_KEY_FORMAT` | `--wrapped` (format override) | —              |
| `IDS_SIGNING_KEY`         | `--signed`                    | `hex`          |
| `IDS_SIGNING_KEY_FORMAT`  | `--signed` (format override)  | —              |
| `IDS_DIGEST_KEY`          | `--digest`                    | `hex`          |
| `IDS_DIGEST_KEY_FORMAT`   | `--digest` (format override)  | —              |

Key format defaults to `hex`; override per-invocation with `--key-format` or set
the matching `_FORMAT` env var for a session default. `--key-format` on the
command line wins. Key-format env vars do not affect `keygen` — only
`--key-format` applies there.
