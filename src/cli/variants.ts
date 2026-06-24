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
import { codecOpts } from "./codec-options.js";
import { isKindError, isNsError, parseKind, parseNs } from "./flags.js";
import { formatCliError } from "./format.js";
import type { KeyFacet } from "./key-io.js";
import type { RunOpts } from "./types.js";

type InspectMode = "readable" | "keyed-readable" | "unwrap" | "verify" | "unsupported";

export type Descriptor = {
  flag?: string;
  key?: KeyFacet<unknown>;
  construct: (
    brand: string,
    opts: RunOpts,
    key?: unknown,
    values?: Map<string, string>,
  ) => (IdCodec<string> & { generate?(): string | Promise<string> }) | string;
  inspectMode: InspectMode;
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
  inspectMode: InspectMode;
  extraFlags?: readonly string[];
};

export type Policy<D extends Descriptor = Descriptor> = {
  default: D;
  selectable: readonly D[];
  intrinsicFlags: readonly string[];
};

export type GeneratePolicy = Policy<GeneratorDescriptor>;

export const timestampVariant: GeneratorDescriptor = {
  inspectMode: "readable",
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
  inspectMode: "keyed-readable",
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
  inspectMode: "readable",
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
  inspectMode: "unwrap",
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
  inspectMode: "verify",
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
  inspectMode: "unsupported",
  extraFlags: ["--ns"],
  construct(brand, opts, key, values) {
    const ns = parseNs(values ?? new Map());
    if (ns === undefined) return "--ns is required with --digest";
    if (isNsError(ns)) return ns;
    try {
      const codec = createDigestId(brand, { ns, key: key as DigestKey, allowDuplicateBrand: true });
      return {
        safeParse: (v: unknown) => codec.safeParse(v),
        generate(): Promise<string> {
          const reader = opts.readStdin ?? (() => Promise.resolve(""));
          return reader().then((material) => codec.digest(material));
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
