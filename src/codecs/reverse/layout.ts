import type { Id, LayoutOps, Prefix, ValidBrand } from "../../types.js";
import { payloadBytesFromId, toWireId } from "../../wire/envelope.js";
import { payloadByteLength } from "../../wire/invariants.js";
import { timestampByteLength, writeTimestamp } from "../../wire/timestamp-bytes.js";

const randomByteLength: number = payloadByteLength - timestampByteLength;

/** Writes inverted timestamp bytes, then fills random portion. */
function buildReversePayload(
  ms: number,
  rng: (target: Uint8Array) => void,
  buffer: Uint8Array,
  randomView: Uint8Array,
): void {
  writeTimestamp(ms, buffer);
  for (let i = 0; i < timestampByteLength; i++) {
    buffer[i] = ~buffer[i]! & 0xff;
  }
  rng(randomView);
}

/** Writes inverted timestamp bytes, then fills random portion with a sentinel. */
function buildReverseSentinelPayload(
  ms: number,
  fill: number,
  buffer: Uint8Array,
  randomView: Uint8Array,
): void {
  writeTimestamp(ms, buffer);
  for (let i = 0; i < timestampByteLength; i++) {
    buffer[i] = ~buffer[i]! & 0xff;
  }
  randomView.fill(fill);
}

/** Decodes the original timestamp by inverting the first 6 payload bytes. */
function extractReverseTimestampFromId<Brand extends ValidBrand>(
  prefix: Prefix<Brand>,
  id: Id<Brand>,
): Date {
  const bytes = payloadBytesFromId(prefix, id);
  let ms = 0;
  for (let i = 0; i < timestampByteLength; i++) {
    ms = ms * 256 + (~bytes[i]! & 0xff);
  }
  return new Date(ms);
}

/** Layout ops binder for the Reverse Timestamp variant. */
export function createReverseTimestampLayoutOps<Brand extends ValidBrand>(
  prefix: Prefix<Brand>,
  rng: (target: Uint8Array) => void,
): LayoutOps<Brand> & {
  generateAt(ms: number): Id<Brand>;
  extractTimestamp(id: Id<Brand>): Date;
  minIdForTime(ms: number): Id<Brand>;
  maxIdForTime(ms: number): Id<Brand>;
} {
  const buffer = new Uint8Array(payloadByteLength);
  const randomView = new Uint8Array(buffer.buffer, timestampByteLength, randomByteLength);

  return {
    generateAt: (ms: number): Id<Brand> => {
      buildReversePayload(ms, rng, buffer, randomView);
      return toWireId(prefix, buffer);
    },
    extractTimestamp: (id: Id<Brand>): Date => extractReverseTimestampFromId(prefix, id),
    minIdForTime: (ms: number): Id<Brand> => {
      buildReverseSentinelPayload(ms, 0x00, buffer, randomView);
      return toWireId(prefix, buffer);
    },
    maxIdForTime: (ms: number): Id<Brand> => {
      buildReverseSentinelPayload(ms, 0xff, buffer, randomView);
      return toWireId(prefix, buffer);
    },
    exampleWireId: (ms?: number): Id<Brand> => {
      buildReversePayload(ms ?? Date.now(), rng, buffer, randomView);
      return toWireId(prefix, buffer);
    },
  };
}
