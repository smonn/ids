import type { RunOpts } from "./types.js";

type SharedCodecOpts = {
  now?: () => number;
  rng?: (target: Uint8Array) => void;
  allowDuplicateBrand: true;
};

export function sharedCodecOpts(opts: RunOpts): SharedCodecOpts {
  // CLI invocations are intentionally ephemeral: one codec per run, never
  // retained, so this is not the duplicate-brand warning case.
  const o: SharedCodecOpts = { allowDuplicateBrand: true };
  if (opts.now !== undefined) o.now = opts.now;
  if (opts.rng !== undefined) o.rng = opts.rng;
  return o;
}
