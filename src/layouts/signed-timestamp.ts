import type { Id, Prefix } from "../types.js";
import { payloadBytesFromId, toWireId } from "../wire/envelope.js";
import { payloadBase32Length, payloadByteLength } from "../wire/invariants.js";
import {
  readTimestampMsFromBase32Suffix,
  timestampByteLength,
  writeTimestamp,
} from "../wire/timestamp-bytes.js";

const randomByteLength = 5;
const tagByteLength = 5;
const randomOffset = timestampByteLength; // 6
const tagOffset = randomOffset + randomByteLength; // 11
const signedContentByteLength = randomOffset + randomByteLength; // 11 (ts6 ‖ rand5)

async function computeTag(
  hmacKey: CryptoKey,
  brandBytes: Uint8Array,
  signedContent: Uint8Array,
): Promise<Uint8Array> {
  const message = new Uint8Array(brandBytes.length + signedContent.length);
  message.set(brandBytes, 0);
  message.set(signedContent, brandBytes.length);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, message as Uint8Array<ArrayBuffer>),
  );
  return signature.subarray(0, tagByteLength);
}

function tagsEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function createSignedTimestampLayoutOps<Brand extends string>(
  prefix: Prefix<Brand>,
  brand: Brand,
  rng: (target: Uint8Array) => void,
  hmacKeys: readonly CryptoKey[],
) {
  const signKey = hmacKeys[0]!;
  const brandBytes = new TextEncoder().encode(brand);
  const syncBuffer = new Uint8Array(payloadByteLength);

  return {
    generateAt: async (ms: number): Promise<Id<Brand>> => {
      const buffer = new Uint8Array(payloadByteLength);
      writeTimestamp(ms, buffer);
      rng(buffer.subarray(randomOffset, tagOffset));
      const tag = await computeTag(
        signKey,
        brandBytes,
        buffer.subarray(0, signedContentByteLength),
      );
      buffer.set(tag, tagOffset);
      return toWireId(prefix, buffer);
    },
    tryVerify: async (id: Id<Brand>): Promise<boolean> => {
      const payload = payloadBytesFromId(prefix, id);
      const storedTag = payload.subarray(tagOffset, payloadByteLength);
      const signedContent = payload.subarray(0, signedContentByteLength);
      for (const hmacKey of hmacKeys) {
        const expected = await computeTag(hmacKey, brandBytes, signedContent);
        if (tagsEqual(storedTag, expected)) return true;
      }
      return false;
    },
    extractTimestamp: (id: Id<Brand>): Date =>
      new Date(readTimestampMsFromBase32Suffix(id.slice(prefix.length))),
    minIdForTime: (ms: number): Id<Brand> => {
      writeTimestamp(ms, syncBuffer);
      syncBuffer.fill(0x00, randomOffset, payloadByteLength);
      return toWireId(prefix, syncBuffer);
    },
    maxIdForTime: (ms: number): Id<Brand> => {
      writeTimestamp(ms, syncBuffer);
      syncBuffer.fill(0xff, randomOffset, payloadByteLength);
      return toWireId(prefix, syncBuffer);
    },
    exampleWireId: (): Id<Brand> => (prefix + "0".repeat(payloadBase32Length)) as Id<Brand>,
  };
}
