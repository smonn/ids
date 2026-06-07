import { maxGenerateCount } from "./constants.js";

export function usage(): string {
  return [
    "Usage: ids <subcommand> [args]",
    "",
    "Subcommands:",
    "  inspect, i <id> [--opaque] [--key-format hex|base64url]",
    "    Decode an ID and print brand, timestamp, and canonical form.",
    "    --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "  generate, g <brand> [--count, -c N] [--opaque] [--key-format hex|base64url]",
    `    Mint 1..${maxGenerateCount} canonical IDs for the given brand.`,
    "    --opaque reads the AES key from IDS_KEY (hex by default; IDS_KEY_FORMAT or --key-format).",
    "  keygen, k [--bits 128|192|256] [--key-format hex|base64url]",
    "    Emit a random AES key for importOpaqueKey (stdout only).",
    "",
  ].join("\n");
}
