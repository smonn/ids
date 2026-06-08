# Keyed codecs are async; non-keyed codecs stay sync

WebCrypto SubtleCrypto — the only cross-runtime crypto API available in modern Node and browsers — is async-only. Any codec that needs a key (Opaque Timestamp, Signed Timestamp, Digest) therefore has async key-dependent methods. We accept the async contract for these codecs rather than bundling a pure-JS algorithm implementation to preserve sync semantics. Non-keyed codecs (Timestamp, Reverse Timestamp) remain fully sync.

This split also resolves the "do codec variants share `TimestampCodec<Brand>`?" question deferred in [docs/IDEAS.md](../IDEAS.md): they don't. Each keyed variant defines its own codec type (`OpaqueTimestampCodec<Brand>`, etc.). Methods that don't need the key (`is`, `parse`, `safeParse`, `toJsonSchema`, `~standard`) stay sync even on keyed codecs, because they operate on the wire form only.

## Considered Options

- **Bundle pure-JS AES / HMAC for sync keyed codecs** — rejected: ~5–10KB of audited crypto per algorithm, ongoing maintenance and review burden, no compelling consumer to justify the cost.
- **Node-only sync via `node:crypto`** — rejected: cuts out browser and edge runtimes; opaque IDs in URLs are a browser-relevant feature.
- **Share a single all-async codec contract across variants** — rejected: forces the Timestamp codec async too, regressing the dominant use case.

## Consequences

- Keyed codec construction stays sync (the codec takes an already-imported `CryptoKey`). Per-call latency includes one or more `subtle` round-trips.
- Range-scan methods (`minIdForTime`, `maxIdForTime`) are omitted from keyed codecs where they don't make sense (the Opaque Timestamp codec's ciphertext doesn't sort by time).
- If a future consumer needs a sync keyed codec, the pure-JS bundling decision can be revisited without breaking the existing async API — async signatures accept sync implementations under the same Promise contract.
