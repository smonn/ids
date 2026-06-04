---
"@smonn/ids": minor
---

Add `createOpaqueId(brand, { key })` and `importOpaqueKey(bytes)` under the new `@smonn/ids/opaque` subpath export. The Opaque codec produces IDs wire-compatible with the Timestamp codec — same prefix, same 26 base32 chars — but the 16-byte payload is AES-CBC-encrypted under the caller-supplied key. `extractTimestamp` becomes key-gated; the timestamp is unrecoverable without the key.

Key-dependent methods (`generate`, `generateAt`, `extractTimestamp`) are async; `is`, `parse`, `safeParse`, `toJsonSchema`, and `~standard` stay sync because they operate on the wire form only. `OpaqueCodec` omits `minIdForTime` / `maxIdForTime` — lexicographic order over ciphertext doesn't correspond to time order. The construction uses AES-CBC with a zero IV and a single-block strip-and-reconstruct trick to preserve the 16-byte payload, the only WebCrypto primitive that lets us compute raw single-block AES while fitting the shared wire format.

See ADRs 0004–0007 for the design: the strip-and-reconstruct trick and IV=0 security rationale, the subpath-export precedent for codec variants, the async contract for keyed codecs, and the shared brand registry with wire-indistinguishability.
