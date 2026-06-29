import { createTimestampId } from "../../codecs/timestamp/index.js";
import { codecOpts } from "../codec-options.js";
import { isCliError, runtimeError } from "../errors.js";
import type { CodecModule } from "../types.js";
import { brandOfId, runGenerateKeyless, runInspect } from "../verbs.js";

export const timestampCli: CodecModule = {
  codec: "timestamp",
  verbs: {
    generate: (argv, opts) =>
      runGenerateKeyless((brand, o) => createTimestampId(brand, codecOpts(o)), argv, opts),
    inspect: (argv, opts) =>
      runInspect(
        {
          keyed: false,
          prepare: (o) => (id) => {
            const brand = brandOfId(id);
            if (isCliError(brand)) return Promise.resolve(brand);
            const codec = createTimestampId(brand, codecOpts(o));
            const parsed = codec.safeParse(id);
            if (!parsed.ok) return Promise.resolve(runtimeError(`invalid_id: ${parsed.error}`));
            const ts = codec.extractTimestamp(parsed.id);
            return Promise.resolve({
              shape: "timestamp",
              brand,
              codec: "timestamp",
              ms: ts.getTime(),
              uuid: codec.toUUID(parsed.id),
            });
          },
        },
        argv,
        opts,
      ),
  },
};
