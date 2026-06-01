---
"@smonn/ids": patch
---

Drop the `invariant` helper and inline `if (...) throw new Error(...)` checks where they remain. V8 declines to inline functions that contain `throw`, so each `invariant()` call cost ~10ns of un-amortised function-call overhead.

Internal-only base32 functions no longer validate their input — callers in `id.ts` already guarantee shape (16 bytes for `encodeBase32`, alphabet characters for `decodeBase32`), and `Id<Brand>` provides a typed contract for `extractTimestamp` per ADR-0003. Bad input now produces silent garbage rather than a thrown error, which is consistent with the trust-the-type rule applied elsewhere.

`decodeBase32` and `extractTimestamp` are ~5% faster as a result.
