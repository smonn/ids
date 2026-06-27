import { createTimestampId, type TimestampCodec } from "../../codecs/timestamp/index.js";
import type { Id } from "../../types.js";
import { codecOpts } from "../codec-options.js";
import { buildCodec, deriveAllowedFlags, isCodecError, resolveVariant } from "../dispatch.js";
import {
  formatCliError,
  formatInspectOutput,
  formatSignedInspectOutput,
  formatWrappedInspectOutput,
  invalidIdPrefix,
} from "../format.js";
import { splitFlags, unsupportedFlagForCommand } from "../flags.js";
import { isKeyFormatError, parseKeyFormat } from "../key-io.js";
import type { RunOpts } from "../types.js";
import { usageInspect } from "../usage.js";
import { inspectPolicy } from "../variants.js";

export async function runInspect(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    opts.stdout(usageInspect());
    return 0;
  }
  const allowedFlags = deriveAllowedFlags(inspectPolicy);
  const selectorFlags = new Set(
    inspectPolicy.selectable.map((v) => v.flag).filter((f): f is string => f !== undefined),
  );
  const valueFlags = new Set([...allowedFlags].filter((f) => !selectorFlags.has(f)));
  const { flags, values, positionals, errors } = splitFlags(args, valueFlags);

  const unsupported = unsupportedFlagForCommand("inspect", flags, allowedFlags);
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return 2;
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return 2;
  }

  // --from-uuid path: convert a UUID to a canonical Id<Brand>
  const fromUuidValue = values.get("--from-uuid");
  if (fromUuidValue !== undefined) {
    if (fromUuidValue === "") {
      opts.stderr("--from-uuid requires a value\n");
      return 2;
    }
    const fromUuidForbiddenFlags = [
      ...inspectPolicy.selectable.map((v) => v.flag).filter((f): f is string => f !== undefined),
      "--key-format",
    ];
    const forbiddenFlag = fromUuidForbiddenFlags.find((f) => flags.has(f));
    if (forbiddenFlag !== undefined) {
      opts.stderr(`${forbiddenFlag} cannot be used with --from-uuid\n`);
      return 2;
    }
    const brandValue = values.get("--brand");
    if (brandValue === undefined || brandValue === "") {
      opts.stderr("--from-uuid requires --brand\n");
      return 2;
    }
    let tsCodec: TimestampCodec<string>;
    try {
      tsCodec = createTimestampId(brandValue, codecOpts(opts));
    } catch (err) {
      opts.stderr(formatCliError(err) + "\n");
      return 1;
    }
    const result = tsCodec.safeFromUUID(fromUuidValue);
    if (!result.ok) {
      opts.stderr("invalid_uuid: not a valid RFC 9562 UUID\n");
      return 1;
    }
    opts.stdout(result.id + "\n");
    return 0;
  }

  const [input] = positionals;
  if (input === undefined) {
    opts.stderr(usageInspect());
    return 2;
  }
  const extra = positionals[1];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return 2;
  }

  const variant = resolveVariant(inspectPolicy, flags);
  if (typeof variant === "string") {
    opts.stderr(variant + "\n");
    return 2;
  }
  if (variant.key === undefined && flags.has("--key-format")) {
    opts.stderr("--key-format requires --opaque, --wrapped, or --signed\n");
    return 2;
  }

  const brand = input.slice(0, 3).toLowerCase();
  const cap = variant.inspect;

  // "verify" (--signed) mode: the timestamp is plaintext and must be extractable even when
  // the signing key is unavailable. Structural parse happens before key loading so that:
  //   bad key format → stderr only, stdout = "" (no timestamp shown)
  //   invalid payload → stderr only, stdout = "" (no timestamp shown)
  //   key missing/malformed → stdout has timestamp + "verification: unavailable"
  let verifyTimestamp: Date | undefined;
  let verifyCanonical: Id<string> | undefined;
  let verifyNowMs: number | undefined;
  let verifyTsCodec: TimestampCodec<string> | undefined;
  if (cap.mode === "verify") {
    const fmtCheck = parseKeyFormat(values, opts, variant.key!);
    if (isKeyFormatError(fmtCheck)) {
      opts.stderr(fmtCheck + "\n");
      return 2;
    }
    let tsCodec: TimestampCodec<string>;
    try {
      tsCodec = createTimestampId(brand, codecOpts(opts));
    } catch (err) {
      opts.stderr(formatCliError(err) + "\n");
      return 1;
    }
    const structValidation = tsCodec["~standard"].validate(input);
    if (structValidation.issues) {
      opts.stderr(invalidIdPrefix + structValidation.issues[0]!.message + "\n");
      return 1;
    }
    verifyTsCodec = tsCodec;
    verifyCanonical = structValidation.value;
    verifyTimestamp = tsCodec.extractTimestamp(verifyCanonical);
    verifyNowMs = (opts.now ?? Date.now)();
  }

  const codecOrError = await buildCodec(variant, brand, values, opts);
  if (isCodecError(codecOrError)) {
    if (cap.mode === "verify") {
      const uuid = verifyTsCodec!.toUUID(verifyCanonical!);
      opts.stdout(
        formatSignedInspectOutput({
          brand,
          timestamp: verifyTimestamp!,
          canonical: verifyCanonical!,
          uuid,
          input,
          nowMs: verifyNowMs!,
          verification: "unavailable",
        }),
      );
      opts.stderr(codecOrError.message + "\n");
      return 1;
    }
    opts.stderr(codecOrError.message + "\n");
    return codecOrError.kind === "usage" ? 2 : 1;
  }

  // Structural validation for non-verify, non-unsupported cases
  let canonical: Id<string> | undefined;
  if (cap.mode !== "verify" && cap.mode !== "unsupported") {
    const parsed = cap.validate(codecOrError, input);
    if ("issue" in parsed) {
      opts.stderr(parsed.issue + "\n");
      return 1;
    }
    canonical = parsed.value;
  }

  // Helper to call toUUID on any codec via unsafe cast
  function codecToUUID(id: Id<string>): string {
    return (codecOrError as unknown as { toUUID(id: Id<string>): string }).toUUID(id);
  }

  // Dispatch on capability mode for output shapes
  switch (cap.mode) {
    case "readable": {
      const timestamp = cap.extractTimestamp(codecOrError, canonical!);
      const nowMs = (opts.now ?? Date.now)();
      const uuid = codecToUUID(canonical!);
      opts.stderr(cap.note + "\n");
      opts.stdout(
        formatInspectOutput({ brand, timestamp, canonical: canonical!, uuid, input, nowMs }),
      );
      return 0;
    }
    case "keyed-readable": {
      const timestamp = await cap.extractTimestamp(codecOrError, canonical!);
      const nowMs = (opts.now ?? Date.now)();
      const uuid = codecToUUID(canonical!);
      opts.stderr(cap.note + "\n");
      opts.stdout(
        formatInspectOutput({ brand, timestamp, canonical: canonical!, uuid, input, nowMs }),
      );
      return 0;
    }
    case "unwrap": {
      let lookupKey: number | bigint;
      try {
        lookupKey = await cap.unwrap(codecOrError, canonical!);
      } catch (err) {
        opts.stderr(formatCliError(err) + "\n");
        return 1;
      }
      const uuid = codecToUUID(canonical!);
      opts.stdout(
        formatWrappedInspectOutput({ brand, lookupKey, canonical: canonical!, uuid, input }),
      );
      return 0;
    }
    case "verify": {
      const uuid = verifyTsCodec!.toUUID(verifyCanonical!);
      const verifyResult = await cap.safeVerify(codecOrError, input);
      if (!verifyResult.ok) {
        /* v8 ignore next 4 -- defensive: both codecs share the same wire parse so ParseError
           is unreachable after the createTimestampId pre-validation above passes */
        if (verifyResult.error !== "verification_failed") {
          opts.stderr(verifyResult.error + "\n");
          return 1;
        }
        opts.stdout(
          formatSignedInspectOutput({
            brand,
            timestamp: verifyTimestamp!,
            canonical: verifyCanonical!,
            uuid,
            input,
            nowMs: verifyNowMs!,
            verification: "failed",
          }),
        );
        opts.stderr("verification_failed: verification failed\n");
        return 1;
      }
      opts.stdout(
        formatSignedInspectOutput({
          brand,
          timestamp: verifyTimestamp!,
          canonical: verifyResult.id,
          uuid,
          input,
          nowMs: verifyNowMs!,
          verification: "ok",
        }),
      );
      return 0;
    }
    /* v8 ignore next 5 -- defensive: digestVariant is the only "unsupported" variant and it is
       excluded from inspectPolicy.selectable, so resolveVariant can never return it here. The
       branch exists for TypeScript exhaustiveness. */
    case "unsupported": {
      opts.stderr("unsupported flag for inspect: --digest\n");
      return 1;
    }
  }
}
