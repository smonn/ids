import type { webcrypto } from "node:crypto";
import type { Id, Prefix } from "../../types.js";
import { decryptPayload, encryptPayload } from "../_kernel/crypto.js";
import { payloadBytesFromId, toWireId } from "../../wire/envelope.js";
import { payloadBase32Length, payloadByteLength } from "../../wire/invariants.js";
import {
  readTimestampMs,
  timestampByteLength,
  writeTimestamp,
} from "../../wire/timestamp-bytes.js";

function buildPlaintext(ms: number, rng: (target: Uint8Array) => void): Uint8Array {
  const plaintext = new Uint8Array(payloadByteLength);
  writeTimestamp(ms, plaintext);
  rng(plaintext.subarray(timestampByteLength, payloadByteLength));
  return plaintext;
}

async function extractTimestampFromId<Brand extends string>(
  prefix: Prefix<Brand>,
  key: webcrypto.CryptoKey,
  id: Id<Brand>,
): Promise<Date> {
  const plaintext = await decryptPayload(key, payloadBytesFromId(prefix, id));
  return new Date(readTimestampMs(plaintext));
}

/** Produces a canonical encrypted wire ID. Per-call plaintext/ciphertext buffers —
 * subtle dominates this path; reuse would be safe but not worth pinning to spec detail. */
async function generateWireId<Brand extends string>(
  prefix: Prefix<Brand>,
  key: webcrypto.CryptoKey,
  rng: (target: Uint8Array) => void,
  ms: number,
): Promise<Id<Brand>> {
  const plaintext = buildPlaintext(ms, rng);
  const encrypted = await encryptPayload(key, plaintext);
  return toWireId(prefix, encrypted);
}

/** Structural placeholder for JSON Schema (encrypt is async). */
function schemaExample<Brand extends string>(prefix: Prefix<Brand>): string {
  return prefix + "0".repeat(payloadBase32Length);
}

/** Layout ops binder for the Opaque Timestamp variant. `extractTimestampFromId` is module-private; the binder exposes `extractTimestamp` for the codec constructor. */
export function createOpaqueLayoutOps<Brand extends string>(
  prefix: Prefix<Brand>,
  key: webcrypto.CryptoKey,
  rng: (target: Uint8Array) => void,
) {
  return {
    generateAt: (ms: number): Promise<Id<Brand>> => generateWireId(prefix, key, rng, ms),
    extractTimestamp: (id: Id<Brand>): Promise<Date> => extractTimestampFromId(prefix, key, id),
    exampleWireId: (): Id<Brand> => schemaExample(prefix) as Id<Brand>,
  };
}
