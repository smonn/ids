import type { Id, Prefix } from "../types.js";
import { payloadByteLength, readTimestampMsFromId, toWireId } from "../wire/envelope.js";
import { timestampByteLength, writeTimestamp } from "../wire/timestamp-bytes.js";

export const randomByteLength: number = payloadByteLength - timestampByteLength;

/** Writes a 16-byte timestamp-layout payload into factory-owned scratch. */
export function buildPayload(
  ms: number,
  rng: (target: Uint8Array) => void,
  buffer: Uint8Array,
  randomView: Uint8Array,
): void {
  writeTimestamp(ms, buffer);
  rng(randomView);
}

/** Writes sentinel min/max random bytes into factory-owned scratch. */
export function buildSentinelPayload(
  ms: number,
  fill: number,
  buffer: Uint8Array,
  randomView: Uint8Array,
): void {
  writeTimestamp(ms, buffer);
  randomView.fill(fill);
}

/** Decodes the creation timestamp from a trusted wire ID. */
export function extractTimestampFromId<Brand extends string>(
  prefix: Prefix<Brand>,
  id: Id<Brand>,
): Date {
  return new Date(readTimestampMsFromId(prefix, id));
}

/** Encodes scratch buffer contents as a canonical wire ID. */
export function toWireIdFromBuffer<Brand extends string>(
  prefix: Prefix<Brand>,
  buffer: Uint8Array,
): Id<Brand> {
  return toWireId(prefix, buffer);
}
