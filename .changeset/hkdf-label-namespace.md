---
"@smonn/ids": minor
---

**Breaking (pre-1.0):** standardize the HKDF domain-separation labels across the keyed codecs onto `@smonn/ids/<subpath>/<primitive>` (unversioned). The labels change as follows:

- Signed Timestamp: `ids/signed-timestamp/hmac` → `@smonn/ids/signed/hmac`
- Digest: `ids/digest/hmac` → `@smonn/ids/digest/hmac`
- Wrapped key: `@smonn/ids/wrapped/aes/v1` → `@smonn/ids/wrapped/aes`, `@smonn/ids/wrapped/hmac/v1` → `@smonn/ids/wrapped/hmac`

These labels feed HKDF key derivation, so renaming them re-derives every subkey. **Every existing Wrapped key ID, Signed Timestamp ID, and Digest ID produced under the old labels will fail to verify/decode after upgrading.** There is no migration path or compatibility shim — callers must regenerate all keyed IDs as a hard cutover. The Opaque Timestamp codec is unaffected (it imports its AES key directly, with no HKDF label). No change to any KDF, key length, algorithm, wire format, or API beyond the label strings. See ADR-0019.
