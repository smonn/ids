---
"@smonn/ids": patch
---

Lower the `engines.node` floor from `>=24.0.0` to `>=22.0.0`. An exhaustive audit of `src/` found no Node 24-only API — the crypto surface (`crypto.subtle`, `crypto.randomUUID`, `crypto.getRandomValues`, HKDF) and the hand-rolled hex/base64url helpers all predate Node 22, and no Node 22+ additions (`Uint8Array.prototype.toHex`/`toBase64`, `Promise.withResolvers`, `RegExp.escape`, `node:sqlite`, etc.) are used. Node 22 (Jod) is the lowest non-EOL LTS — Node 20 reached end-of-life on 2026-03-24 — so the floor lands at 22. `@types/node` is re-pinned to `22.20.0` to match.
