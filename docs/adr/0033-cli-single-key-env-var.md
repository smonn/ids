# CLI key resolution: a single `IDS_KEY` and explicit key sources

Resolve the operator key for any keyed command from **one** key value — `--key STRING` > `--key-file PATH` > `IDS_KEY` — decoded under one encoding — `--key-encoding` > `IDS_KEY_ENCODING` > `hex`. Conflicting explicit key flags are a usage error; the decoded key must be 16/24/32 bytes. This removes the per-codec key env vars introduced by [ADR-0028](./0028-cli-primary-secret-env-var.md) and **supersedes** it.

## Why now

[ADR-0028](./0028-cli-primary-secret-env-var.md) made the CLI's key env vars symmetric — `IDS_OPAQUE_KEY`, `IDS_SIGNING_KEY`, `IDS_WRAPPING_KEY`, `IDS_DIGEST_KEY` (each with a `_FORMAT` partner) — with a bare `IDS_KEY` as a primary-secret fallback. That decision is now shipped (`src/cli/variants.ts`). The codec-first redesign ([ADR-0032](./0032-codec-first-cli-grammar.md)) revisits the whole CLI surface in the same pre-1.0 window, which is the moment to reconsider it.

Two facts make the per-codec env vars redundant:

- The **primary-secret** model ([ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md)) already guarantees that one secret safely backs every keyed codec — each codec derives its primitive key under a distinct HKDF label, so the keys are independent. Per-codec env vars were therefore never a *security* requirement, only a flexibility convenience.
- Under codec-first grammar the **codec is an explicit command token**. The env var no longer needs to encode *which* codec the secret is for — `ids signed generate` and `ids opaque generate` already say so. Eight env vars (four key + four format) collapse to two.

## Decision

- **Key value precedence:** `--key STRING` > `--key-file PATH` > `IDS_KEY`. The env var is a silent fallback. Supplying **both** `--key` and `--key-file` is a **usage error** — two explicit sources colliding signals a mistake, and erroring is safer than hidden precedence.
- **Key encoding precedence:** `--key-encoding hex|base64url` > `IDS_KEY_ENCODING` > `hex`. Renamed from `--key-format`: this governs only the byte-to-string **encoding**, not a structured key format (no PEM/JWK/DER). See the **Key encoding** glossary entry.
- **`--key-file`** reads the *encoded* key string from a file, trims surrounding whitespace (encodings carry no meaningful trailing whitespace; files usually end in `\n`), then decodes exactly like `--key`.
- **Length guard:** the decoded key must be 16, 24, or 32 bytes; any other length is a usage error. This catches truncated or wrong-encoding paste errors, which almost never land on one of the three exact lengths.
- One secret is imported through the selected codec's import function internally ([ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md)); the **codec token**, not the env var name, selects the codec.

## Considered options

- **Keep ADR-0028's per-codec env vars.** Rejected. Now that the codec is an explicit token, encoding it in the variable name is redundant; eight env vars is surface for a flexibility (distinct secrets per codec via the environment) that cuts against the primary-secret grain and is still available per-call through `--key` / `--key-file`.
- **Silent precedence for `--key` vs `--key-file`** (as the draft spec had it). Rejected for *explicit* sources; kept only for the env fallback. Two flags both set is most likely an error, not an intent to be silently resolved.
- **Keep the `--key-format` name.** Rejected. "Format" reads as a structured format; "encoding" is the precise word. The glossary's prior `_Avoid_: key encoding` note is reversed and the disambiguation rule recorded there.

## Consequences

- **Breaking (CLI), supersedes [ADR-0028](./0028-cli-primary-secret-env-var.md).** `IDS_OPAQUE_KEY` / `IDS_SIGNING_KEY` / `IDS_WRAPPING_KEY` / `IDS_DIGEST_KEY` and their `_FORMAT` partners are removed; only `IDS_KEY` and `IDS_KEY_ENCODING` remain. An operator who genuinely needs distinct per-codec secrets supplies them per call via `--key` / `--key-file`.
- Glossary: **Opaque key format** → codec-agnostic **Key encoding**; the **Primary secret** entry's CLI note is updated from "fallback when the codec-specific variable is unset" to "the single key env var."
- The frozen **Error code** `invalid_key_format` keeps its name for back-compat despite the concept rename to "encoding."
- Depends on [ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md): one shared secret is sound only because each codec derives under a distinct HKDF label.
- No library API change — this is a CLI-surface decision over the existing per-codec import functions.
