import { redactToken } from "./sanitize.js";

/**
 * Declarative flag parsing for a single CLI node (one codec verb or top-level command).
 *
 * Each verb declares the exact flags it accepts; anything else is an `unsupported flag`
 * error. This replaces the old derive-from-policy machinery — a node's surface is now
 * *stated*, not computed.
 */
export type FlagSpec = {
  /** Canonical flag name, e.g. `"--count"`. */
  readonly name: string;
  /** Optional alias, e.g. `"-c"`. Resolves to {@link name}. */
  readonly alias?: string;
  /** Whether the flag consumes a value (`--count 5`) or is a bare boolean (`--json`). */
  readonly value: boolean;
};

export type ParsedArgs = {
  /** Value-flag values, keyed by canonical name. */
  readonly values: Map<string, string>;
  /** Canonical names of every flag present. */
  readonly flags: Set<string>;
  readonly positionals: string[];
  /** First parse error encountered, if any (a usage error). */
  readonly error: string | undefined;
};

/**
 * Value flags consume the following token unconditionally (so a negative `--value -5`
 * is read as a value, not mistaken for a flag); a malformed invocation surfaces as a
 * value-validation error downstream rather than here.
 */
export function parseArgs(argv: ReadonlyArray<string>, specs: ReadonlyArray<FlagSpec>): ParsedArgs {
  const byToken = new Map<string, FlagSpec>();
  for (const spec of specs) {
    byToken.set(spec.name, spec);
    if (spec.alias !== undefined) byToken.set(spec.alias, spec);
  }

  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  let error: string | undefined;
  const fail = (message: string): void => {
    if (error === undefined) error = message;
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!;
    if (!raw.startsWith("-") || raw === "-") {
      positionals.push(raw);
      continue;
    }

    const eq = raw.indexOf("=");
    const token = eq === -1 ? raw : raw.slice(0, eq);
    const inline = eq === -1 ? undefined : raw.slice(eq + 1);

    const spec = byToken.get(token);
    if (spec === undefined) {
      fail(`unsupported flag: ${redactToken(token)}`);
      continue;
    }
    if (flags.has(spec.name)) {
      fail(`duplicate flag: ${spec.name}`);
      continue;
    }
    flags.add(spec.name);

    if (spec.value) {
      if (inline !== undefined) {
        values.set(spec.name, inline);
        continue;
      }
      // Consume the next token as the value — but NOT if it's a recognized flag, so a
      // forgotten value (`--key --json`) reports "requires a value" instead of binding
      // `--json` as the key. A negative number (`--value -5`) isn't a known flag, so it
      // is still consumed.
      const next = argv[i + 1];
      const nextToken =
        next === undefined
          ? undefined
          : next.includes("=")
            ? next.slice(0, next.indexOf("="))
            : next;
      if (next === undefined || (nextToken !== undefined && byToken.has(nextToken))) {
        values.set(spec.name, "");
      } else {
        values.set(spec.name, next);
        i++;
      }
    } else if (inline !== undefined) {
      fail(`flag does not take a value: ${redactToken(token)}`);
    }
  }

  return { values, flags, positionals, error };
}
