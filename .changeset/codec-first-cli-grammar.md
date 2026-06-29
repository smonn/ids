---
"@smonn/ids": major
---

**Breaking — CLI redesigned to a codec-first grammar.** Commands are now `ids <codec> <verb> [args] [flags]` (e.g. `ids opaque generate usr`, `ids signed inspect <id> --key …`) instead of selecting the codec with a flag (`generate --opaque`). See [ADR-0032](https://github.com/smonn/ids/blob/main/docs/adr/0032-codec-first-cli-grammar.md) and the [CLI spec](https://github.com/smonn/ids/blob/main/docs/cli-spec.md). Closes #778.

- **Verbs name their input:** `generate` (timestamp/reverse/signed/opaque), `wrap` (wrapped), `derive` (digest); read verbs `inspect` (all but digest) and `match` (digest, grep-like exit `0`/`1`/`2`).
- **Codec-agnostic operations are top-level:** `keygen` (now codec-agnostic — `--bytes 16|24|32`, `--key-encoding`) and `convert <brand> --uuid <uuid>` (UUID → Id; the Id → UUID direction is the `uuid` field of `inspect`).
- **Single key env var.** The per-codec `IDS_OPAQUE_KEY` / `IDS_SIGNING_KEY` / `IDS_WRAPPING_KEY` / `IDS_DIGEST_KEY` (and their `_FORMAT` partners) are removed; one `IDS_KEY` backs every keyed codec. Key value resolves as `--key` > `--key-file` > `IDS_KEY` (supplying both `--key` and `--key-file` is a usage error); encoding resolves as `--key-encoding` > `IDS_KEY_ENCODING` > `hex` (renamed from `--key-format`). See [ADR-0033](https://github.com/smonn/ids/blob/main/docs/adr/0033-cli-single-key-env-var.md), which supersedes ADR-0028.
- **New behavior:** `generate --at <iso|epoch-ms>` stamps an explicit creation time (UTC); `inspect`/`match` gain `--json` (NDJSON when `inspect` batches IDs over stdin) and `--quiet`; digest material is read from `--material` or stdin; UUID interop is preserved via `convert` + the `inspect` `uuid` field.
- **Internal:** the `Policy` / `Descriptor` / `InspectCapability` dispatch engine is deleted in favor of per-codec CLI modules and a thin router.
