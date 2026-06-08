import type { TimestampOptions } from "../timestamp.js";
import type { RunOpts } from "./types.js";

export function codecOpts(opts: RunOpts): Partial<TimestampOptions> {
  // CLI invocations are intentionally ephemeral: one codec per run, never
  // retained, so this is not the duplicate-brand warning case.
  const o: Partial<TimestampOptions> = { allowDuplicateBrand: true };
  if (opts.now !== undefined) o.now = opts.now;
  if (opts.rng !== undefined) o.rng = opts.rng;
  return o;
}
