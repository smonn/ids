import { type CliError, usageError } from "./errors.js";
import { maxGenerateCount } from "./constants.js";

export function parseCount(values: Map<string, string>): number | CliError {
  const raw = values.get("--count");
  if (raw === undefined) return 1;
  if (raw === "") return usageError("--count requires a value");
  if (!/^[1-9][0-9]*$/.test(raw))
    return usageError(`--count must be a positive integer, got '${raw}'`);
  const count = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(count) || count > maxGenerateCount) {
    return usageError(`--count must be at most ${maxGenerateCount}, got '${raw}'`);
  }
  return count;
}

export type WrappedKindValue = "u32" | "i32" | "u64" | "i64";

export function parseKind(values: Map<string, string>): WrappedKindValue | CliError | undefined {
  const raw = values.get("--kind");
  if (raw === undefined) return undefined;
  if (raw === "") return usageError("--kind requires a value");
  if (raw === "u32" || raw === "i32" || raw === "u64" || raw === "i64") return raw;
  return usageError(`--kind must be u32, i32, u64, or i64, got '${raw}'`);
}

export function parseNs(values: Map<string, string>): string | CliError | undefined {
  const raw = values.get("--ns");
  if (raw === undefined) return undefined;
  if (raw.trim() === "") return usageError("--ns requires a value");
  if (raw !== raw.trim()) return usageError("--ns must not have leading or trailing whitespace");
  return raw;
}
