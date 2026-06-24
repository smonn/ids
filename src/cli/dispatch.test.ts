import { describe, expect, it } from "vitest";
import { buildCodec, deriveAllowedFlags, resolveVariant } from "./dispatch.js";
import {
  digestVariant,
  generatePolicy,
  inspectPolicy,
  keygenPolicy,
  opaqueVariant,
  reverseVariant,
  signedVariant,
  timestampVariant,
  wrappedVariant,
  type Descriptor,
  type Policy,
} from "./variants.js";
import { encodeDigestKey } from "../codecs/digest/index.js";
import { encodeOpaqueKey } from "../codecs/opaque/index.js";
import { encodeSigningKey } from "../codecs/signed/index.js";
import { encodeWrappingKey } from "../codecs/wrapped/index.js";
import type { RunOpts } from "./types.js";

const testKeyBytes = new Uint8Array(32).fill(0xab);
const testOpaqueHex = encodeOpaqueKey(testKeyBytes, "hex");
const testSigningHex = encodeSigningKey(testKeyBytes, "hex");
const testWrappingHex = encodeWrappingKey(testKeyBytes, "hex");
const testDigestHex = encodeDigestKey(testKeyBytes, "hex");

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

// A policy with no keyed variants, to cover the hasKeyed=false branch
const noKeyPolicy: Policy = {
  default: timestampVariant,
  selectable: [reverseVariant],
  intrinsicFlags: [],
};

// A flagless selectable descriptor, to cover the v.flag === undefined branch in deriveAllowedFlags
const flaglessDescriptor: Descriptor = {
  inspectMode: "readable",
  construct(brand, opts) {
    return timestampVariant.construct(brand, opts);
  },
};
const policyWithFlaglessSelectable: Policy = {
  default: timestampVariant,
  selectable: [flaglessDescriptor],
  intrinsicFlags: [],
};

describe("deriveAllowedFlags", () => {
  it("includes selectable flags", () => {
    const flags = deriveAllowedFlags(generatePolicy);
    expect(flags.has("--opaque")).toBe(true);
    expect(flags.has("--reverse")).toBe(true);
    expect(flags.has("--signed")).toBe(true);
  });

  it("excludes the default variant's flag", () => {
    // timestamp has no flag, so nothing to exclude — verify wrapped isn't there
    const flags = deriveAllowedFlags(generatePolicy);
    expect(flags.has("--wrapped")).toBe(false);
  });

  it("includes --key-format when any reachable variant is keyed", () => {
    const flags = deriveAllowedFlags(generatePolicy);
    expect(flags.has("--key-format")).toBe(true);
  });

  it("omits --key-format when no reachable variant is keyed", () => {
    const flags = deriveAllowedFlags(noKeyPolicy);
    expect(flags.has("--key-format")).toBe(false);
  });

  it("includes intrinsicFlags", () => {
    const flags = deriveAllowedFlags(generatePolicy);
    expect(flags.has("--count")).toBe(true);
    expect(flags.has("-c")).toBe(true);
  });

  it("includes extraFlags from selectable variants", () => {
    const flags = deriveAllowedFlags(inspectPolicy);
    expect(flags.has("--kind")).toBe(true);
  });

  it("keygen policy derives --wrapped, --signed, --digest, --bits, --key-format, --kind, --ns", () => {
    const flags = deriveAllowedFlags(keygenPolicy);
    expect(flags.has("--wrapped")).toBe(true);
    expect(flags.has("--signed")).toBe(true);
    expect(flags.has("--digest")).toBe(true);
    expect(flags.has("--bits")).toBe(true);
    expect(flags.has("--key-format")).toBe(true);
    expect(flags.has("--kind")).toBe(true);
    expect(flags.has("--ns")).toBe(true);
  });

  it("generate policy includes --digest and --ns", () => {
    const flags = deriveAllowedFlags(generatePolicy);
    expect(flags.has("--digest")).toBe(true);
    expect(flags.has("--ns")).toBe(true);
  });

  it("includes --key-format when the default variant is keyed", () => {
    // keygenPolicy default is opaque (keyed)
    const flags = deriveAllowedFlags(keygenPolicy);
    expect(flags.has("--key-format")).toBe(true);
  });

  it("noKeyPolicy has only --reverse, no --key-format", () => {
    const flags = deriveAllowedFlags(noKeyPolicy);
    expect(flags.has("--reverse")).toBe(true);
    expect(flags.has("--key-format")).toBe(false);
    expect(flags.size).toBe(1);
  });

  it("skips adding flag when selectable variant has no flag (covers v.flag === undefined branch)", () => {
    const flags = deriveAllowedFlags(policyWithFlaglessSelectable);
    expect(flags.size).toBe(0);
  });
});

describe("resolveVariant", () => {
  it("returns default when no selectable flags are present", () => {
    const result = resolveVariant(generatePolicy, new Set());
    expect(result).toBe(timestampVariant);
  });

  it("returns default when non-selectable flags are present", () => {
    const result = resolveVariant(generatePolicy, new Set(["--count", "--key-format"]));
    expect(result).toBe(timestampVariant);
  });

  it("returns the opaque variant when --opaque is present", () => {
    const result = resolveVariant(generatePolicy, new Set(["--opaque"]));
    expect(result).toBe(opaqueVariant);
  });

  it("returns the reverse variant when --reverse is present", () => {
    const result = resolveVariant(generatePolicy, new Set(["--reverse"]));
    expect(result).toBe(reverseVariant);
  });

  it("returns the signed variant when --signed is present", () => {
    const result = resolveVariant(generatePolicy, new Set(["--signed"]));
    expect(result).toBe(signedVariant);
  });

  it("returns wrapped variant from inspect policy when --wrapped present", () => {
    const result = resolveVariant(inspectPolicy, new Set(["--wrapped"]));
    expect(result).toBe(wrappedVariant);
  });

  it("returns keygen default (opaque) when no selectable flags", () => {
    const result = resolveVariant(keygenPolicy, new Set());
    expect(result).toBe(opaqueVariant);
  });

  it("returns wrapped from keygen when --wrapped present", () => {
    const result = resolveVariant(keygenPolicy, new Set(["--wrapped"]));
    expect(result).toBe(wrappedVariant);
  });

  // Conflict cases — all pinned messages from existing commands
  it("conflicts: reverse + opaque → 'cannot use --reverse and --opaque together'", () => {
    const result = resolveVariant(generatePolicy, new Set(["--reverse", "--opaque"]));
    expect(result).toBe("cannot use --reverse and --opaque together");
  });

  it("conflicts: signed + opaque → 'cannot use --signed and --opaque together'", () => {
    const result = resolveVariant(generatePolicy, new Set(["--signed", "--opaque"]));
    expect(result).toBe("cannot use --signed and --opaque together");
  });

  it("conflicts: signed + reverse → 'cannot use --signed and --reverse together'", () => {
    const result = resolveVariant(generatePolicy, new Set(["--signed", "--reverse"]));
    expect(result).toBe("cannot use --signed and --reverse together");
  });

  it("conflicts: wrapped + opaque → 'cannot use --wrapped and --opaque together'", () => {
    const result = resolveVariant(inspectPolicy, new Set(["--wrapped", "--opaque"]));
    expect(result).toBe("cannot use --wrapped and --opaque together");
  });

  it("conflicts: reverse + wrapped → 'cannot use --reverse and --wrapped together'", () => {
    const result = resolveVariant(inspectPolicy, new Set(["--reverse", "--wrapped"]));
    expect(result).toBe("cannot use --reverse and --wrapped together");
  });

  it("conflicts: signed + wrapped (inspect) → 'cannot use --signed and --wrapped together'", () => {
    const result = resolveVariant(inspectPolicy, new Set(["--signed", "--wrapped"]));
    expect(result).toBe("cannot use --signed and --wrapped together");
  });

  it("conflicts: signed + reverse (inspect) → 'cannot use --signed and --reverse together'", () => {
    const result = resolveVariant(inspectPolicy, new Set(["--signed", "--reverse"]));
    expect(result).toBe("cannot use --signed and --reverse together");
  });

  it("conflicts: signed + opaque (inspect) → 'cannot use --signed and --opaque together'", () => {
    const result = resolveVariant(inspectPolicy, new Set(["--signed", "--opaque"]));
    expect(result).toBe("cannot use --signed and --opaque together");
  });

  it("conflicts: signed + wrapped (keygen) → 'cannot use --signed and --wrapped together'", () => {
    const result = resolveVariant(keygenPolicy, new Set(["--signed", "--wrapped"]));
    expect(result).toBe("cannot use --signed and --wrapped together");
  });

  it("conflict with 3 flags present picks first two in priority order", () => {
    const result = resolveVariant(inspectPolicy, new Set(["--reverse", "--opaque", "--wrapped"]));
    // signed not present; conflict priority: [signed, reverse, wrapped, opaque]
    // first two present in that order: reverse(1), wrapped(2) → "reverse and wrapped"
    expect(result).toBe("cannot use --reverse and --wrapped together");
  });

  it("returns digest variant from generate policy when --digest present", () => {
    const result = resolveVariant(generatePolicy, new Set(["--digest"]));
    expect(result).toBe(digestVariant);
  });

  it("returns digest variant from keygen policy when --digest present", () => {
    const result = resolveVariant(keygenPolicy, new Set(["--digest"]));
    expect(result).toBe(digestVariant);
  });

  it("conflicts: signed + digest (generate) → 'cannot use --signed and --digest together'", () => {
    const result = resolveVariant(generatePolicy, new Set(["--signed", "--digest"]));
    expect(result).toBe("cannot use --signed and --digest together");
  });

  it("conflicts: digest + reverse (generate) → 'cannot use --digest and --reverse together'", () => {
    const result = resolveVariant(generatePolicy, new Set(["--digest", "--reverse"]));
    expect(result).toBe("cannot use --digest and --reverse together");
  });

  it("conflicts: digest + opaque (generate) → 'cannot use --digest and --opaque together'", () => {
    const result = resolveVariant(generatePolicy, new Set(["--digest", "--opaque"]));
    expect(result).toBe("cannot use --digest and --opaque together");
  });

  it("conflicts: signed + digest (keygen) → 'cannot use --signed and --digest together'", () => {
    const result = resolveVariant(keygenPolicy, new Set(["--signed", "--digest"]));
    expect(result).toBe("cannot use --signed and --digest together");
  });

  it("conflicts: digest + wrapped (keygen) → 'cannot use --digest and --wrapped together'", () => {
    const result = resolveVariant(keygenPolicy, new Set(["--digest", "--wrapped"]));
    expect(result).toBe("cannot use --digest and --wrapped together");
  });
});

describe("buildCodec", () => {
  it("returns a codec for a non-keyed variant (timestamp)", async () => {
    const result = await buildCodec(timestampVariant, "tst", new Map(), makeOpts());
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns a codec for a non-keyed variant (reverse)", async () => {
    const result = await buildCodec(reverseVariant, "tst", new Map(), makeOpts());
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns construct error string when construct fails (invalid brand)", async () => {
    const result = await buildCodec(timestampVariant, "", new Map(), makeOpts());
    expect(typeof result).toBe("string");
    expect(result as string).toContain("invalid_brand");
  });

  it("returns key format error when --key-format flag is invalid", async () => {
    const values = new Map([["--key-format", "bad"]]);
    const result = await buildCodec(opaqueVariant, "tst", values, makeOpts());
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--key-format must be");
  });

  it("returns error string when key env var is missing", async () => {
    const result = await buildCodec(opaqueVariant, "tst", new Map(), makeOpts({}));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("missing");
    expect(result as string).toContain("IDS_KEY");
  });

  it("returns opaque codec when env key is present", async () => {
    const opts = makeOpts({ IDS_KEY: testOpaqueHex });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns signed codec when env key is present", async () => {
    const opts = makeOpts({ IDS_SIGNING_KEY: testSigningHex });
    const result = await buildCodec(signedVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns error string for wrapped codec when --kind is missing", async () => {
    const opts = makeOpts({ IDS_WRAPPING_KEY: testWrappingHex });
    const result = await buildCodec(wrappedVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("string");
    expect(result as string).toBe("--kind is required with --wrapped");
  });

  it("returns wrapped codec with valid key and kind", async () => {
    const opts = makeOpts({ IDS_WRAPPING_KEY: testWrappingHex });
    const values = new Map([["--kind", "u32"]]);
    const result = await buildCodec(wrappedVariant, "tst", values, opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns error when key encoding is bad", async () => {
    const opts = makeOpts({ IDS_KEY: "not-valid-hex!!!" });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("string");
  });

  it("respects --key-format flag (base64url)", async () => {
    const encoded = opaqueVariant.key!.encode(testKeyBytes, "base64url");
    const opts = makeOpts({ IDS_KEY: encoded });
    const values = new Map([["--key-format", "base64url"]]);
    const result = await buildCodec(opaqueVariant, "tst", values, opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("codec branch exposes generate() without a cast (timestamp)", async () => {
    const codec = await buildCodec(timestampVariant, "tst", new Map(), makeOpts());
    if (typeof codec === "string") throw new Error("expected codec object");
    const id = await codec.generate();
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^tst_/);
  });

  it("codec branch exposes generate() without a cast (opaque, async)", async () => {
    const opts = makeOpts({ IDS_KEY: testOpaqueHex });
    const codec = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    if (typeof codec === "string") throw new Error("expected codec object");
    const id = await codec.generate();
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^tst_/);
  });

  it("returns digest codec when env key and --ns are present", async () => {
    const opts = makeOpts({ IDS_DIGEST_KEY: testDigestHex });
    const values = new Map([["--ns", "checkout"]]);
    const result = await buildCodec(digestVariant, "tst", values, opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns error string for digest codec when --ns is missing", async () => {
    const opts = makeOpts({ IDS_DIGEST_KEY: testDigestHex });
    const result = await buildCodec(digestVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("string");
    expect(result as string).toBe("--ns is required with --digest");
  });

  it("returns error string for digest codec when IDS_DIGEST_KEY is missing", async () => {
    const values = new Map([["--ns", "checkout"]]);
    const result = await buildCodec(digestVariant, "tst", values, makeOpts({}));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("IDS_DIGEST_KEY");
  });

  it("digest codec generate() is deterministic via readStdin", async () => {
    const opts = {
      ...makeOpts({ IDS_DIGEST_KEY: testDigestHex }),
      readStdin: () => Promise.resolve("hello"),
    };
    const values = new Map([["--ns", "test"]]);
    const codec1 = await buildCodec(digestVariant, "tst", values, opts);
    const codec2 = await buildCodec(digestVariant, "tst", values, opts);
    if (typeof codec1 === "string" || typeof codec2 === "string") {
      throw new Error("expected codec objects");
    }
    const id1 = await codec1.generate();
    const id2 = await codec2.generate();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^tst_/);
  });
});

describe("resolveVariant descriptor type guard", () => {
  it("returned value from resolveVariant is Descriptor when no conflict", () => {
    const result = resolveVariant(generatePolicy, new Set(["--opaque"]));
    const isDescriptor = (v: Descriptor | string): v is Descriptor => typeof v !== "string";
    expect(isDescriptor(result)).toBe(true);
  });

  it("returned value from resolveVariant is string when conflict", () => {
    const result = resolveVariant(generatePolicy, new Set(["--opaque", "--reverse"]));
    expect(typeof result).toBe("string");
  });
});
