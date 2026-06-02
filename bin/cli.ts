#!/usr/bin/env node
import { run } from "../src/cli.js";

process.exitCode = run({
  argv: process.argv.slice(2),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
});
