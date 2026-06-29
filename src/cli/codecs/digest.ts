import {
  createDigestId,
  decodeDigestKey,
  type DigestKey,
  importDigestKey,
} from "../../codecs/digest/index.js";
import { sharedCodecOpts } from "../codec-options.js";
import type { CodecKey } from "../key.js";
import type { CodecModule, RunOpts } from "../types.js";
import { runDerive, runMatch } from "../verbs.js";

const digestKey: CodecKey<DigestKey> = { decode: decodeDigestKey, import: importDigestKey };

function build(opts: RunOpts) {
  return (brand: string, key: DigestKey, ns: string) =>
    createDigestId(brand, { ns, key, ...sharedCodecOpts(opts) });
}

export const digestCli: CodecModule = {
  codec: "digest",
  verbs: {
    derive: (argv, opts) => runDerive(digestKey, build(opts), argv, opts),
    match: (argv, opts) => runMatch(digestKey, build(opts), argv, opts),
  },
};
