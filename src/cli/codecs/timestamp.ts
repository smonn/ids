import { createTimestampId } from "../../codecs/timestamp/index.js";
import { sharedCodecOpts } from "../codec-options.js";
import type { CodecModule } from "../types.js";
import { keylessTimestampInspect, runGenerateKeyless, runInspect } from "../verbs.js";

export const timestampCli: CodecModule = {
  codec: "timestamp",
  verbs: {
    generate: (argv, opts) =>
      runGenerateKeyless((brand, o) => createTimestampId(brand, sharedCodecOpts(o)), argv, opts),
    inspect: (argv, opts) =>
      runInspect(
        keylessTimestampInspect("timestamp", (brand, o) =>
          createTimestampId(brand, sharedCodecOpts(o)),
        ),
        argv,
        opts,
      ),
  },
};
