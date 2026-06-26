import { describe, expect, it } from "vitest";
import { buildCodec, deriveAllowedFlags, isCodecError, resolveVariant } from "./dispatch.js";
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
import { makeOpts } from "./test-helpers.js";

const testKeyBytes = new Uint8Array(32).fill(0xab);
const testOpaqueHex = encodeOpaqueKey(testKeyBytes, "hex");
const testSigningHex = encodeSigningKey(testKeyBytes, "hex");
const testWrappingHex = encodeWrappingKey(testKeyBytes, "hex");
const testDigestHex = encodeDigestKey(testKeyBytes, "hex");

// A policy with no keyed variants, to cover the hasKeyed=false branch
const noKeyPolicy: Policy = {
  default: timestampVariant,
  selectable: [reverseVariant],
  intrinsicFlags: [],
};

// A flagless selectable descriptor, to cover the v.flag === undefined branch in deriveAllowedFlags
const flaglessDescriptor: Descriptor = {
  inspect: timestampVariant.inspect,
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

  it("returns CodecError when construct fails (invalid brand)", async () => {
    const result = await buildCodec(timestampVariant, "", new Map(), makeOpts());
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toContain("invalid_brand");
    expect(result.kind).toBe("runtime");
  });

  it("returns CodecError(usage) when --key-format flag is invalid", async () => {
    const values = new Map([["--key-format", "bad"]]);
    const result = await buildCodec(opaqueVariant, "tst", values, makeOpts());
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toContain("--key-format must be");
    expect(result.kind).toBe("usage");
  });

  it("returns CodecError(usage) when key env var is missing", async () => {
    const result = await buildCodec(opaqueVariant, "tst", new Map(), makeOpts({}));
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toContain("missing");
    expect(result.message).toContain("IDS_OPAQUE_KEY");
    expect(result.message).toContain("IDS_KEY");
    expect(result.kind).toBe("usage");
  });

  it("returns opaque codec when IDS_OPAQUE_KEY is present", async () => {
    const opts = makeOpts({ IDS_OPAQUE_KEY: testOpaqueHex });
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

  it("returns CodecError(usage) for wrapped codec when --kind is missing", async () => {
    const opts = makeOpts({ IDS_WRAPPING_KEY: testWrappingHex });
    const result = await buildCodec(wrappedVariant, "tst", new Map(), opts);
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toBe("--kind is required with --wrapped");
    expect(result.kind).toBe("usage");
  });

  it("returns wrapped codec with valid key and kind", async () => {
    const opts = makeOpts({ IDS_WRAPPING_KEY: testWrappingHex });
    const values = new Map([["--kind", "u32"]]);
    const result = await buildCodec(wrappedVariant, "tst", values, opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns CodecError(runtime) when key encoding is bad", async () => {
    const opts = makeOpts({ IDS_OPAQUE_KEY: "not-valid-hex!!!" });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.kind).toBe("runtime");
  });

  it("respects --key-format flag (base64url)", async () => {
    const encoded = opaqueVariant.key!.encode(testKeyBytes, "base64url");
    const opts = makeOpts({ IDS_OPAQUE_KEY: encoded });
    const values = new Map([["--key-format", "base64url"]]);
    const result = await buildCodec(opaqueVariant, "tst", values, opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("codec branch exposes generate() without a cast (timestamp)", async () => {
    const codec = await buildCodec(timestampVariant, "tst", new Map(), makeOpts());
    if (isCodecError(codec)) throw new Error("expected codec object");
    const id = await codec.generate();
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^tst_/);
  });

  it("codec branch exposes generate() without a cast (opaque, async)", async () => {
    const opts = makeOpts({ IDS_OPAQUE_KEY: testOpaqueHex });
    const codec = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    if (isCodecError(codec)) throw new Error("expected codec object");
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

  it("returns CodecError(usage) for digest codec when --ns is missing", async () => {
    const opts = makeOpts({ IDS_DIGEST_KEY: testDigestHex });
    const result = await buildCodec(digestVariant, "tst", new Map(), opts);
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toBe("--ns is required with --digest");
    expect(result.kind).toBe("usage");
  });

  it("returns CodecError(usage) for digest codec when IDS_DIGEST_KEY is missing", async () => {
    const values = new Map([["--ns", "checkout"]]);
    const result = await buildCodec(digestVariant, "tst", values, makeOpts({}));
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toContain("IDS_DIGEST_KEY");
    expect(result.kind).toBe("usage");
  });

  it("digest codec generate() is deterministic via readStdin", async () => {
    const opts = {
      ...makeOpts({ IDS_DIGEST_KEY: testDigestHex }),
      readStdin: () => Promise.resolve("hello"),
    };
    const values = new Map([["--ns", "test"]]);
    const codec1 = await buildCodec(digestVariant, "tst", values, opts);
    const codec2 = await buildCodec(digestVariant, "tst", values, opts);
    if (isCodecError(codec1) || isCodecError(codec2)) {
      throw new Error("expected codec objects");
    }
    const id1 = await codec1.generate();
    const id2 = await codec2.generate();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^tst_/);
  });

  it("returns CodecError(usage) when key env-var format is invalid (IDS_KEY_FORMAT via fallback)", async () => {
    const opts = makeOpts({ IDS_KEY_FORMAT: "bad" });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toContain("IDS_KEY_FORMAT");
    expect(result.kind).toBe("usage");
  });

  it("returns wrapped codec via IDS_KEY fallback when IDS_WRAPPING_KEY is unset", async () => {
    const opts = makeOpts({ IDS_KEY: testWrappingHex });
    const values = new Map([["--kind", "u32"]]);
    const result = await buildCodec(wrappedVariant, "tst", values, opts);
    expect(isCodecError(result)).toBe(false);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns CodecError(usage) when IDS_OPAQUE_KEY_FORMAT is invalid (specific format var)", async () => {
    const opts = makeOpts({ IDS_OPAQUE_KEY: testOpaqueHex, IDS_OPAQUE_KEY_FORMAT: "bad" });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(isCodecError(result)).toBe(true);
    if (!isCodecError(result)) throw new Error("expected CodecError");
    expect(result.message).toContain("IDS_OPAQUE_KEY_FORMAT");
    expect(result.kind).toBe("usage");
  });

  it("returns opaque codec via IDS_KEY fallback when IDS_OPAQUE_KEY is unset", async () => {
    const opts = makeOpts({ IDS_KEY: testOpaqueHex });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(isCodecError(result)).toBe(false);
  });

  it("IDS_OPAQUE_KEY wins over IDS_KEY when both are set", async () => {
    const wrongKeyBytes = new Uint8Array(32).fill(0xff);
    const wrongKeyHex = encodeOpaqueKey(wrongKeyBytes, "hex");
    // IDS_OPAQUE_KEY is valid, IDS_KEY is a different valid key — specific wins
    const opts = makeOpts({ IDS_OPAQUE_KEY: testOpaqueHex, IDS_KEY: wrongKeyHex });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("object");
    expect(isCodecError(result)).toBe(false);
  });

  it("IDS_OPAQUE_KEY_FORMAT is paired with IDS_OPAQUE_KEY, not IDS_KEY_FORMAT", async () => {
    // IDS_OPAQUE_KEY set in base64url, IDS_OPAQUE_KEY_FORMAT says base64url, IDS_KEY_FORMAT says hex
    const encoded = encodeOpaqueKey(testKeyBytes, "base64url");
    const opts = makeOpts({
      IDS_OPAQUE_KEY: encoded,
      IDS_OPAQUE_KEY_FORMAT: "base64url",
      IDS_KEY_FORMAT: "hex",
    });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("object");
    expect(isCodecError(result)).toBe(false);
  });

  it("IDS_KEY_FORMAT is paired with IDS_KEY fallback, not IDS_OPAQUE_KEY_FORMAT", async () => {
    // IDS_KEY in base64url, IDS_KEY_FORMAT says base64url, no IDS_OPAQUE_KEY set
    const encoded = encodeOpaqueKey(testKeyBytes, "base64url");
    const opts = makeOpts({ IDS_KEY: encoded, IDS_KEY_FORMAT: "base64url" });
    const result = await buildCodec(opaqueVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("object");
    expect(isCodecError(result)).toBe(false);
  });

  it("returns signed codec via IDS_KEY fallback when IDS_SIGNING_KEY is unset", async () => {
    const opts = makeOpts({ IDS_KEY: testSigningHex });
    const result = await buildCodec(signedVariant, "tst", new Map(), opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(isCodecError(result)).toBe(false);
  });

  it("returns digest codec via IDS_KEY fallback when IDS_DIGEST_KEY is unset", async () => {
    const opts = makeOpts({ IDS_KEY: testDigestHex });
    const values = new Map([["--ns", "test"]]);
    const result = await buildCodec(digestVariant, "tst", values, opts);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(isCodecError(result)).toBe(false);
  });
});

describe("isCodecError", () => {
  it("returns true for a usage CodecError", () => {
    expect(isCodecError({ kind: "usage", message: "oops" })).toBe(true);
  });

  it("returns true for a runtime CodecError", () => {
    expect(isCodecError({ kind: "runtime", message: "oops" })).toBe(true);
  });

  it("returns false for a codec object", () => {
    expect(isCodecError({ safeParse: () => ({}) })).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isCodecError("error message")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCodecError(null)).toBe(false);
  });

  it("returns false for an object with unknown kind", () => {
    expect(isCodecError({ kind: "other", message: "oops" })).toBe(false);
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
