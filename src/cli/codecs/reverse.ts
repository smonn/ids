import { createReverseTimestampId } from "../../codecs/reverse/index.js";
import { sharedCodecOpts } from "../codec-options.js";
import type { CodecModule } from "../types.js";
import { keylessTimestampInspect, runGenerateKeyless, runInspect } from "../verbs.js";

export const reverseCli: CodecModule = {
  codec: "reverse",
  verbs: {
    generate: (argv, opts) =>
      runGenerateKeyless(
        (brand, o) => createReverseTimestampId(brand, sharedCodecOpts(o)),
        argv,
        opts,
      ),
    inspect: (argv, opts) =>
      runInspect(
        keylessTimestampInspect("reverse", (brand, o) =>
          createReverseTimestampId(brand, sharedCodecOpts(o)),
        ),
        argv,
        opts,
      ),
  },
};
