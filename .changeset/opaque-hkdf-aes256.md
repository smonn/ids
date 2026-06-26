---
"@smonn/ids": major
---

**Breaking — Opaque Timestamp codec key derivation.** `importOpaqueKey` no longer imports the operator's bytes directly as the AES key. The bytes are now HKDF **input keying material**, and the codec derives an **AES-256** key from them via HKDF under the domain-separation label `@smonn/ids/opaque/aes` ([ADR-0027](https://github.com/smonn/ids/blob/main/docs/adr/0027-opaque-hkdf-uniform-key-derivation.md)).

Consequences:

- **Every existing Opaque ID is invalidated** — the encryption key changes, so previously issued IDs no longer decrypt. There is no wire key-id to trial the old construction against, so this is a hard cutover: regenerate all Opaque IDs.
- Opaque encryption is **always AES-256** regardless of key length. 16/24/32-byte keys are still accepted but now set the entropy floor only (a 16-byte key yields AES-256 with a 128-bit entropy floor); AES-128/192 Opaque ciphertexts can no longer be produced.
- `importOpaqueKey`'s signature is unchanged.

This completes the uniform key-derivation model in which no operator secret is ever used directly as a primitive key, so one **primary secret** may safely feed all four keyed codecs (each derives independently under its own HKDF label).
