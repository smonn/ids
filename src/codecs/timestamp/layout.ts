import type { Id, LayoutOps, Prefix } from "../../types.js";
import { toWireId } from "../../wire/envelope.js";
import { payloadByteLength } from "../../wire/invariants.js";
import {
  readTimestampMsFromBase32Suffix,
  timestampByteLength,
  writeTimestamp,
} from "../../wire/timestamp-bytes.js";

const randomByteLength: number = payloadByteLength - timestampByteLength;

/** Writes a 16-byte timestamp-layout payload into codec-owned scratch. */
function buildPayload(
  ms: number,
  rng: (target: Uint8Array) => void,
  buffer: Uint8Array,
  randomView: Uint8Array,
): void {
  writeTimestamp(ms, buffer);
  rng(randomView);
}

/** Writes sentinel min/max random bytes into codec-owned scratch. */
function buildSentinelPayload(
  ms: number,
  fill: number,
  buffer: Uint8Array,
  randomView: Uint8Array,
): void {
  writeTimestamp(ms, buffer);
  randomView.fill(fill);
}

/** Decodes the creation timestamp from a trusted wire ID. */
function extractTimestampFromId<Brand extends string>(prefix: Prefix<Brand>, id: Id<Brand>): Date {
  return new Date(readTimestampMsFromBase32Suffix(id.slice(prefix.length)));
}

/** Layout ops binder for the Timestamp variant. `extractTimestampFromId` is module-private; the binder exposes `extractTimestamp` for the codec constructor. */
export function createTimestampLayoutOps<Brand extends string>(
  prefix: Prefix<Brand>,
  rng: (target: Uint8Array) => void,
): LayoutOps<Brand> & {
  generateAt(ms: number): Id<Brand>;
  extractTimestamp(id: Id<Brand>): Date;
  minIdForTime(ms: number): Id<Brand>;
  maxIdForTime(ms: number): Id<Brand>;
} {
  // Per-codec scratch buffer. Shared across generateAt(), minIdForTime(),
  // maxIdForTime(), and exampleWireId() — all are synchronous and overwrite both
  // the timestamp and random slices before encoding, so successive callers see
  // their own freshly-written bytes. toWireId reads the buffer and returns an
  // independent string, so the caller never sees the buffer itself.
  const buffer = new Uint8Array(payloadByteLength);
  const randomView = new Uint8Array(buffer.buffer, timestampByteLength, randomByteLength);

  return {
    generateAt: (ms: number): Id<Brand> => {
      buildPayload(ms, rng, buffer, randomView);
      return toWireId(prefix, buffer);
    },
    extractTimestamp: (id: Id<Brand>): Date => extractTimestampFromId(prefix, id),
    minIdForTime: (ms: number): Id<Brand> => {
      buildSentinelPayload(ms, 0x00, buffer, randomView);
      return toWireId(prefix, buffer);
    },
    maxIdForTime: (ms: number): Id<Brand> => {
      buildSentinelPayload(ms, 0xff, buffer, randomView);
      return toWireId(prefix, buffer);
    },
    exampleWireId: (ms?: number): Id<Brand> => {
      buildPayload(ms ?? Date.now(), rng, buffer, randomView);
      return toWireId(prefix, buffer);
    },
  };
}
