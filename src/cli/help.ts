const codecs = ["timestamp", "reverse", "signed", "opaque", "wrapped", "digest"] as const;

export function usage(): string {
  return [
    "Usage: ids <codec> <verb> [args] [flags]",
    "       ids keygen [--bytes 16|24|32] [--key-encoding hex|base64url]",
    "       ids convert <brand> --uuid <uuid>",
    "       ids --version | --help",
    "",
    `Codecs: ${codecs.join(", ")}`,
    "  generate (timestamp, reverse, signed, opaque)   mint fresh IDs",
    "  wrap     (wrapped)                               wrap an integer",
    "  derive   (digest)                                derive a stable ID from material",
    "  inspect  (all but digest)                        read an ID",
    "  match    (digest)                                test material against an ID",
    "",
  ].join("\n");
}

export function helpForCodec(codec: string): string {
  return `Usage: ids ${codec} <verb> [args] [flags]\nRun 'ids --help' for the full command list.\n`;
}

export function helpForCommand(name: string): string {
  if (name === "keygen") {
    return "Usage: ids keygen [--bytes 16|24|32] [--key-encoding hex|base64url]\n";
  }
  if (name === "convert") {
    return "Usage: ids convert <brand> --uuid <uuid>\n";
  }
  return helpForCodec(name);
}
