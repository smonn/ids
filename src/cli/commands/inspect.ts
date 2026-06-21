import { createTimestampId } from "../../timestamp.js";
import { createOpaqueTimestampId, type OpaqueKeyFormat } from "../../opaque.js";
import { createReverseTimestampId } from "../../reverse.js";
import { createSignedTimestampId } from "../../signed.js";
import { createWrappedKeyId, type WrappingKey } from "../../wrapped.js";
import { codecOpts } from "../codec-options.js";
import {
  formatCliError,
  formatInspectOutput,
  formatSignedInspectOutput,
  formatWrappedInspectOutput,
} from "../format.js";
import {
  isKindError,
  parseKind,
  splitFlags,
  unsupportedFlagForCommand,
  type WrappedKindValue,
} from "../flags.js";
import { isKeyFormatError, loadOpaqueKey, parseOpaqueKeyFormat } from "../opaque-key.js";
import { loadSigningKey, parseSigningKeyFormat } from "../signing-key.js";
import type { SigningKeyFormat } from "../../signed.js";
import { loadWrappingKey, parseWrappingKeyFormat } from "../wrapping-key.js";
import type { RunOpts } from "../types.js";
import { usage } from "../usage.js";

export function runInspect(args: ReadonlyArray<string>, opts: RunOpts): Promise<number> {
  const { flags, values, positionals, errors } = splitFlags(args);
  const unsupported = unsupportedFlagForCommand(
    "inspect",
    flags,
    new Set(["--opaque", "--wrapped", "--reverse", "--signed", "--kind", "--key-format"]),
  );
  if (unsupported !== undefined) {
    opts.stderr(unsupported + "\n");
    return Promise.resolve(1);
  }
  if (errors[0] !== undefined) {
    opts.stderr(errors[0] + "\n");
    return Promise.resolve(1);
  }
  const [input] = positionals;
  if (input === undefined) {
    opts.stderr(usage());
    return Promise.resolve(1);
  }
  const extra = positionals[1];
  if (extra !== undefined) {
    opts.stderr(`unexpected argument: ${extra}\n`);
    return Promise.resolve(1);
  }
  const opaque = flags.has("--opaque");
  const wrapped = flags.has("--wrapped");
  const reverse = flags.has("--reverse");
  const signed = flags.has("--signed");
  if (opaque && wrapped) {
    opts.stderr("cannot use --wrapped and --opaque together\n");
    return Promise.resolve(1);
  }
  if (reverse && opaque) {
    opts.stderr("cannot use --reverse and --opaque together\n");
    return Promise.resolve(1);
  }
  if (reverse && wrapped) {
    opts.stderr("cannot use --reverse and --wrapped together\n");
    return Promise.resolve(1);
  }
  if (signed && opaque) {
    opts.stderr("cannot use --signed and --opaque together\n");
    return Promise.resolve(1);
  }
  if (signed && wrapped) {
    opts.stderr("cannot use --signed and --wrapped together\n");
    return Promise.resolve(1);
  }
  if (signed && reverse) {
    opts.stderr("cannot use --signed and --reverse together\n");
    return Promise.resolve(1);
  }
  if (!opaque && !wrapped && !signed && flags.has("--key-format")) {
    opts.stderr("--key-format requires --opaque, --wrapped, or --signed\n");
    return Promise.resolve(1);
  }
  const brand = input.slice(0, 3).toLowerCase();
  if (wrapped) {
    const kind = parseKind(values);
    if (kind === undefined) {
      opts.stderr("--kind is required with --wrapped\n");
      return Promise.resolve(1);
    }
    if (isKindError(kind)) {
      opts.stderr(kind + "\n");
      return Promise.resolve(1);
    }
    const format = parseWrappingKeyFormat(values, opts);
    if (isKeyFormatError(format)) {
      opts.stderr(format + "\n");
      return Promise.resolve(1);
    }
    return runWrappedInspect(brand, input, kind, format, opts);
  }
  if (opaque) {
    const format = parseOpaqueKeyFormat(values, opts);
    if (isKeyFormatError(format)) {
      opts.stderr(format + "\n");
      return Promise.resolve(1);
    }
    return runOpaqueInspect(brand, input, format, opts);
  }
  if (signed) {
    const format = parseSigningKeyFormat(values, opts);
    if (isKeyFormatError(format)) {
      opts.stderr(format + "\n");
      return Promise.resolve(1);
    }
    return runSignedInspect(brand, input, format, opts);
  }
  if (reverse) {
    let reverseCodec;
    try {
      reverseCodec = createReverseTimestampId(brand, codecOpts(opts));
    } catch (err) {
      opts.stderr(formatCliError(err) + "\n");
      return Promise.resolve(1);
    }
    const reverseValidation = reverseCodec["~standard"].validate(input);
    if (reverseValidation.issues) {
      opts.stderr(reverseValidation.issues[0]!.message + "\n");
      return Promise.resolve(1);
    }
    const reverseCanonical = reverseValidation.value;
    const reverseTimestamp = reverseCodec.extractTimestamp(reverseCanonical);
    const reverseNowMs = (opts.now ?? Date.now)();
    opts.stdout(
      formatInspectOutput({
        brand,
        timestamp: reverseTimestamp,
        canonical: reverseCanonical,
        input,
        nowMs: reverseNowMs,
      }),
    );
    return Promise.resolve(0);
  }
  let codec;
  try {
    codec = createTimestampId(brand, codecOpts(opts));
  } catch (err) {
    opts.stderr(formatCliError(err) + "\n");
    return Promise.resolve(1);
  }
  const validation = codec["~standard"].validate(input);
  if (validation.issues) {
    opts.stderr(validation.issues[0]!.message + "\n");
    return Promise.resolve(1);
  }
  const canonical = validation.value;
  const timestamp = codec.extractTimestamp(canonical);
  const nowMs = (opts.now ?? Date.now)();
  opts.stdout(
    formatInspectOutput({
      brand,
      timestamp,
      canonical,
      input,
      nowMs,
    }),
  );
  return Promise.resolve(0);
}

async function runWrappedInspect(
  brand: string,
  input: string,
  kind: WrappedKindValue,
  format: string,
  opts: RunOpts,
): Promise<number> {
  const keyResult = await loadWrappingKey(opts, format as "hex" | "base64url");
  if (typeof keyResult === "string") {
    opts.stderr(keyResult + "\n");
    return 1;
  }
  let codec;
  try {
    codec = createWrappedKeyId(brand, {
      kind,
      keys: [keyResult as WrappingKey],
      allowDuplicateBrand: true,
    });
  } catch (err) {
    opts.stderr(formatCliError(err) + "\n");
    return 1;
  }
  const validation = codec["~standard"].validate(input);
  if (validation.issues) {
    opts.stderr(validation.issues[0]!.message + "\n");
    return 1;
  }
  const canonical = validation.value;
  let lookupKey;
  try {
    lookupKey = await codec.unwrap(canonical);
  } catch (err) {
    opts.stderr(formatCliError(err) + "\n");
    return 1;
  }
  opts.stdout(
    formatWrappedInspectOutput({
      brand,
      lookupKey,
      canonical,
      input,
    }),
  );
  return 0;
}

async function runOpaqueInspect(
  brand: string,
  input: string,
  format: OpaqueKeyFormat,
  opts: RunOpts,
): Promise<number> {
  const keyResult = await loadOpaqueKey(opts, format);
  if (typeof keyResult === "string") {
    opts.stderr(keyResult + "\n");
    return 1;
  }
  let codec;
  try {
    codec = createOpaqueTimestampId(brand, { key: keyResult, ...codecOpts(opts) });
  } catch (err) {
    opts.stderr(formatCliError(err) + "\n");
    return 1;
  }
  const validation = codec["~standard"].validate(input);
  if (validation.issues) {
    opts.stderr(validation.issues[0]!.message + "\n");
    return 1;
  }
  const canonical = validation.value;
  const timestamp = await codec.extractTimestamp(canonical);
  const nowMs = (opts.now ?? Date.now)();
  opts.stderr(
    "note: timestamp assumes IDS_KEY matches the key used at generation; a wrong key yields a plausible but incorrect timestamp\n",
  );
  opts.stdout(
    formatInspectOutput({
      brand,
      timestamp,
      canonical,
      input,
      nowMs,
    }),
  );
  return 0;
}

async function runSignedInspect(
  brand: string,
  input: string,
  format: SigningKeyFormat,
  opts: RunOpts,
): Promise<number> {
  // Always parse structurally first using the Timestamp codec — the Signed Timestamp
  // codec shares the same wire shape (prefix + 26 base32 chars) and the same first
  // 6 plaintext timestamp bytes, so this is correct for structure validation and
  // timestamp extraction regardless of whether a signing key is present.
  let structCodec;
  try {
    structCodec = createTimestampId(brand, codecOpts(opts));
  } catch (err) {
    opts.stderr(formatCliError(err) + "\n");
    return 1;
  }
  const validation = structCodec["~standard"].validate(input);
  if (validation.issues) {
    opts.stderr(validation.issues[0]!.message + "\n");
    return 1;
  }
  const canonical = validation.value;
  const timestamp = structCodec.extractTimestamp(canonical);
  const nowMs = (opts.now ?? Date.now)();

  const env = opts.env ?? process.env;
  const rawKey = env.IDS_SIGNING_KEY;
  if (rawKey === undefined) {
    opts.stdout(formatSignedInspectOutput({ brand, timestamp, canonical, input, nowMs }));
    return 0;
  }

  const keyResult = await loadSigningKey(opts, format);
  if (typeof keyResult === "string") {
    opts.stderr(keyResult + "\n");
    return 1;
  }
  // Brand was already validated by createTimestampId above; single key is non-empty and
  // non-duplicate by construction; allowDuplicateBrand silences the registry check. Cannot throw.
  const signedCodec = createSignedTimestampId(brand, {
    keys: [keyResult],
    allowDuplicateBrand: true,
    ...codecOpts(opts),
  });
  const verifyResult = await signedCodec.safeVerify(input);
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
        timestamp,
        canonical,
        input,
        nowMs,
        verification: "failed",
      }),
    );
    return 1;
  }
  opts.stdout(
    formatSignedInspectOutput({
      brand,
      timestamp,
      canonical: verifyResult.id,
      input,
      nowMs,
      verification: "ok",
    }),
  );
  return 0;
}
