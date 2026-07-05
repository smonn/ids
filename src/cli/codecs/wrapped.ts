import {
  createWrappedKeyId,
  decodeWrappingKey,
  importWrappingKey,
  type WrappedKind,
  type WrappingKey,
} from "../../codecs/wrapped/index.js";
import { sharedCodecOpts } from "../codec-options.js";
import { isCliError, runtimeError } from "../errors.js";
import type { CodecKey } from "../key.js";
import type { CodecModule } from "../types.js";
import { requireBrand, runInspect, runWrap } from "../verbs.js";
import { parseKind } from "../flags.js";

const wrappingKey: CodecKey<WrappingKey> = { decode: decodeWrappingKey, import: importWrappingKey };
const trialKinds: readonly WrappedKind[] = ["u32", "i32", "u64", "i64"];

export const wrappedCli: CodecModule = {
  codec: "wrapped",
  verbs: {
    wrap: (argv, opts) =>
      runWrap(
        wrappingKey,
        (brand, key, kind) =>
          createWrappedKeyId(brand, { kind, keys: [key], ...sharedCodecOpts(opts) }),
        argv,
        opts,
      ),
    inspect: (argv, opts) =>
      runInspect(
        {
          keyed: true,
          codecKey: wrappingKey,
          extraFlags: [{ name: "--kind", value: true }],
          // --kind is validated once here (not per ID), so a bad --kind is a single
          // usage error rather than a per-line failure in a batch.
          prepare: (o, key, values) => {
            const kindOpt = parseKind(values);
            if (kindOpt !== undefined && isCliError(kindOpt)) return kindOpt;
            const kinds: readonly WrappedKind[] = kindOpt === undefined ? trialKinds : [kindOpt];

            return async (id) => {
              const brand = requireBrand(id);
              if (typeof brand !== "string") return brand;
              for (const kind of kinds) {
                const codec = createWrappedKeyId(brand, {
                  kind,
                  keys: [key],
                  ...sharedCodecOpts(o),
                });
                const result = await codec.safeUnwrap(id);
                if (result.ok) {
                  return {
                    shape: "wrapped",
                    brand,
                    codec: "wrapped",
                    value: result.lookupKey,
                    kind,
                    uuid: codec.toUUID(result.id),
                  };
                }
                // A structural parse error is the same for every kind — fail fast.
                if (result.error !== "verification_failed") {
                  return runtimeError(`invalid_id: ${result.error}`);
                }
              }
              return runtimeError("verification_failed: no key/kind matches this id");
            };
          },
        },
        argv,
        opts,
      ),
  },
};
