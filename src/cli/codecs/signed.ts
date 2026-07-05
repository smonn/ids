import {
  createSignedTimestampId,
  decodeSigningKey,
  importSigningKey,
  type SigningKey,
} from "../../codecs/signed/index.js";
import { sharedCodecOpts } from "../codec-options.js";
import { runtimeError } from "../errors.js";
import type { CodecKey } from "../key.js";
import type { CodecModule } from "../types.js";
import { requireBrand, runGenerateKeyed, runInspect } from "../verbs.js";

const signingKey: CodecKey<SigningKey> = { decode: decodeSigningKey, import: importSigningKey };

export const signedCli: CodecModule = {
  codec: "signed",
  verbs: {
    generate: (argv, opts) =>
      runGenerateKeyed(
        signingKey,
        (brand, o, key) => createSignedTimestampId(brand, { keys: [key], ...sharedCodecOpts(o) }),
        argv,
        opts,
      ),
    inspect: (argv, opts) =>
      runInspect(
        {
          keyed: true,
          codecKey: signingKey,
          prepare: (o, key) => async (id) => {
            const brand = requireBrand(id);
            if (typeof brand !== "string") return brand;
            const codec = createSignedTimestampId(brand, { keys: [key], ...sharedCodecOpts(o) });
            const verified = await codec.safeVerify(id);
            if (!verified.ok) {
              return verified.error === "verification_failed"
                ? runtimeError("verification_failed: signature did not verify")
                : runtimeError(`invalid_id: ${verified.error}`);
            }
            const ts = codec.extractTimestamp(verified.id);
            return {
              shape: "timestamp",
              brand,
              codec: "signed",
              ms: ts.getTime(),
              uuid: codec.toUUID(verified.id),
              verified: true,
            };
          },
        },
        argv,
        opts,
      ),
  },
};
