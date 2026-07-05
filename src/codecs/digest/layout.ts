import type { webcrypto } from "node:crypto";
import type { Id, Prefix } from "../../types.js";
import { hmacSignTruncated } from "../_kernel/crypto.js";
import { len32ByteLength, writeLen32 } from "../_kernel/bytes.js";
import { toWireId } from "../../wire/envelope.js";
import { payloadByteLength } from "../../wire/invariants.js";

const encoder = new TextEncoder();

/**
 * Precomputed HMAC-message template for a fixed (brand, ns) pair.
 *
 * The message is `len32(brand) ‖ brand ‖ len32(ns) ‖ ns ‖ material`. Everything
 * except the trailing variable-length material is constant for the life of the
 * codec, so we build the prefix once at construction. `brand`/`ns` are never
 * re-encoded and no `writeLen32` call occurs on the `digest()` hot path.
 */
type DigestMessageTemplate = {
  /** Constant prefix buffer: `len32(brand) ‖ brand ‖ len32(ns) ‖ ns`. */
  readonly prefix: Uint8Array;
};

function createDigestMessageTemplate(brand: string, ns: string): DigestMessageTemplate {
  const brandBytes = encoder.encode(brand);
  const nsBytes = encoder.encode(ns);
  const prefixLen = len32ByteLength + brandBytes.length + len32ByteLength + nsBytes.length;
  const prefix = new Uint8Array(prefixLen);
  let offset = 0;
  writeLen32(brandBytes.length, prefix, offset);
  offset += len32ByteLength;
  prefix.set(brandBytes, offset);
  offset += brandBytes.length;
  writeLen32(nsBytes.length, prefix, offset);
  offset += len32ByteLength;
  prefix.set(nsBytes, offset);
  return { prefix };
}

/** Materialise the HMAC message for `material`. Fresh buffer per call → safe under concurrent async signs. */
function digestMessage(template: DigestMessageTemplate, material: Uint8Array): Uint8Array {
  const message = new Uint8Array(template.prefix.length + material.length);
  message.set(template.prefix, 0);
  message.set(material, template.prefix.length);
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
  const template = createDigestMessageTemplate(brand, ns);

  return {
    digest: async (material: string | Uint8Array): Promise<Id<Brand>> => {
      const materialBytes = typeof material === "string" ? encoder.encode(material) : material;
      const message = digestMessage(template, materialBytes);
      const payload = await hmacSignTruncated(hmacKey, message, payloadByteLength);
      return toWireId(prefix, payload);
    },
  };
}
