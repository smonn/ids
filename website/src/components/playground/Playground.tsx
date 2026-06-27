import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import {
  CODECS,
  type CodecId,
  WRAPPED_KINDS,
  type WrappedKind,
  createDigestId,
  createOpaqueTimestampId,
  createReverseTimestampId,
  createSignedTimestampId,
  createTimestampId,
  createWrappedKeyId,
  decodeDigestKey,
  decodeOpaqueKey,
  decodeSigningKey,
  decodeWrappingKey,
  describeError,
  encodeDigestKey,
  encodeOpaqueKey,
  encodeSigningKey,
  encodeWrappingKey,
  importDigestKey,
  importOpaqueKey,
  importSigningKey,
  importWrappingKey,
  randomKeyBytes,
} from "./lib";
import styles from "./Playground.module.css";

type Outcome = { kind: "ok"; text: string } | { kind: "err"; text: string } | null;

function OutcomeLine({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  return <output class={outcome.kind === "ok" ? styles.ok : styles.err}>{outcome.text}</output>;
}

function Row({ children }: { children: ComponentChildren }) {
  return <div class={styles.row}>{children}</div>;
}

/** Editable hex key with a "generate" button. Source of truth is the hex string. */
function KeyField({
  value,
  onInput,
  encode,
}: {
  value: string;
  onInput: (hex: string) => void;
  encode: (bytes: Uint8Array, format: "hex") => string;
}) {
  return (
    <label class={styles.field}>
      <span>Key (hex)</span>
      <Row>
        <input
          class={styles.mono}
          value={value}
          spellcheck={false}
          onInput={(e) => onInput((e.target as HTMLInputElement).value.trim())}
        />
        <button type="button" onClick={() => onInput(encode(randomKeyBytes(), "hex"))}>
          Generate key
        </button>
      </Row>
    </label>
  );
}

function BrandField({ value, onInput }: { value: string; onInput: (v: string) => void }) {
  return (
    <label class={styles.field}>
      <span>Brand (3 lowercase letters)</span>
      <input
        class={styles.mono}
        value={value}
        maxLength={3}
        spellcheck={false}
        onInput={(e) => onInput((e.target as HTMLInputElement).value.trim())}
      />
    </label>
  );
}

// --- Timestamp / Reverse: identical surface, different factory --------------

function PlainPanel({ codec }: { codec: "timestamp" | "reverse" }) {
  const factory = codec === "timestamp" ? createTimestampId : createReverseTimestampId;
  const [brand, setBrand] = useState(codec === "timestamp" ? "usr" : "evt");
  const [id, setId] = useState("");
  const [uuid, setUuid] = useState("");
  const [out, setOut] = useState<Outcome>(null);

  const generate = () => {
    try {
      const c = factory(brand, { allowDuplicateBrand: true });
      const value = c.generate();
      setId(value);
      setOut({ kind: "ok", text: value });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  const extract = () => {
    try {
      const c = factory(brand, { allowDuplicateBrand: true });
      const parsed = c.parse(id);
      setOut({ kind: "ok", text: `timestamp: ${c.extractTimestamp(parsed).toISOString()}` });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  // Lossless round-trip into a native `uuid` column: the 16-byte payload is
  // reinterpreted verbatim as 128 bits, so toUUID → fromUUID returns the same ID.
  const toUuid = () => {
    try {
      const c = factory(brand, { allowDuplicateBrand: true });
      const value = c.toUUID(c.parse(id));
      setUuid(value);
      setOut({ kind: "ok", text: value });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  const fromUuid = () => {
    const c = factory(brand, { allowDuplicateBrand: true });
    const r = c.safeFromUUID(uuid);
    if (r.ok) {
      setId(r.id);
      setOut({ kind: "ok", text: r.id });
    } else {
      setOut({ kind: "err", text: `invalid_id: ${r.error}` });
    }
  };

  return (
    <div class={styles.panel}>
      <BrandField value={brand} onInput={setBrand} />
      <Row>
        <button type="button" onClick={generate}>
          Generate
        </button>
      </Row>
      <label class={styles.field}>
        <span>ID to extract timestamp from</span>
        <input
          class={styles.mono}
          value={id}
          spellcheck={false}
          onInput={(e) => setId((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <Row>
        <button type="button" onClick={extract} disabled={!id}>
          Extract timestamp
        </button>
        <button type="button" onClick={toUuid} disabled={!id}>
          To UUID
        </button>
      </Row>
      <label class={styles.field}>
        <span>UUID to import (8-4-4-4-12)</span>
        <input
          class={styles.mono}
          value={uuid}
          spellcheck={false}
          onInput={(e) => setUuid((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <Row>
        <button type="button" onClick={fromUuid} disabled={!uuid}>
          From UUID
        </button>
      </Row>
      <p class={styles.hint}>
        Round-trip an ID through a native <code>uuid</code> column: <strong>To UUID</strong> emits
        the 16-byte payload as a canonical UUID, and <strong>From UUID</strong> reads it back to the
        same branded ID. Available on every codec.
      </p>
      <OutcomeLine outcome={out} />
    </div>
  );
}

// --- Signed -----------------------------------------------------------------

function SignedPanel() {
  const [brand, setBrand] = useState("shr");
  const [keyHex, setKeyHex] = useState(() => encodeSigningKey(randomKeyBytes(), "hex"));
  const [id, setId] = useState("");
  const [out, setOut] = useState<Outcome>(null);

  const makeCodec = async () => {
    const key = await importSigningKey(decodeSigningKey(keyHex, "hex"));
    return createSignedTimestampId(brand, { keys: [key], allowDuplicateBrand: true });
  };

  const generate = async () => {
    try {
      const c = await makeCodec();
      const value = await c.generate();
      setId(value);
      setOut({ kind: "ok", text: value });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  const verify = async () => {
    try {
      const c = await makeCodec();
      const r = await c.safeVerify(id);
      setOut(
        r.ok
          ? { kind: "ok", text: `verified ✓ — ${r.id}` }
          : { kind: "err", text: `verification: ${r.error}` },
      );
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  return (
    <div class={styles.panel}>
      <BrandField value={brand} onInput={setBrand} />
      <KeyField value={keyHex} onInput={setKeyHex} encode={encodeSigningKey} />
      <Row>
        <button type="button" onClick={generate}>
          Generate
        </button>
      </Row>
      <label class={styles.field}>
        <span>ID to verify</span>
        <input
          class={styles.mono}
          value={id}
          spellcheck={false}
          onInput={(e) => setId((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <Row>
        <button type="button" onClick={verify} disabled={!id}>
          Verify
        </button>
      </Row>
      <p class={styles.hint}>
        Tamper with a character in the ID, then verify — the HMAC tag fails.
      </p>
      <OutcomeLine outcome={out} />
    </div>
  );
}

// --- Opaque -----------------------------------------------------------------

function OpaquePanel() {
  const [brand, setBrand] = useState("inv");
  const [keyHex, setKeyHex] = useState(() => encodeOpaqueKey(randomKeyBytes(), "hex"));
  const [id, setId] = useState("");
  const [out, setOut] = useState<Outcome>(null);

  const makeCodec = async () => {
    const key = await importOpaqueKey(decodeOpaqueKey(keyHex, "hex"));
    return createOpaqueTimestampId(brand, { key, allowDuplicateBrand: true });
  };

  const generate = async () => {
    try {
      const c = await makeCodec();
      const value = await c.generate();
      setId(value);
      setOut({ kind: "ok", text: value });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  const extract = async () => {
    try {
      const c = await makeCodec();
      const parsed = c.parse(id);
      const ts = await c.extractTimestamp(parsed);
      setOut({ kind: "ok", text: `timestamp: ${ts.toISOString()}` });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  return (
    <div class={styles.panel}>
      <BrandField value={brand} onInput={setBrand} />
      <KeyField value={keyHex} onInput={setKeyHex} encode={encodeOpaqueKey} />
      <Row>
        <button type="button" onClick={generate}>
          Generate
        </button>
      </Row>
      <label class={styles.field}>
        <span>ID to decrypt timestamp from</span>
        <input
          class={styles.mono}
          value={id}
          spellcheck={false}
          onInput={(e) => setId((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <Row>
        <button type="button" onClick={extract} disabled={!id}>
          Extract timestamp
        </button>
      </Row>
      <p class={styles.hint}>
        Edit the key and extract again — a wrong key yields a plausible but wrong time, never an
        error.
      </p>
      <OutcomeLine outcome={out} />
    </div>
  );
}

// --- Wrapped ----------------------------------------------------------------

function WrappedPanel() {
  const [brand, setBrand] = useState("ord");
  const [kind, setKind] = useState<WrappedKind>("u64");
  const [keyHex, setKeyHex] = useState(() => encodeWrappingKey(randomKeyBytes(), "hex"));
  const [lookup, setLookup] = useState("42");
  const [id, setId] = useState("");
  const [out, setOut] = useState<Outcome>(null);

  const makeCodec = async () => {
    const key = await importWrappingKey(decodeWrappingKey(keyHex, "hex"));
    return createWrappedKeyId(brand, { kind, keys: [key], allowDuplicateBrand: true });
  };

  const wrap = async () => {
    try {
      const c = await makeCodec();
      const isBig = kind === "u64" || kind === "i64";
      const value = await c.wrap(isBig ? BigInt(lookup) : Number(lookup));
      setId(value);
      setOut({ kind: "ok", text: value });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  const unwrap = async () => {
    try {
      const c = await makeCodec();
      const r = await c.safeUnwrap(id);
      setOut(
        r.ok
          ? { kind: "ok", text: `lookup key: ${r.lookupKey}` }
          : { kind: "err", text: `unwrap: ${r.error}` },
      );
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  return (
    <div class={styles.panel}>
      <BrandField value={brand} onInput={setBrand} />
      <label class={styles.field}>
        <span>Kind</span>
        <select
          value={kind}
          onChange={(e) => setKind((e.target as HTMLSelectElement).value as WrappedKind)}
        >
          {WRAPPED_KINDS.map((k) => (
            <option value={k}>{k}</option>
          ))}
        </select>
      </label>
      <KeyField value={keyHex} onInput={setKeyHex} encode={encodeWrappingKey} />
      <label class={styles.field}>
        <span>Lookup key (integer)</span>
        <input
          class={styles.mono}
          value={lookup}
          spellcheck={false}
          onInput={(e) => setLookup((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <Row>
        <button type="button" onClick={wrap}>
          Wrap
        </button>
      </Row>
      <label class={styles.field}>
        <span>ID to unwrap</span>
        <input
          class={styles.mono}
          value={id}
          spellcheck={false}
          onInput={(e) => setId((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <Row>
        <button type="button" onClick={unwrap} disabled={!id}>
          Unwrap
        </button>
      </Row>
      <OutcomeLine outcome={out} />
    </div>
  );
}

// --- Digest -----------------------------------------------------------------

function DigestPanel() {
  const [brand, setBrand] = useState("idk");
  const [ns, setNs] = useState("checkout");
  const [keyHex, setKeyHex] = useState(() => encodeDigestKey(randomKeyBytes(), "hex"));
  const [material, setMaterial] = useState("order-ref-123");
  const [out, setOut] = useState<Outcome>(null);

  const makeCodec = async () => {
    const key = await importDigestKey(decodeDigestKey(keyHex, "hex"));
    return createDigestId(brand, { ns, key, allowDuplicateBrand: true });
  };

  const digest = async () => {
    try {
      const c = await makeCodec();
      const id = await c.digest(material);
      setOut({ kind: "ok", text: id });
    } catch (err) {
      setOut({ kind: "err", text: describeError(err) });
    }
  };

  return (
    <div class={styles.panel}>
      <BrandField value={brand} onInput={setBrand} />
      <label class={styles.field}>
        <span>Namespace (ns)</span>
        <input
          class={styles.mono}
          value={ns}
          spellcheck={false}
          onInput={(e) => setNs((e.target as HTMLInputElement).value.trim())}
        />
      </label>
      <KeyField value={keyHex} onInput={setKeyHex} encode={encodeDigestKey} />
      <label class={styles.field}>
        <span>Material to digest</span>
        <input
          class={styles.mono}
          value={material}
          spellcheck={false}
          onInput={(e) => setMaterial((e.target as HTMLInputElement).value)}
        />
      </label>
      <Row>
        <button type="button" onClick={digest} disabled={!material}>
          Digest
        </button>
      </Row>
      <p class={styles.hint}>
        Digest the same material again — you get the same ID. The codec is one-way: there is no
        extract, verify, or unwrap, and the material cannot be recovered from the ID.
      </p>
      <OutcomeLine outcome={out} />
    </div>
  );
}

export default function Playground() {
  const [codec, setCodec] = useState<CodecId>("timestamp");

  return (
    <div class={styles.playground} not-content>
      <div class={styles.tabs} role="tablist" aria-label="Codec">
        {CODECS.map((c, i) => {
          const selected = c.id === codec;
          return (
            <button
              type="button"
              role="tab"
              id={`pg-tab-${c.id}`}
              aria-selected={selected}
              aria-controls={`pg-panel-${c.id}`}
              tabIndex={selected ? 0 : -1}
              class={selected ? styles.tabActive : styles.tab}
              onClick={() => setCodec(c.id)}
              onKeyDown={(e) => {
                // Roving-tabindex arrow navigation per the WAI-ARIA tabs pattern.
                const last = CODECS.length - 1;
                let next = i;
                if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                  next = i === 0 ? last : i - 1;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = last;
                else return;
                e.preventDefault();
                const target = CODECS[next];
                setCodec(target.id);
                document.getElementById(`pg-tab-${target.id}`)?.focus();
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {CODECS.map((c) => (
        <div
          key={c.id}
          role="tabpanel"
          id={`pg-panel-${c.id}`}
          aria-labelledby={`pg-tab-${c.id}`}
          tabIndex={0}
          hidden={c.id !== codec}
        >
          <p class={styles.blurb}>{c.blurb}</p>
          {c.id === "timestamp" && <PlainPanel codec="timestamp" />}
          {c.id === "reverse" && <PlainPanel codec="reverse" />}
          {c.id === "signed" && <SignedPanel />}
          {c.id === "opaque" && <OpaquePanel />}
          {c.id === "wrapped" && <WrappedPanel />}
          {c.id === "digest" && <DigestPanel />}
        </div>
      ))}
    </div>
  );
}
