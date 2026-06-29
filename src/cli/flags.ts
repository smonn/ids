import { maxGenerateCount } from "./constants.js";

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
