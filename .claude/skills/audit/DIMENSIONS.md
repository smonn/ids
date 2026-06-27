# Audit dimensions

The reviewer roster for Phase 1 — one sub-agent per row. This roster is an **example profile** tuned for a security-sensitive library; treat the dimensions as a starting set and the focus bullets as illustrations, not a fixed checklist. Add, drop, or retarget rows to fit the codebase under audit — e.g. a web app swaps the crypto focus for authn/z, XSS, and data-access concerns. Where a row overlaps an existing review skill (`/code-review`, `/simplify`, `/security-review`), have its agent draw on that skill for the angle.

## Shared reviewer contract (prepend to every agent prompt)

> You are a READ-ONLY reviewer of `<project>`. Do NOT modify any files. You are handed: the review **scope** (whole tree, or a `git diff <point>...HEAD`), an area/file map, and a **decided digest** — a list of `<topic> → ADR-N (status)` for questions this project has already settled.
>
> **The gate:** for any finding a decided-digest line or an ADR settles, DROP it or mark it `closed:ADR-N` — never raise a decided thing as actionable. When unsure whether something is decided, read the cited ADR before reporting.
>
> Report each finding as: `severity (Critical/High/Medium/Low) | file:line | one-line title | concrete cost or failure scenario | suggested direction | status: open | closed:ADR-N`. Rank most-severe first. End with a one-line count. Keep under ~700 words.

## Dimensions

| Dimension | Focus |
| --- | --- |
| **Security — core** | The trust-critical primitives. For crypto: constant-time comparisons of secrets/MACs, CSPRNG use (no `Math.random`), nonce/IV reuse, AEAD/cipher misuse, KDF salt/info & key separation, decode-before-authenticate, truncated-MAC length, secrets in errors/memory. |
| **Security — input surface** | Untrusted input: CLI/env/stdin key handling, request params through adapters, parsers/decoders (length/charset/ReDoS/DoS), injection into queries, error messages leaking internals, `eval`/`child_process`/dynamic require on tainted input. |
| **Accuracy / correctness** | Round-trip (encode∘decode identity) on edge inputs (empty, max, all-zero, all-0xFF), layout/offset/endianness, off-by-one, inverted conditions, falsy-zero, integer precision (>32-bit shifts, >2^53), boundary conditions. Trace the byte math. |
| **Performance** | Hot-path work that should be hoisted/cached (key derivation, tables, regexes), allocations in loops, sync crypto on hot paths, O(n²), per-row/per-request adapter overhead, closures pinning large scopes. |
| **Duplication** | Near-identical blocks that must be fixed in N places. Honor the repo's de-dup warrant (e.g. >2 call sites / substantial shared code). Distinguish true duplication from intentional mirroring; name the helper to extract and where it lives. |
| **Accidental complexity** | Complexity a simpler design removes (not inherent crypto/correctness complexity): needless indirection, premature abstraction, type gymnastics, config nobody needs, forwarding wrappers. Trace one path end-to-end and count the hops. |
| **Testability + test quality** | Coverage map (source ↔ test), known-answer vectors, negative/tamper/wrong-key tests, boundary & property tests, injectable seams (RNG/clock/keys/IO), over-mocking, assertion-free tests. |
| **Maintainability** | Naming consistency, one error taxonomy, magic numbers vs named constants, comment quality, TODO/FIXME/HACK markers, coupling, structural consistency across siblings, public-API coherence and accidental internal exports. |
| **Architecture** | Layering and dependency direction (acyclic? enforced?), plugin/registry extensibility (add-a-feature without editing N places), separation of concerns, public-API hygiene & tree-shakeability, drift between code and ADRs. |
| **Documentation** | README/docs/site examples that match the real API (spot-check signatures), security guidance for sensitive libs, JSDoc/TSDoc on public APIs, CLI/doc drift, stale/contradictory docs, changelog/changeset hygiene. |
