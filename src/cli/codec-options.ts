import type { Options } from "../id.js";
import type { RunOpts } from "./types.js";

export function codecOpts(opts: RunOpts): Partial<Options> {
  // CLI invocations are intentionally ephemeral: one codec per run, never
  // retained, so this is not the duplicate-brand warning case.
  const o: Partial<Options> = { allowDuplicateBrand: true };
  if (opts.now !== undefined) o.now = opts.now;
  if (opts.rng !== undefined) o.rng = opts.rng;
  return o;
}
