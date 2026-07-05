---
status: accepted
created: 2026-06-26
last-updated: 2026-06-26
---

# Opaque joins HKDF: one operator secret may serve every keyed codec

Route the Opaque Timestamp codec's key through HKDF like the other three keyed codecs, under the domain-separation label `@smonn/ids/opaque/aes`, and bless the resulting invariant: **an operator secret is always input keying material, never a final primitive key**, so one raw secret may safely feed all four keyed codecs because each derives independently under its own label. This closes the question [ADR-0019](./0019-hkdf-label-namespace.md) and [docs/IDEAS.md](../IDEAS.md) left deliberately undecided ("Opaque codec via HKDF").

This is a design-acceptance gate. Implementation — the HKDF derivation in `src/codecs/opaque/key.ts`, the AES-256 change, the conformance/round-trip test updates, and the consumer-doc rewrites — is deferred to follow-up issues filed after this ADR reaches `main`, mirroring [ADR-0024](./0024-uuid-interop-raw-mapping.md) and [ADR-0025](./0025-frozen-wire-spec-conformance-vectors.md).

## The question, reduced

[ADR-0019](./0019-hkdf-label-namespace.md) exempted Opaque from the HKDF label rule on the principled ground that an AES-128/192/256 key is exactly what the operator hands `importOpaqueKey`, so raw `importKey("raw", bytes, "AES-CBC")` is the conventional construction. That is correct as far as it goes. What forces the decision now is the **1.0 freeze**: the raw-import exception, if not closed, freezes into the public contract, and any later change becomes a 2.0-only break.

Examined for v1, the technical merit of routing Opaque through HKDF collapses to a single thing. HKDF-Extract exists to condense _non-uniform_ IKM (a Diffie-Hellman output, a passphrase) into a uniform pseudorandom key; an operator-supplied AES key is already uniform, full-entropy key material, and with the empty salt the keyed codecs use ([ADR-0019](./0019-hkdf-label-namespace.md), Empty-salt rationale) Extract-then-Expand on a uniform key just yields a _different_ uniform key. So the Extract/Expand machinery adds nothing on the uniformity axis. The **only** working part is the `info` label — domain-separating Opaque's encryption key from the operator's raw secret.

That label is worthless under one key-management model and load-bearing under the other:

- If each codec must hold its **own independent secret** (the contract `CONTEXT.md` described before this ADR), there is no within-library collision to prevent — a raw-AES key can never equal an HKDF output anyway — so the label hardens a boundary already drawn by policy. Cosmetic.
- If one operator secret may **serve many codecs**, raw-import Opaque is the one place that reuse actually bites: the primary secret _is_ the AES key, so it collides with any other raw-AES use of the same secret, inside or outside the library. The label is what removes that hole.

So "is HKDF-on-Opaque technically right?" is not a question about Opaque at all — it is a question about which key-management model the library commits to. We commit to the second.

## Decision: bless one-secret-many-codecs, and close the Opaque exception

The library adopts the invariant that **no operator secret is ever used directly as a primitive key**. Every primitive key is `HKDF-Expand(secret, unique-label)`, so importing the same raw bytes into any two codecs — or into the library and an external system — yields cryptographically independent keys. Opaque was the sole violation; it now derives under `@smonn/ids/opaque/aes`, making the invariant total and the security model exception-free and auditable.

The motivation that drives the other three codecs to HKDF (Signed/Digest need an HMAC key from raw bytes — a primitive-type change; Wrapped needs two subkeys from one secret) is structurally absent for Opaque, which is handed an AES key and needs an AES key. Opaque derives **not** for that reason but for the uniform-invariant reason: to be domain-separable from every other use of the operator's secret. Recording this so a future reader does not "simplify" Opaque back to raw import on the (true but incomplete) grounds that it needs no derivation.

## Decision: Opaque always derives AES-256

`importOpaqueKey` continues to accept 16, 24, or 32 raw bytes — a primary secret must be a size every keyed codec accepts, so a single 32-byte secret can feed all four. But the input size now sets the **entropy floor only**; HKDF-Expand always produces a 32-byte key and Opaque is **always AES-256-CBC**.

This mirrors the HMAC codecs exactly: `importSigningKey` already derives a fixed 256-bit HMAC key (`length: 256`) regardless of whether it was fed 16, 24, or 32 bytes, and [ADR-0019](./0019-hkdf-label-namespace.md) already documents the honest consequence — "callers choosing 16-byte keys get 128-bit entropy, not the 256-bit floor a reader might assume." The same note now applies to a 16-byte Opaque primary secret. Decoupling output strength from input size deletes the per-codec AES-strength knob (AES-128/192/256-by-input-length), which becomes incoherent once one secret feeds every codec: the operator is choosing primary-secret entropy, not a per-codec cipher strength. AES-256 is the strictly-safe default with no real cost on a single 16-byte block, and the [ADR-0004](./0004-aes-cbc-strip-trick.md) single-block strip trick is indifferent to key size.

## Decision: passive blessing — no primary-secret-import API at 1.0

The blessing is delivered entirely by the labels plus the Opaque fix. The four separate import handles (`importOpaqueKey`, `importSigningKey`, `importWrappingKey`, `importDigestKey`) stay; feeding the same bytes to all four is now a **supported, documented pattern** rather than a discouraged one. A unified `importPrimarySecret(bytes)` that vends per-codec keys from one call is pure ergonomics and **purely additive** — a new export that can ship any time post-1.0 — so it is deferred. Committing a primary-secret-import API _shape_ at 1.0 would freeze surface we might want to reshape, for no capability gain.

## Considered options

- **Keep raw import, close the question that way** — rejected. It is a legitimate construction, but it leaves the security model with a permanent exception ("every key is HKDF-derived… except Opaque") frozen into 1.0, and forecloses the one-secret-many-codecs model the CLI extension ([ADR-0028](./0028-cli-primary-secret-env-var.md)) builds on.
- **Preserve input-size → AES-strength mapping (16→AES-128, …)** — rejected. Keeps a knob the primary-secret model renders incoherent and reads inconsistently with the HMAC codecs' fixed-256 derivation.
- **Ship `importPrimarySecret` at 1.0** — rejected for 1.0. Additive sugar; defer rather than freeze a shape.
- **Route Opaque through HKDF _and_ keep accepting any-length IKM** — rejected. Widening accepted lengths beyond 16/24/32 would let an Opaque primary secret differ from what the other three codecs accept, breaking the "one primary-secret size works everywhere" property; the shared `assertValidKeyMaterialByteLength` stays.

## Consequences

- **Breaking:** every existing Opaque ID is invalidated (the AES key changes from raw bytes to `HKDF(bytes, @smonn/ids/opaque/aes)`), and Opaque output is now AES-256 regardless of key length, so AES-128/192 Opaque ciphertexts can no longer be produced. There is no wire key-id to trial the old construction against ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)), so this is a **hard cutover**: callers regenerate all Opaque IDs. Acceptable as a 1.0 break; the cost was explicitly accepted as not the deciding factor.
- The **Opaque key** contract shifts from "you supply the AES key" to "you supply key material we derive the AES key from." The `CONTEXT.md` **Opaque key** entry, the codec tsdoc, and the website Opaque page move to this framing; a new **Primary secret** glossary term records the blessed reuse pattern.
- [ADR-0019](./0019-hkdf-label-namespace.md)'s "The Opaque codec is intentionally exempt" section is superseded by this ADR and carries a pointer here. The keyed-codec label set is now complete: `@smonn/ids/opaque/aes`, `@smonn/ids/signed/hmac`, `@smonn/ids/digest/hmac`, `@smonn/ids/wrapped/{aes,hmac}`.
- [ADR-0013](./0013-opaque-key-rotation.md) (caller-driven key epochs) is unaffected — rotation semantics do not change; only how the per-epoch AES key is obtained from the operator's bytes.
- The async contract ([ADR-0006](./0006-async-keyed-codec-contract.md)) already covers `importOpaqueKey` returning a Promise, so no signature changes; HKDF derivation is one more awaited WebCrypto call.
- The conformance vectors ([ADR-0025](./0025-frozen-wire-spec-conformance-vectors.md)) are unaffected: Opaque construction vectors were already deferred to the v2 keyed-codec bump, and the v1 set is keyless.
- `docs/IDEAS.md` moves the "Opaque codec via HKDF" item from **Undecided** to decided, pointing here.
