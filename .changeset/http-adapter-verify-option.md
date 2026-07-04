---
"@smonn/ids": minor
---

Add opt-in signature verification to HTTP adapters (`idParam`, `idQuery`, `ParseIdPipe`). Pass `verify: true` with a Signed Timestamp codec to authenticate the HMAC tag after structural parsing — tag failure is treated as a `"malformed"` failure. The option is only accepted when the codec satisfies the new `IdVerifiableCodec` structural interface (enforced via TypeScript function overloads). Default behaviour (no `verify`) is byte-for-byte unchanged.
