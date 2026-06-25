# Multi-dimension audit — 2026-06-25

> **Point-in-time snapshot. Non-authoritative. Superseded once the issues below are filed.**
> Issue numbers are deliberately omitted so this file cannot rot against GitHub. Paths/line
> numbers are accurate as of this date and are expected to drift — treat the description and
> fix direction as the durable content, not the coordinates. A dedicated **1.0.0 API-freeze
> readiness audit is deferred to its own session** (see "1.0.0 release gate" below).

## Method

Six read-only subagents run in parallel across the dimensions below. No source was modified.
Each was told to ground findings in the ADRs/`CONTEXT.md` before flagging, distinguish genuine
issues from accepted-by-design trade-offs, and avoid re-reporting the prior review round
(HKDF consolidation, `ValidBrand`, brand-registry model, CLI typed discriminants, the doc
roundups, etc.) and the then-open issue on `ALL_CODES` compile-time exhaustiveness.

Headline: **the library is in strong shape.** Crypto is sound, layering is enforced
(dependency-cruiser clean), docs are largely accurate, coverage gate is 100%. No
critical/high-severity _bugs_ in shipped code. The most actionable items are one dead test
assertion, a handful of doc contradictions, and CLI/CI gaps.

---

## Findings by dimension

### Security — construction verified sound

Constant-time compares everywhere tags are verified; all `CryptoKey`s `extractable:false`; no
raw secrets retained; domain-separated HKDF labels; CSPRNG-only; zero runtime deps; CLI keys
via env, never argv. No critical/high.

- **sec-M1 (doc) — HKDF empty-salt rationale assumes 256-bit IKM.** `_kernel/crypto.ts:74`.
  HKDF is called with an empty salt; the ADR-0004/0019 justification ("IKM already 256-bit
  uniform") doesn't literally hold for the accepted 16/24-byte key sizes. Still cryptographically
  safe — only the _documented rationale_ is narrower than the input range. → tighten ADR wording:
  entropy floor = input key size (128/192/256-bit). Folded into the doc-drift roundup.
- **sec-L1 (comment) — `decodeBase32` indexes a 256-entry table via `charCodeAt`.**
  `wire/base32.ts:52`. A >255 code unit yields silent garbage rather than a throw, unlike
  `decodeHex` which guards. Reachable only on the trusted post-regex path, so by-design — but the
  asymmetry with `decodeHex` deserves a one-line comment noting the gate lives upstream.

### Performance — already well-tuned

Module-level tables, construction-time hoisting, reused scratch buffers. Findings are
low/medium.

- **perf-M1 — `safeParse` canonical fast-path.** `wire/parse.ts:17,27`. `toLowerCase()` +
  `prefix+base32` recompose run unconditionally, even when input is already canonical (the
  dominant DB-round-trip case) — two avoidable allocations on the hottest validation path.
  → detect canonical input and return it as-is; fall back to the lenient path otherwise. Prove
  with a benchmark.
- **perf-L — signed codec rebuilds its HMAC message buffer per verify-trial.**
  `signed/layout.ts:23`. The wrapped codec hoists an `HmacMessageTemplate`; signed does not.
  Minor consistency.
- **Bench gaps.** All keyed benches use single-key keyrings, so multi-key trial cost (the
  rotation case) is unmeasured; rejection paths (`is(invalid)`/`safeParse(invalid)`) unbenched.

### Architecture — coherent; depcruise verified clean (110 modules, 0 violations, 0 cycles)

No high.

- **arch-M1 — two depcruise rules have no negative-fixture coverage.**
  `.dependency-cruiser.cjs:191` (`crypto-leaf-restricted`, `crypto-leaf-no-upward`). These are
  the only two rules lacking a negative fixture in `depcruise-rules.test.ts`, and they guard the
  new shared crypto leaf — exactly where an accidental upward import would be most damaging.
  → add fixtures mirroring the `key-material` ones.
- **arch-M2 — `IdsError` re-export inconsistency. RESOLVED: keep + document.** Five of six codec
  subpaths re-export `{IdsError, isIdsError, IdsErrorCode}`; timestamp doesn't (no subpath — root
  provides them). Decision: **keep** the re-exports (single-import DX for subpath-only consumers)
  and **codify the rule** in the codec-addition checklist (timestamp exempt because it ships from
  root). Freeze-safe direction (dropping would have been breaking).
- **arch-L (cosmetic) — slice drift.** Only digest's forged-handle guard carries `v8 ignore`;
  opaque's key accessor breaks the two-function pattern other key modules follow. Low priority.

### Documentation — largely accurate; the value is the drift findings

- **doc-T2 — `monitor-prs` skill names the wrong bot.** `.claude/skills/monitor-prs/SKILL.md:24`
  says the PR author is `claude[bot]`; the real App identity is `smonn[bot]` everywhere
  (`implement.yml`, `triage.yml`). Breaks the agent-vs-external PR classification rule as written.
- **doc-T3 — ADR-0019 closing sentence contradicts its own decision.** `docs/adr/0019:11` ends
  "The bare `ids` prefix was chosen instead," but the decision (and the code's `@smonn/ids/...`
  HKDF labels) chose the namespaced prefix; line 28 lists bare `ids` as _rejected_.
- **doc-M3 — stale ADR range in agent docs.** `docs/agents/domain.md:20` hardcodes "(0001–0020)";
  ADRs now run to 0022. → drop the hardcoded upper bound so it can't drift again.
- **doc-ADR0003 — references a non-existent result field.** `docs/adr/0003:13` says
  `safeParse().success`; the discriminant is `.ok` (`src/types.ts`, `wire/parse.ts`).
- **doc-dup0021 — duplicate ADR number.** Both `0021-brand-registry-process-global.md` and
  `0021-prisma-compute-field-brand-propagation.md` exist. Both accurate to code; violates
  CONTRIBUTING's "numbered sequentially." → renumber one (e.g. prisma → 0023) + update inbound
  refs. **Filed separately** from the doc-drift roundup (rename + refs, not a typo).

### Testing — 100% line coverage, but some assertions don't test what they claim

- **test-T1 (HIGH) — dead assertion.** `wrapped/index.test.ts:153`:
  `await expect(rotated.wrap(7)).not.toBe(id)` — `await` binds the whole expression, so `expect`
  receives an unresolved Promise and the matcher can never fail. The rotation re-wrap property is
  unverified. → `expect(await rotated.wrap(7)).not.toBe(id)`.
- **test-H2 (HIGH) — reverse codec lacks property-based round-trip + boundary round-trips.**
  `reverse/index.test.ts`. The bitwise inversion on encode _and_ decode is the riskiest path, yet
  it has no `generateAt(ms)→extractTimestamp===ms` property and no epoch-0 / 2⁴⁸−1 round-trips
  (where all-ones/all-zeros byte patterns most expose mask/shift errors).
- **test-H3 (HIGH) — kernel `decryptPayload` never tested with wrong key / tampered ciphertext.**
  `_kernel/crypto.test.ts`. The "decrypt yields garbage, never throws" invariant (the basis for
  opaque's no-throw contract) is exercised only indirectly at the codec layer.
- **test-M2 — message-text assertions across 4 codecs.** `reverse`/`signed`/`opaque`/`timestamp`
  index tests assert on non-contractual English (`toThrow("timestamp exceeds 48-bit range")`).
  CONTEXT.md says message is non-contractual; the 2026-06-01 mutation audit already established the
  bare-`toThrow()` convention for the timestamp codec. **Do NOT introduce an error code** — the
  bare `Error` from the 48-bit range check is a CLOSED decision (CONTEXT.md `IdsError` entry,
  ADR-0011). This is a test-only de-brittling; dissolved into each codec's test issue below.
- **test-M (medium gaps):** full-ring _failure_ path (no key matches → `verification_failed`)
  untested for signed & wrapped; digest length-prefix split-collision guarded by a single golden
  vector; wrong-length wire input never reaches the AES/length guard in a test; reverse codec
  missing the forward suite's negative cases; brand-registry global state not reset in the opaque
  & digest suites (`beforeEach(resetBrandRegistry)`); adapter "safeParse-only" contract never
  directly enforced (spy codec); GraphQL adapter never distinguishes failure reasons.
- **test-L:** CLI exact-stderr-string assertions (de-brittle to code/exit only); unguarded
  `await codec.generate()` in the CLI has no throw→exit-1 mapping test; distinct-handle-same-bytes
  duplicate-key rejection only proven at the unit level; opaque/digest defensive-guard and
  key-length boundary asymmetries; arithmetic-only "bound" tests that can't fail; `flags.ts` pure
  helpers lack direct unit tests.
- Error-code runtime coverage is **complete** — all 11 `IdsErrorCode` members are thrown by real
  paths AND asserted by runtime tests.

### DX / build / packaging / CI — packaging clean (attw + publint green; exports match dist)

- **DX-M-cli — no `--version`/`-v` on the published bin.** `cli/index.ts:20`. `ids --version`
  falls through to unknown-subcommand → usage on stderr, exit 2 (looks like an error). → add
  `--version` printing the package version (read at build time) to stdout, exit 0.
- **DX-M-ci — CI runs single Node (22) + single OS.** `ci.yml`. `engines.node >=22` advertises
  22/24/25, and the CLI/crypto surface is cross-platform, but only Node 22 on Linux is exercised.
  → add a `node-version: [22, 24]` (optionally `os: [ubuntu, windows]`) matrix. **In-session item**
  (edits a `.github/workflows/` file — the implement agent's App token lacks `workflows`
  permission, so this cannot be agent-implemented).
- **DX-M3 — no `/timestamp` subpath. RESOLVED: document, don't add.** The default codec is the
  only one without a named subpath. Decision: document the intentional "timestamp is the headline
  default, ships from root `.`" asymmetry in the README codec table (zero new permanent surface;
  adding a subpath later stays additive if reconsidered).
- **DX-L — orphan root `.prettierignore`.** Root toolchain is oxfmt; no root Prettier. Dead config.
  → remove.
- **DX-info (not filed now):** no bundle-size gate (would add a CI step → in-session if pursued);
  14 pending changesets accumulated (intended batching, watch at release-PR time).

---

## Resolved design decisions (so issues can be written agent-ready)

| Finding                          | Decision                                    | Why                                                                                                                             |
| -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| test-M2 timestamp-overflow error | Test-only de-brittle; **no** new error code | Bare `Error` for the 48-bit range check is a CLOSED decision (CONTEXT.md/ADR-0011) — adding `invalid_timestamp` would reopen it |
| arch-M2 `IdsError` re-export     | **Keep** + document the rule                | Subpath-import DX is real and cheap; keep is the freeze-safe direction                                                          |
| DX-M3 `/timestamp` subpath       | **Document** the asymmetry, don't add       | Avoids a permanent dual-homed export; adding later stays additive                                                               |

---

## Filing plan (slicing)

Default: **one issue per finding**, sized single-turn for `implement.yml`. Exception driven by a
real automation hazard — multiple parallel `implement.yml` PRs editing the same file conflict. So:
**group sub-findings by the file they touch, so each issue's file set is disjoint** and the PRs
run in parallel conflict-free (no `Blocked by` chains needed). test-M2's per-file de-brittling is
_dissolved into_ each codec's test issue rather than filed cross-file.

**Test cluster (file-disjoint, parallel-safe):**

- reverse test parity = H2 + reverse negatives + de-brittle reverse assertions
- signed test hardening = try-all-fail + wrong-length wire + dup-handle + de-brittle
- opaque test hardening = registry reset + key-length boundaries + guard + de-brittle
- timestamp test = de-brittle + `is()` uppercase-prefix gap
- wrapped test hardening = T1 dead assertion + try-all-fail + wrong-length wire + dup-handle
- digest test hardening = split-collision + guard
- kernel crypto = wrong-key / tampered decrypt (H3)
- adapter contract = safeParse-only spy (all adapters) + GraphQL reason distinction
- CLI de-brittle = stderr→code/exit + throw→exit-1 + flags unit tests

**Code/config singletons (agent-ready, file-disjoint):** perf canonical fast-path (+bench) ·
bench gaps · depcruise crypto-leaf fixtures · sec-L1 base32 comment · arch-M2 re-export rule doc ·
DX-M3 timestamp-asymmetry doc · remove `.prettierignore`.

**Doc-drift roundup (one small agent-ready issue):** doc-T2 · doc-T3 · doc-M3 · doc-ADR0003 ·
sec-M1 HKDF wording.

**Separate:** dup-ADR-0021 renumber (rename + ref updates).

**In-session (not agent-implementable):** DX-M-ci Node/OS matrix (workflow file).

---

## 1.0.0 release gate

1.0 freezes the **public export surface**, the **wire format / byte layouts**, and the **CLI
surface** permanently (error-code _additions_ remain minor bumps). Re-triaged against that:

- **None of the findings above is a hard 1.0 blocker.** Tests, docs, perf, depcruise fixtures,
  bench, `.prettierignore` don't touch the frozen contract; CLI `--version` and the `/timestamp`
  decision are additive; arch-M2 kept the freeze-safe direction.
- The genuinely 1.0-critical work is a **dimension this audit did not run: an API-freeze
  readiness review** — "is everything public meant to be public forever; anything to hide/rename/
  remove now (e.g. is `resetBrandRegistry` in the public surface?); are the byte layouts and the
  40-bit signed tag what we want to be unable to change?" This is **deferred to its own dedicated
  session** after the above batch lands, to keep its context clean.
