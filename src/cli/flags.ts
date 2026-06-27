import { maxGenerateCount } from "./constants.js";

export type ParsedFlags = {
  flags: Set<string>;
  values: Map<string, string>;
  positionals: string[];
  errors: string[];
};

function splitFlagToken(arg: string): { flag: string; inlineValue: string | undefined } {
  const eq = arg.indexOf("=");
  if (eq <= 0) return { flag: arg, inlineValue: undefined };
  return { flag: arg.slice(0, eq), inlineValue: arg.slice(eq + 1) };
}

export function splitFlags(args: ReadonlyArray<string>, valueFlags: Set<string>): ParsedFlags {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];
  const errors: string[] = [];
  const seenFlags = new Set<string>();
  const addFlag = (flag: string) => {
    const canonical = canonicalFlag(flag);
    if (seenFlags.has(canonical)) errors.push(`duplicate flag: ${canonical}`);
    seenFlags.add(canonical);
    flags.add(flag);
  };
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]!;
    const { flag, inlineValue } = splitFlagToken(raw);
    if (valueFlags.has(flag)) {
      if (inlineValue !== undefined) {
        addFlag(flag);
        values.set(flag, inlineValue);
        continue;
      }
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        addFlag(flag);
        values.set(flag, "");
        continue;
      }
      addFlag(flag);
      values.set(flag, value);
      i++;
      continue;
    }
    if (flag.startsWith("-")) {
      addFlag(flag);
      if (inlineValue !== undefined) errors.push(`flag does not take a value: ${flag}`);
      continue;
    }
    positionals.push(raw);
  }
  return { flags, values, positionals, errors };
}

function canonicalFlag(flag: string): string {
  if (flag === "-c") return "--count";
  return flag;
}

const knownFlags = new Set([
  "--opaque",
  "--wrapped",
  "--reverse",
  "--signed",
  "--digest",
  "--ns",
  "--kind",
  "--key-format",
  "--count",
  "-c",
  "--bits",
  "--uuid",
  "--from-uuid",
  "--brand",
]);

export function unsupportedFlagForCommand(
  command: string,
  flags: Set<string>,
  allowed: Set<string>,
): string | undefined {
  for (const flag of flags) {
    if (!allowed.has(flag)) {
      return knownFlags.has(flag)
        ? `unsupported flag for ${command}: ${flag}`
        : `unsupported flag: ${flag}`;
    }
  }
  return undefined;
}

export function parseCount(values: Map<string, string>): number | string {
  const raw = values.get("--count") ?? values.get("-c");
  if (raw === undefined) return 1;
  if (raw === "") return "--count requires a value";
  if (!/^[1-9][0-9]*$/.test(raw)) return `--count must be a positive integer, got '${raw}'`;
  const count = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(count) || count > maxGenerateCount) {
    return `--count must be at most ${maxGenerateCount}, got '${raw}'`;
  }
  return count;
}

export function parseBits(values: Map<string, string>): number | string {
  const raw = values.get("--bits");
  if (raw === undefined) return 256;
  if (raw === "") return "--bits requires a value";
  if (raw === "128") return 128;
  if (raw === "192") return 192;
  if (raw === "256") return 256;
  return `--bits must be 128, 192, or 256, got '${raw}'`;
}

export type WrappedKindValue = "u32" | "i32" | "u64" | "i64";

export function parseKind(values: Map<string, string>): WrappedKindValue | string | undefined {
  const raw = values.get("--kind");
  if (raw === undefined) return undefined;
  if (raw === "") return "--kind requires a value";
  if (raw === "u32" || raw === "i32" || raw === "u64" || raw === "i64") return raw;
  return `--kind must be u32, i32, u64, or i64, got '${raw}'`;
}

export function isKindError(result: WrappedKindValue | string): result is string {
  return result !== "u32" && result !== "i32" && result !== "u64" && result !== "i64";
}

export function parseNs(values: Map<string, string>): string | undefined {
  const raw = values.get("--ns");
  if (raw === undefined) return undefined;
  if (raw.trim() === "") return "--ns requires a value";
  if (raw !== raw.trim()) return "--ns must not have leading or trailing whitespace";
  return raw;
}

export function isNsError(result: string): boolean {
  return (
    result === "--ns requires a value" ||
    result === "--ns must not have leading or trailing whitespace"
  );
}
