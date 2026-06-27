import { describe, expect, it } from "vitest";
import { toWireId, payloadBytesFromId } from "./envelope.js";
import type { Id } from "../types.js";

const PREFIX = "usr_" as const;
type Brand = "usr";

describe("toWireId", () => {
  it("produces a string beginning with the expected prefix followed by a 26-character base32 payload", () => {
    const payload = new Uint8Array(16);
    const id = toWireId(PREFIX, payload);
    expect(id.startsWith(PREFIX)).toBe(true);
    expect(id.slice(PREFIX.length)).toHaveLength(26);
  });
});

describe("payloadBytesFromId", () => {
  it("recovers the original 16-byte payload from an ID produced by toWireId (round-trip)", () => {
    const payload = new Uint8Array(16);
    for (let i = 0; i < 16; i++) payload[i] = i;
    const id = toWireId(PREFIX, payload) as Id<Brand>;
    const recovered = payloadBytesFromId(PREFIX, id);
    expect(Array.from(recovered)).toEqual(Array.from(payload));
  });
});
