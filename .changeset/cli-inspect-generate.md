---
"@smonn/ids": minor
---

Add a CLI runnable as `npx @smonn/ids <subcommand>` with two brand-agnostic subcommands: `inspect <id>` decodes an existing ID and prints the brand, ISO timestamp with a relative-time tail, canonical form, and whether the input was already canonical (flagging uppercase and Crockford aliases). `generate <brand> [--count N]` mints one or more canonical IDs (default 1), one per line for pipeable output. Brand validation is delegated to `createId`; invalid input prints the parse error and exits non-zero.
