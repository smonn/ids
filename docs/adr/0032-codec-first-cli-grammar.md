# Codec-first CLI grammar with per-codec command ownership

Restructure the CLI from a flag-selected codec dispatch engine to a **codec-first grammar** — `ids <codec> <verb> [args] [flags]` — with codec-agnostic operations (`keygen`, `convert`) as top-level commands, and each codec owning its own CLI module so the generic dispatch engine is deleted. This is a breaking CLI change, taken in the pre-1.0 window.

It supersedes the scope of [#778](https://github.com/smonn/ids/issues/778): that issue proposed flattening the dispatch engine *without changing CLI behavior*. The same simplification — and considerably more — falls out of a grammar redesign instead, so the behavior-preserving refactor is abandoned in favor of this.

## Why now

The CLI is hand-rolled and carried a generic dispatch engine — `Policy` / `Descriptor` / `GeneratorDescriptor` / `InspectCapability`, plus `deriveAllowedFlags`, `resolveVariant`, `conflictPriorityOrder`, and overloaded `buildCodec` / `constructCodec` — to drive what is fundamentally six codecs × a handful of commands, with the codec **selected by a flag** (`generate --opaque`, `inspect --signed`, …). #778 found this heavier than warranted but constrained itself to "no behavior change," which capped how much could actually go.

The codec is load-bearing for every operation and orthogonal to the brand. Flag-selection let it be omitted (defaulting silently) and forced runtime conflict detection (two selector flags → an error assembled by `conflictPriorityOrder`). Promoting the codec to the **first token** removes the inference, removes the conflict machinery, and makes each command's flag surface *static and declarable* rather than *derived per invocation*. A breaking grammar change is only available pre-1.0, so this is the window.

## Decision

- **Grammar:** `ids <codec> <verb> [args] [flags]`. The codec is the first positional token and is never inferred; the CLI must not guess it.
- **Honest verbs name their input:** `generate` (timestamp/reverse/signed/opaque, takes a brand), `wrap` (wrapped, takes an integer), `derive` (digest, takes material + namespace). The read verb is uniform `inspect` wherever a value is recoverable; `digest` is the exception (`match`), since its input is unrecoverable.
- **Codec-agnostic operations are top-level:** `keygen` (one key backs every codec) and `convert` (UUID ↔ Id, a view over the shared payload). The governing rule: **codec-agnostic ⇒ top-level; codec-bearing ⇒ the codec tree.** `keygen` is no longer a one-off exception — it is the first instance of this rule, and `convert` is the second.
- **Each codec owns a CLI module in the CLI layer** (`src/cli/codecs/<codec>.ts`) that *declares* its verbs, flags, and handlers; a thin router maps `<codec> <verb>` → handler. The library's codec slices stay pure — CLI/format/stdout concerns never leak into the published subpath exports ([ADR-0005](./0005-codec-variant-subpath-exports.md)). Ownership lives in the CLI layer, not the library.
- **The dispatch engine is deleted.** Allowed flags are declared per codec module, not derived; there is no `resolveVariant` / conflict ordering and no `buildCodec` / `constructCodec` overload pair. Per-node `--help` lists only the verbs and flags that node actually supports — impossible combinations cannot be expressed.

## Considered options

- **Keep the flag-based grammar; do the minimal #778 refactor.** Rejected. Flattening the engine in place leaves codec *selection* inference-prone and retains the conflict-detection machinery; the engine's weight is structural to flag-selection, so the bulk of it only goes once selection moves to a positional token.
- **Put the CLI descriptors inside the library codec slices** (maximal cohesion). Rejected. It couples the library to CLI/stdout concerns and bloats the per-codec subpath exports ([ADR-0005](./0005-codec-variant-subpath-exports.md)) with CLI code.
- **One flat central `codec:verb` dispatch table.** Rejected. Smallest diff from today, but it keeps a single central file rather than giving each codec its own module — it does not deliver per-codec ownership.

## Consequences

- **Breaking (CLI).** Every invocation changes shape (`generate --opaque usr` → `ids opaque generate usr`). Acceptable pre-1.0.
- `inspect` batches over stdin (one ID per line, best-effort, "stdout = successes only"); `match` is single-shot with grep-like exit (`0` match / `1` no match / `2` error). `--json` (NDJSON for `inspect` batches), `--quiet`, and TTY-independent output formatting come in with the redesign.
- A `generate`-only `--at` flag (ISO-8601-UTC or epoch-ms) surfaces the library's `generateAt`; it applies to the four timestamp-family codecs only.
- UUID interop ([ADR-0024](./0024-uuid-interop-raw-mapping.md)) is preserved, not dropped: id → uuid is a `uuid` field in `inspect` output, uuid → id is the top-level `convert <brand> --uuid <uuid>`.
- The per-codec module structure realizes "each codec owns its CLI commands" and aligns with by-feature slicing ([ADR-0018](./0018-by-feature-codec-slices.md)).
- The CLI key model changes substantially with this redesign; that decision is recorded separately in [ADR-0033](./0033-cli-single-key-env-var.md), which supersedes [ADR-0028](./0028-cli-primary-secret-env-var.md).
- The full command contract (every codec/verb/flag, exit codes, output shapes) lives in the CLI specification document, not this ADR.
