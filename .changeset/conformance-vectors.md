---
"@smonn/ids": patch
---

Add `spec/vectors.json` — a frozen, append-only conformance-vector file (v1) and its `toEqual` test harness. The vectors pin the reference implementation against known-answer cases for the shared wire layer (`canonicalize`, the raw UUID mapping) and the Timestamp and Reverse Timestamp codecs (`extract` / `generate`), so the reference implementation and any cross-language port can be checked against the same oracle. The file is published in the package `files` array; keyed-codec construction vectors are deferred to an additive v2 bump. See ADR-0025 (decision) and ADR-0026 (file schema).
