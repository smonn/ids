// Thin re-export layer over the real @smonn/ids library so the playground UI
// stays declarative. Every operation here runs the published codecs in the
// browser via WebCrypto — nothing is mocked or stubbed.
import { isIdsError } from "@smonn/ids";
import {
  createDigestId,
  decodeDigestKey,
  encodeDigestKey,
  importDigestKey,
} from "@smonn/ids/digest";
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

export type CodecId = "timestamp" | "reverse" | "signed" | "opaque" | "wrapped" | "digest";

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
  {
    id: "digest",
    label: "Digest",
    keyed: true,
    blurb: "Map caller material to a stable public ID. One-way — the material can't be recovered.",
  },
];

export const WRAPPED_KINDS: WrappedKind[] = ["u32", "i32", "u64", "i64"];

/** Fresh random key material bytes for the given size. */
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
  createDigestId,
  createOpaqueTimestampId,
  createReverseTimestampId,
  createSignedTimestampId,
  createTimestampId,
  createWrappedKeyId,
  decodeDigestKey,
  decodeOpaqueKey,
  decodeSigningKey,
  decodeWrappingKey,
  encodeDigestKey,
  encodeOpaqueKey,
  encodeSigningKey,
  encodeWrappingKey,
  importDigestKey,
  importOpaqueKey,
  importSigningKey,
  importWrappingKey,
  type WrappedKind,
};
