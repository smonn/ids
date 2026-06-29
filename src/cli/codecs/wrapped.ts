import {
  createWrappedKeyId,
  decodeWrappingKey,
  importWrappingKey,
  type WrappedKind,
  type WrappingKey,
} from "../../codecs/wrapped/index.js";
import { isCliError, runtimeError, usageError } from "../errors.js";
import type { CodecKey } from "../key.js";
import type { CodecModule } from "../types.js";
import { brandOfId, runInspect, runWrap } from "../verbs.js";
import { isKindError, parseKind } from "../flags.js";

const wrappingKey: CodecKey<WrappingKey> = { decode: decodeWrappingKey, import: importWrappingKey };
const trialKinds: readonly WrappedKind[] = ["u32", "i32", "u64", "i64"];

export const wrappedCli: CodecModule = {
  codec: "wrapped",
  verbs: {
    wrap: (argv, opts) =>
      runWrap(
        wrappingKey,
        (brand, key, kind) =>
          createWrappedKeyId(brand, { kind, keys: [key], allowDuplicateBrand: true }),
        argv,
        opts,
      ),
    inspect: (argv, opts) =>
      runInspect(
        {
          keyed: true,
          codecKey: wrappingKey,
          extraFlags: [{ name: "--kind", value: true }],
          prepare: (_o, key, values) => async (id) => {
            const brand = brandOfId(id);
            if (isCliError(brand)) return brand;

            const kindOpt = parseKind(values);
            let kinds: readonly WrappedKind[];
            if (kindOpt === undefined) {
              kinds = trialKinds;
            } else if (isKindError(kindOpt)) {
              return usageError(kindOpt);
            } else {
              kinds = [kindOpt];
            }

            for (const kind of kinds) {
              const codec = createWrappedKeyId(brand, {
                kind,
                keys: [key!],
                allowDuplicateBrand: true,
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
          },
        },
        argv,
        opts,
      ),
  },
};
