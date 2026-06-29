import { createReverseTimestampId } from "../../codecs/reverse/index.js";
import { codecOpts } from "../codec-options.js";
import type { CodecModule } from "../types.js";
import { keylessTimestampInspect, runGenerateKeyless, runInspect } from "../verbs.js";

export const reverseCli: CodecModule = {
  codec: "reverse",
  verbs: {
    generate: (argv, opts) =>
      runGenerateKeyless((brand, o) => createReverseTimestampId(brand, codecOpts(o)), argv, opts),
    inspect: (argv, opts) =>
      runInspect(
        keylessTimestampInspect("reverse", (brand, o) =>
          createReverseTimestampId(brand, codecOpts(o)),
        ),
        argv,
        opts,
      ),
  },
};
