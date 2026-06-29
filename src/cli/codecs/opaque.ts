import {
  createOpaqueTimestampId,
  decodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKey,
} from "../../codecs/opaque/index.js";
import { codecOpts } from "../codec-options.js";
import { runtimeError } from "../errors.js";
import type { CodecKey } from "../key.js";
import type { CodecModule } from "../types.js";
import { brandOfId, runGenerateKeyed, runInspect } from "../verbs.js";

const opaqueKey: CodecKey<OpaqueKey> = { decode: decodeOpaqueKey, import: importOpaqueKey };

export const opaqueCli: CodecModule = {
  codec: "opaque",
  verbs: {
    generate: (argv, opts) =>
      runGenerateKeyed(
        opaqueKey,
        (brand, o, key) => createOpaqueTimestampId(brand, { key, ...codecOpts(o) }),
        argv,
        opts,
      ),
    inspect: (argv, opts) =>
      runInspect(
        {
          keyed: true,
          codecKey: opaqueKey,
          prepare: (o, key) => async (id) => {
            const brand = brandOfId(id);
            if (brand === undefined) return runtimeError("invalid_id: not a valid ID");
            const codec = createOpaqueTimestampId(brand, { key: key!, ...codecOpts(o) });
            const parsed = codec.safeParse(id);
            if (!parsed.ok) return runtimeError(`invalid_id: ${parsed.error}`);
            const ts = await codec.extractTimestamp(parsed.id);
            return {
              shape: "timestamp",
              brand,
              codec: "opaque",
              ms: ts.getTime(),
              uuid: codec.toUUID(parsed.id),
            };
          },
        },
        argv,
        opts,
      ),
  },
};
