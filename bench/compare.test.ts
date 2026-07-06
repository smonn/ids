import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isBlockingEligible, readReport, renderComment } from "./compare.js";
import type { Report } from "./compare.js";

describe("isBlockingEligible", () => {
  it("gates sync ns-scale benches (eligible)", () => {
    expect(isBlockingEligible("generate")).toBe(true);
    expect(isBlockingEligible("is(canonical)")).toBe(true);
    expect(isBlockingEligible("parse(canonical)")).toBe(true);
    expect(isBlockingEligible("safeParse(canonical)")).toBe(true);
    expect(isBlockingEligible("safeParse(lenient)")).toBe(true);
    expect(isBlockingEligible("extractTimestamp")).toBe(true);
    expect(isBlockingEligible("encodeBase32")).toBe(true);
    expect(isBlockingEligible("decodeBase32")).toBe(true);
  });

  it("gates reverse.* benches (sync inversion, same variance profile as plain Timestamp)", () => {
    expect(isBlockingEligible("reverse.generate")).toBe(true);
    expect(isBlockingEligible("reverse.extractTimestamp")).toBe(true);
  });

  it("never gates opaque.* benches (AES-CBC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("opaque.generate")).toBe(false);
    expect(isBlockingEligible("opaque.extractTimestamp")).toBe(false);
    expect(isBlockingEligible("opaque.someNewBench")).toBe(false);
  });

  it("never gates wrapped.* benches (AES + HMAC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("wrapped.wrap")).toBe(false);
    expect(isBlockingEligible("wrapped.unwrap")).toBe(false);
    expect(isBlockingEligible("wrapped.someNewBench")).toBe(false);
  });

  it("never gates signed.* benches (HMAC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("signed.generate")).toBe(false);
    expect(isBlockingEligible("signed.verify")).toBe(false);
    expect(isBlockingEligible("signed.someNewBench")).toBe(false);
  });

  it("never gates digest.* benches (HMAC async crypto, high CI runner variance)", () => {
    expect(isBlockingEligible("digest.digest")).toBe(false);
    expect(isBlockingEligible("digest.someNewBench")).toBe(false);
  });
});

function bench(name: string, p50_ns: number) {
  return {
    name,
    avg_ns: p50_ns,
    min_ns: p50_ns,
    p50_ns,
    p75_ns: p50_ns,
    p99_ns: p50_ns,
    samples: 100,
  };
}

function report(benches: ReturnType<typeof bench>[], cpuModel?: string): Report {
  return {
    schema: 1,
    node: "v22.0.0",
    platform: "linux x64",
    ...(cpuModel !== undefined && { cpuModel }),
    benches,
  };
}

describe("renderComment", () => {
  it("collapses within-noise benches into a <details> block and shows only their count in the headline", () => {
    const out = renderComment(
      report([bench("generate", 100), bench("parse(canonical)", 100)]),
      report([bench("generate", 101), bench("parse(canonical)", 99)]),
    );
    expect(out).toContain("✅ 2 within noise");
    expect(out).toContain("<details>");
    expect(out).toContain(
      "<summary>✅ 2 benches within noise (±15% sync / ±40% async-crypto)</summary>",
    );
    // Quiet rows live inside the collapsed block: nothing between the headline
    // and <details> but blank lines (no unfolded attention table).
    const headlineIdx = out.indexOf("✅ 2 within noise");
    const detailsIdx = out.indexOf("<details>");
    expect(out.slice(headlineIdx, detailsIdx)).not.toContain("| `");
  });

  it("unfolds warn regressions above the fold with a ⚠️ note", () => {
    const out = renderComment(
      report([bench("generate", 100), bench("parse(canonical)", 100)]),
      report([bench("generate", 120), bench("parse(canonical)", 100)]),
    );
    const detailsIdx = out.indexOf("<details>");
    const generateIdx = out.indexOf("| `generate` |");
    expect(generateIdx).toBeGreaterThan(-1);
    expect(generateIdx).toBeLessThan(detailsIdx);
    expect(out).toContain("⚠️ regression (warn)");
    expect(out).toContain("⚠️ 1 regression (warn) · ✅ 1 within noise");
  });

  it("unfolds severe regressions with a 🛑 note and keeps the review advisory", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 140)]));
    expect(out).toContain("🛑 **1 severe regression**");
    expect(out).toContain("🛑 **regression (severe)**");
    expect(out).toContain("does not block merge");
  });

  it("emits the mixed-band warn label when severe > 0 and regressions > severe", () => {
    // generate at +35% → severe (sync, above SEVERE_THRESHOLD 30%)
    // opaque.generate at +45% → warn (async, above ASYNC_WARN_THRESHOLD 40%), never severe
    // Result: severe=1, regressions=2, regressions > severe → "1 more above warn" line fires.
    const out = renderComment(
      report([bench("generate", 100), bench("opaque.generate", 100)]),
      report([bench("generate", 135), bench("opaque.generate", 145)]),
    );
    expect(out).toContain("🛑 **1 severe regression**");
    expect(out).toContain("1 more above warn (±15% sync / ±40% async-crypto).");
  });

  it("never marks async-crypto benches severe, even above the severe threshold", () => {
    // +50% delta is above ASYNC_WARN_THRESHOLD (±40%) so it classifies as warn,
    // and above SEVERE_THRESHOLD (30%) but must never be severe.
    const out = renderComment(
      report([bench("signed.generate", 100)]),
      report([bench("signed.generate", 150)]),
    );
    expect(out).toContain("⚠️ regression (warn)");
    expect(out).not.toContain("🛑");
    expect(out).not.toContain("regression (severe)");
  });

  it("unfolds improvements with a 🟢 note", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 80)]));
    expect(out).toContain("🟢 1 improvement");
    expect(out).toContain("🟢 improvement");
  });

  it("unfolds new and removed benches and reports their counts in the headline", () => {
    const out = renderComment(report([bench("oldBench", 100)]), report([bench("newBench", 100)]));
    const detailsIdx = out.indexOf("<details>");
    expect(detailsIdx).toBe(-1); // no quiet rows at all
    expect(out).toContain("| `newBench` | — |");
    expect(out).toContain("➕ new");
    expect(out).toContain("| `oldBench` |");
    expect(out).toContain("➖ removed");
    // Headline must surface the structural change, not just "0 within noise".
    expect(out).toContain("➕ 1 new");
    expect(out).toContain("➖ 1 removed");
  });

  it("omits the attention table when everything is within noise", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 100)]));
    expect(out).not.toContain("| Notes |");
    expect(out).toContain("✅ 1 within noise");
  });

  it("moves the threshold boilerplate into a <sub> footer", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 100)]));
    expect(out).toContain("<sub>Thresholds on p50");
    expect(out).toContain("sync warn ±15%");
    expect(out).toContain("async-crypto warn ±40%");
    expect(out).toContain("`v22.0.0` linux x64");
  });

  it("shows CPU-model provenance in the footer when both reports carry it", () => {
    const out = renderComment(
      report([bench("generate", 100)], "Intel(R) Xeon(R) Platinum 8370C"),
      report([bench("generate", 100)], "Intel(R) Xeon(R) Platinum 8370C"),
    );
    expect(out).toContain("Base: `v22.0.0` linux x64 (Intel(R) Xeon(R) Platinum 8370C).");
    expect(out).toContain("PR: `v22.0.0` linux x64 (Intel(R) Xeon(R) Platinum 8370C).");
  });

  it("tolerates a baseline without cpuModel (pre-#1046 report): no caveat, PR-side provenance only", () => {
    const out = renderComment(
      report([bench("generate", 100)]),
      report([bench("generate", 140)], "Intel(R) Xeon(R) Platinum 8370C"),
    );
    expect(out).toContain("Base: `v22.0.0` linux x64. PR:");
    expect(out).toContain("PR: `v22.0.0` linux x64 (Intel(R) Xeon(R) Platinum 8370C).");
    expect(out).not.toContain("Cross-model comparison");
  });

  it("tolerates a PR report without cpuModel: no caveat, base-side provenance only", () => {
    const out = renderComment(
      report([bench("generate", 100)], "Intel(R) Xeon(R) Platinum 8370C"),
      report([bench("generate", 140)]),
    );
    expect(out).toContain("Base: `v22.0.0` linux x64 (Intel(R) Xeon(R) Platinum 8370C).");
    expect(out).toContain("PR: `v22.0.0` linux x64.");
    expect(out).not.toContain("Cross-model comparison");
  });

  it("flags a cross-model comparison with a caveat line, without changing classification", () => {
    const out = renderComment(
      report([bench("generate", 100)], "Intel(R) Xeon(R) Platinum 8272CL"),
      report([bench("generate", 140)], "AMD EPYC 7763"),
    );
    expect(out).toContain("Cross-model comparison");
    expect(out).toContain("`Intel(R) Xeon(R) Platinum 8272CL`");
    expect(out).toContain("`AMD EPYC 7763`");
    // Caveat sits above the attention table, right after the headline.
    expect(out.indexOf("Cross-model comparison")).toBeLessThan(out.indexOf("| Bench |"));
    // Classification is untouched: a +40% sync regression is still severe.
    expect(out).toContain("🛑 **1 severe regression**");
  });

  it("omits the cross-model caveat when both reports carry the same cpuModel", () => {
    const out = renderComment(
      report([bench("generate", 100)], "AMD EPYC 7763"),
      report([bench("generate", 140)], "AMD EPYC 7763"),
    );
    expect(out).not.toContain("Cross-model comparison");
  });

  it("reports absolute numbers only when there is no baseline", () => {
    const out = renderComment(null, report([bench("generate", 100)]));
    expect(out).toContain("_No baseline available");
    expect(out).toContain("| `generate` |");
    expect(out).not.toContain("<details>");
  });

  it("records PR provenance in a footer even when there is no baseline", () => {
    const out = renderComment(
      null,
      report([bench("generate", 100)], "Intel(R) Xeon(R) Platinum 8370C"),
    );
    expect(out).toContain("<sub>PR: `v22.0.0` linux x64 (Intel(R) Xeon(R) Platinum 8370C).</sub>");
  });
});

// Bug 1 — async-crypto benches use ASYNC_WARN_THRESHOLD (±40%), not WARN_THRESHOLD (±15%).
describe("async-crypto warn band (ASYNC_WARN_THRESHOLD)", () => {
  it("folds an opaque.generate bench at +30% delta into within-noise (below ±40% band)", () => {
    // +30% is within async noise — should NOT appear in the attention table.
    const out = renderComment(
      report([bench("opaque.generate", 100)]),
      report([bench("opaque.generate", 130)]),
    );
    expect(out).toContain("✅ 1 within noise");
    expect(out).not.toContain("⚠️ regression (warn)");
    expect(out).not.toContain("regressions");
  });

  it("classifies an opaque.generate bench at +45% delta as warn (above ±40% band), never severe", () => {
    // +45% is outside the async noise band — appears as warn, never severe.
    const out = renderComment(
      report([bench("opaque.generate", 100)]),
      report([bench("opaque.generate", 145)]),
    );
    expect(out).toContain("⚠️ regression (warn)");
    expect(out).not.toContain("🛑");
    expect(out).not.toContain("regression (severe)");
  });

  it("folds an opaque.generate bench at exactly +40% into within-noise (positive boundary inclusive)", () => {
    const out = renderComment(
      report([bench("opaque.generate", 100)]),
      report([bench("opaque.generate", 140)]),
    );
    expect(out).toContain("✅ 1 within noise");
    expect(out).not.toContain("⚠️ regression (warn)");
  });

  it("folds an opaque.generate bench at exactly −40% into within-noise (negative boundary inclusive)", () => {
    // delta = (60-100)/100 = -0.4; -0.4 < -0.4 is false → ok (within noise), not improvement.
    const out = renderComment(
      report([bench("opaque.generate", 100)]),
      report([bench("opaque.generate", 60)]),
    );
    expect(out).toContain("✅ 1 within noise");
    expect(out).not.toContain("🟢 improvement");
  });

  it("classifies an opaque.generate bench at −45% delta as improvement (below negative boundary)", () => {
    // delta = (55-100)/100 = -0.45; -0.45 < -0.4 → improvement path for async benches.
    const out = renderComment(
      report([bench("opaque.generate", 100)]),
      report([bench("opaque.generate", 55)]),
    );
    expect(out).toContain("🟢 improvement");
    expect(out).not.toContain("⚠️ regression (warn)");
  });

  it("does not change sync bench classification — generate at +20% is still warn", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 120)]));
    expect(out).toContain("⚠️ regression (warn)");
  });
});

// Bug 2 — readReport validates schema and per-bench p50_ns before returning.
describe("readReport validation", () => {
  function writeTmp(content: string): string {
    const path = join(
      tmpdir(),
      `ids-bench-test-${process.pid}-${Math.floor(Math.random() * 1e9)}.json`,
    );
    writeFileSync(path, content, "utf8");
    return path;
  }

  const validReport = {
    schema: 1,
    node: "v22.0.0",
    platform: "linux x64",
    benches: [
      {
        name: "generate",
        p50_ns: 100,
        avg_ns: 100,
        min_ns: 100,
        p75_ns: 100,
        p99_ns: 100,
        samples: 10,
      },
    ],
  };

  it("returns a valid report for well-formed JSON", () => {
    const path = writeTmp(JSON.stringify(validReport));
    expect(readReport(path)).toEqual(validReport);
  });

  it("returns null for an empty file", () => {
    const path = writeTmp("");
    expect(readReport(path)).toBeNull();
  });

  it("returns null for a missing file (ENOENT)", () => {
    expect(readReport("/nonexistent/__ids_bench_test_xyz__.json")).toBeNull();
  });

  it("returns null when schema !== 1 (schema-drifted cache)", () => {
    const path = writeTmp(JSON.stringify({ ...validReport, schema: 2 }));
    expect(readReport(path)).toBeNull();
  });

  it("returns null when schema is missing", () => {
    const { schema: _schema, ...noSchema } = validReport;
    const path = writeTmp(JSON.stringify(noSchema));
    expect(readReport(path)).toBeNull();
  });

  it("returns null when a bench entry has a non-finite p50_ns (NaN serialises to null)", () => {
    // JSON.stringify converts NaN to null; the validator checks Number.isFinite.
    const drifted = { ...validReport, benches: [{ ...validReport.benches[0], p50_ns: null }] };
    const path = writeTmp(JSON.stringify(drifted));
    expect(readReport(path)).toBeNull();
  });

  it("returns null when a bench entry has a string p50_ns (drifted schema field type)", () => {
    const drifted = { ...validReport, benches: [{ ...validReport.benches[0], p50_ns: "fast" }] };
    const path = writeTmp(JSON.stringify(drifted));
    expect(readReport(path)).toBeNull();
  });

  it("returns null when a bench entry is missing p50_ns entirely", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { p50_ns: _p, ...noBench } = validReport.benches[0]!;
    const drifted = { ...validReport, benches: [noBench] };
    const path = writeTmp(JSON.stringify(drifted));
    expect(readReport(path)).toBeNull();
  });

  // Class-level: no path through renderComment may emit NaN or Infinity in a cell.
  it("renderComment with null baseline (as produced by a drifted readReport) emits no NaN or Infinity", () => {
    const out = renderComment(null, report([bench("generate", 100)]));
    expect(out).not.toContain("NaN");
    expect(out).not.toContain("Infinity");
    expect(out).toContain("_No baseline available");
  });
});

// Bug 3 — headline includes ➕ N new · ➖ N removed segments when non-zero.
describe("headline new/removed counts", () => {
  it("includes ➕ 1 new and ➖ 1 removed in the headline when a bench is renamed", () => {
    const out = renderComment(report([bench("oldBench", 100)]), report([bench("newBench", 100)]));
    expect(out).toContain("➕ 1 new");
    expect(out).toContain("➖ 1 removed");
  });

  it("omits ➕ / ➖ segments when there are no new or removed benches", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 100)]));
    expect(out).not.toContain("➕");
    expect(out).not.toContain("➖");
  });

  it("includes only ➕ N new when benches are added but none removed", () => {
    const out = renderComment(
      report([bench("generate", 100)]),
      report([bench("generate", 100), bench("newBench", 100)]),
    );
    expect(out).toContain("➕ 1 new");
    expect(out).not.toContain("➖");
  });

  it("includes only ➖ N removed when benches are removed but none added", () => {
    const out = renderComment(
      report([bench("generate", 100), bench("oldBench", 100)]),
      report([bench("generate", 100)]),
    );
    expect(out).toContain("➖ 1 removed");
    expect(out).not.toContain("➕");
  });

  it("counts multiple new and removed benches correctly in the headline", () => {
    const out = renderComment(
      report([bench("a", 100), bench("b", 100)]),
      report([bench("c", 100), bench("d", 100)]),
    );
    expect(out).toContain("➕ 2 new");
    expect(out).toContain("➖ 2 removed");
  });
});
