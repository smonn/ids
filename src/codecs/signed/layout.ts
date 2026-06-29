import type { webcrypto } from "node:crypto";
import type { Id, LayoutOps, Prefix } from "../../types.js";
import { hmacSignTruncated, timingSafeEqual } from "../_kernel/crypto.js";
import { payloadBytesFromId, toWireId } from "../../wire/envelope.js";
import { payloadBase32Length, payloadByteLength } from "../../wire/invariants.js";
import {
  readTimestampMsFromBase32Suffix,
  timestampByteLength,
  writeTimestamp,
} from "../../wire/timestamp-bytes.js";

const randomByteLength = 5;
const tagByteLength = 5;
type Equals<A, B> = A extends B ? (B extends A ? true : never) : never;
const _signedByteCheck: Equals<typeof payloadByteLength, 16> = true; // timestampByteLength(6) + randomByteLength(5) + tagByteLength(5)
void _signedByteCheck;
const randomOffset = timestampByteLength; // 6
const tagOffset = randomOffset + randomByteLength; // 11
const signedContentByteLength = randomOffset + randomByteLength; // 11 (ts6 ‖ rand5)

async function computeTag(
  hmacKey: webcrypto.CryptoKey,
  brandBytes: Uint8Array,
  signedContent: Uint8Array,
): Promise<Uint8Array> {
  const message = new Uint8Array(brandBytes.length + signedContent.length);
  message.set(brandBytes, 0);
  message.set(signedContent, brandBytes.length);
  return hmacSignTruncated(hmacKey, message, tagByteLength);
}

export function createSignedTimestampLayoutOps<Brand extends string>(
  prefix: Prefix<Brand>,
  brand: Brand,
  rng: (target: Uint8Array) => void,
  hmacKeys: readonly webcrypto.CryptoKey[],
): LayoutOps<Brand> & {
  generateAt(ms: number): Promise<Id<Brand>>;
  tryVerify(id: Id<Brand>): Promise<boolean>;
  extractTimestamp(id: Id<Brand>): Date;
  minIdForTime(ms: number): Id<Brand>;
  maxIdForTime(ms: number): Id<Brand>;
} {
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
      const message = new Uint8Array(brandBytes.length + signedContentByteLength);
      message.set(brandBytes, 0);
      message.set(signedContent, brandBytes.length);
      // Accepted timing leak: early-return on first keyring match reveals the
      // matching key's position (rotation epoch). This is inherent to ordered-ring
      // trial and accepted — see docs/adr/0012-signed-timestamp-construction.md.
      for (const hmacKey of hmacKeys) {
        const expected = await hmacSignTruncated(hmacKey, message, tagByteLength);
        if (timingSafeEqual(storedTag, expected)) return true;
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
    exampleWireId: (_ms?: number): Id<Brand> =>
      (prefix + "0".repeat(payloadBase32Length)) as Id<Brand>,
  };
}
