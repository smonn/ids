import { describe, expect, it } from "vitest";
import { isCliError } from "./errors.js";
import { type CodecKey, resolveKey, resolveKeyEncoding } from "./key.js";
import type { RunOpts } from "./types.js";

function opts(over: Partial<RunOpts> = {}): RunOpts {
  return { argv: [], stdout: () => {}, stderr: () => {}, env: {}, ...over };
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
});
