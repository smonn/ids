# Codec variants are wire-indistinguishable; brand registry enforces one codec per brand

Every codec variant produces the same wire shape — `<brand>_` followed by 26 lowercase Crockford base32 characters. `safeParse` cannot tell an Opaque Timestamp ID from a Timestamp ID structurally, and we deliberately don't add per-codec wire markers. Codec choice is a per-brand commitment, enforced at construction time by the shared module-level brand registry: registering the same brand via more than one codec (e.g. `createTimestampId("usr")` and `createOpaqueTimestampId("usr")`) warns in dev, the same way duplicate `createTimestampId("usr")` calls do today.

## Considered Options

- **Per-codec prefix marker** (e.g. `usr$_` for opaque) — rejected: leaks codec choice into the URL; complicates `safeParse`; defeats the migration story ("swap Timestamp for Opaque Timestamp without changing URL shape").
- **Version byte inside the payload** — rejected: same effective cost (changes the wire format); reduces the random budget.
- **Codec discrimination on parse** (try each registered codec) — rejected: requires the parse path to know about every codec; pulls algorithm code into the main entry; conflicts with [ADR-0005](./0005-codec-variant-subpath-exports.md).

## Consequences

- A brand belongs to exactly one codec in a process. The existing `allowDuplicateBrand: true` opt-out continues to work for legitimate cases (isolated codec instances bundled together).
- The brand registry lives in a small shared module so subpath variants can participate.
- Calling `extractTimestamp` via the wrong codec returns garbage (silently, per the trust-the-type contract in [ADR-0002](./0002-payload-layout.md)). The registry warning is the design-time guard against this; runtime is best-effort.
- Migrating a brand from Timestamp to Opaque Timestamp is a code change, not a wire change. Existing URLs stay valid as long as the same brand isn't re-registered against the old codec.
