import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTimestampId } from "../src/index.js";
import { createReverseTimestampId } from "../src/codecs/reverse/index.js";
import type { Id, ParseResult } from "../src/index.js";

/*
  Frozen-oracle conformance harness for spec/vectors.json (ADR-0025, ADR-0026).

  The committed vectors are the source of truth: this suite asserts the
  reference implementation's output `toEqual` each vector's `expected`. It must
  NEVER be turned into a snapshot or regenerated from the implementation — a
  red assertion means the *code* drifted from the frozen wire, not that the
  vector is wrong. See the freeze guard in ADR-0025.

  All v1 vectors are authored against the brand `usr`; the brand is visible in
  every id string, so the harness fixes it here rather than carrying a per-vector
  brand field.
*/

const BRAND = "usr";

type Layer = "prefix" | "base32" | "uuid" | "not_a_string";
type BoundaryOutcome = { ok: true; id: string } | { ok: false; layer: Layer };
type GenerateInput = { timestamp: number; rng: string };
type Vector = {
  name: string;
  description?: string;
  category: string;
  operation: string;
  input: unknown;
  expected: unknown;
};
type VectorsFile = { version: number; vectors: Vector[] };

const file = JSON.parse(
  readFileSync(new URL("./vectors.json", import.meta.url), "utf8"),
) as VectorsFile;

// The seven in-scope (category, operation) pairs for v1 (ADR-0025): the shared
// wire layer plus the two plaintext timestamp codecs and the raw UUID mapping.
const IN_SCOPE: readonly string[] = [
  "wire|canonicalize",
  "wire|to_uuid",
  "wire|from_uuid",
  "codec:timestamp|extract",
  "codec:timestamp|generate",
  "codec:reverse|extract",
  "codec:reverse|generate",
];

// The reference implementation's ParseError reason strings are informative
// reference-impl API; SPEC.md freezes the structural *layer*. Map one to the
// other so the frozen file never bakes in a TS-specific reason string.
const REASON_TO_LAYER: Readonly<Record<string, Layer>> = {
  not_string: "not_a_string",
  invalid_prefix: "prefix",
  invalid_base32: "base32",
  invalid_uuid: "uuid",
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBoundaryOutcome(result: ParseResult<string>): BoundaryOutcome {
  if (result.ok) return { ok: true, id: result.id };
  const layer = REASON_TO_LAYER[result.error];
  if (!layer) throw new Error(`unmapped ParseError reason: ${result.error}`);
  return { ok: false, layer };
}

// One shared codec per category for the rng-independent operations; the
// duplicate-brand warning is intentional here (every vector is brand `usr`).
const timestamp = createTimestampId(BRAND, { allowDuplicateBrand: true });
const reverse = createReverseTimestampId(BRAND, { allowDuplicateBrand: true });

function actualOutput(vector: Vector): unknown {
  const key = `${vector.category}|${vector.operation}`;
  switch (key) {
    case "codec:timestamp|extract":
      return timestamp.extractTimestamp(vector.input as Id<typeof BRAND>).getTime();
    case "codec:reverse|extract":
      return reverse.extractTimestamp(vector.input as Id<typeof BRAND>).getTime();
    case "codec:timestamp|generate": {
      const { timestamp: ms, rng } = vector.input as GenerateInput;
      const codec = createTimestampId(BRAND, {
        rng: (target) => target.set(hexToBytes(rng)),
        allowDuplicateBrand: true,
      });
      return codec.generateAt(new Date(ms));
    }
    case "codec:reverse|generate": {
      const { timestamp: ms, rng } = vector.input as GenerateInput;
      const codec = createReverseTimestampId(BRAND, {
        rng: (target) => target.set(hexToBytes(rng)),
        allowDuplicateBrand: true,
      });
      return codec.generateAt(new Date(ms));
    }
    case "wire|to_uuid":
      return timestamp.toUUID(vector.input as Id<typeof BRAND>);
    case "wire|from_uuid":
      return toBoundaryOutcome(timestamp.safeFromUUID(vector.input));
    case "wire|canonicalize":
      return toBoundaryOutcome(timestamp.safeParse(vector.input));
    default:
      throw new Error(`unknown vector (category, operation): ${key}`);
  }
}

describe("spec/vectors.json conformance", () => {
  it("declares a monotonic integer version", () => {
    expect(Number.isInteger(file.version)).toBe(true);
    expect(file.version).toBeGreaterThanOrEqual(1);
  });

  it("has unique vector names", () => {
    const names = file.vectors.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers every in-scope (category, operation) pair", () => {
    const present = new Set(file.vectors.map((v) => `${v.category}|${v.operation}`));
    for (const pair of IN_SCOPE) {
      expect(present, `missing vectors for ${pair}`).toContain(pair);
    }
  });

  it("contains only in-scope (category, operation) pairs", () => {
    for (const vector of file.vectors) {
      expect(IN_SCOPE).toContain(`${vector.category}|${vector.operation}`);
    }
  });

  for (const vector of file.vectors) {
    it(vector.name, () => {
      expect(actualOutput(vector)).toEqual(vector.expected);
    });
  }
});
