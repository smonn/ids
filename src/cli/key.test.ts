import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCliError } from "./errors.js";
import { type CodecKey, resolveKey, resolveKeyEncoding } from "./key.js";
import type { RunOpts } from "./types.js";

function opts(over: Partial<RunOpts> = {}): RunOpts {
  return { argv: [], stdout: () => {}, stderr: () => {}, env: {}, ...over };
}

// RunOpts with no injected env, so resolution falls through to process.env.
function noEnvOpts(): RunOpts {
  return { argv: [], stdout: () => {}, stderr: () => {} };
}

const fakeKey: CodecKey<{ bytes: Uint8Array }> = {
  decode: (encoded) => {
    if (encoded === "bad") throw new Error("invalid_key_encoding: bad");
    return new Uint8Array(32).fill(1);
  },
  import: (bytes) => ({ bytes }),
};

describe("resolveKeyEncoding", () => {
  it("defaults to hex", () => {
    expect(resolveKeyEncoding(new Map(), opts())).toBe("hex");
  });

  it("reads the --key-encoding flag", () => {
    expect(resolveKeyEncoding(new Map([["--key-encoding", "base64url"]]), opts())).toBe(
      "base64url",
    );
  });

  it("reads IDS_KEY_ENCODING", () => {
    expect(resolveKeyEncoding(new Map(), opts({ env: { IDS_KEY_ENCODING: "base64url" } }))).toBe(
      "base64url",
    );
  });

  it("rejects an invalid encoding as a usage error", () => {
    const r = resolveKeyEncoding(new Map([["--key-encoding", "pem"]]), opts());
    expect(isCliError(r) && r.kind).toBe("usage");
  });

  it("rejects an empty --key-encoding value", () => {
    const r = resolveKeyEncoding(new Map([["--key-encoding", ""]]), opts());
    expect(isCliError(r) && r.message).toContain("requires a value");
  });

  it("rejects an invalid IDS_KEY_ENCODING", () => {
    const r = resolveKeyEncoding(new Map(), opts({ env: { IDS_KEY_ENCODING: "pem" } }));
    expect(isCliError(r) && r.message).toContain("IDS_KEY_ENCODING");
  });

  it("falls back to process.env when no env is injected", () => {
    expect(resolveKeyEncoding(new Map(), noEnvOpts())).toBe("hex");
  });
});

describe("resolveKey", () => {
  it("imports a key from --key", async () => {
    const r = await resolveKey(
      new Map([["--key", "deadbeef"]]),
      new Set(["--key"]),
      opts(),
      fakeKey,
    );
    expect(isCliError(r)).toBe(false);
  });

  it("falls back to IDS_KEY", async () => {
    const r = await resolveKey(
      new Map(),
      new Set(),
      opts({ env: { IDS_KEY: "deadbeef" } }),
      fakeKey,
    );
    expect(isCliError(r)).toBe(false);
  });

  it("errors when no key source is present", async () => {
    const r = await resolveKey(new Map(), new Set(), opts(), fakeKey);
    expect(isCliError(r) && r.message).toContain("missing key");
  });

  it("rejects --key and --key-file together", async () => {
    const r = await resolveKey(
      new Map([
        ["--key", "x"],
        ["--key-file", "k"],
      ]),
      new Set(["--key", "--key-file"]),
      opts(),
      fakeKey,
    );
    expect(isCliError(r) && r.message).toContain("cannot use --key and --key-file together");
  });

  it("reads and trims a key file via opts.readFile", async () => {
    const r = await resolveKey(
      new Map([["--key-file", "k"]]),
      new Set(["--key-file"]),
      opts({ readFile: () => Promise.resolve("deadbeef\n") }),
      fakeKey,
    );
    expect(isCliError(r)).toBe(false);
  });

  it("maps a decode failure to a usage error", async () => {
    const r = await resolveKey(new Map([["--key", "bad"]]), new Set(["--key"]), opts(), fakeKey);
    expect(isCliError(r) && r.kind).toBe("usage");
  });

  it("rejects an empty --key-file path", async () => {
    const r = await resolveKey(
      new Map([["--key-file", ""]]),
      new Set(["--key-file"]),
      opts(),
      fakeKey,
    );
    expect(isCliError(r) && r.message).toContain("--key-file requires a value");
  });

  it("maps a --key-file read failure to a usage error", async () => {
    const r = await resolveKey(
      new Map([["--key-file", "missing"]]),
      new Set(["--key-file"]),
      opts({ readFile: () => Promise.reject(new Error("ENOENT")) }),
      fakeKey,
    );
    expect(isCliError(r) && r.message).toContain("cannot read --key-file");
  });

  it("rejects an empty (whitespace-only) --key-file", async () => {
    const r = await resolveKey(
      new Map([["--key-file", "k"]]),
      new Set(["--key-file"]),
      opts({ readFile: () => Promise.resolve("\n  \n") }),
      fakeKey,
    );
    expect(isCliError(r) && r.message).toContain("is empty");
  });

  it("maps a key import failure to a usage error", async () => {
    const throwingKey: CodecKey<{ bytes: Uint8Array }> = {
      decode: () => new Uint8Array(32),
      import: () => {
        throw new Error("bad key handle");
      },
    };
    const r = await resolveKey(
      new Map([["--key", "deadbeef"]]),
      new Set(["--key"]),
      opts(),
      throwingKey,
    );
    expect(isCliError(r) && r.kind).toBe("usage");
  });

  it("returns the encoding error before resolving the value", async () => {
    const r = await resolveKey(
      new Map([
        ["--key-encoding", "pem"],
        ["--key", "deadbeef"],
      ]),
      new Set(["--key"]),
      opts(),
      fakeKey,
    );
    expect(isCliError(r) && r.message).toContain("--key-encoding");
  });

  it("falls back to process.env for the key value when no env is injected", async () => {
    const r = await resolveKey(new Map(), new Set(), noEnvOpts(), fakeKey);
    expect(isCliError(r) && r.message).toContain("missing key");
  });

  it("reads a key file from disk via the default reader (no opts.readFile)", async () => {
    const path = join(tmpdir(), `ids-key-${process.pid}.hex`);
    await writeFile(path, "deadbeef\n", "utf8");
    const r = await resolveKey(
      new Map([["--key-file", path]]),
      new Set(["--key-file"]),
      opts(),
      fakeKey,
    );
    expect(isCliError(r)).toBe(false);
  });

  it("is silent on a real 0600 key file (no statFile injection)", async () => {
    const path = join(tmpdir(), `ids-key-0600-${process.pid}.hex`);
    await writeFile(path, "deadbeef\n", { encoding: "utf8", mode: 0o600 });
    const captured: string[] = [];
    const result = await resolveKey(
      new Map([["--key-file", path]]),
      new Set(["--key-file"]),
      opts({ stderr: (s) => captured.push(s) }),
      fakeKey,
    );
    expect(isCliError(result)).toBe(false);
    expect(captured.join("")).toBe("");
  });

  it("emits a stderr advisory when --key is used", async () => {
    const captured: string[] = [];
    await resolveKey(
      new Map([["--key", "deadbeef"]]),
      new Set(["--key"]),
      opts({ stderr: (s) => captured.push(s) }),
      fakeKey,
    );
    expect(captured.join("")).toContain("--key-file");
  });

  it("does not emit a key advisory when key comes from IDS_KEY", async () => {
    const captured: string[] = [];
    await resolveKey(
      new Map(),
      new Set(),
      opts({ stderr: (s) => captured.push(s), env: { IDS_KEY: "deadbeef" } }),
      fakeKey,
    );
    expect(captured.join("")).toBe("");
  });

  it("warns on stderr when --key-file has group-readable bits (0o644)", async () => {
    const captured: string[] = [];
    const result = await resolveKey(
      new Map([["--key-file", "k"]]),
      new Set(["--key-file"]),
      opts({
        stderr: (s) => captured.push(s),
        readFile: () => Promise.resolve("deadbeef"),
        statFile: () => Promise.resolve({ mode: 0o100644 }),
      }),
      fakeKey,
    );
    expect(isCliError(result)).toBe(false);
    expect(captured.join("")).toContain("chmod 0600");
  });

  it("is silent when --key-file has 0600 permissions", async () => {
    const captured: string[] = [];
    await resolveKey(
      new Map([["--key-file", "k"]]),
      new Set(["--key-file"]),
      opts({
        stderr: (s) => captured.push(s),
        readFile: () => Promise.resolve("deadbeef"),
        statFile: () => Promise.resolve({ mode: 0o100600 }),
      }),
      fakeKey,
    );
    expect(captured.join("")).toBe("");
  });

  it("silently skips the permissions check when statFile throws", async () => {
    const captured: string[] = [];
    const result = await resolveKey(
      new Map([["--key-file", "k"]]),
      new Set(["--key-file"]),
      opts({
        stderr: (s) => captured.push(s),
        readFile: () => Promise.resolve("deadbeef"),
        statFile: () => Promise.reject(new Error("EPERM")),
      }),
      fakeKey,
    );
    expect(isCliError(result)).toBe(false);
    expect(captured.join("")).toBe("");
  });
});
