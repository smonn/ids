---
title: Choosing a codec
description: Pick the right @smonn/ids codec variant for sortability, confidentiality, or integrity.
---

All six codecs share the same `<brand>_<26 chars>` wire shape but make
different trade-offs. Pick by what you need from the payload.

| Codec                                 | Import               | Sort direction            | Key required       | Timestamp extractable      | Range query support                                                          |
| ------------------------------------- | -------------------- | ------------------------- | ------------------ | -------------------------- | ---------------------------------------------------------------------------- |
| [Timestamp](/codecs/timestamp/)       | `@smonn/ids`         | Ascending (oldest-first)  | No                 | Always (plaintext)         | `minIdForTime(t_old)` → `maxIdForTime(t_new)`                                |
| [Reverse Timestamp](/codecs/reverse/) | `@smonn/ids/reverse` | Descending (newest-first) | No                 | Always (plaintext)         | `minIdForTime(t_new)` → `maxIdForTime(t_old)` (bounds flipped)               |
| [Signed Timestamp](/codecs/signed/)   | `@smonn/ids/signed`  | Ascending (oldest-first)  | Yes (signing key)  | Always (plaintext)         | `minIdForTime(t_old)` → `maxIdForTime(t_new)` (sentinels carry no valid tag) |
| [Opaque Timestamp](/codecs/opaque/)   | `@smonn/ids/opaque`  | None (encrypted)          | Yes (AES key)      | With key only              | None — encrypted payloads do not sort by time                                |
| [Wrapped key](/codecs/wrapped/)       | `@smonn/ids/wrapped` | None                      | Yes (wrapping key) | N/A — not timestamp-family | None                                                                         |
| [Digest](/codecs/digest/)             | `@smonn/ids/digest`  | None                      | Yes (digest key)   | N/A — not timestamp-family | None                                                                         |

## Decision guide

- **Public entity IDs that should sort by creation time** → **Timestamp**. The default.
- **Newest-first scans on a forward-only KV store** (DynamoDB, Datastore) → **Reverse Timestamp**.
- **Tamper-evident share links you verify without a DB lookup** → **Signed Timestamp** (integrity).
- **IDs that must not leak creation time** (invoice/signup IDs) → **Opaque Timestamp** (confidentiality).
- **A public handle for an internal integer PK** → **Wrapped key**.
- **Idempotency keys, content-addressed records, or stable public pseudonyms** → **Digest**.

Signed and Opaque sit on opposite security axes: Signed adds **integrity**
(a verifiable HMAC tag, timestamp stays readable); Opaque adds
**confidentiality** (the timestamp is encrypted, no auth tag).

## A per-brand commitment

The codec variants are **wire-indistinguishable** — you cannot tell from an ID
alone which codec minted it. Codec choice is therefore a per-brand commitment:
register one brand against one codec. In development the brand registry warns if
you register the same brand against two codecs. See
[ADR-0007](https://github.com/smonn/ids/blob/main/docs/adr/0007-wire-indistinguishable-codec-variants.md).
