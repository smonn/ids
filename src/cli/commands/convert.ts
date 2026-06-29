import { createTimestampId } from "../../codecs/timestamp/index.js";
import { type FlagSpec, parseArgs } from "../args.js";
import { usageError } from "../errors.js";
import type { RunOpts } from "../types.js";
import { fail, mapThrown } from "../verbs.js";

/**
 * Re-express a UUID as an `Id` for a brand (uuid → id). Codec-agnostic — the Raw UUID
 * mapping is a view over the shared payload, so any codec's `fromUUID` works; the
 * Timestamp codec is used as the carrier. The reverse direction is `inspect`'s uuid field.
 */
export async function runConvert(argv: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const specs: FlagSpec[] = [{ name: "--uuid", value: true }];
  const { values, positionals, error } = parseArgs(argv, specs);
  if (error !== undefined) return fail(opts, usageError(error));

  const brand = positionals[0];
  if (brand === undefined) return fail(opts, usageError("missing brand"));
  if (positionals.length > 1)
    return fail(opts, usageError(`unexpected argument: ${positionals[1]!}`));

  const uuid = values.get("--uuid");
  if (uuid === undefined || uuid === "") return fail(opts, usageError("--uuid is required"));

  let codec: ReturnType<typeof createTimestampId<string>>;
  try {
    codec = createTimestampId(brand, { allowDuplicateBrand: true });
  } catch (err) {
    return fail(opts, mapThrown(err));
  }

  const result = codec.safeFromUUID(uuid);
  if (!result.ok) return fail(opts, usageError(`invalid_uuid: ${result.error}`));
  opts.stdout(`${result.id}\n`);
  return 0;
}
