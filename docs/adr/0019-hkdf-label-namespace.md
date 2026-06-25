# HKDF domain-separation label namespace: `@smonn/ids/<subpath>/<primitive>`

The keyed codecs derive their subkeys with HKDF, and each passes a distinct `info` string as a **domain-separation label** so the same raw operator secret imported into two codecs yields cryptographically independent keys. Those labels drifted into three inconsistent shapes: `ids/signed-timestamp/hmac` (Signed), `ids/digest/hmac` (Digest), and `@smonn/ids/wrapped/aes/v1` / `@smonn/ids/wrapped/hmac/v1` (Wrapped). We **standardize on `@smonn/ids/<subpath-export>/<primitive>`, unversioned** — yielding `@smonn/ids/signed/hmac`, `@smonn/ids/digest/hmac`, `@smonn/ids/wrapped/aes`, and `@smonn/ids/wrapped/hmac`.

This resolves issue [#388](https://github.com/smonn/ids/issues/388) (split from the [#379](https://github.com/smonn/ids/issues/379) audit backlog). There is **no collision today** — all six strings are distinct, so the derived keys are already independent. The motivation is a latent footgun: with the `ids/…` vs `@smonn/ids/…` split live, a future `ids/wrapped/…` label would _visually_ resemble a collision while not actually colliding, and the inconsistency is a trap for the next person adding a codec.

## The rule

`@smonn/ids/<subpath-export>/<primitive>`:

- **`@smonn/ids`** — the published package name. Every public subpath export (`@smonn/ids/wrapped`, `@smonn/ids/signed`, `@smonn/ids/digest`) already namespaces under it, the tsdoc and `CONTEXT.md` already treat `@smonn/ids/<codec>` as each codec's canonical identity, and it is globally unique — the on-purpose property for a domain-separation label, which exists precisely to prevent cross-context key reuse. The `@smonn/ids` prefix was chosen over the bare `ids` prefix.
- **`<subpath-export>`** — the codec's public import-path segment (`signed`, `digest`, `wrapped`), **not** the codec's prose name. This is why Signed's label changes from `signed-timestamp` to `signed`: the label is now a pure function of the public import path, so the next codec's label is unambiguous by construction.
- **`<primitive>`** — the derived primitive (`hmac`, `aes`). Wrapped carries two (`aes` + `hmac`) because it derives two subkeys from one secret; the single-key codecs carry one.
- **No version suffix.** The `/v1` that only Wrapped carried is dropped. A label version is inert here: there is no wire key-id, so v1 and a hypothetical v2 could never be trialled or run side-by-side, and re-keying is already a hard, regenerate-everything break. The two newer codecs (Signed, Digest) had already omitted it; this brings Wrapped into line rather than spreading dead decoration.

## The Opaque codec is intentionally exempt

The Opaque Timestamp codec imports the operator's 16/24/32 raw bytes **directly** as the AES-CBC key (no HKDF), so it has no `info` label to standardize. This is principled, not an oversight: an AES-128/192/256 key is exactly what the operator hands it, raw import is the conventional construction, and Opaque is already cryptographically independent of the HKDF codecs _because_ its key is the raw bytes rather than an HKDF output. Whether to route Opaque through a labelled HKDF for a no-exceptions uniform model is left **undecided** (see `docs/IDEAS.md`); it is a separate breaking change with its own rationale and would need its own ADR.

## Empty-salt rationale for HKDF

RFC 5869 § 2.2 specifies that when no application-defined salt is available, HKDF uses a block of zero bytes whose length equals the hash output (SHA-256 → 32 zero bytes), and the security reduction holds as long as the IKM has sufficient entropy. The keyed codecs use an empty salt (`new Uint8Array()`) because the IKM is already operator-supplied cryptographic key material.

The entropy floor is the **input key size**, not a fixed 256-bit value: `importSigningKey`, `importWrappingKey`, and `importDigestKey` all accept 16, 24, or 32 raw bytes (128, 192, or 256 bits), and that is the actual entropy the HKDF extract step receives. All three accepted key sizes provide an entropy floor well above the HKDF security parameter for SHA-256, so the empty-salt construction is safe for any of the three lengths. Callers choosing 16-byte keys get 128-bit entropy, not the 256-bit floor a reader might assume if this rationale stated a fixed value.

## Semver and migration

HKDF `info` strings feed key derivation, so renaming any label **re-derives every subkey** and **invalidates every existing Wrapped, Signed Timestamp, and Digest ID** produced under the old labels. There is no in-band key-id on the wire to trial the old label against, so no migration shim or transparent fallback is possible — this is a **hard cutover**: callers must regenerate all keyed IDs.

The library is pre-1.0 (`0.10.0`). Under semver, `0.x` minor releases may break, so this ships as a routine **`0.11.0`** breaking change, not a deferred "future major." This is also the cheapest moment to make it: keyed-codec adoption is low and the cost of this exact rename only rises after `1.0` — and shipping `1.0` with the prefix split intact would freeze the footgun in place.

## Considered options

- **`ids/…` prefix** — rejected. Shorter and used by two of the three current files, but "majority of current files" is an artifact of implementation order, not a reason; the bare prefix is not tied to the package identity and is weaker as a global domain separator.
- **Keep `/v1` on all labels** — rejected. Uniform, but implies a versioned-rotation story the wire format cannot honor (no key-id to trial), and the design had already drifted away from it.
- **Keep `signed-timestamp` as the codec segment** — rejected. More descriptive, but breaks the clean "label segment = subpath export" rule and reintroduces an inconsistency right after removing two others.
- **Editing the old labels in ADR-0009/0012/0017** — rejected. Those are an immutable decision log; they record what was true when decided. They carry a one-line supersede pointer to this ADR instead; only the live glossary (`CONTEXT.md`) and consumer docs are rewritten to current reality.
- **Bringing Opaque into HKDF in this change** — rejected for this issue; a distinct breaking construction-change with its own rationale, left undecided in `docs/IDEAS.md`.

## Consequences

- Four label literals change across `src/codecs/{signed,digest,wrapped}/key.ts`, plus the tsdoc in those files that quotes them. No KDF, key-length, algorithm, wire-format, or API change — label string only.
- **No test changes:** no test asserts a literal label, and the keyed-codec tests are determinism / round-trip based (label-agnostic), so re-derivation does not break any known-answer vector.
- `CONTEXT.md` (**Digest key** entry) and the consumer site (`website/.../codecs/digest.md`) move to the new labels. ADR-0009/0012/0017 keep their historical bodies with a supersede pointer here.
- A `minor` changeset records the breaking cutover and the regenerate-all-keyed-IDs migration note; release is `0.11.0`.
- `docs/IDEAS.md` records the Opaque-via-HKDF question as deliberately undecided.
