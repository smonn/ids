import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import {
  CODECS,
  type CodecId,
  WRAPPED_KINDS,
  type WrappedKind,
  createOpaqueTimestampId,
  createReverseTimestampId,
  createSignedTimestampId,
  createTimestampId,
  createWrappedKeyId,
  decodeOpaqueKey,
  decodeSigningKey,
  decodeWrappingKey,
  describeError,
  encodeOpaqueKey,
  encodeSigningKey,
  encodeWrappingKey,
  importOpaqueKey,
  importSigningKey,
  importWrappingKey,
  randomKeyBytes,
} from "./lib";
import styles from "./Playground.module.css";

type Outcome = { kind: "ok"; text: string } | { kind: "err"; text: string } | null;

function OutcomeLine({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  return (
    <output class={outcome.kind === "ok" ? styles.ok : styles.err}>{outcome.text}</output>
  );
}

function Row({ children }: { children: ComponentChildren }) {
  return <div class={styles.row}>{children}</div>;
}

/** Editable hex key with a "generate" button. Source of truth is the hex string. */
function KeyField({
  value,
  onInput,
}: {
  value: string;
  onInput: (hex: string) => void;
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
        <button type="button" onClick={() => onInput(encodeOpaqueKey(randomKeyBytes(), "hex"))}>
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
      </Row>
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
      <KeyField value={keyHex} onInput={setKeyHex} />
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
      <KeyField value={keyHex} onInput={setKeyHex} />
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
        Edit the key and extract again — a wrong key yields a plausible but wrong time, never
        an error.
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
      <KeyField value={keyHex} onInput={setKeyHex} />
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

export default function Playground() {
  const [codec, setCodec] = useState<CodecId>("timestamp");
  const active = useMemo(() => CODECS.find((c) => c.id === codec)!, [codec]);

  return (
    <div class={styles.playground} not-content>
      <div class={styles.tabs} role="tablist">
        {CODECS.map((c) => (
          <button
            type="button"
            role="tab"
            aria-selected={c.id === codec}
            class={c.id === codec ? styles.tabActive : styles.tab}
            onClick={() => setCodec(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p class={styles.blurb}>{active.blurb}</p>
      {codec === "timestamp" && <PlainPanel codec="timestamp" />}
      {codec === "reverse" && <PlainPanel codec="reverse" />}
      {codec === "signed" && <SignedPanel />}
      {codec === "opaque" && <OpaquePanel />}
      {codec === "wrapped" && <WrappedPanel />}
    </div>
  );
}
