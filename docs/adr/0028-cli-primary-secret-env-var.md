---
status: superseded
created: 2026-06-26
last-updated: 2026-06-29
superseded-by: ADR-0033
---

# CLI primary-secret env var, and symmetric per-codec env vars

> **Superseded by [ADR-0033](./0033-cli-single-key-env-var.md) (2026-06-29):** The codec-first CLI redesign ([ADR-0032](./0032-codec-first-cli-grammar.md)) removes the per-codec key env vars decided here. With the codec promoted to an explicit command token, encoding it in the variable name is redundant, so the four `IDS_<CODEC>_KEY` variables and their `_FORMAT` partners collapse to a single `IDS_KEY` / `IDS_KEY_ENCODING`. The reasoning below is preserved for historical context.

Make the CLI's four per-codec key env vars symmetric by renaming Opaque's `IDS_KEY` → `IDS_OPAQUE_KEY`, and repurpose the freed bare `IDS_KEY` as a **primary-secret fallback** that any keyed subcommand reads when its codec-specific variable is unset. This carries the one-secret-many-codecs model from [ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md) into the CLI ergonomics.

This is a design-acceptance gate. Implementation — the rename across `src/cli/variants.ts`, `src/cli/key-io.ts`, `src/cli/usage.ts`, and tests, plus the fallback resolution and its error messages — is deferred to follow-up issues filed after this ADR reaches `main`.

## Why now

The CLI today exposes four key env vars, three of them following `IDS_<CODEC>_KEY` (`IDS_SIGNING_KEY`, `IDS_WRAPPING_KEY`, `IDS_DIGEST_KEY`) and one — Opaque — as the bare `IDS_KEY`. That asymmetry is the CLI's exact mirror of the library's raw-import exception ([ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md)): Opaque is the odd one out in both places, for the same historical reason. And the bare `IDS_KEY` is the worst name to freeze at 1.0, because it is precisely the name a shared **primary secret** wants — yet it currently means "the Opaque key." Renaming an env var after 1.0 is a breaking CLI change, so the symmetric naming has to land in the same pre-1.0 window as the library change.

[ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md) is what makes a shared CLI env var _safe_: one secret fed to any keyed subcommand is imported through that codec's own HKDF label, yielding independent keys. Before that decision a shared `IDS_KEY` would have silently reused one raw secret as multiple primitive keys — the footgun the old contract forbade.

## Decision: symmetric per-codec vars plus an `IDS_KEY` primary fallback

The four codec-specific variables become uniform:

| Variant | Key env var        | Format env var            |
| ------- | ------------------ | ------------------------- |
| Opaque  | `IDS_OPAQUE_KEY`   | `IDS_OPAQUE_KEY_FORMAT`   |
| Signed  | `IDS_SIGNING_KEY`  | `IDS_SIGNING_KEY_FORMAT`  |
| Wrapped | `IDS_WRAPPING_KEY` | `IDS_WRAPPING_KEY_FORMAT` |
| Digest  | `IDS_DIGEST_KEY`   | `IDS_DIGEST_KEY_FORMAT`   |

The bare `IDS_KEY` (with `IDS_KEY_FORMAT`) is the primary-secret fallback. Resolution for a keyed subcommand:

- The codec-specific variable **wins** when set; the primary secret is consulted only when it is unset.
- Each key variable pairs with its **own** format variable — `IDS_OPAQUE_KEY` reads `IDS_OPAQUE_KEY_FORMAT`, and the primary `IDS_KEY` reads `IDS_KEY_FORMAT`. The format follows whichever key variable was actually used, never a cross-pairing.
- The primary secret is imported through the selected codec's import function, so `IDS_KEY` set once lets `generate --opaque`, `--signed`, `--digest`, and `--wrapped` all work off one secret, each deriving an independent key under its own label.

`keygen` is unaffected: it writes a key, it does not read one. (And it already effectively emits a primary secret — all four variants produce identically-distributed 16/24/32 random bytes in `hex`/`base64url`; the variant flag is near-cosmetic for `keygen`.)

## Considered options

- **Rename only, reserve `IDS_KEY` for later** — rejected. The rename is the breaking, must-do-now half; the fallback is additive and could defer. But the fallback is the entire point of the rename and costs almost nothing on top of it, and shipping the symmetric names with a permanently-unused `IDS_KEY` invites the question "why is this reserved?" for no benefit. Do both.
- **Leave the CLI as-is** — rejected. Freezes the asymmetric `IDS_KEY = Opaque` at 1.0, so a future primary-secret variable can never reuse the natural bare name without a later breaking rename — the precise trap this ADR avoids.
- **Primary secret wins over the specific variable** — rejected. A specific `IDS_OPAQUE_KEY` is the more precise intent; the general one should never override it. Specific-wins is also the least-surprising precedence and matches how layered configuration normally resolves.

## Consequences

- **Breaking (CLI):** `--opaque` users must move from `IDS_KEY` to `IDS_OPAQUE_KEY` (and `IDS_KEY_FORMAT` → `IDS_OPAQUE_KEY_FORMAT`). The bare `IDS_KEY` keeps working for Opaque _by coincidence_ via the primary-secret fallback, but the documented Opaque variable is now `IDS_OPAQUE_KEY`. Acceptable as a 1.0 break.
- Error and usage text change: "`--opaque` without `IDS_KEY`" becomes "without `IDS_OPAQUE_KEY` or `IDS_KEY`", and the `--opaque`/`--signed`/etc. usage lines document the primary-secret fallback. The `IDS_KEY`/`IDS_KEY_FORMAT` references in `src/cli/variants.ts` notes and `src/cli/usage.ts` move accordingly.
- Depends on [ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md): the fallback is only sound because every codec derives its key under a distinct HKDF label.
- No library API change — this is a CLI-surface decision over the existing import functions.
