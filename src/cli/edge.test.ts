import { describe, expect, it } from "vitest";
import { run } from "./router.js";
import { makeOpts } from "./test-helpers.js";

const keyHex = "ab".repeat(32);
const uuid = "0190ab12-3456-789a-bcde-f0123456789a";

function capture(argv: string[], over: Record<string, unknown> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const opts = {
    ...makeOpts(),
    argv,
    stdout: (s: string) => out.push(s),
    stderr: (s: string) => err.push(s),
    ...over,
  };
  return { opts, out, err };
}

const exit = (argv: string[], over: Record<string, unknown> = {}) => run(capture(argv, over).opts);

describe("generate edge cases", () => {
  it("extra positional → 2", async () => {
    expect(await exit(["timestamp", "generate", "usr", "extra"])).toBe(2);
  });
  it("invalid --count → 2", async () => {
    expect(await exit(["timestamp", "generate", "usr", "--count", "abc"])).toBe(2);
  });
  it("invalid --at → 2", async () => {
    expect(await exit(["timestamp", "generate", "usr", "--at", "notadate"])).toBe(2);
  });
  it("empty --at → 2", async () => {
    expect(await exit(["timestamp", "generate", "usr", "--at"])).toBe(2);
  });
});

describe("inspect edge cases", () => {
  it("unknown flag → 2", async () => {
    expect(await exit(["timestamp", "inspect", "usr_x", "--bogus"])).toBe(2);
  });
  it("extra positional → 2", async () => {
    expect(await exit(["timestamp", "inspect", "a", "b"])).toBe(2);
  });
  it("structurally invalid id (valid brand) → 1", async () => {
    expect(await exit(["timestamp", "inspect", "usr_zzz"])).toBe(1);
  });
  it("keyed inspect without a key → 2", async () => {
    expect(await exit(["signed", "inspect", "usr_zzz"])).toBe(2);
  });
  it("signed inspect of a structurally invalid id → 1", async () => {
    expect(await exit(["signed", "inspect", "usr_zzz", "--key", keyHex])).toBe(1);
  });
  it("signed inspect of a non-id token → 1", async () => {
    expect(await exit(["signed", "inspect", "xx", "--key", keyHex])).toBe(1);
  });
  it("opaque inspect of a non-id token → 1", async () => {
    expect(await exit(["opaque", "inspect", "not-an-id", "--key", keyHex])).toBe(1);
  });
  it("opaque inspect of a structurally invalid id → 1", async () => {
    expect(await exit(["opaque", "inspect", "usr_zzz", "--key", keyHex])).toBe(1);
  });
  it("wrapped inspect of a structurally invalid id → 1", async () => {
    expect(await exit(["wrapped", "inspect", "ord_zzz", "--key", keyHex])).toBe(1);
  });
  it("wrapped inspect of a non-id token → 1", async () => {
    expect(await exit(["wrapped", "inspect", "not-an-id", "--key", keyHex])).toBe(1);
  });
  it("batch inspect with empty stdin → 2", async () => {
    expect(await exit(["timestamp", "inspect"], { readStdin: () => Promise.resolve("") })).toBe(2);
  });

  it("wrapped inspect human output carries value/kind", async () => {
    const w = capture(["wrapped", "wrap", "ord", "--value", "7", "--kind", "u32", "--key", keyHex]);
    await run(w.opts);
    const id = w.out.join("").trim();
    const ins = capture(["wrapped", "inspect", id, "--key", keyHex]);
    expect(await run(ins.opts)).toBe(0);
    expect(ins.out.join("")).toContain("value:");
    expect(ins.out.join("")).toContain("kind:");
  });

  it("signed inspect human output carries the verified line", async () => {
    const g = capture(["signed", "generate", "usr", "--key", keyHex]);
    await run(g.opts);
    const id = g.out.join("").trim();
    const ins = capture(["signed", "inspect", id, "--key", keyHex]);
    expect(await run(ins.opts)).toBe(0);
    expect(ins.out.join("")).toContain("verified:");
  });
});

describe("wrap edge cases", () => {
  it("missing --kind → 2", async () => {
    expect(await exit(["wrapped", "wrap", "ord", "--value", "1", "--key", keyHex])).toBe(2);
  });
  it("invalid --kind → 2", async () => {
    expect(
      await exit(["wrapped", "wrap", "ord", "--value", "1", "--kind", "x", "--key", keyHex]),
    ).toBe(2);
  });
  it("missing --value → 2", async () => {
    expect(await exit(["wrapped", "wrap", "ord", "--kind", "u32", "--key", keyHex])).toBe(2);
  });
  it("missing brand → 2", async () => {
    expect(await exit(["wrapped", "wrap", "--value", "1", "--kind", "u32", "--key", keyHex])).toBe(
      2,
    );
  });
  it("extra positional → 2", async () => {
    expect(
      await exit(["wrapped", "wrap", "ord", "x", "--value", "1", "--kind", "u32", "--key", keyHex]),
    ).toBe(2);
  });
  it("missing key → 2", async () => {
    expect(await exit(["wrapped", "wrap", "ord", "--value", "1", "--kind", "u32"])).toBe(2);
  });
});

describe("derive edge cases", () => {
  it("missing --ns → 2", async () => {
    expect(await exit(["digest", "derive", "psd", "--material", "x", "--key", keyHex])).toBe(2);
  });
  it("missing brand → 2", async () => {
    expect(await exit(["digest", "derive", "--ns", "b", "--material", "x", "--key", keyHex])).toBe(
      2,
    );
  });
  it("extra positional → 2", async () => {
    expect(
      await exit(["digest", "derive", "psd", "x", "--ns", "b", "--material", "y", "--key", keyHex]),
    ).toBe(2);
  });
});

describe("match edge cases", () => {
  it("--json output carries the match field", async () => {
    const d = capture(["digest", "derive", "psd", "--ns", "b", "--material", "x", "--key", keyHex]);
    await run(d.opts);
    const id = d.out.join("").trim();
    const m = capture([
      "digest",
      "match",
      id,
      "--ns",
      "b",
      "--material",
      "x",
      "--key",
      keyHex,
      "--json",
    ]);
    expect(await run(m.opts)).toBe(0);
    expect(JSON.parse(m.out.join("")) as { match: boolean }).toEqual({ id, match: true });
  });
  it("--quiet suppresses stdout", async () => {
    const d = capture(["digest", "derive", "psd", "--ns", "b", "--material", "x", "--key", keyHex]);
    await run(d.opts);
    const id = d.out.join("").trim();
    const m = capture([
      "digest",
      "match",
      id,
      "--ns",
      "b",
      "--material",
      "x",
      "--key",
      keyHex,
      "--quiet",
    ]);
    expect(await run(m.opts)).toBe(0);
    expect(m.out.join("")).toBe("");
  });
  it("missing id → 2", async () => {
    expect(await exit(["digest", "match", "--ns", "b", "--material", "x", "--key", keyHex])).toBe(
      2,
    );
  });
  it("structurally invalid id → 2", async () => {
    expect(
      await exit(["digest", "match", "psd_zzz", "--ns", "b", "--material", "x", "--key", keyHex]),
    ).toBe(2);
  });
  it("missing key → 2", async () => {
    expect(await exit(["digest", "match", "psd_zzz", "--ns", "b", "--material", "x"])).toBe(2);
  });
  it("extra positional → 2", async () => {
    expect(
      await exit(["digest", "match", "a", "b", "--ns", "n", "--material", "x", "--key", keyHex]),
    ).toBe(2);
  });
});

describe("value/ns/at parsing branches", () => {
  it("wrap unknown flag → 2", async () => {
    expect(
      await exit([
        "wrapped",
        "wrap",
        "ord",
        "--bogus",
        "--value",
        "1",
        "--kind",
        "u32",
        "--key",
        keyHex,
      ]),
    ).toBe(2);
  });
  it("wrap with an invalid brand → 2 (construct throws)", async () => {
    expect(
      await exit(["wrapped", "wrap", "TOOLONG", "--value", "1", "--kind", "u32", "--key", keyHex]),
    ).toBe(2);
  });
  it("wrap empty --value → 2", async () => {
    expect(
      await exit(["wrapped", "wrap", "ord", "--value", "", "--kind", "u32", "--key", keyHex]),
    ).toBe(2);
  });
  it("wrap non-integer --value (32-bit) → 2", async () => {
    expect(
      await exit(["wrapped", "wrap", "ord", "--value", "abc", "--kind", "u32", "--key", keyHex]),
    ).toBe(2);
  });
  it("wrap i32 value → 0", async () => {
    expect(
      await exit(["wrapped", "wrap", "ord", "--value", "-5", "--kind", "i32", "--key", keyHex]),
    ).toBe(0);
  });
  it("wrap i64 value → 0", async () => {
    expect(
      await exit(["wrapped", "wrap", "ord", "--value", "-5", "--kind", "i64", "--key", keyHex]),
    ).toBe(0);
  });
  it("wrap out-of-range 64-bit value → 2", async () => {
    expect(
      await exit([
        "wrapped",
        "wrap",
        "ord",
        "--value",
        "99999999999999999999999",
        "--kind",
        "u64",
        "--key",
        keyHex,
      ]),
    ).toBe(2);
  });

  it("derive unknown flag → 2", async () => {
    expect(
      await exit([
        "digest",
        "derive",
        "psd",
        "--bogus",
        "--ns",
        "b",
        "--material",
        "x",
        "--key",
        keyHex,
      ]),
    ).toBe(2);
  });
  it("derive invalid brand → 2 (construct throws)", async () => {
    expect(
      await exit(["digest", "derive", "TOOLONG", "--ns", "b", "--material", "x", "--key", keyHex]),
    ).toBe(2);
  });
  it("derive whitespace-padded --ns → 2", async () => {
    expect(
      await exit(["digest", "derive", "psd", "--ns", " x ", "--material", "y", "--key", keyHex]),
    ).toBe(2);
  });
  it("derive empty stdin material → 2", async () => {
    expect(
      await exit(["digest", "derive", "psd", "--ns", "b", "--key", keyHex], {
        readStdin: () => Promise.resolve(""),
      }),
    ).toBe(2);
  });

  it("match unknown flag → 2", async () => {
    expect(
      await exit([
        "digest",
        "match",
        "psd_zzz",
        "--bogus",
        "--ns",
        "b",
        "--material",
        "x",
        "--key",
        keyHex,
      ]),
    ).toBe(2);
  });
  it("match whitespace-padded --ns → 2", async () => {
    expect(
      await exit(["digest", "match", "psd_zzz", "--ns", " x ", "--material", "y", "--key", keyHex]),
    ).toBe(2);
  });
  it("match empty --material → 2", async () => {
    expect(
      await exit(["digest", "match", "psd_zzz", "--ns", "b", "--material", "", "--key", keyHex]),
    ).toBe(2);
  });

  it("generate --at with a tz-less datetime → 0 (interpreted UTC)", async () => {
    expect(await exit(["timestamp", "generate", "usr", "--at", "2024-01-01T00:00:00"])).toBe(0);
  });
});

describe("router edge cases", () => {
  it("no args prints usage (exit 2)", async () => {
    const { opts, out } = capture([]);
    expect(await run(opts)).toBe(2);
    expect(out.join("")).toContain("Usage: ids");
  });
  it("--version without an injected version falls back to 0.0.0", async () => {
    const { opts, out } = capture(["--version"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("").trim()).toBe("0.0.0");
  });
  it("codec with no verb prints help (exit 2)", async () => {
    const { opts, err } = capture(["timestamp"]);
    expect(await run(opts)).toBe(2);
    expect(err.join("")).toContain("Verbs:");
  });
  it("verb-level --help prints help (exit 0)", async () => {
    const { opts, out } = capture(["timestamp", "generate", "--help"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("")).toContain("timestamp");
  });
});

describe("keygen edge cases", () => {
  it("extra positional → 2", async () => {
    expect(await exit(["keygen", "extra"])).toBe(2);
  });
  it("--bytes 24 → 0", async () => {
    const { opts, out } = capture(["keygen", "--bytes", "24"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("").trim()).toMatch(/^[0-9a-f]{48}$/);
  });
  it("--bytes 32 → 0", async () => {
    expect(await exit(["keygen", "--bytes", "32"])).toBe(0);
  });
  it("empty --bytes → 2", async () => {
    expect(await exit(["keygen", "--bytes"])).toBe(2);
  });
  it("unknown flag → 2", async () => {
    expect(await exit(["keygen", "--bogus"])).toBe(2);
  });
  it("invalid --key-encoding → 2", async () => {
    expect(await exit(["keygen", "--key-encoding", "pem"])).toBe(2);
  });
});

describe("convert edge cases", () => {
  it("unknown flag → 2", async () => {
    expect(await exit(["convert", "usr", "--bogus", "--uuid", uuid])).toBe(2);
  });
  it("extra positional → 2", async () => {
    expect(await exit(["convert", "usr", "extra", "--uuid", uuid])).toBe(2);
  });
  it("invalid brand → 2", async () => {
    expect(await exit(["convert", "TOOLONG", "--uuid", uuid])).toBe(2);
  });
  it("--help prints help (exit 0)", async () => {
    const { opts, out } = capture(["convert", "--help"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("")).toContain("convert");
  });
});
