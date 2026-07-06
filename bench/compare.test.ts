import { describe, expect, it } from "vitest";
import { isBlockingEligible, renderComment } from "./compare.js";
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
    expect(out).toContain("<summary>✅ 2 benches within noise (±15%)</summary>");
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

  it("never marks async-crypto benches severe, even above the severe threshold", () => {
    const out = renderComment(
      report([bench("signed.generate", 100)]),
      report([bench("signed.generate", 140)]),
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

  it("unfolds new and removed benches", () => {
    const out = renderComment(report([bench("oldBench", 100)]), report([bench("newBench", 100)]));
    const detailsIdx = out.indexOf("<details>");
    expect(detailsIdx).toBe(-1); // no quiet rows at all
    expect(out).toContain("| `newBench` | — |");
    expect(out).toContain("➕ new");
    expect(out).toContain("| `oldBench` |");
    expect(out).toContain("➖ removed");
  });

  it("omits the attention table when everything is within noise", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 100)]));
    expect(out).not.toContain("| Notes |");
    expect(out).toContain("✅ 1 within noise");
  });

  it("moves the threshold boilerplate into a <sub> footer", () => {
    const out = renderComment(report([bench("generate", 100)]), report([bench("generate", 100)]));
    expect(out).toContain("<sub>Thresholds on p50");
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
});
