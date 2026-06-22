// Thin re-export layer over the real @smonn/ids library so the playground UI
// stays declarative. Every operation here runs the published codecs in the
// browser via WebCrypto — nothing is mocked or stubbed.
import { isIdsError } from "@smonn/ids";
import {
  createOpaqueTimestampId,
  decodeOpaqueKey,
  encodeOpaqueKey,
  importOpaqueKey,
} from "@smonn/ids/opaque";
import { createReverseTimestampId } from "@smonn/ids/reverse";
import {
  createSignedTimestampId,
  decodeSigningKey,
  encodeSigningKey,
  importSigningKey,
} from "@smonn/ids/signed";
import { createTimestampId } from "@smonn/ids";
import {
  createWrappedKeyId,
  decodeWrappingKey,
  encodeWrappingKey,
  importWrappingKey,
  type WrappedKind,
} from "@smonn/ids/wrapped";

export type CodecId = "timestamp" | "reverse" | "signed" | "opaque" | "wrapped";

export const CODECS: { id: CodecId; label: string; keyed: boolean; blurb: string }[] = [
  {
    id: "timestamp",
    label: "Timestamp",
    keyed: false,
    blurb: "Plaintext, oldest-first sortable. The default codec.",
  },
  {
    id: "reverse",
    label: "Reverse Timestamp",
    keyed: false,
    blurb: "Plaintext, newest-first sortable for descending range scans.",
  },
  {
    id: "signed",
    label: "Signed Timestamp",
    keyed: true,
    blurb: "Readable timestamp plus a tamper-evident HMAC tag. Verifiable offline.",
  },
  {
    id: "opaque",
    label: "Opaque Timestamp",
    keyed: true,
    blurb: "Same wire shape, timestamp AES-encrypted under your key.",
  },
  {
    id: "wrapped",
    label: "Wrapped key",
    keyed: true,
    blurb: "Wrap a u32/i32/u64/i64 lookup key into a verifiable public ID.",
  },
];

export const WRAPPED_KINDS: WrappedKind[] = ["u32", "i32", "u64", "i64"];

/** A fresh random AES key as raw bytes for the given key size. */
export function randomKeyBytes(bits: 128 | 192 | 256 = 256): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(bits / 8));
}

/** Human-readable message for any thrown value, naming IdsError codes. */
export function describeError(err: unknown): string {
  if (isIdsError(err)) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export {
  createOpaqueTimestampId,
  createReverseTimestampId,
  createSignedTimestampId,
  createTimestampId,
  createWrappedKeyId,
  decodeOpaqueKey,
  decodeSigningKey,
  decodeWrappingKey,
  encodeOpaqueKey,
  encodeSigningKey,
  encodeWrappingKey,
  importOpaqueKey,
  importSigningKey,
  importWrappingKey,
  isIdsError,
  type WrappedKind,
};
