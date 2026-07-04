---
"@smonn/ids": minor
---

Extend HTTP adapter `verify: true` to the Wrapped key codec. The Wrapped key codec now exposes `safeVerify` — a verify-only alias of `safeUnwrap` that drops the recovered `lookupKey` from the success shape (`{ ok: true; id }`) — so it satisfies the `IdVerifiableCodec` structural interface. `idParam`, `idQuery`, and the NestJS `ParseIdPipe` now accept a Wrapped key codec under `verify: true` exactly like the Signed Timestamp codec: a wrong-key, tampered, or revoked-key ID is rejected as a `"malformed"` failure through the existing channel. The adapter and `IdVerifiableCodec` are unchanged; default behaviour (no `verify`) is byte-for-byte unchanged. See ADR-0036.
