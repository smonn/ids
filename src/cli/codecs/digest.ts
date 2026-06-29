import {
  createDigestId,
  decodeDigestKey,
  type DigestKey,
  importDigestKey,
} from "../../codecs/digest/index.js";
import type { CodecKey } from "../key.js";
import type { CodecModule } from "../types.js";
import { runDerive, runMatch } from "../verbs.js";

const digestKey: CodecKey<DigestKey> = { decode: decodeDigestKey, import: importDigestKey };

function build(brand: string, key: DigestKey, ns: string) {
  return createDigestId(brand, { ns, key, allowDuplicateBrand: true });
}

export const digestCli: CodecModule = {
  codec: "digest",
  verbs: {
    derive: (argv, opts) => runDerive(digestKey, build, argv, opts),
    match: (argv, opts) => runMatch(digestKey, build, argv, opts),
  },
};
