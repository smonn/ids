import type { webcrypto } from "node:crypto";
import type { Id, Prefix } from "../../types.js";
import { hmacSignTruncated } from "../_kernel/crypto.js";
import { len32ByteLength, writeLen32 } from "../_kernel/bytes.js";
import { toWireId } from "../../wire/envelope.js";
import { payloadByteLength } from "../../wire/invariants.js";

const encoder = new TextEncoder();

function buildMessage(
  brandBytes: Uint8Array,
  nsBytes: Uint8Array,
  material: Uint8Array,
): Uint8Array {
  const msgLen =
    len32ByteLength + brandBytes.length + len32ByteLength + nsBytes.length + material.length;
  const message = new Uint8Array(msgLen);
  let offset = 0;
  writeLen32(brandBytes.length, message, offset);
  offset += len32ByteLength;
  message.set(brandBytes, offset);
  offset += brandBytes.length;
  writeLen32(nsBytes.length, message, offset);
  offset += len32ByteLength;
  message.set(nsBytes, offset);
  offset += nsBytes.length;
  message.set(material, offset);
  return message;
}

export function createDigestLayoutOps<Brand extends string>(
  prefix: Prefix<Brand>,
  brand: Brand,
  ns: string,
  hmacKey: webcrypto.CryptoKey,
): {
  digest(material: string | Uint8Array): Promise<Id<Brand>>;
} {
  const brandBytes = encoder.encode(brand);
  const nsBytes = encoder.encode(ns);

  return {
    digest: async (material: string | Uint8Array): Promise<Id<Brand>> => {
      const materialBytes = typeof material === "string" ? encoder.encode(material) : material;
      const message = buildMessage(brandBytes, nsBytes, materialBytes);
      const payload = await hmacSignTruncated(hmacKey, message, payloadByteLength);
      return toWireId(prefix, payload);
    },
  };
}
