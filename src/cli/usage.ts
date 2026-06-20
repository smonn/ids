import { maxGenerateCount } from "./constants.js";

export function usage(): string {
  return [
    "Usage: ids <subcommand> [args]",
    "",
    "Subcommands:",
    "  inspect, i <id> [--opaque] [--wrapped --kind u32|i32|u64|i64] [--reverse] [--key-format hex|base64url]",
    "    Decode an ID and print brand, timestamp (or lookup key), and canonical form.",
    "    --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "    --wrapped reads the wrapping key from IDS_WRAPPING_KEY (hex by default; IDS_WRAPPING_KEY_FORMAT or --key-format).",
    "    --kind is required with --wrapped: u32, i32, u64, or i64.",
    "    --reverse decodes a Reverse Timestamp ID (newest-first sort order).",
    "  generate, g <brand> [--count, -c N] [--opaque] [--reverse] [--key-format hex|base64url]",
    `    Mint 1..${maxGenerateCount} canonical IDs for the given brand.`,
    "    --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "    --reverse mints Reverse Timestamp IDs (newest-first sort order).",
    "  keygen, k [--wrapped] [--bits 128|192|256] [--key-format hex|base64url]",
    "    Emit a random AES key for importOpaqueKey (stdout only).",
    "    --wrapped emits a wrapping key for importWrappingKey instead (IDS_WRAPPING_KEY).",
    "",
  ].join("\n");
}
