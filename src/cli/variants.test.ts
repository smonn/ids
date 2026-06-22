import { describe, expect, it } from "vitest";
import {
  conflictPriorityOrder,
  generatePolicy,
  inspectPolicy,
  keygenPolicy,
  opaqueVariant,
  reverseVariant,
  signedVariant,
  timestampVariant,
  wrappedVariant,
} from "./variants.js";
import { importOpaqueKey } from "../opaque.js";
import { importSigningKey } from "../signed.js";
import { importWrappingKey } from "../wrapped.js";
import type { RunOpts } from "./types.js";

const testKeyBytes = new Uint8Array(32).fill(0xab);

function makeOpts(env: Record<string, string> = {}): RunOpts {
  return {
    argv: [],
    stdout: () => {},
    stderr: () => {},
    now: () => 0x123456789abc,
    rng: (t) => t.fill(0x00),
    env,
  };
}

describe("timestampVariant", () => {
  it("has no flag (default variant)", () => {
    expect(timestampVariant.flag).toBeUndefined();
  });

  it("has no key facet", () => {
    expect(timestampVariant.key).toBeUndefined();
  });

  it("has readable inspectMode", () => {
    expect(timestampVariant.inspectMode).toBe("readable");
  });

  it("has no extraFlags", () => {
    expect(timestampVariant.extraFlags).toBeUndefined();
  });

  it("construct returns a codec for a valid brand", () => {
    const result = timestampVariant.construct("tst", makeOpts());
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("construct returns error string for invalid brand", () => {
    const result = timestampVariant.construct("", makeOpts());
    expect(typeof result).toBe("string");
    expect(result).toContain("invalid_brand");
  });
});

describe("opaqueVariant", () => {
  it("has --opaque flag", () => {
    expect(opaqueVariant.flag).toBe("--opaque");
  });

  it("has a key facet with IDS_KEY env var", () => {
    expect(opaqueVariant.key).toBeDefined();
    expect(opaqueVariant.key!.envVar).toBe("IDS_KEY");
    expect(opaqueVariant.key!.formatEnvVar).toBe("IDS_KEY_FORMAT");
  });

  it("key facet encode/decode round-trips", () => {
    const encoded = opaqueVariant.key!.encode(testKeyBytes, "hex");
    const decoded = opaqueVariant.key!.decode(encoded, "hex");
    expect(decoded).toEqual(testKeyBytes);
  });

  it("has keyed-readable inspectMode", () => {
    expect(opaqueVariant.inspectMode).toBe("keyed-readable");
  });

  it("has no extraFlags", () => {
    expect(opaqueVariant.extraFlags).toBeUndefined();
  });

  it("construct returns a codec with a valid key", async () => {
    const key = await importOpaqueKey(testKeyBytes);
    const result = opaqueVariant.construct("tst", makeOpts(), key);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("construct returns error string for invalid brand", async () => {
    const key = await importOpaqueKey(testKeyBytes);
    const result = opaqueVariant.construct("", makeOpts(), key);
    expect(typeof result).toBe("string");
    expect(result).toContain("invalid_brand");
  });
});

describe("reverseVariant", () => {
  it("has --reverse flag", () => {
    expect(reverseVariant.flag).toBe("--reverse");
  });

  it("has no key facet", () => {
    expect(reverseVariant.key).toBeUndefined();
  });

  it("has readable inspectMode", () => {
    expect(reverseVariant.inspectMode).toBe("readable");
  });

  it("has no extraFlags", () => {
    expect(reverseVariant.extraFlags).toBeUndefined();
  });

  it("construct returns a codec for a valid brand", () => {
    const result = reverseVariant.construct("tst", makeOpts());
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("construct returns error string for invalid brand", () => {
    const result = reverseVariant.construct("", makeOpts());
    expect(typeof result).toBe("string");
    expect(result).toContain("invalid_brand");
  });
});

describe("wrappedVariant", () => {
  it("has --wrapped flag", () => {
    expect(wrappedVariant.flag).toBe("--wrapped");
  });

  it("has a key facet with IDS_WRAPPING_KEY env var", () => {
    expect(wrappedVariant.key).toBeDefined();
    expect(wrappedVariant.key!.envVar).toBe("IDS_WRAPPING_KEY");
    expect(wrappedVariant.key!.formatEnvVar).toBe("IDS_WRAPPING_KEY_FORMAT");
  });

  it("key facet encode/decode round-trips", () => {
    const encoded = wrappedVariant.key!.encode(testKeyBytes, "hex");
    const decoded = wrappedVariant.key!.decode(encoded, "hex");
    expect(decoded).toEqual(testKeyBytes);
  });

  it("has unwrap inspectMode", () => {
    expect(wrappedVariant.inspectMode).toBe("unwrap");
  });

  it("has --kind in extraFlags", () => {
    expect(wrappedVariant.extraFlags).toContain("--kind");
  });

  it("construct returns error string when --kind is missing (explicit Map)", () => {
    const result = wrappedVariant.construct("tst", makeOpts(), undefined, new Map());
    expect(result).toBe("--kind is required with --wrapped");
  });

  it("construct returns error string when values is undefined (covers ?? new Map() branch)", () => {
    const result = wrappedVariant.construct("tst", makeOpts(), undefined, undefined);
    expect(result).toBe("--kind is required with --wrapped");
  });

  it("construct returns error string when --kind has no value", () => {
    const result = wrappedVariant.construct(
      "tst",
      makeOpts(),
      undefined,
      new Map([["--kind", ""]]),
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("--kind requires a value");
  });

  it("construct returns error string for invalid --kind value", () => {
    const result = wrappedVariant.construct(
      "tst",
      makeOpts(),
      undefined,
      new Map([["--kind", "bad"]]),
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("--kind must be");
  });

  it("construct returns a codec with a valid key and kind", async () => {
    const key = await importWrappingKey(testKeyBytes);
    const result = wrappedVariant.construct("tst", makeOpts(), key, new Map([["--kind", "u32"]]));
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("construct returns error string for invalid brand", async () => {
    const key = await importWrappingKey(testKeyBytes);
    const result = wrappedVariant.construct("", makeOpts(), key, new Map([["--kind", "u32"]]));
    expect(typeof result).toBe("string");
    expect(result).toContain("invalid_brand");
  });
});

describe("signedVariant", () => {
  it("has --signed flag", () => {
    expect(signedVariant.flag).toBe("--signed");
  });

  it("has a key facet with IDS_SIGNING_KEY env var", () => {
    expect(signedVariant.key).toBeDefined();
    expect(signedVariant.key!.envVar).toBe("IDS_SIGNING_KEY");
    expect(signedVariant.key!.formatEnvVar).toBe("IDS_SIGNING_KEY_FORMAT");
  });

  it("key facet encode/decode round-trips", () => {
    const encoded = signedVariant.key!.encode(testKeyBytes, "hex");
    const decoded = signedVariant.key!.decode(encoded, "hex");
    expect(decoded).toEqual(testKeyBytes);
  });

  it("has verify inspectMode", () => {
    expect(signedVariant.inspectMode).toBe("verify");
  });

  it("has no extraFlags", () => {
    expect(signedVariant.extraFlags).toBeUndefined();
  });

  it("construct returns a codec with a valid key", async () => {
    const key = await importSigningKey(testKeyBytes);
    const result = signedVariant.construct("tst", makeOpts(), key);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("construct returns error string for invalid brand", async () => {
    const key = await importSigningKey(testKeyBytes);
    const result = signedVariant.construct("", makeOpts(), key);
    expect(typeof result).toBe("string");
    expect(result).toContain("invalid_brand");
  });
});

describe("conflictPriorityOrder", () => {
  it("has signed first", () => {
    expect(conflictPriorityOrder[0]).toBe(signedVariant);
  });

  it("has reverse second", () => {
    expect(conflictPriorityOrder[1]).toBe(reverseVariant);
  });

  it("has wrapped third", () => {
    expect(conflictPriorityOrder[2]).toBe(wrappedVariant);
  });

  it("has opaque fourth", () => {
    expect(conflictPriorityOrder[3]).toBe(opaqueVariant);
  });
});

describe("generatePolicy", () => {
  it("default is timestampVariant", () => {
    expect(generatePolicy.default).toBe(timestampVariant);
  });

  it("selectable contains opaque, reverse, signed (not wrapped)", () => {
    expect(generatePolicy.selectable).toContain(opaqueVariant);
    expect(generatePolicy.selectable).toContain(reverseVariant);
    expect(generatePolicy.selectable).toContain(signedVariant);
    expect(generatePolicy.selectable).not.toContain(wrappedVariant);
    expect(generatePolicy.selectable).not.toContain(timestampVariant);
  });

  it("intrinsicFlags includes --count and -c", () => {
    expect(generatePolicy.intrinsicFlags).toContain("--count");
    expect(generatePolicy.intrinsicFlags).toContain("-c");
  });
});

describe("inspectPolicy", () => {
  it("default is timestampVariant", () => {
    expect(inspectPolicy.default).toBe(timestampVariant);
  });

  it("selectable contains all non-default variants", () => {
    expect(inspectPolicy.selectable).toContain(reverseVariant);
    expect(inspectPolicy.selectable).toContain(wrappedVariant);
    expect(inspectPolicy.selectable).toContain(opaqueVariant);
    expect(inspectPolicy.selectable).toContain(signedVariant);
    expect(inspectPolicy.selectable).not.toContain(timestampVariant);
  });

  it("intrinsicFlags is empty", () => {
    expect(inspectPolicy.intrinsicFlags).toHaveLength(0);
  });
});

describe("keygenPolicy", () => {
  it("default is opaqueVariant", () => {
    expect(keygenPolicy.default).toBe(opaqueVariant);
  });

  it("selectable contains wrapped and signed but not opaque", () => {
    expect(keygenPolicy.selectable).toContain(wrappedVariant);
    expect(keygenPolicy.selectable).toContain(signedVariant);
    expect(keygenPolicy.selectable).not.toContain(opaqueVariant);
    expect(keygenPolicy.selectable).not.toContain(reverseVariant);
    expect(keygenPolicy.selectable).not.toContain(timestampVariant);
  });

  it("intrinsicFlags includes --bits", () => {
    expect(keygenPolicy.intrinsicFlags).toContain("--bits");
  });
});
