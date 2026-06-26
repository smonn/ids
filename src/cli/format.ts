import { isIdsError } from "../error.js";
import type { Id } from "../types.js";

type InspectOutput = {
  brand: string;
  timestamp: Date;
  canonical: Id<string>;
  uuid: string;
  input: string;
  nowMs: number;
};

type SignedInspectOutput = InspectOutput & {
  verification: "ok" | "failed" | "unavailable";
};

type WrappedInspectOutput = {
  brand: string;
  lookupKey: number | bigint;
  canonical: Id<string>;
  uuid: string;
  input: string;
};

export const invalidIdPrefix = "invalid_id: ";

export function formatCliError(err: unknown): string {
  return isIdsError(err)
    ? `${err.code}: ${err.message}`
    : err instanceof Error
      ? err.message
      : String(err);
}

export function formatWrappedInspectOutput(result: WrappedInspectOutput): string {
  const inputLine = describeInputForm(result.input, result.canonical);
  return [
    `brand:      ${result.brand}`,
    `lookup-key: ${result.lookupKey.toString()}`,
    `canonical:  ${result.canonical}`,
    `uuid:       ${result.uuid}`,
    `input:      ${inputLine}`,
    "",
  ].join("\n");
}

export function formatSignedInspectOutput(result: SignedInspectOutput): string {
  const relative = formatRelative(result.timestamp.getTime(), result.nowMs);
  const inputLine = describeInputForm(result.input, result.canonical);
  const lines = [
    `brand:     ${result.brand}`,
    `timestamp: ${result.timestamp.toISOString()} (${relative})`,
  ];
  // "verification:" is the spec-mandated key name; the extra chars vs. other labels are intentional.
  lines.push(`verification: ${result.verification}`);
  lines.push(
    `canonical: ${result.canonical}`,
    `uuid:      ${result.uuid}`,
    `input:     ${inputLine}`,
    "",
  );
  return lines.join("\n");
}

export function formatInspectOutput(result: InspectOutput): string {
  const relative = formatRelative(result.timestamp.getTime(), result.nowMs);
  const inputLine = describeInputForm(result.input, result.canonical);
  return [
    `brand:     ${result.brand}`,
    `timestamp: ${result.timestamp.toISOString()} (${relative})`,
    `canonical: ${result.canonical}`,
    `uuid:      ${result.uuid}`,
    `input:     ${inputLine}`,
    "",
  ].join("\n");
}

function describeInputForm(input: string, canonical: Id<string>): string {
  if (input === canonical) return "canonical";
  const notes: string[] = [];
  if (input !== input.toLowerCase()) notes.push("was uppercase");
  if (/[ilo]/i.test(input.slice(4))) notes.push("used Crockford aliases");
  return `not canonical (${notes.join(" + ")})`;
}

const msPerSecond = 1000;
export const msPerMinute: number = 60 * msPerSecond;
export const msPerHour: number = 60 * msPerMinute;
export const msPerDay: number = 24 * msPerHour;
const daysPerMonth = 30.44;
const monthsPerYear = 12;

function formatRelative(thenMs: number, nowMs: number): string {
  const diff = nowMs - thenMs;
  const abs = Math.abs(diff);
  const suffix = diff < 0 ? "from now" : "ago";

  const head = headUnits(abs);
  return head === "" ? "just now" : `${head} ${suffix}`;
}

function headUnits(abs: number): string {
  if (abs < msPerMinute) return "";
  if (abs < msPerHour) return unit(Math.round(abs / msPerMinute), "minute");
  if (abs < msPerDay) return unit(Math.round(abs / msPerHour), "hour");
  if (abs < msPerDay * daysPerMonth) return unit(Math.round(abs / msPerDay), "day");

  const totalMonths = Math.round(abs / (msPerDay * daysPerMonth));
  if (totalMonths < monthsPerYear) return unit(totalMonths, "month");

  const years = Math.floor(totalMonths / monthsPerYear);
  const months = totalMonths % monthsPerYear;
  return months === 0 ? unit(years, "year") : `${unit(years, "year")} ${unit(months, "month")}`;
}

function unit(n: number, name: string): string {
  return `${n} ${n === 1 ? name : `${name}s`}`;
}
