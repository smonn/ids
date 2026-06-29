#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli/index.js";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { version: string };

process.exitCode = await run({
  argv: process.argv.slice(2),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  version: pkg.version,
});
