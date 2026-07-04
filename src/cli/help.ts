const KEY_FLAGS_HELP = [
  "Key flags (keyed verbs): --key-file <path>  (preferred)  --key <value>  IDS_KEY=<value>",
  "  Prefer --key-file or IDS_KEY over --key to avoid exposing key material on argv/history.",
].join("\n");

export function usage(codecNames: readonly string[]): string {
  return [
    "Usage: ids <codec> <verb> [args] [flags]",
    "       ids keygen [--bytes 16|24|32] [--key-encoding hex|base64url]",
    "       ids convert <brand> --uuid <uuid>",
    "       ids --version | --help",
    "",
    `Codecs: ${codecNames.join(", ")}`,
    "  generate (timestamp, reverse, signed, opaque)   mint fresh IDs",
    "  wrap     (wrapped)                               wrap an integer",
    "  derive   (digest)                                derive a stable ID from material",
    "  inspect  (all but digest)                        read an ID",
    "  match    (digest)                                test material against an ID",
    "",
    KEY_FLAGS_HELP,
    "",
  ].join("\n");
}

export function helpForCodec(codec: string, verbs: readonly string[]): string {
  return [
    `Usage: ids ${codec} <verb> [args] [flags]`,
    `Verbs: ${verbs.join(", ")}`,
    KEY_FLAGS_HELP,
    "Run 'ids --help' for the full command list.",
    "",
  ].join("\n");
}

export function helpForCommand(name: string): string {
  if (name === "keygen") {
    return "Usage: ids keygen [--bytes 16|24|32] [--key-encoding hex|base64url]\n";
  }
  // `convert` is the only other top-level command (router gates the callers).
  return "Usage: ids convert <brand> --uuid <uuid>\n";
}
