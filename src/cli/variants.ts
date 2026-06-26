import {
  createDigestId,
  decodeDigestKey,
  encodeDigestKey,
  importDigestKey,
  type DigestKey,
} from "../codecs/digest/index.js";
import {
  createOpaqueTimestampId,
  decodeOpaqueKey,
  encodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKey,
} from "../codecs/opaque/index.js";
import { createReverseTimestampId } from "../codecs/reverse/index.js";
import {
  createSignedTimestampId,
  decodeSigningKey,
  encodeSigningKey,
  importSigningKey,
  type SigningKey,
} from "../codecs/signed/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  createWrappedKeyId,
  decodeWrappingKey,
  encodeWrappingKey,
  importWrappingKey,
  type WrappingKey,
} from "../codecs/wrapped/index.js";
import type { IdCodec } from "../adapters/adapter-types.js";
import type { SafeVerifyResult } from "../codecs/signed/index.js";
import type { Id, StandardSchemaProps } from "../types.js";
import { codecOpts } from "./codec-options.js";
import { isKindError, isNsError, parseKind, parseNs } from "./flags.js";
import { formatCliError, invalidIdPrefix } from "./format.js";
import type { KeyFacet } from "./key-io.js";
import type { RunOpts } from "./types.js";

type InspectCapability =
  | {
      readonly mode: "readable";
      readonly note: string;
      validate(codec: IdCodec<string>, input: string): { value: Id<string> } | { issue: string };
      extractTimestamp(codec: IdCodec<string>, id: Id<string>): Date;
    }
  | {
      readonly mode: "keyed-readable";
      readonly note: string;
      validate(codec: IdCodec<string>, input: string): { value: Id<string> } | { issue: string };
      extractTimestamp(codec: IdCodec<string>, id: Id<string>): Promise<Date>;
    }
  | {
      readonly mode: "unwrap";
      validate(codec: IdCodec<string>, input: string): { value: Id<string> } | { issue: string };
      unwrap(codec: IdCodec<string>, id: Id<string>): Promise<number | bigint>;
    }
  | {
      readonly mode: "verify";
      safeVerify(codec: IdCodec<string>, id: string): Promise<SafeVerifyResult<string>>;
    }
  | { readonly mode: "unsupported" };

function standardValidate(
  codec: IdCodec<string>,
  input: string,
): { value: Id<string> } | { issue: string } {
  const result = (codec as unknown as { "~standard": StandardSchemaProps<string> })[
    "~standard"
  ].validate(input);
  if (result.issues) return { issue: invalidIdPrefix + result.issues[0]!.message };
  return { value: result.value! };
}

export type Descriptor = {
  flag?: string;
  key?: KeyFacet<unknown>;
  construct: (
    brand: string,
    opts: RunOpts,
    key?: unknown,
    values?: Map<string, string>,
  ) => (IdCodec<string> & { generate?(): string | Promise<string> }) | string;
  inspect: InspectCapability;
  extraFlags?: readonly string[];
};

export type GeneratorDescriptor = {
  flag?: string;
  key?: KeyFacet<unknown>;
  construct: (
    brand: string,
    opts: RunOpts,
    key?: unknown,
    values?: Map<string, string>,
  ) => (IdCodec<string> & { generate(): string | Promise<string> }) | string;
  inspect: InspectCapability;
  extraFlags?: readonly string[];
};

export type Policy<D extends Descriptor = Descriptor> = {
  default: D;
  selectable: readonly D[];
  intrinsicFlags: readonly string[];
};

export type GeneratePolicy = Policy<GeneratorDescriptor>;

export const timestampVariant: GeneratorDescriptor = {
  inspect: {
    mode: "readable",
    note: "note: timestamp assumes a plaintext Timestamp ID; if this ID was Opaque-encoded, the timestamp is meaningless — re-run with --opaque and the correct IDS_KEY",
    validate: standardValidate,
    extractTimestamp(codec: IdCodec<string>, id: Id<string>): Date {
      return (codec as unknown as { extractTimestamp(id: Id<string>): Date }).extractTimestamp(id);
    },
  },
  construct(brand, opts) {
    try {
      return createTimestampId(brand, codecOpts(opts));
    } catch (err) {
      return formatCliError(err);
    }
  },
};

export const opaqueVariant: GeneratorDescriptor = {
  flag: "--opaque",
  key: {
    envVar: "IDS_KEY",
    formatEnvVar: "IDS_KEY_FORMAT",
    encode: encodeOpaqueKey,
    decode: decodeOpaqueKey,
    import: importOpaqueKey,
  },
  inspect: {
    mode: "keyed-readable",
    note: "note: timestamp assumes IDS_KEY matches the key used at generation; a wrong key yields a plausible but incorrect timestamp",
    validate: standardValidate,
    extractTimestamp(codec: IdCodec<string>, id: Id<string>): Promise<Date> {
      return (
        codec as unknown as { extractTimestamp(id: Id<string>): Promise<Date> }
      ).extractTimestamp(id);
    },
  },
  construct(brand, opts, key) {
    try {
      return createOpaqueTimestampId(brand, { key: key as OpaqueKey, ...codecOpts(opts) });
    } catch (err) {
      return formatCliError(err);
    }
  },
};

export const reverseVariant: GeneratorDescriptor = {
  flag: "--reverse",
  inspect: {
    mode: "readable",
    note: "note: timestamp assumes a plaintext Timestamp ID; if this ID was Opaque-encoded, the timestamp is meaningless — re-run with --opaque and the correct IDS_KEY",
    validate: standardValidate,
    extractTimestamp(codec: IdCodec<string>, id: Id<string>): Date {
      return (codec as unknown as { extractTimestamp(id: Id<string>): Date }).extractTimestamp(id);
    },
  },
  construct(brand, opts) {
    try {
      return createReverseTimestampId(brand, codecOpts(opts));
    } catch (err) {
      return formatCliError(err);
    }
  },
};

export const wrappedVariant: Descriptor = {
  flag: "--wrapped",
  key: {
    envVar: "IDS_WRAPPING_KEY",
    formatEnvVar: "IDS_WRAPPING_KEY_FORMAT",
    encode: encodeWrappingKey,
    decode: decodeWrappingKey,
    import: importWrappingKey,
  },
  inspect: {
    mode: "unwrap",
    validate: standardValidate,
    unwrap(codec: IdCodec<string>, id: Id<string>): Promise<number | bigint> {
      return (codec as unknown as { unwrap(id: Id<string>): Promise<number | bigint> }).unwrap(id);
    },
  },
  extraFlags: ["--kind"],
  construct(brand, _opts, key, values) {
    const kind = parseKind(values ?? new Map());
    if (kind === undefined) return "--kind is required with --wrapped";
    if (isKindError(kind)) return kind;
    try {
      return createWrappedKeyId(brand, {
        kind,
        keys: [key as WrappingKey],
        allowDuplicateBrand: true,
      });
    } catch (err) {
      return formatCliError(err);
    }
  },
};

export const signedVariant: GeneratorDescriptor = {
  flag: "--signed",
  key: {
    envVar: "IDS_SIGNING_KEY",
    formatEnvVar: "IDS_SIGNING_KEY_FORMAT",
    encode: encodeSigningKey,
    decode: decodeSigningKey,
    import: importSigningKey,
  },
  inspect: {
    mode: "verify",
    safeVerify(codec: IdCodec<string>, id: string): Promise<SafeVerifyResult<string>> {
      return (
        codec as unknown as { safeVerify(id: string): Promise<SafeVerifyResult<string>> }
      ).safeVerify(id);
    },
  },
  construct(brand, opts, key) {
    try {
      return createSignedTimestampId(brand, {
        keys: [key as SigningKey],
        ...codecOpts(opts),
      });
    } catch (err) {
      return formatCliError(err);
    }
  },
};

export const digestVariant: GeneratorDescriptor = {
  flag: "--digest",
  key: {
    envVar: "IDS_DIGEST_KEY",
    formatEnvVar: "IDS_DIGEST_KEY_FORMAT",
    encode: encodeDigestKey,
    decode: decodeDigestKey,
    import: importDigestKey,
  },
  // Digest is one-way: inspect --digest is unsupported by design, so digestVariant is omitted
  // from inspectPolicy.selectable. "unsupported" documents that there is no inspect path.
  inspect: { mode: "unsupported" },
  extraFlags: ["--ns"],
  construct(brand, opts, key, values) {
    const ns = parseNs(values ?? new Map());
    if (ns === undefined) return "--ns is required with --digest";
    if (isNsError(ns)) return ns;
    try {
      const codec = createDigestId(brand, { ns, key: key as DigestKey, allowDuplicateBrand: true });
      return {
        safeParse: (v: unknown) => codec.safeParse(v),
        async generate(): Promise<string> {
          const reader = opts.readStdin ?? (() => Promise.resolve(""));
          const material = await reader();
          return codec.digest(material);
        },
      };
    } catch (err) {
      return formatCliError(err);
    }
  },
};

// Determines which flag name appears first in "cannot use --A and --B together"
// messages when two selectable variant flags conflict. Signed always leads;
// remaining follow registry insertion order (digest, reverse, wrapped, opaque).
export const conflictPriorityOrder: readonly Descriptor[] = [
  signedVariant,
  digestVariant,
  reverseVariant,
  wrappedVariant,
  opaqueVariant,
];

export const generatePolicy: GeneratePolicy = {
  default: timestampVariant,
  selectable: [opaqueVariant, reverseVariant, signedVariant, digestVariant],
  intrinsicFlags: ["--count", "-c"],
};

export const inspectPolicy: Policy = {
  default: timestampVariant,
  selectable: [reverseVariant, wrappedVariant, opaqueVariant, signedVariant],
  intrinsicFlags: [],
};

export const keygenPolicy: Policy = {
  default: opaqueVariant,
  selectable: [wrappedVariant, signedVariant, digestVariant],
  intrinsicFlags: ["--bits"],
};
