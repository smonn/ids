import type { webcrypto } from "node:crypto";
import type { Id, LayoutOps, Prefix, ValidBrand } from "../../types.js";
import { writeLen32 } from "../_kernel/bytes.js";
import { toWireId } from "../../wire/envelope.js";
import { payloadBase32Length, payloadByteLength } from "../../wire/invariants.js";

const encoder = new TextEncoder();

function buildMessage(
  brandBytes: Uint8Array,
  nsBytes: Uint8Array,
  material: Uint8Array,
): Uint8Array {
  const msgLen = 4 + brandBytes.length + 4 + nsBytes.length + material.length;
  const message = new Uint8Array(msgLen);
  let offset = 0;
  writeLen32(brandBytes.length, message, offset);
  offset += 4;
  message.set(brandBytes, offset);
  offset += brandBytes.length;
  writeLen32(nsBytes.length, message, offset);
  offset += 4;
  message.set(nsBytes, offset);
  offset += nsBytes.length;
  message.set(material, offset);
  return message;
}

export function createDigestLayoutOps<Brand extends ValidBrand>(
  prefix: Prefix<Brand>,
  brand: Brand,
  ns: string,
  hmacKey: webcrypto.CryptoKey,
): LayoutOps<Brand> & {
  digest(material: string | Uint8Array): Promise<Id<Brand>>;
} {
  const brandBytes = encoder.encode(brand);
  const nsBytes = encoder.encode(ns);

  return {
    digest: async (material: string | Uint8Array): Promise<Id<Brand>> => {
      const materialBytes = typeof material === "string" ? encoder.encode(material) : material;
      const message = buildMessage(brandBytes, nsBytes, materialBytes);
      const hmacOutput = new Uint8Array(
        await crypto.subtle.sign("HMAC", hmacKey, message as Uint8Array<ArrayBuffer>),
      );
      const payload = hmacOutput.subarray(0, payloadByteLength);
      return toWireId(prefix, payload);
    },
    exampleWireId: (_ms?: number): Id<Brand> =>
      (prefix + "0".repeat(payloadBase32Length)) as Id<Brand>,
  };
}
