import type { webcrypto } from "node:crypto";
import type { Id, LayoutOps, Prefix } from "../../types.js";
import { decryptPayload, encryptPayload, timingSafeEqual } from "../_kernel/crypto.js";
import { writeLen32 } from "../_kernel/bytes.js";
import { payloadBytesFromId, toWireId } from "../../wire/envelope.js";
import { payloadBase32Length, payloadByteLength } from "../../wire/invariants.js";

const laneByteLength = 8;
const tagByteLength = 8;
const _wrappedByteCheck: typeof payloadByteLength = laneByteLength + tagByteLength;
void _wrappedByteCheck;

type LayoutWrappingKey = {
  aesKey: webcrypto.CryptoKey;
  hmacKey: webcrypto.CryptoKey;
};

type LayoutWrappedKind = "u32" | "i32" | "u64" | "i64";
type LayoutLookupKey<K extends LayoutWrappedKind> = K extends "u32" | "i32" ? number : bigint;

function writeU32Lane(value: number, lane: Uint8Array): void {
  lane[0] = 0;
  lane[1] = 0;
  lane[2] = 0;
  lane[3] = 0;
  lane[4] = (value >>> 24) & 0xff;
  lane[5] = (value >>> 16) & 0xff;
  lane[6] = (value >>> 8) & 0xff;
  lane[7] = value & 0xff;
}

function readU32Lane(lane: Uint8Array): number | null {
  for (let i = 0; i < 4; i++) {
    if (lane[i] !== 0) return null;
  }
  return ((lane[4]! << 24) | (lane[5]! << 16) | (lane[6]! << 8) | lane[7]!) >>> 0;
}

function writeI32Lane(value: number, lane: Uint8Array): void {
  lane.fill(value < 0 ? 0xff : 0x00, 0, 4);
  new DataView(lane.buffer, lane.byteOffset, lane.byteLength).setInt32(4, value, false);
}

function readI32Lane(lane: Uint8Array): number | null {
  const signExtension = (lane[4]! & 0x80) === 0 ? 0x00 : 0xff;
  for (let i = 0; i < 4; i++) {
    if (lane[i] !== signExtension) return null;
  }
  return new DataView(lane.buffer, lane.byteOffset, lane.byteLength).getInt32(4, false);
}

function writeU64Lane(value: bigint, lane: Uint8Array): void {
  new DataView(lane.buffer, lane.byteOffset, lane.byteLength).setBigUint64(0, value, false);
}

function readU64Lane(lane: Uint8Array): bigint {
  return new DataView(lane.buffer, lane.byteOffset, lane.byteLength).getBigUint64(0, false);
}

function writeI64Lane(value: bigint, lane: Uint8Array): void {
  new DataView(lane.buffer, lane.byteOffset, lane.byteLength).setBigInt64(0, value, false);
}

function readI64Lane(lane: Uint8Array): bigint {
  return new DataView(lane.buffer, lane.byteOffset, lane.byteLength).getBigInt64(0, false);
}

function writeLane<K extends LayoutWrappedKind>(
  kind: K,
  value: LayoutLookupKey<K>,
  lane: Uint8Array,
): void {
  if (kind === "i32") {
    writeI32Lane(value as number, lane);
    return;
  }
  if (kind === "u64") {
    writeU64Lane(value as bigint, lane);
    return;
  }
  if (kind === "i64") {
    writeI64Lane(value as bigint, lane);
    return;
  }
  writeU32Lane(value as number, lane);
}

function readLane<K extends LayoutWrappedKind>(
  kind: K,
  lane: Uint8Array,
): LayoutLookupKey<K> | null {
  if (kind === "u64") return readU64Lane(lane) as LayoutLookupKey<K>;
  if (kind === "i64") return readI64Lane(lane) as LayoutLookupKey<K>;
  const value = kind === "i32" ? readI32Lane(lane) : readU32Lane(lane);
  return value as LayoutLookupKey<K> | null;
}

/**
 * Precomputed HMAC-message template for a fixed (brand, kind) pair.
 *
 * The message is `len32(brand) ‖ brand ‖ len32(kind) ‖ kind ‖ lane`. Everything
 * except the trailing 8-byte lane is constant for the life of the codec, so we
 * build it once at construction. `brand`/`kind` are never re-encoded and no
 * `TextEncoder` is allocated on the `wrap` / `unwrap` hot paths.
 */
type HmacMessageTemplate = {
  /** Full-length buffer with the constant prefix written and the lane region zeroed. */
  readonly buffer: Uint8Array;
  /** Byte offset where the lane is copied in on each call. */
  readonly laneOffset: number;
};

function createHmacMessageTemplate(brand: string, kind: LayoutWrappedKind): HmacMessageTemplate {
  const encoder = new TextEncoder();
  const brandBytes = encoder.encode(brand);
  const kindBytes = encoder.encode(kind);
  const laneOffset = 4 + brandBytes.length + 4 + kindBytes.length;
  const buffer = new Uint8Array(laneOffset + laneByteLength);
  let offset = 0;
  writeLen32(brandBytes.length, buffer, offset);
  offset += 4;
  buffer.set(brandBytes, offset);
  offset += brandBytes.length;
  writeLen32(kindBytes.length, buffer, offset);
  offset += 4;
  buffer.set(kindBytes, offset);
  return { buffer, laneOffset };
}

/** Materialise the HMAC message for `lane`. Fresh buffer per call → safe under concurrent async signs. */
function hmacMessage(template: HmacMessageTemplate, lane: Uint8Array): Uint8Array {
  const message = template.buffer.slice();
  message.set(lane, template.laneOffset);
  return message;
}

async function computeTag(
  key: LayoutWrappingKey,
  template: HmacMessageTemplate,
  lane: Uint8Array,
): Promise<Uint8Array> {
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key.hmacKey,
      hmacMessage(template, lane) as Uint8Array<ArrayBuffer>,
    ),
  );
  return signature.subarray(0, tagByteLength);
}

function buildPlaintext(lane: Uint8Array, tag: Uint8Array): Uint8Array {
  const plaintext = new Uint8Array(payloadByteLength);
  plaintext.set(lane, 0);
  plaintext.set(tag, laneByteLength);
  return plaintext;
}

async function wrapLookupKey<Brand extends string, Kind extends LayoutWrappedKind>(
  prefix: Prefix<Brand>,
  template: HmacMessageTemplate,
  key: LayoutWrappingKey,
  kind: Kind,
  lookupKey: LayoutLookupKey<Kind>,
): Promise<Id<Brand>> {
  const lane = new Uint8Array(laneByteLength);
  writeLane(kind, lookupKey, lane);
  const tag = await computeTag(key, template, lane);
  const encrypted = await encryptPayload(key.aesKey, buildPlaintext(lane, tag));
  return toWireId(prefix, encrypted);
}

async function tryUnwrapLookupKey<Brand extends string, Kind extends LayoutWrappedKind>(
  prefix: Prefix<Brand>,
  template: HmacMessageTemplate,
  key: LayoutWrappingKey,
  kind: Kind,
  id: Id<Brand>,
): Promise<LayoutLookupKey<Kind> | null> {
  const plaintext = await decryptPayload(key.aesKey, payloadBytesFromId(prefix, id));
  const lane = plaintext.subarray(0, laneByteLength);
  const tag = plaintext.subarray(laneByteLength, payloadByteLength);
  const expected = await computeTag(key, template, lane);
  if (!timingSafeEqual(tag, expected)) return null;
  return readLane(kind, lane);
}

function schemaExample<Brand extends string>(prefix: Prefix<Brand>): string {
  return prefix + "0".repeat(payloadBase32Length);
}

export function createWrappedLayoutOps<Brand extends string, Kind extends LayoutWrappedKind>(
  prefix: Prefix<Brand>,
  brand: Brand,
  kind: Kind,
  keys: readonly LayoutWrappingKey[],
): LayoutOps<Brand> & {
  wrap(lookupKey: LayoutLookupKey<Kind>): Promise<Id<Brand>>;
  tryUnwrap(id: Id<Brand>): Promise<LayoutLookupKey<Kind> | null>;
} {
  const wrapKey = keys[0]!;
  // brand + kind are fixed for the codec's lifetime; encode them and build the
  // HMAC-message prefix once instead of on every wrap / unwrap-trial.
  const template = createHmacMessageTemplate(brand, kind);
  return {
    wrap: (lookupKey: LayoutLookupKey<Kind>): Promise<Id<Brand>> =>
      wrapLookupKey(prefix, template, wrapKey, kind, lookupKey),
    tryUnwrap: async (id: Id<Brand>): Promise<LayoutLookupKey<Kind> | null> => {
      // Accepted timing leak: early-return on first keyring match reveals the
      // matching key's position (rotation epoch). This is inherent to ordered-ring
      // trial and accepted — see docs/adr/0009-wrapped-key-compact-construction.md.
      for (const key of keys) {
        const lookupKey = await tryUnwrapLookupKey(prefix, template, key, kind, id);
        if (lookupKey !== null) return lookupKey;
      }
      return null;
    },
    exampleWireId: (_ms?: number): Id<Brand> => schemaExample(prefix) as Id<Brand>,
  };
}
