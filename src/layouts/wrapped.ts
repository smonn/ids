import type { Id, Prefix } from "../types.js";
import { payloadBytesFromId, toWireId } from "../wire/envelope.js";
import { payloadBase32Length, payloadByteLength } from "../wire/invariants.js";

const zeroIv = new Uint8Array(payloadByteLength);
const pkcsPad = 0x10;
const laneByteLength = 8;
const tagByteLength = 8;

type LayoutWrappingKey = {
  aesKey: CryptoKey;
  hmacKey: CryptoKey;
};

export type WrappedKind = "u32" | "i32" | "u64" | "i64";

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
  return (
    ((lane[4]! << 24) | (lane[5]! << 16) | (lane[6]! << 8) | lane[7]!) >>> 0
  );
}

function hmacMessage(brand: string, kind: WrappedKind, lane: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${brand}:${kind}:`);
  const message = new Uint8Array(prefix.length + lane.length);
  message.set(prefix, 0);
  message.set(lane, prefix.length);
  return message;
}

async function computeTag(
  key: LayoutWrappingKey,
  brand: string,
  kind: WrappedKind,
  lane: Uint8Array,
): Promise<Uint8Array> {
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key.hmacKey,
      hmacMessage(brand, kind, lane) as Uint8Array<ArrayBuffer>,
    ),
  );
  return signature.subarray(0, tagByteLength);
}

function tagsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function encryptPayload(key: LayoutWrappingKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: zeroIv },
      key.aesKey,
      plaintext as Uint8Array<ArrayBuffer>,
    ),
  );
  return encrypted.subarray(0, payloadByteLength);
}

async function decryptPayload(key: LayoutWrappingKey, c1: Uint8Array): Promise<Uint8Array> {
  const c2Input = new Uint8Array(payloadByteLength);
  for (let i = 0; i < payloadByteLength; i++) c2Input[i] = pkcsPad ^ c1[i]!;
  const c2Encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: zeroIv },
      key.aesKey,
      c2Input as Uint8Array<ArrayBuffer>,
    ),
  );
  const ciphertext = new Uint8Array(payloadByteLength * 2);
  ciphertext.set(c1, 0);
  ciphertext.set(c2Encrypted.subarray(0, payloadByteLength), payloadByteLength);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: zeroIv },
      key.aesKey,
      ciphertext as Uint8Array<ArrayBuffer>,
    ),
  );
}

function buildPlaintext(lane: Uint8Array, tag: Uint8Array): Uint8Array {
  const plaintext = new Uint8Array(payloadByteLength);
  plaintext.set(lane, 0);
  plaintext.set(tag, laneByteLength);
  return plaintext;
}

async function wrapU32<Brand extends string>(
  prefix: Prefix<Brand>,
  brand: string,
  key: LayoutWrappingKey,
  lookupKey: number,
): Promise<Id<Brand>> {
  const lane = new Uint8Array(laneByteLength);
  writeU32Lane(lookupKey, lane);
  const tag = await computeTag(key, brand, "u32", lane);
  const encrypted = await encryptPayload(key, buildPlaintext(lane, tag));
  return toWireId(prefix, encrypted);
}

async function tryUnwrapU32<Brand extends string>(
  prefix: Prefix<Brand>,
  brand: string,
  key: LayoutWrappingKey,
  id: Id<Brand>,
): Promise<number | null> {
  const plaintext = await decryptPayload(key, payloadBytesFromId(prefix, id));
  const lane = plaintext.subarray(0, laneByteLength);
  const tag = plaintext.subarray(laneByteLength, payloadByteLength);
  const expected = await computeTag(key, brand, "u32", lane);
  if (!tagsEqual(tag, expected)) return null;
  return readU32Lane(lane);
}

function schemaExample<Brand extends string>(prefix: Prefix<Brand>): string {
  return prefix + "0".repeat(payloadBase32Length);
}

export function createWrappedLayoutOps<Brand extends string>(
  prefix: Prefix<Brand>,
  brand: Brand,
  keys: readonly LayoutWrappingKey[],
) {
  const wrapKey = keys[0]!;
  return {
    wrap: (lookupKey: number): Promise<Id<Brand>> => wrapU32(prefix, brand, wrapKey, lookupKey),
    unwrap: async (id: Id<Brand>): Promise<number> => {
      for (const key of keys) {
        const lookupKey = await tryUnwrapU32(prefix, brand, key, id);
        if (lookupKey !== null) return lookupKey;
      }
      throw new Error("verification failed");
    },
    tryUnwrap: async (id: Id<Brand>): Promise<number | null> => {
      for (const key of keys) {
        const lookupKey = await tryUnwrapU32(prefix, brand, key, id);
        if (lookupKey !== null) return lookupKey;
      }
      return null;
    },
    exampleWireId: (): Id<Brand> => schemaExample(prefix) as Id<Brand>,
  };
}
