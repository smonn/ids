---
title: Wire format & porting
description: Links to the wire-format specification and conformance vectors for cross-language porters.
---

This page is for **cross-language porters** — developers reimplementing `@smonn/ids` in another language or runtime. It points to the two artifacts that make a faithful port possible.

## Artifacts

**[SPEC.md](https://github.com/smonn/ids/blob/main/SPEC.md)** — the descriptive wire-format specification. It covers the prefix structure, Crockford base32 canonical form, the 16-byte payload, and the per-codec byte layouts (Timestamp, Reverse Timestamp, Opaque Timestamp, Signed Timestamp, Wrapped key, Digest) in enough detail to reimplement in another language.

**[spec/vectors.json](https://github.com/smonn/ids/blob/main/spec/vectors.json)** — the conformance vectors file. It pins concrete inputs to their expected outputs for each codec and operation. Use these as an oracle to verify your port against the reference implementation.

## Framing

Both artifacts are **descriptive, not normative**. `SPEC.md` documents the reference TypeScript implementation and does not offer a conformance claim that third parties may make against it. The format is **unversioned by design** — there is no version marker on the wire ([ADR-0007](https://github.com/smonn/ids/blob/main/docs/adr/0007-wire-indistinguishable-codec-variants.md), [ADR-0015](https://github.com/smonn/ids/blob/main/docs/adr/0015-twenty-byte-payload-wide-block-prp.md), [ADR-0025](https://github.com/smonn/ids/blob/main/docs/adr/0025-frozen-wire-spec-conformance-vectors.md)). The conformance vectors file is append-only and never regenerated from the implementation — its outputs are a fixed oracle, not a snapshot.

The website links to these artifacts; it does not restate the wire format. `SPEC.md` is the single source of truth.
