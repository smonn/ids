import { maxGenerateCount } from "./constants.js";

export function usageInspect(): string {
  return [
    "Usage: ids inspect, i <id> [--opaque] [--wrapped --kind u32|i32|u64|i64] [--reverse] [--signed] [--key-format hex|base64url]",
    "",
    "  Decode an ID and print brand, timestamp (or lookup key), and canonical form.",
    "  --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "  --wrapped reads the wrapping key from IDS_WRAPPING_KEY (hex by default; IDS_WRAPPING_KEY_FORMAT or --key-format).",
    "  --kind is required with --wrapped: u32, i32, u64, or i64.",
    "  --reverse decodes a Reverse Timestamp ID (newest-first sort order).",
    "  --signed decodes a Signed Timestamp ID; reads signing key from IDS_SIGNING_KEY (hex by default; IDS_SIGNING_KEY_FORMAT or --key-format).",
    "  Without IDS_SIGNING_KEY, --signed prints the timestamp only (no verification). With IDS_SIGNING_KEY, prints verification: ok or failed.",
    "  Note: --digest is not supported for inspect (Digest IDs are one-way; there is no reverse path).",
    "",
  ].join("\n");
}

export function usageGenerate(): string {
  return [
    `Usage: ids generate, g <brand> [--count, -c N] [--opaque] [--reverse] [--signed] [--digest --ns <ns>] [--key-format hex|base64url]`,
    "",
    `  Mint 1..${maxGenerateCount} canonical IDs for the given brand.`,
    "  --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "  --reverse mints Reverse Timestamp IDs (newest-first sort order).",
    "  --signed mints Signed Timestamp IDs; reads signing key from IDS_SIGNING_KEY (hex by default; IDS_SIGNING_KEY_FORMAT or --key-format).",
    "  --digest mints a deterministic Digest ID from material read on stdin.",
    "    --ns <ns> is required: the namespace domain separator (non-secret, non-empty).",
    "    Reads the digest key from IDS_DIGEST_KEY (hex by default; IDS_DIGEST_KEY_FORMAT or --key-format).",
    "    Same material + ns + key always produces the same ID. Digest IDs are one-way.",
    "    --count N > 1 is rejected: same material always produces the same ID.",
    "",
  ].join("\n");
}

export function usageKeygen(): string {
  return [
    "Usage: ids keygen, k [--wrapped] [--signed] [--digest] [--bits 128|192|256] [--key-format hex|base64url]",
    "",
    "  Emit a random key for importOpaqueKey, importWrappingKey, importSigningKey, or importDigestKey (stdout only).",
    "  --wrapped emits a wrapping key for importWrappingKey instead (IDS_WRAPPING_KEY).",
    "  --signed emits a signing key for importSigningKey instead (IDS_SIGNING_KEY; hex by default; IDS_SIGNING_KEY_FORMAT or --key-format).",
    "  --digest emits a digest key for importDigestKey instead (IDS_DIGEST_KEY; hex by default; IDS_DIGEST_KEY_FORMAT or --key-format).",
    "",
  ].join("\n");
}

export function usage(): string {
  return [
    "Usage: ids <subcommand> [args]",
    "",
    "Subcommands:",
    "  inspect, i <id> [--opaque] [--wrapped --kind u32|i32|u64|i64] [--reverse] [--signed] [--key-format hex|base64url]",
    "    Decode an ID and print brand, timestamp (or lookup key), and canonical form.",
    "    --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "    --wrapped reads the wrapping key from IDS_WRAPPING_KEY (hex by default; IDS_WRAPPING_KEY_FORMAT or --key-format).",
    "    --kind is required with --wrapped: u32, i32, u64, or i64.",
    "    --reverse decodes a Reverse Timestamp ID (newest-first sort order).",
    "    --signed decodes a Signed Timestamp ID; reads signing key from IDS_SIGNING_KEY (hex by default; IDS_SIGNING_KEY_FORMAT or --key-format).",
    "    Without IDS_SIGNING_KEY, --signed prints the timestamp only (no verification). With IDS_SIGNING_KEY, prints verification: ok or failed.",
    "    Note: --digest is not supported for inspect (Digest IDs are one-way; there is no reverse path).",
    "  generate, g <brand> [--count, -c N] [--opaque] [--reverse] [--signed] [--digest --ns <ns>] [--key-format hex|base64url]",
    `    Mint 1..${maxGenerateCount} canonical IDs for the given brand.`,
    "    --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "    --reverse mints Reverse Timestamp IDs (newest-first sort order).",
    "    --signed mints Signed Timestamp IDs; reads signing key from IDS_SIGNING_KEY (hex by default; IDS_SIGNING_KEY_FORMAT or --key-format).",
    "    --digest mints a deterministic Digest ID from material read on stdin.",
    "      --ns <ns> is required: the namespace domain separator (non-secret, non-empty).",
    "      Reads the digest key from IDS_DIGEST_KEY (hex by default; IDS_DIGEST_KEY_FORMAT or --key-format).",
    "      Same material + ns + key always produces the same ID. Digest IDs are one-way.",
    "      --count N > 1 is rejected: same material always produces the same ID.",
    "  keygen, k [--wrapped] [--signed] [--digest] [--bits 128|192|256] [--key-format hex|base64url]",
    "    Emit a random key for importOpaqueKey, importWrappingKey, importSigningKey, or importDigestKey (key on stdout; warning on stderr).",
    "    Safe handling: redirect stdout to a 0600 file (e.g. ids keygen > key.hex && chmod 0600 key.hex);",
    "    do not let the key appear in shell history or CI logs. A warning is printed to stderr on every run.",
    "    --wrapped emits a wrapping key for importWrappingKey instead (IDS_WRAPPING_KEY).",
    "    --signed emits a signing key for importSigningKey instead (IDS_SIGNING_KEY; hex by default; IDS_SIGNING_KEY_FORMAT or --key-format).",
    "    --digest emits a digest key for importDigestKey instead (IDS_DIGEST_KEY; hex by default; IDS_DIGEST_KEY_FORMAT or --key-format).",
    "",
    "Exit codes:",
    "  0  Success",
    "  1  Runtime/operational error (codec failure, bad key material, verification failure)",
    "  2  Usage/argument error (unknown subcommand, unrecognised flag, bad flag value, missing required arg)",
    "",
  ].join("\n");
}
