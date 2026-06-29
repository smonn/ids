import { describe, expect, it } from "vitest";
import { run } from "./router.js";
import { makeOpts } from "./test-helpers.js";

const keyHex = "ab".repeat(32);
const otherKeyHex = "cd".repeat(32);

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

describe("ids timestamp generate", () => {
  it("mints one canonical id and exits 0", async () => {
    const { opts, out, err } = capture(["timestamp", "generate", "usr"]);
    const code = await run(opts);
    expect(code).toBe(0);
    expect(out.join("").trim()).toMatch(/^usr_[0-9a-z]{26}$/);
    expect(err.join("")).toBe("");
  });

  it("--count mints N ids", async () => {
    const { opts, out } = capture(["timestamp", "generate", "usr", "--count", "3"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("").trim().split("\n")).toHaveLength(3);
  });

  it("rejects --key on a keyless codec", async () => {
    const { opts, err } = capture(["timestamp", "generate", "usr", "--key", "x"]);
    expect(await run(opts)).toBe(2);
    expect(err.join("")).toContain("unsupported flag: --key");
  });

  it("missing brand exits 2", async () => {
    const { opts } = capture(["timestamp", "generate"]);
    expect(await run(opts)).toBe(2);
  });

  it("invalid brand exits 2", async () => {
    const { opts } = capture(["timestamp", "generate", "TOOLONG"]);
    expect(await run(opts)).toBe(2);
  });
});

describe("ids timestamp inspect", () => {
  it("reports brand, codec, timestamp, uuid (human + json)", async () => {
    const gen = capture(["timestamp", "generate", "usr"]);
    await run(gen.opts);
    const id = gen.out.join("").trim();

    const human = capture(["timestamp", "inspect", id]);
    expect(await run(human.opts)).toBe(0);
    const text = human.out.join("");
    expect(text).toContain("brand:");
    expect(text).toContain("codec:");
    expect(text).toContain("timestamp:");
    expect(text).toContain("uuid:");

    const j = capture(["timestamp", "inspect", id, "--json"]);
    expect(await run(j.opts)).toBe(0);
    const obj = JSON.parse(j.out.join("")) as {
      brand: string;
      codec: string;
      timestamp: { ms: number; iso: string };
      uuid: string;
    };
    expect(obj.brand).toBe("usr");
    expect(obj.codec).toBe("timestamp");
    expect(typeof obj.timestamp.ms).toBe("number");
    expect(obj.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("round-trips --at through inspect", async () => {
    const at = "2023-11-14T22:13:20.000Z";
    const gen = capture(["timestamp", "generate", "usr", "--at", at]);
    await run(gen.opts);
    const id = gen.out.join("").trim();

    const j = capture(["timestamp", "inspect", id, "--json"]);
    await run(j.opts);
    const obj = JSON.parse(j.out.join("")) as { timestamp: { iso: string } };
    expect(obj.timestamp.iso).toBe(at);
  });

  it("rejects a malformed id with exit 1", async () => {
    const { opts, err } = capture(["timestamp", "inspect", "not-an-id"]);
    expect(await run(opts)).toBe(1);
    expect(err.join("")).toContain("invalid_id");
  });

  it("--quiet suppresses stdout but keeps the exit code", async () => {
    const gen = capture(["timestamp", "generate", "usr"]);
    await run(gen.opts);
    const id = gen.out.join("").trim();
    const q = capture(["timestamp", "inspect", id, "--quiet"]);
    expect(await run(q.opts)).toBe(0);
    expect(q.out.join("")).toBe("");
  });
});

describe("ids reverse", () => {
  it("generates and inspects a reverse id", async () => {
    const gen = capture(["reverse", "generate", "evt"]);
    expect(await run(gen.opts)).toBe(0);
    const id = gen.out.join("").trim();
    expect(id).toMatch(/^evt_[0-9a-z]{26}$/);
    const ins = capture(["reverse", "inspect", id, "--json"]);
    expect(await run(ins.opts)).toBe(0);
    const obj = JSON.parse(ins.out.join("")) as { codec: string };
    expect(obj.codec).toBe("reverse");
  });
});

describe("ids signed", () => {
  it("generates with a key and inspect reports verified: true", async () => {
    const gen = capture(["signed", "generate", "usr", "--key", keyHex]);
    expect(await run(gen.opts)).toBe(0);
    const id = gen.out.join("").trim();

    const ins = capture(["signed", "inspect", id, "--key", keyHex, "--json"]);
    expect(await run(ins.opts)).toBe(0);
    const obj = JSON.parse(ins.out.join("")) as { codec: string; verified: boolean };
    expect(obj.codec).toBe("signed");
    expect(obj.verified).toBe(true);
  });

  it("inspect with the wrong key fails verification with exit 1", async () => {
    const gen = capture(["signed", "generate", "usr", "--key", keyHex]);
    await run(gen.opts);
    const id = gen.out.join("").trim();

    const ins = capture(["signed", "inspect", id, "--key", otherKeyHex]);
    expect(await run(ins.opts)).toBe(1);
    expect(ins.err.join("")).toContain("verification_failed");
  });

  it("generate without a key is a usage error (exit 2)", async () => {
    const gen = capture(["signed", "generate", "usr"]);
    expect(await run(gen.opts)).toBe(2);
    expect(gen.err.join("")).toContain("missing key");
  });
});

describe("ids opaque", () => {
  it("generates with a key and round-trips the timestamp via inspect", async () => {
    const at = "2023-11-14T22:13:20.000Z";
    const gen = capture(["opaque", "generate", "usr", "--key", keyHex, "--at", at]);
    expect(await run(gen.opts)).toBe(0);
    const id = gen.out.join("").trim();

    const ins = capture(["opaque", "inspect", id, "--key", keyHex, "--json"]);
    expect(await run(ins.opts)).toBe(0);
    const obj = JSON.parse(ins.out.join("")) as { codec: string; timestamp: { iso: string } };
    expect(obj.codec).toBe("opaque");
    expect(obj.timestamp.iso).toBe(at);
  });
});

describe("ids wrapped", () => {
  it("wraps an integer and recovers it via inspect (kind trial)", async () => {
    const w = capture([
      "wrapped",
      "wrap",
      "ord",
      "--value",
      "42",
      "--kind",
      "u32",
      "--key",
      keyHex,
    ]);
    expect(await run(w.opts)).toBe(0);
    const id = w.out.join("").trim();
    expect(id).toMatch(/^ord_[0-9a-z]{26}$/);

    const ins = capture(["wrapped", "inspect", id, "--key", keyHex, "--json"]);
    expect(await run(ins.opts)).toBe(0);
    const obj = JSON.parse(ins.out.join("")) as { codec: string; value: unknown; kind: string };
    expect(obj.codec).toBe("wrapped");
    expect(obj.value).toBe(42);
    expect(obj.kind).toBe("u32");
  });

  it("emits a u64 value as a JSON string to preserve precision", async () => {
    const big = "18446744073709551615";
    const w = capture(["wrapped", "wrap", "ord", "--value", big, "--kind", "u64", "--key", keyHex]);
    expect(await run(w.opts)).toBe(0);
    const id = w.out.join("").trim();

    const ins = capture(["wrapped", "inspect", id, "--key", keyHex, "--kind", "u64", "--json"]);
    expect(await run(ins.opts)).toBe(0);
    const obj = JSON.parse(ins.out.join("")) as { value: unknown; kind: string };
    expect(obj.value).toBe(big);
    expect(obj.kind).toBe("u64");
  });

  it("rejects an out-of-range value as a usage error", async () => {
    const w = capture([
      "wrapped",
      "wrap",
      "ord",
      "--value",
      "-1",
      "--kind",
      "u32",
      "--key",
      keyHex,
    ]);
    expect(await run(w.opts)).toBe(2);
    expect(w.err.join("")).toContain("out of range");
  });

  it("fails inspect when no kind matches (wrong --kind)", async () => {
    const w = capture([
      "wrapped",
      "wrap",
      "ord",
      "--value",
      "42",
      "--kind",
      "u32",
      "--key",
      keyHex,
    ]);
    await run(w.opts);
    const id = w.out.join("").trim();
    const ins = capture(["wrapped", "inspect", id, "--key", keyHex, "--kind", "i64"]);
    expect(await run(ins.opts)).toBe(1);
    expect(ins.err.join("")).toContain("verification_failed");
  });
});

describe("ids digest", () => {
  it("derives a stable id and match confirms it (exit 0)", async () => {
    const d = capture([
      "digest",
      "derive",
      "psd",
      "--ns",
      "billing",
      "--material",
      "a@b.com",
      "--key",
      keyHex,
    ]);
    expect(await run(d.opts)).toBe(0);
    const id = d.out.join("").trim();
    expect(id).toMatch(/^psd_[0-9a-z]{26}$/);

    const m = capture([
      "digest",
      "match",
      id,
      "--ns",
      "billing",
      "--material",
      "a@b.com",
      "--key",
      keyHex,
    ]);
    expect(await run(m.opts)).toBe(0);
    expect(m.out.join("")).toContain("match: true");
  });

  it("match returns exit 1 for a non-match", async () => {
    const d = capture([
      "digest",
      "derive",
      "psd",
      "--ns",
      "billing",
      "--material",
      "a@b.com",
      "--key",
      keyHex,
    ]);
    await run(d.opts);
    const id = d.out.join("").trim();
    const m = capture([
      "digest",
      "match",
      id,
      "--ns",
      "billing",
      "--material",
      "other",
      "--key",
      keyHex,
    ]);
    expect(await run(m.opts)).toBe(1);
    expect(m.out.join("")).toContain("match: false");
  });

  it("reads material from stdin when --material is absent", async () => {
    const d = capture(["digest", "derive", "psd", "--ns", "billing", "--key", keyHex], {
      readStdin: () => Promise.resolve("a@b.com"),
    });
    expect(await run(d.opts)).toBe(0);
    const id = d.out.join("").trim();

    const m = capture([
      "digest",
      "match",
      id,
      "--ns",
      "billing",
      "--material",
      "a@b.com",
      "--key",
      keyHex,
    ]);
    expect(await run(m.opts)).toBe(0);
  });
});

describe("ids keygen", () => {
  it("emits a 32-byte hex key by default with a stderr warning", async () => {
    const { opts, out, err } = capture(["keygen"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("").trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(err.join("")).toContain("secret key material");
  });

  it("honors --bytes and --key-encoding", async () => {
    const { opts, out } = capture(["keygen", "--bytes", "16", "--key-encoding", "base64url"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("").trim()).not.toMatch(/[+/=]/);
    expect(out.join("").trim().length).toBeLessThan(64);
  });

  it("rejects an invalid --bytes value", async () => {
    const { opts } = capture(["keygen", "--bytes", "20"]);
    expect(await run(opts)).toBe(2);
  });

  it("generated key works for a keyed codec", async () => {
    const kg = capture(["keygen"]);
    await run(kg.opts);
    const key = kg.out.join("").trim();
    const gen = capture(["signed", "generate", "usr", "--key", key]);
    expect(await run(gen.opts)).toBe(0);
  });
});

describe("ids convert", () => {
  it("converts a UUID to an id (reverse of inspect's uuid field)", async () => {
    const gen = capture(["timestamp", "generate", "usr"]);
    await run(gen.opts);
    const id = gen.out.join("").trim();
    const ins = capture(["timestamp", "inspect", id, "--json"]);
    await run(ins.opts);
    const { uuid } = JSON.parse(ins.out.join("")) as { uuid: string };

    const conv = capture(["convert", "usr", "--uuid", uuid]);
    expect(await run(conv.opts)).toBe(0);
    expect(conv.out.join("").trim()).toBe(id);
  });

  it("rejects a malformed uuid (exit 2)", async () => {
    const { opts } = capture(["convert", "usr", "--uuid", "not-a-uuid"]);
    expect(await run(opts)).toBe(2);
  });
});

describe("router", () => {
  it("--help prints usage to stdout, exit 0", async () => {
    const { opts, out } = capture(["--help"]);
    expect(await run(opts)).toBe(0);
    expect(out.join("")).toContain("Usage: ids");
  });

  it("--version prints the injected version", async () => {
    const { opts, out } = capture(["--version"], { version: "9.9.9" });
    expect(await run(opts)).toBe(0);
    expect(out.join("").trim()).toBe("9.9.9");
  });

  it("unknown command exits 2", async () => {
    const { opts, err } = capture(["frobnicate"]);
    expect(await run(opts)).toBe(2);
    expect(err.join("")).toContain("unknown command");
  });

  it("unknown verb for a codec exits 2", async () => {
    const { opts, err } = capture(["timestamp", "frobnicate"]);
    expect(await run(opts)).toBe(2);
    expect(err.join("")).toContain("unknown verb");
  });

  it("batch inspect over stdin is best-effort with stdout = successes only", async () => {
    const a = capture(["timestamp", "generate", "usr"]);
    await run(a.opts);
    const id = a.out.join("").trim();
    const batch = capture(["timestamp", "inspect", "--json"], {
      readStdin: () => Promise.resolve(`${id}\nnot-an-id\n`),
    });
    expect(await run(batch.opts)).toBe(1);
    const lines = batch.out.join("").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]!) as { brand: string }).brand).toBe("usr");
    expect(batch.err.join("")).toContain("invalid_id");
  });

  it("batch inspect (human) emits one block per id and exits 0 when all succeed", async () => {
    const a = capture(["timestamp", "generate", "usr", "--count", "2"]);
    await run(a.opts);
    const ids = a.out.join("").trim();
    const batch = capture(["timestamp", "inspect"], {
      readStdin: () => Promise.resolve(`${ids}\n`),
    });
    expect(await run(batch.opts)).toBe(0);
    expect(batch.out.join("").match(/brand:/g)).toHaveLength(2);
  });

  it("codec and top-level --help print help with exit 0", async () => {
    const codecHelp = capture(["wrapped", "--help"]);
    expect(await run(codecHelp.opts)).toBe(0);
    expect(codecHelp.out.join("")).toContain("wrapped");

    const keygenHelp = capture(["keygen", "--help"]);
    expect(await run(keygenHelp.opts)).toBe(0);
    expect(keygenHelp.out.join("")).toContain("keygen");
  });
});

describe("key resolution (integration)", () => {
  it("falls back to IDS_KEY when no --key flag is given", async () => {
    const gen = capture(["signed", "generate", "usr"], { env: { IDS_KEY: keyHex } });
    expect(await run(gen.opts)).toBe(0);
  });

  it("reads (and trims) the key from --key-file", async () => {
    const gen = capture(["signed", "generate", "usr", "--key-file", "k"], {
      readFile: () => Promise.resolve(`${keyHex}\n`),
    });
    expect(await run(gen.opts)).toBe(0);
  });

  it("rejects --key together with --key-file (exit 2)", async () => {
    const gen = capture(["signed", "generate", "usr", "--key", keyHex, "--key-file", "k"], {
      readFile: () => Promise.resolve(keyHex),
    });
    expect(await run(gen.opts)).toBe(2);
    expect(gen.err.join("")).toContain("cannot use --key and --key-file together");
  });

  it("accepts a base64url key with --key-encoding", async () => {
    const b64 = Buffer.from(new Uint8Array(32).fill(0xab)).toString("base64url");
    const gen = capture(["signed", "generate", "usr", "--key", b64, "--key-encoding", "base64url"]);
    expect(await run(gen.opts)).toBe(0);
  });

  it("rejects a wrong-length key (exit 2)", async () => {
    const gen = capture(["signed", "generate", "usr", "--key", "abcd"]);
    expect(await run(gen.opts)).toBe(2);
  });
});

describe("more edge cases", () => {
  it("digest derive rejects empty material (exit 2)", async () => {
    const d = capture([
      "digest",
      "derive",
      "psd",
      "--ns",
      "billing",
      "--material",
      "",
      "--key",
      keyHex,
    ]);
    expect(await run(d.opts)).toBe(2);
  });

  it("digest match rejects a malformed id (exit 2)", async () => {
    const m = capture([
      "digest",
      "match",
      "xx",
      "--ns",
      "billing",
      "--material",
      "a",
      "--key",
      keyHex,
    ]);
    expect(await run(m.opts)).toBe(2);
  });

  it("convert requires both a brand and a uuid", async () => {
    expect(await run(capture(["convert"]).opts)).toBe(2);
    expect(await run(capture(["convert", "usr"]).opts)).toBe(2);
  });
});

describe("review regression fixes", () => {
  it("rejects a hex --value for a 64-bit kind (no BigInt 0x leniency)", async () => {
    const w = capture([
      "wrapped",
      "wrap",
      "ord",
      "--value",
      "0x1f",
      "--kind",
      "u64",
      "--key",
      keyHex,
    ]);
    expect(await run(w.opts)).toBe(2);
    expect(w.err.join("")).toContain("must be an integer");
  });

  it("treats a negative epoch-ms --at as a pre-epoch usage error", async () => {
    const g = capture(["timestamp", "generate", "usr", "--at", "-1"]);
    expect(await run(g.opts)).toBe(2);
  });

  it("reports a bad --kind once with exit 2 in a batch inspect (not per line)", async () => {
    const batch = capture(["wrapped", "inspect", "--kind", "bogus", "--key", keyHex], {
      readStdin: () => Promise.resolve("ord_aaa\nord_bbb\n"),
    });
    expect(await run(batch.opts)).toBe(2);
    expect(batch.err.join("").match(/--kind/g)).toHaveLength(1);
  });

  it("fails fast with a key error before consuming stdin material (#766)", async () => {
    let stdinRead = false;
    const d = capture(["digest", "derive", "psd", "--ns", "billing"], {
      readStdin: () => {
        stdinRead = true;
        return Promise.resolve("secret-pii");
      },
    });
    expect(await run(d.opts)).toBe(2);
    expect(d.err.join("")).toContain("missing key");
    expect(stdinRead).toBe(false);
  });

  it("does not bind a following flag as a key value", async () => {
    // --json is recognized, so --key has no value -> usage error, not a bogus key
    const ins = capture(["signed", "inspect", "usr_xxxxxxxxxxxxxxxxxxxxxxxxxx", "--key", "--json"]);
    expect(await run(ins.opts)).toBe(2);
    expect(ins.err.join("")).toContain("--key requires a value");
  });
});
