import type { Id, Prefix } from "../../types.js";
import { toWireId } from "../../wire/envelope.js";
import { payloadByteLength } from "../../wire/invariants.js";
import {
  readTimestampMsFromBase32Suffix,
  timestampByteLength,
  writeTimestamp,
} from "../../wire/timestamp-bytes.js";

const randomByteLength: number = payloadByteLength - timestampByteLength;

/** Decodes the creation timestamp from a trusted wire ID. */
function extractTimestampFromId<Brand extends string>(prefix: Prefix<Brand>, id: Id<Brand>): Date {
  return new Date(readTimestampMsFromBase32Suffix(id.slice(prefix.length)));
}

/** Layout ops binder for the Timestamp variant. `extractTimestampFromId` is module-private; the binder exposes `extractTimestamp` for the codec constructor. */
export function createTimestampLayoutOps<Brand extends string>(
  prefix: Prefix<Brand>,
  rng: (target: Uint8Array) => void,
): {
  generateAt(ms: number): Id<Brand>;
  extractTimestamp(id: Id<Brand>): Date;
  minIdForTime(ms: number): Id<Brand>;
  maxIdForTime(ms: number): Id<Brand>;
} {
  // Per-codec scratch buffer. Shared across generateAt(), minIdForTime(), and
  // maxIdForTime() — all are synchronous and overwrite both the timestamp and
  // random slices before encoding, so successive callers see their own
  // freshly-written bytes. toWireId reads the buffer and returns an independent
  // string, so the caller never sees the buffer itself.
  const buffer = new Uint8Array(payloadByteLength);
  const randomView = new Uint8Array(buffer.buffer, timestampByteLength, randomByteLength);

  return {
    generateAt: (ms: number): Id<Brand> => {
      writeTimestamp(ms, buffer);
      rng(randomView);
      return toWireId(prefix, buffer);
    },
    extractTimestamp: (id: Id<Brand>): Date => extractTimestampFromId(prefix, id),
    minIdForTime: (ms: number): Id<Brand> => {
      writeTimestamp(ms, buffer);
      randomView.fill(0x00);
      return toWireId(prefix, buffer);
    },
    maxIdForTime: (ms: number): Id<Brand> => {
      writeTimestamp(ms, buffer);
      randomView.fill(0xff);
      return toWireId(prefix, buffer);
    },
  };
}
