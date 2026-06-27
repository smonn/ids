import { describe, expect, it } from "vitest";
import { runGenerate } from "./generate.js";
import { encodeDigestKey } from "../../codecs/digest/index.js";
import { encodeOpaqueKey } from "../../codecs/opaque/index.js";
import { makeOpts } from "../test-helpers.js";

const testKeyBytes = new Uint8Array(32).fill(0xab);
const testDigestHex = encodeDigestKey(testKeyBytes, "hex");
const testOpaqueHex = encodeOpaqueKey(testKeyBytes, "hex");

function makeCapturingOpts(env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const opts = {
    ...makeOpts(env),
    stdout: (s: string) => {
      out.push(s);
    },
    stderr: (s: string) => {
      err.push(s);
    },
  };
  return { opts, out, err };
}

describe("runGenerate — --help / -h", () => {
  it("--help exits 0 and prints usage to stdout", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["--help"], opts);
    expect(code).toBe(0);
    expect(out.join("")).toContain("generate");
    expect(err).toHaveLength(0);
  });

  it("-h exits 0 and prints usage to stdout", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["-h"], opts);
    expect(code).toBe(0);
    expect(out.join("")).toContain("generate");
    expect(err).toHaveLength(0);
  });
});

describe("runGenerate — flag validation errors", () => {
  it("unsupported flag exits 2 with error on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--from-uuid"], opts);
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("--from-uuid");
  });

  it("duplicate flag exits 2 with error on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--reverse", "--reverse"], opts);
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("duplicate flag");
  });

  it("extra positional argument exits 2 with error on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "extra"], opts);
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("unexpected argument: extra");
  });

  it("invalid --count value exits 2 with error on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--count", "abc"], opts);
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("--count");
  });

  it("conflicting variant flags exit 2 with error on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--opaque", "--signed"], {
      ...opts,
      env: { IDS_OPAQUE_KEY: testOpaqueHex },
    });
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("cannot use");
  });

  it("--key-format without a keyed variant exits 2 with error on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--key-format", "hex"], opts);
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("--key-format");
  });

  it("--digest with --count > 1 exits 2 with error on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts({ IDS_DIGEST_KEY: testDigestHex });
    const code = await runGenerate(["tst", "--digest", "--ns", "x", "--count", "2"], {
      ...opts,
      readStdin: () => Promise.resolve("material"),
    });
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("--count N > 1");
  });
});

describe("runGenerate — codec build errors", () => {
  it("missing key exits 2 (usage error) with message on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--opaque"], opts);
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("IDS_OPAQUE_KEY");
  });

  it("malformed key exits 1 (runtime error) with message on stderr", async () => {
    const { opts, out, err } = makeCapturingOpts({ IDS_OPAQUE_KEY: "ab" });
    const code = await runGenerate(["tst", "--opaque"], opts);
    expect(code).toBe(1);
    expect(out).toHaveLength(0);
    expect(err.join("")).toBeTruthy();
  });
});

describe("runGenerate — normal generate (timestamp variant)", () => {
  it("generates a single ID to stdout and exits 0", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst"], opts);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^tst_[0-9a-z]{26}\n$/);
    expect(err).toHaveLength(0);
  });

  it("--count 3 generates 3 IDs to stdout", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--count", "3"], opts);
    expect(code).toBe(0);
    expect(out).toHaveLength(3);
    expect(err).toHaveLength(0);
    for (const line of out) {
      expect(line).toMatch(/^tst_[0-9a-z]{26}\n$/);
    }
  });

  it("--uuid emits a UUID string instead of an ID", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--uuid"], opts);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\n$/);
    expect(err).toHaveLength(0);
  });

  it("brand-only (no positional) generates ID with empty-string brand (exits 1 on invalid brand)", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runGenerate([], opts);
    expect(code).toBe(1);
    expect(err.join("")).toContain("invalid_brand");
  });
});

describe("runGenerate — --digest TTY hint (CLI-5)", () => {
  it("prints hint to stderr when isTTY is true, then emits ID and exits 0", async () => {
    const { opts, out, err } = makeCapturingOpts({ IDS_DIGEST_KEY: testDigestHex });
    const code = await runGenerate(["tst", "--digest", "--ns", "orders"], {
      ...opts,
      isTTY: true,
      readStdin: () => Promise.resolve("order-123"),
    });
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^tst_[0-9a-z]{26}\n$/);
    expect(err).toHaveLength(1);
    expect(err[0]).toContain("hint:");
    expect(err[0]).toContain("stdin");
  });

  it("prints no hint when isTTY is false", async () => {
    const { opts, out, err } = makeCapturingOpts({ IDS_DIGEST_KEY: testDigestHex });
    const code = await runGenerate(["tst", "--digest", "--ns", "orders"], {
      ...opts,
      isTTY: false,
      readStdin: () => Promise.resolve("order-123"),
    });
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(err).toHaveLength(0);
  });
});

describe("runGenerate — --digest key validation precedes stdin (#766)", () => {
  it("missing digest key exits 2 before reading stdin or printing the TTY hint", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runGenerate(["tst", "--digest", "--ns", "orders"], {
      ...opts,
      isTTY: true,
      readStdin: () => {
        throw new Error("stdin must not be read when the key is missing");
      },
    });
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("IDS_DIGEST_KEY");
    expect(err.join("")).not.toContain("hint:");
  });
});

describe("runGenerate — --digest empty material (CLI-6)", () => {
  it("exits 1 with diagnostic on stderr and nothing on stdout when material is empty", async () => {
    const { opts, out, err } = makeCapturingOpts({ IDS_DIGEST_KEY: testDigestHex });
    const code = await runGenerate(["tst", "--digest", "--ns", "orders"], {
      ...opts,
      readStdin: () => Promise.resolve(""),
    });
    expect(code).toBe(1);
    expect(out).toHaveLength(0);
    expect(err.join("")).toContain("empty");
  });

  it("emits ID and exits 0 when material is non-empty", async () => {
    const { opts, out, err } = makeCapturingOpts({ IDS_DIGEST_KEY: testDigestHex });
    const code = await runGenerate(["tst", "--digest", "--ns", "orders"], {
      ...opts,
      readStdin: () => Promise.resolve("order-123"),
    });
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^tst_[0-9a-z]{26}\n$/);
    expect(err).toHaveLength(0);
  });
});
