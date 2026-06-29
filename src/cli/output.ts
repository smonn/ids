import type { WrappedKind } from "../codecs/wrapped/index.js";

/**
 * What an `inspect` recovered from one ID. `timestamp` covers the timestamp family
 * (with an optional `verified` flag for the signed codec); `wrapped` carries the
 * recovered lookup key and its kind.
 */
export type InspectReport =
  | {
      readonly shape: "timestamp";
      readonly brand: string;
      readonly codec: string;
      readonly ms: number;
      readonly uuid: string;
      readonly verified?: boolean;
    }
  | {
      readonly shape: "wrapped";
      readonly brand: string;
      readonly codec: string;
      readonly value: number | bigint;
      readonly kind: WrappedKind;
      readonly uuid: string;
    };

export type MatchReport = { readonly id: string; readonly matched: boolean };

function line(label: string, value: string): string {
  return `${`${label}:`.padEnd(11)}${value}\n`;
}

export function formatInspectHuman(report: InspectReport): string {
  if (report.shape === "wrapped") {
    return (
      line("brand", report.brand) +
      line("codec", report.codec) +
      line("value", report.value.toString()) +
      line("kind", report.kind) +
      line("uuid", report.uuid)
    );
  }
  const iso = new Date(report.ms).toISOString();
  let out =
    line("brand", report.brand) +
    line("codec", report.codec) +
    line("timestamp", `${report.ms} (${iso})`);
  if (report.verified !== undefined) out += line("verified", String(report.verified));
  return out + line("uuid", report.uuid);
}

export function formatInspectJson(report: InspectReport): string {
  if (report.shape === "wrapped") {
    // u64/i64 exceed 2^53, so 64-bit kinds are always emitted as JSON strings.
    const value =
      report.kind === "u64" || report.kind === "i64" ? report.value.toString() : report.value;
    return `${JSON.stringify({ brand: report.brand, codec: report.codec, value, kind: report.kind, uuid: report.uuid })}\n`;
  }
  const obj: Record<string, unknown> = {
    brand: report.brand,
    codec: report.codec,
    timestamp: { ms: report.ms, iso: new Date(report.ms).toISOString() },
  };
  if (report.verified !== undefined) obj["verified"] = report.verified;
  obj["uuid"] = report.uuid;
  return `${JSON.stringify(obj)}\n`;
}

export function formatMatchHuman(report: MatchReport): string {
  return `match: ${report.matched}\n`;
}

export function formatMatchJson(report: MatchReport): string {
  return `${JSON.stringify({ id: report.id, match: report.matched })}\n`;
}
