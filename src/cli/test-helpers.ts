import type { RunOpts } from "./types.js";

export function makeOpts(env: Record<string, string> = {}): RunOpts {
  return {
    argv: [],
    stdout: () => {},
    stderr: () => {},
    now: () => 0x123456789abc,
    rng: (t) => t.fill(0x00),
    env,
  };
}
