import {
  createOpaqueTimestampId,
  decodeOpaqueKey,
  encodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKey,
} from "../opaque.js";
import { createReverseTimestampId } from "../reverse.js";
import {
  createSignedTimestampId,
  decodeSigningKey,
  encodeSigningKey,
  importSigningKey,
  type SigningKey,
} from "../signed.js";
import { createTimestampId } from "../timestamp.js";
import {
  createWrappedKeyId,
  decodeWrappingKey,
  encodeWrappingKey,
  importWrappingKey,
  type WrappingKey,
} from "../wrapped.js";
import type { IdCodec } from "../adapter-types.js";
import { codecOpts } from "./codec-options.js";
import { isKindError, parseKind } from "./flags.js";
import { formatCliError } from "./format.js";
import type { KeyFacet } from "./key-io.js";
import type { RunOpts } from "./types.js";

type InspectMode = "readable" | "keyed-readable" | "unwrap" | "verify";

export type Descriptor = {
  flag?: string;
  key?: KeyFacet<unknown>;
  construct: (
    brand: string,
    opts: RunOpts,
    key?: unknown,
    values?: Map<string, string>,
  ) => IdCodec<string> | string;
  inspectMode: InspectMode;
  extraFlags?: readonly string[];
};

export type Policy = {
  default: Descriptor;
  selectable: readonly Descriptor[];
  intrinsicFlags: readonly string[];
};

export const timestampVariant: Descriptor = {
  inspectMode: "readable",
  construct(brand, opts) {
    try {
      return createTimestampId(brand, codecOpts(opts));
    } catch (err) {
      return formatCliError(err);
    }
  },
};

export const opaqueVariant: Descriptor = {
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

export const reverseVariant: Descriptor = {
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

export const signedVariant: Descriptor = {
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
        allowDuplicateBrand: true,
        ...codecOpts(opts),
      });
    } catch (err) {
      return formatCliError(err);
    }
  },
};

// Determines which flag name appears first in "cannot use --A and --B together"
// messages when two selectable variant flags conflict. Signed always leads;
// remaining three follow registry insertion order (reverse, wrapped, opaque).
export const conflictPriorityOrder: readonly Descriptor[] = [
  signedVariant,
  reverseVariant,
  wrappedVariant,
  opaqueVariant,
];

export const generatePolicy: Policy = {
  default: timestampVariant,
  selectable: [opaqueVariant, reverseVariant, signedVariant],
  intrinsicFlags: ["--count", "-c"],
};

export const inspectPolicy: Policy = {
  default: timestampVariant,
  selectable: [reverseVariant, wrappedVariant, opaqueVariant, signedVariant],
  intrinsicFlags: [],
};

export const keygenPolicy: Policy = {
  default: opaqueVariant,
  selectable: [wrappedVariant, signedVariant],
  intrinsicFlags: ["--bits"],
};
