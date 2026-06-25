import { createTimestampId, type TimestampCodec } from "../../codecs/timestamp/index.js";
import type { Id, ValidBrand } from "../../types.js";
import { codecOpts } from "../codec-options.js";
import { buildCodec, deriveAllowedFlags, resolveVariant } from "../dispatch.js";
import {
  formatCliError,
  formatInspectOutput,
  formatSignedInspectOutput,
  formatWrappedInspectOutput,
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
  let verifyCanonical: Id<ValidBrand> | undefined;
  let verifyNowMs: number | undefined;
  if (cap.mode === "verify") {
    const fmtCheck = parseKeyFormat(values, opts, variant.key!);
    if (isKeyFormatError(fmtCheck)) {
      opts.stderr(fmtCheck + "\n");
      return values.has("--key-format") ? 2 : 1;
    }
    let tsCodec: TimestampCodec<ValidBrand>;
    try {
      tsCodec = createTimestampId(brand as unknown as ValidBrand, codecOpts(opts));
    } catch (err) {
      opts.stderr(formatCliError(err) + "\n");
      return 1;
    }
    const structValidation = tsCodec["~standard"].validate(input);
    if (structValidation.issues) {
      opts.stderr(structValidation.issues[0]!.message + "\n");
      return 1;
    }
    verifyCanonical = structValidation.value;
    verifyTimestamp = tsCodec.extractTimestamp(verifyCanonical);
    verifyNowMs = (opts.now ?? Date.now)();
  }

  const codecOrError = await buildCodec(variant, brand, values, opts);
  if (typeof codecOrError === "string") {
    if (cap.mode === "verify") {
      opts.stdout(
        formatSignedInspectOutput({
          brand,
          timestamp: verifyTimestamp!,
          canonical: verifyCanonical!,
          input,
          nowMs: verifyNowMs!,
          verification: "unavailable",
        }),
      );
      opts.stderr(codecOrError + "\n");
      return 1;
    }
    opts.stderr(codecOrError + "\n");
    return codecOrError.startsWith("--") ? 2 : 1;
  }

  // Structural validation for non-verify, non-unsupported cases
  let canonical: Id<ValidBrand> | undefined;
  if (cap.mode !== "verify" && cap.mode !== "unsupported") {
    const parsed = cap.validate(codecOrError, input);
    if ("issue" in parsed) {
      opts.stderr(parsed.issue + "\n");
      return 1;
    }
    canonical = parsed.value;
  }

  // Dispatch on capability mode for output shapes
  switch (cap.mode) {
    case "readable": {
      const timestamp = cap.extractTimestamp(codecOrError, canonical!);
      const nowMs = (opts.now ?? Date.now)();
      opts.stderr(cap.note + "\n");
      opts.stdout(formatInspectOutput({ brand, timestamp, canonical: canonical!, input, nowMs }));
      return 0;
    }
    case "keyed-readable": {
      const timestamp = await cap.extractTimestamp(codecOrError, canonical!);
      const nowMs = (opts.now ?? Date.now)();
      opts.stderr(cap.note + "\n");
      opts.stdout(formatInspectOutput({ brand, timestamp, canonical: canonical!, input, nowMs }));
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
      opts.stdout(formatWrappedInspectOutput({ brand, lookupKey, canonical: canonical!, input }));
      return 0;
    }
    case "verify": {
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
