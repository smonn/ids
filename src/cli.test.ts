import { describe, expect, it } from "vitest";
import { createOpaqueTimestampId, importOpaqueKey } from "./codecs/opaque/index.js";
import { encodeOpaqueKey, decodeOpaqueKey } from "./codecs/opaque/key.js";
import {
  createSignedTimestampId,
  importSigningKey,
  encodeSigningKey,
  decodeSigningKey,
} from "./codecs/signed/index.js";
import {
  createWrappedKeyId,
  importWrappingKey,
  encodeWrappingKey,
  decodeWrappingKey,
} from "./codecs/wrapped/index.js";
import { createReverseTimestampId } from "./codecs/reverse/index.js";
import { encodeDigestKey } from "./codecs/digest/index.js";
import { run } from "./cli/index.js";
import { IdsError } from "./error.js";
import { formatCliError } from "./cli/format.js";

type Capture = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const testKeyBytes = new Uint8Array(32).fill(0xab);
const testKeyHex = encodeOpaqueKey(testKeyBytes, "hex");

const KEYGEN_WARNING =
  "Warning: secret key material — redirect to a file (chmod 0600) and avoid shell history.\n";

async function runCapture(
  argv: string[],
  opts: {
    now?: () => number;
    rng?: (target: Uint8Array) => void;
    env?: Readonly<Record<string, string | undefined>>;
    readStdin?: () => Promise<string>;
  } = {},
): Promise<Capture> {
  let stdout = "";
  let stderr = "";
  const exitCode = await run({
    argv,
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    now: opts.now ?? (() => 0x123456789abc),
    rng: opts.rng ?? ((target) => target.fill(0x00)),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.readStdin !== undefined ? { readStdin: opts.readStdin } : {}),
  });
  return { stdout, stderr, exitCode };
}

describe("formatCliError", () => {
  it("prefixes IdsError with its stable error code", () => {
    const err = new IdsError(
      "invalid_brand",
      "invalid brand: expected three lowercase a-z characters",
    );
    expect(formatCliError(err)).toMatch(/^invalid_brand:/);
  });

  it("returns plain message for non-IdsError", () => {
    const err = new Error("something unexpected");
    expect(formatCliError(err)).toBe("something unexpected");
  });

  it("returns String(err) for a thrown string", () => {
    expect(formatCliError("oops")).toBe("oops");
  });

  it("returns String(err) for null", () => {
    expect(formatCliError(null)).toBe("null");
  });

  it("returns String(err) for a plain object", () => {
    expect(formatCliError({ code: "x" })).toBe("[object Object]");
  });
});

describe("cli", () => {
  describe("usage", () => {
    it("no args prints usage to stdout and exits 0", async () => {
      const result = await runCapture([]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("inspect");
      expect(result.stdout).toContain("generate");
      expect(result.stdout).toContain("keygen");
    });

    it.each(["--help", "-h"])("%s prints usage to stdout and exits 0", async (flag) => {
      const result = await runCapture([flag]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("inspect");
      expect(result.stdout).toContain("generate");
    });

    it("help documents the generate count range", async () => {
      const result = await runCapture(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Mint 1..10000 canonical IDs");
    });

    it("unknown subcommand prints usage to stderr and exits 2", async () => {
      const result = await runCapture(["nope"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("inspect");
      expect(result.stderr).toContain("generate");
    });
  });

  describe("unsupported opaque typo flags", () => {
    it.each([
      ["inspect", ["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"]],
      ["generate", ["generate", "usr"]],
      ["keygen", ["keygen"]],
    ])("%s rejects a misspelled --opaque flag", async (_command, argv) => {
      const result = await runCapture([...argv, "--opqaue"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it.each([
      ["inspect", ["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"]],
      ["generate", ["generate", "usr"]],
      ["keygen", ["keygen"]],
    ])("%s rejects a misspelled --opaque flag with an inline value", async (_command, argv) => {
      const result = await runCapture([...argv, "--opqaue=true"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });
  });

  describe("inspect", () => {
    it("rejects a misspelled --opaque flag before inspecting", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw", "--opqaue"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects duplicate --opaque flags", async () => {
      const result = await runCapture(
        ["inspect", "usr_00000000000000000000000000", "--opaque", "--opaque"],
        { env: { IDS_KEY: testKeyHex } },
      );
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("invalid base32 payload prints the parse error and exits 1", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("invalid_id");
    });

    it("missing id arg prints inspect usage to stderr and exits 2", async () => {
      const result = await runCapture(["inspect"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("inspect");
    });

    it("rejects an unexpected extra positional argument", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw", "extra"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("wrong-shape brand prints the createTimestampId error and exits 1", async () => {
      const result = await runCapture(["inspect", "12X_01h7b3k9rqxn1cw3p9r8t2sgkw"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("invalid_brand");
    });

    it("non-canonical (uppercase only) reports 'was uppercase' and shows canonical form", async () => {
      const result = await runCapture(["inspect", "USR_01H7B3K9RQXN1CW3P9R8T2SGKW"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[0]).toBe("brand:     usr");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkw");
      expect(lines[3]).toMatch(/^uuid:/);
      expect(lines[4]).toBe("input:     not canonical (was uppercase)");
    });

    it("non-canonical (aliases only) reports 'used Crockford aliases'", async () => {
      const result = await runCapture(["inspect", "usr_olh7b3k9rqxnicw3p9r8t2sgkw"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkw");
      expect(lines[3]).toMatch(/^uuid:/);
      expect(lines[4]).toBe("input:     not canonical (used Crockford aliases)");
    });

    it("non-canonical (uppercase + aliases) reports both", async () => {
      const result = await runCapture(["inspect", "USR_Olh7b3k9rqxnIcw3p9r8t2sgkw"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkw");
      expect(lines[3]).toMatch(/^uuid:/);
      expect(lines[4]).toBe("input:     not canonical (was uppercase + used Crockford aliases)");
    });

    it("`i` is an alias for inspect", async () => {
      const result = await runCapture(["i", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkw");
    });

    it("falls back to Date.now when not overridden", async () => {
      let stdout = "";
      const exitCode = await run({
        argv: ["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkw");
    });

    it.each([
      ["just now", 0],
      ["5 minutes ago", 5 * 60_000],
      ["3 hours ago", 3 * 3_600_000],
      ["5 days ago", 5 * 86_400_000],
      ["1 month ago", 30.44 * 86_400_000],
      ["3 months ago", 3 * 30.44 * 86_400_000],
      ["1 year ago", 12 * 30.44 * 86_400_000],
      ["2 years 3 months ago", 27 * 30.44 * 86_400_000],
      ["1 hour from now", -3_600_000],
    ])("renders relative time as '%s'", async (relative, offset) => {
      const thenMs = new Date("1983-05-27T10:24:22.469Z").getTime();
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"], {
        now: () => thenMs + offset,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`(${relative})`);
    });

    it("prints brand/timestamp/canonical/uuid/input for a canonical ID and exits 0", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(
        [
          "brand:     usr",
          "timestamp: 1983-05-27T10:24:22.469Z (43 years ago)",
          "canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
          "uuid:      0062758e-69c5-fb50-b383-b2708d0b309f",
          "input:     canonical",
          "",
        ].join("\n"),
      );
    });

    it("warns on the bare readable path that the timestamp is meaningless for Opaque IDs", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe(
        "note: timestamp assumes a plaintext Timestamp ID; if this ID was Opaque-encoded, the timestamp is meaningless — re-run with --opaque and the correct IDS_KEY\n",
      );
      // stdout contract unchanged: same fields, same format
      expect(result.stdout).toContain("timestamp: 1983-05-27T10:24:22.469Z");
    });

    it("--opaque without IDS_KEY exits 2", async () => {
      const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--opaque"], {
        env: {},
      });
      expect(result.exitCode).toBe(2);
    });

    it("--opaque rejects an invalid --key-format", async () => {
      const result = await runCapture(
        ["inspect", "usr_00000000000000000000000000", "--opaque", "--key-format", "bogus"],
        { env: { IDS_KEY: testKeyHex } },
      );
      expect(result.exitCode).toBe(2);
    });

    it("--opaque rejects a missing --key-format value", async () => {
      const result = await runCapture(
        ["inspect", "usr_00000000000000000000000000", "--opaque", "--key-format"],
        { env: { IDS_KEY: testKeyHex } },
      );
      expect(result.exitCode).toBe(2);
    });

    it("rejects --key-format without --opaque, --wrapped, or --signed", async () => {
      const result = await runCapture([
        "inspect",
        "usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
        "--key-format",
        "base64url",
      ]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("--opaque rejects an invalid brand", async () => {
      const result = await runCapture(["inspect", "12X_00000000000000000000000000", "--opaque"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_brand");
    });

    it("--opaque rejects invalid base32 payload", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!", "--opaque"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_id");
    });

    it("--opaque rejects malformed IDS_KEY", async () => {
      const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--opaque"], {
        env: { IDS_KEY: "aabbcc" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_key_length");
    });

    it("--opaque falls back to Date.now when not overridden", async () => {
      const key = await importOpaqueKey(testKeyBytes);
      const id = await createOpaqueTimestampId("usr", {
        key,
        now: () => new Date("2026-05-28T12:00:00Z").getTime(),
        rng: (target) => target.fill(0x42),
      }).generate();
      let stdout = "";
      const exitCode = await run({
        argv: ["inspect", id, "--opaque"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
        env: { IDS_KEY: testKeyHex },
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
    });

    it("--opaque decodes timestamp from an opaque ID", async () => {
      const key = await importOpaqueKey(testKeyBytes);
      const fixed = new Date("2026-05-28T12:00:00Z");
      const usr = createOpaqueTimestampId("usr", {
        key,
        now: () => fixed.getTime(),
        rng: (target) => target.fill(0x42),
      });
      const id = await usr.generate();
      const result = await runCapture(["inspect", id, "--opaque"], {
        env: { IDS_KEY: testKeyHex },
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("note: timestamp assumes IDS_KEY matches");
      expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
      expect(result.stdout).toContain(`canonical: ${id}`);
    });

    it("--opaque reads base64url IDS_KEY when IDS_KEY_FORMAT is set", async () => {
      const key = await importOpaqueKey(testKeyBytes);
      const fixed = new Date("2026-05-28T12:00:00Z");
      const usr = createOpaqueTimestampId("usr", {
        key,
        now: () => fixed.getTime(),
        rng: (target) => target.fill(0x42),
      });
      const id = await usr.generate();
      const keyB64 = encodeOpaqueKey(testKeyBytes, "base64url");
      const result = await runCapture(["inspect", id, "--opaque"], {
        env: { IDS_KEY: keyB64, IDS_KEY_FORMAT: "base64url" },
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
    });
  });

  describe("generate", () => {
    it("rejects an unexpected extra positional argument", async () => {
      const result = await runCapture(["generate", "usr", "extra"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("prints one canonical ID and exits 0", async () => {
      const result = await runCapture(["generate", "usr"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("usr_28t5cy4tqg0000000000000000\n");
    });

    it("`g` is an alias for generate", async () => {
      const result = await runCapture(["g", "usr"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("usr_28t5cy4tqg0000000000000000\n");
    });

    it("falls back to default now/rng when not overridden", async () => {
      let stdout = "";
      const exitCode = await run({
        argv: ["generate", "usr"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
      });
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}\n$/);
    });

    it("missing brand arg surfaces the createTimestampId error and exits 1", async () => {
      const result = await runCapture(["generate"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_brand");
    });

    it("invalid brand surfaces the createTimestampId error and exits 1", async () => {
      const result = await runCapture(["generate", "BAD"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("invalid_brand");
    });

    it("rejects flags that belong to another command", async () => {
      const result = await runCapture(["generate", "usr", "--bits", "128"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects flags that belong to another command before value-shape errors", async () => {
      const result = await runCapture(["generate", "usr", "--bits"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects an unsupported dash-prefixed token after a missing value flag", async () => {
      const result = await runCapture(["generate", "usr", "--count", "--opqaue"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("reports the missing value when the following dash-prefixed token is allowed", async () => {
      const result = await runCapture(["generate", "usr", "--count", "--opaque"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/--count/);
    });

    it("rejects a misspelled --opaque flag before generating", async () => {
      const result = await runCapture(["generate", "usr", "--opqaue"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects a misspelled --opaque flag with an inline value by flag name", async () => {
      const result = await runCapture(["generate", "usr", "--opqaue=true"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("prints generate-specific usage to stdout and exits 0 for --help", async () => {
      const result = await runCapture(["generate", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("generate");
    });

    it("rejects -- as an unsupported flag", async () => {
      const result = await runCapture(["generate", "--", "usr"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it.each([
      ["--count", "abc"],
      ["--count", "0"],
      ["--count", "1.5"],
      ["--count", "Infinity"],
      ["--count", "1e309"],
      ["--count", "1_000"],
      ["--count", "+3"],
      ["--count", "03"],
      ["--count"],
    ])("rejects %s %s with exit 2 and a stderr message", async (...flags) => {
      const result = await runCapture(["generate", "usr", ...flags]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/--count/);
    });

    it("rejects --count values above the CLI ceiling before generating", async () => {
      const result = await runCapture(["generate", "usr", "--count", "10001"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/--count/);
    });

    it.each(["9007199254740992", "9".repeat(400)])(
      "rejects oversized positive integer --count %s before generating",
      async (count) => {
        const result = await runCapture(["generate", "usr", "--count", count]);
        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toMatch(/--count/);
      },
    );

    it("rejects dash-prefixed count values as unsupported flags", async () => {
      const result = await runCapture(["generate", "usr", "--count", "-3"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("accepts the explicit lower --count boundary", async () => {
      const result = await runCapture(["generate", "usr", "--count", "1"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trimEnd().split("\n")).toHaveLength(1);
    });

    it("accepts the upper --count boundary", async () => {
      const result = await runCapture(["generate", "usr", "--count", "10000"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trimEnd().split("\n")).toHaveLength(10_000);
    });

    it("`-c` is an alias for --count", async () => {
      let counter = 0;
      const result = await runCapture(["generate", "usr", "-c", "3"], {
        rng: (target) => {
          target.fill(0);
          target[9] = counter++;
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trimEnd().split("\n")).toHaveLength(3);
    });

    it("rejects duplicate count flags even when one uses the alias", async () => {
      const result = await runCapture(["generate", "usr", "-c", "2", "--count", "3"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("--count N prints N distinct IDs, one per line", async () => {
      let counter = 0;
      const result = await runCapture(["generate", "usr", "--count", "3"], {
        rng: (target) => {
          target.fill(0);
          target[9] = counter++;
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const lines = result.stdout.split("\n");
      expect(lines.at(-1)).toBe(""); // trailing newline
      const ids = lines.slice(0, -1);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
    });

    it("--opaque without IDS_KEY exits 2", async () => {
      const result = await runCapture(["generate", "usr", "--opaque"], { env: {} });
      expect(result.exitCode).toBe(2);
    });

    it("--opaque rejects --count above the CLI ceiling before loading IDS_KEY", async () => {
      const result = await runCapture(["generate", "usr", "--opaque", "--count", "10001"], {
        env: {},
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/--count/);
    });

    it("rejects an inline value for --opaque", async () => {
      const result = await runCapture(["generate", "usr", "--opaque=true"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("--opaque rejects an invalid --key-format", async () => {
      const result = await runCapture(["generate", "usr", "--opaque", "--key-format", "bogus"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(2);
    });

    it("--opaque rejects an invalid brand", async () => {
      const result = await runCapture(["generate", "BAD", "--opaque"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_brand");
    });

    it("--opaque rejects a missing brand", async () => {
      const result = await runCapture(["generate", "--opaque"], { env: { IDS_KEY: testKeyHex } });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_brand");
    });

    it("--opaque rejects malformed IDS_KEY", async () => {
      const result = await runCapture(["generate", "usr", "--opaque"], {
        env: { IDS_KEY: "not-hex!" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_key_encoding");
    });

    it("--opaque rejects a base64url IDS_KEY when --key-format=hex", async () => {
      const keyB64 = encodeOpaqueKey(testKeyBytes, "base64url");
      const result = await runCapture(["generate", "usr", "--opaque", "--key-format=hex"], {
        env: { IDS_KEY: keyB64 },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("invalid_key_encoding");
    });

    it("--opaque reads IDS_KEY from process.env when env is not injected", async () => {
      const previous = process.env.IDS_KEY;
      process.env.IDS_KEY = testKeyHex;
      try {
        const result = await runCapture(["generate", "usr", "--opaque"], {
          now: () => 0x123456789abc,
          rng: (target) => target.fill(0x00),
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}\n$/);
      } finally {
        if (previous === undefined) delete process.env.IDS_KEY;
        else process.env.IDS_KEY = previous;
      }
    });

    it("--opaque mints deterministic IDs with fixed now/rng", async () => {
      const key = await importOpaqueKey(testKeyBytes);
      const usr = createOpaqueTimestampId("usr", {
        key,
        now: () => 0x123456789abc,
        rng: (target) => target.fill(0x00),
      });
      const expected = await usr.generate();
      const result = await runCapture(["generate", "usr", "--opaque"], {
        env: { IDS_KEY: testKeyHex },
        now: () => 0x123456789abc,
        rng: (target) => target.fill(0x00),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`${expected}\n`);
    });

    it("--opaque --count N prints N IDs, one per line", async () => {
      let counter = 0;
      const result = await runCapture(["generate", "usr", "--opaque", "--count", "2"], {
        env: { IDS_KEY: testKeyHex },
        now: () => 0x123456789abc,
        rng: (target) => {
          target.fill(0);
          target[9] = counter++;
        },
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.split("\n");
      expect(lines.at(-1)).toBe("");
      const ids = lines.slice(0, -1);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      for (const id of ids) expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
    });

    it("--opaque accepts the upper --count boundary", async () => {
      const result = await runCapture(["generate", "usr", "--opaque", "--count", "10000"], {
        env: { IDS_KEY: testKeyHex },
        now: () => 0x123456789abc,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trimEnd().split("\n")).toHaveLength(10_000);
    });

    it("--key-format on the command line wins over IDS_KEY_FORMAT", async () => {
      const key = await importOpaqueKey(testKeyBytes);
      const expected = await createOpaqueTimestampId("usr", {
        key,
        now: () => 0x123456789abc,
        rng: (target) => target.fill(0x00),
      }).generate();
      const result = await runCapture(["generate", "usr", "--opaque", "--key-format=hex"], {
        env: { IDS_KEY: testKeyHex, IDS_KEY_FORMAT: "base64url" },
        now: () => 0x123456789abc,
        rng: (target) => target.fill(0x00),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`${expected}\n`);
    });

    it("rejects --key-format without --opaque, --signed, or --digest", async () => {
      const result = await runCapture(["generate", "usr", "--key-format", "base64url"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects duplicate --key-format flags", async () => {
      const result = await runCapture([
        "generate",
        "usr",
        "--opaque",
        "--key-format",
        "hex",
        "--key-format=base64url",
      ]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });
  });

  describe("keygen", () => {
    it("rejects an unexpected positional argument", async () => {
      const result = await runCapture(["keygen", "extra"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects flags that belong to another command", async () => {
      const result = await runCapture(["keygen", "--opaque"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects --kind, which is not applicable to key generation", async () => {
      const result = await runCapture(["keygen", "--kind", "u32"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects unknown flags", async () => {
      const result = await runCapture(["keygen", "--bogus"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("emits a 256-bit hex key by default", async () => {
      const result = await runCapture(["keygen"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe(KEYGEN_WARNING);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("`k` is an alias for keygen", async () => {
      const result = await runCapture(["k", "--bits", "128"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{32}$/);
    });

    it("supports base64url output", async () => {
      const result = await runCapture(["keygen", "--bits", "128", "--key-format", "base64url"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.stdout.trim()).toHaveLength(22);
    });

    it("accepts --key-format=value and --bits=value", async () => {
      const result = await runCapture(["keygen", "--key-format=base64url", "--bits=128"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.stdout.trim()).toHaveLength(22);
    });

    it("rejects duplicate --bits flags", async () => {
      const result = await runCapture(["keygen", "--bits", "128", "--bits=256"]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
    });

    it("rejects invalid --bits", async () => {
      const result = await runCapture(["keygen", "--bits", "384"]);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toMatch(/--bits must be 128, 192, or 256/);
    });

    it("accepts --bits 192", async () => {
      const result = await runCapture(["keygen", "--bits", "192"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{48}$/);
      expect(decodeOpaqueKey(result.stdout.trim(), "hex")).toHaveLength(24);
    });

    it("rejects a missing --bits value", async () => {
      const result = await runCapture(["keygen", "--bits"]);
      expect(result.exitCode).toBe(2);
    });

    it("accepts explicit --bits 256", async () => {
      const result = await runCapture(["keygen", "--bits", "256"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("rejects an invalid --key-format", async () => {
      const result = await runCapture(["keygen", "--key-format", "bogus"]);
      expect(result.exitCode).toBe(2);
    });

    it("rejects a missing --key-format value", async () => {
      const result = await runCapture(["keygen", "--key-format"]);
      expect(result.exitCode).toBe(2);
    });

    it("ignores IDS_KEY_FORMAT and emits hex by default", async () => {
      const result = await runCapture(["keygen"], {
        env: { IDS_KEY_FORMAT: "base64url" },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("ignores a bogus IDS_KEY_FORMAT env var", async () => {
      const result = await runCapture(["keygen"], {
        env: { IDS_KEY_FORMAT: "bogus" },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("rejects an invalid IDS_KEY_FORMAT env var", async () => {
      const result = await runCapture(["generate", "usr", "--opaque"], {
        env: { IDS_KEY: testKeyHex, IDS_KEY_FORMAT: "bogus" },
      });
      expect(result.exitCode).toBe(2);
    });

    it("reads base64url IDS_KEY when IDS_KEY_FORMAT is set", async () => {
      const keyB64 = encodeOpaqueKey(testKeyBytes, "base64url");
      const key = await importOpaqueKey(testKeyBytes);
      const expected = await createOpaqueTimestampId("usr", {
        key,
        now: () => 0x123456789abc,
        rng: (target) => target.fill(0x00),
      }).generate();
      const result = await runCapture(["generate", "usr", "--opaque"], {
        env: { IDS_KEY: keyB64, IDS_KEY_FORMAT: "base64url" },
        now: () => 0x123456789abc,
        rng: (target) => target.fill(0x00),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`${expected}\n`);
    });

    it("keygen preamble covers all four key types", async () => {
      const result = await runCapture(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "importOpaqueKey, importWrappingKey, importSigningKey, or importDigestKey",
      );
    });

    it("stdout contains only the key — no warning text", async () => {
      const result = await runCapture(["keygen"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
      expect(result.stdout).not.toContain("Warning");
    });

    it("help text documents safe handling (redirect and chmod 0600)", async () => {
      const result = await runCapture(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("0600");
      expect(result.stdout).toContain("redirect");
    });
  });
});

const testWrappingKeyBytes = new Uint8Array(32).fill(0xcd);
const testWrappingKeyHex = encodeWrappingKey(testWrappingKeyBytes, "hex");

describe("cli keygen --wrapped", () => {
  it("emits a 256-bit hex wrapping key by default", async () => {
    const result = await runCapture(["keygen", "--wrapped"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(KEYGEN_WARNING);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keygen --wrapped output round-trips through decodeWrappingKey", async () => {
    const result = await runCapture(["keygen", "--wrapped"]);
    expect(result.exitCode).toBe(0);
    const bytes = decodeWrappingKey(result.stdout.trim(), "hex");
    expect(bytes).toHaveLength(32);
  });

  it("supports --bits 128", async () => {
    const result = await runCapture(["keygen", "--wrapped", "--bits", "128"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("supports --bits 192", async () => {
    const result = await runCapture(["keygen", "--wrapped", "--bits", "192"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{48}$/);
  });

  it("supports base64url output with --key-format", async () => {
    const result = await runCapture([
      "keygen",
      "--wrapped",
      "--bits",
      "128",
      "--key-format",
      "base64url",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.stdout.trim()).toHaveLength(22);
  });

  it("rejects unknown flags with --wrapped", async () => {
    const result = await runCapture(["keygen", "--wrapped", "--bogus"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --opaque with --wrapped (unsupported for keygen)", async () => {
    const result = await runCapture(["keygen", "--wrapped", "--opaque"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("keygen --wrapped is distinct from keygen (different secret domain)", async () => {
    const opaqueResult = await runCapture(["keygen"]);
    const wrappedResult = await runCapture(["keygen", "--wrapped"]);
    expect(opaqueResult.exitCode).toBe(0);
    expect(wrappedResult.exitCode).toBe(0);
    // both emit hex keys (different random bytes, same format)
    expect(opaqueResult.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(wrappedResult.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("usage documents --wrapped flag for keygen", async () => {
    const result = await runCapture(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--wrapped");
    expect(result.stdout).toContain("IDS_WRAPPING_KEY");
  });

  it("usage documents IDS_SIGNING_KEY_FORMAT for keygen --signed", async () => {
    const result = await runCapture(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--signed");
    expect(result.stdout).toContain("IDS_SIGNING_KEY_FORMAT");
  });

  it("stdout contains only the wrapping key — no warning text", async () => {
    const result = await runCapture(["keygen", "--wrapped"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(result.stdout).not.toContain("Warning");
  });
});

describe("cli inspect --wrapped", () => {
  it("requires --kind when --wrapped is passed", async () => {
    const result = await runCapture(["inspect", "inv_00000000000000000000000000", "--wrapped"], {
      env: { IDS_WRAPPING_KEY: testWrappingKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects an invalid --kind value", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u8"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects a missing --kind value", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("recovers a u32 lookup key from a wrapped ID", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(42);
    const result = await runCapture(["inspect", id, "--wrapped", "--kind", "u32"], {
      env: { IDS_WRAPPING_KEY: testWrappingKeyHex },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("brand:      inv");
    expect(result.stdout).toContain("lookup-key: 42");
    expect(result.stdout).toContain(`canonical:  ${id}`);
    expect(result.stdout).toContain("input:      canonical");
  });

  it("recovers an i32 lookup key (negative)", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("iny", {
      kind: "i32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(-7);
    const result = await runCapture(["inspect", id, "--wrapped", "--kind", "i32"], {
      env: { IDS_WRAPPING_KEY: testWrappingKeyHex },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("lookup-key: -7");
  });

  it("recovers a u64 lookup key (bigint)", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("inz", {
      kind: "u64",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(9999999999999999n);
    const result = await runCapture(["inspect", id, "--wrapped", "--kind", "u64"], {
      env: { IDS_WRAPPING_KEY: testWrappingKeyHex },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("lookup-key: 9999999999999999");
  });

  it("prints verification failure on stderr for wrong key", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("inw", {
      kind: "u32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(42);
    const wrongKeyBytes = new Uint8Array(32).fill(0xff);
    const wrongKeyHex = encodeWrappingKey(wrongKeyBytes, "hex");
    const result = await runCapture(["inspect", id, "--wrapped", "--kind", "u32"], {
      env: { IDS_WRAPPING_KEY: wrongKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("verification_failed");
  });

  it("exits 2 when IDS_WRAPPING_KEY is missing", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u32"],
      { env: {} },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("reads base64url IDS_WRAPPING_KEY when IDS_WRAPPING_KEY_FORMAT is base64url", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("inb", {
      kind: "u32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(7);
    const keyB64 = encodeWrappingKey(testWrappingKeyBytes, "base64url");
    const result = await runCapture(["inspect", id, "--wrapped", "--kind", "u32"], {
      env: { IDS_WRAPPING_KEY: keyB64, IDS_WRAPPING_KEY_FORMAT: "base64url" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("lookup-key: 7");
  });

  it("--key-format overrides IDS_WRAPPING_KEY_FORMAT for --wrapped", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("inc", {
      kind: "u32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(5);
    const keyB64 = encodeWrappingKey(testWrappingKeyBytes, "base64url");
    const result = await runCapture(
      ["inspect", id, "--wrapped", "--kind", "u32", "--key-format", "base64url"],
      { env: { IDS_WRAPPING_KEY: keyB64, IDS_WRAPPING_KEY_FORMAT: "hex" } },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("lookup-key: 5");
  });

  it("rejects malformed IDS_WRAPPING_KEY", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: "not-hex!" } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_key_encoding");
  });

  it("rejects invalid base32 payload with --wrapped", async () => {
    const result = await runCapture(
      ["inspect", "inv_01h7b3k9rqxn1cw3p9r8t2sgk!", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_id");
  });

  it("rejects --wrapped and --opaque together", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--opaque", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("structural-only inspect (no --wrapped) is unchanged for a valid ID", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"], {
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("brand:     usr");
    expect(result.stdout).toContain("timestamp:");
    expect(result.stdout).toContain("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkw");
  });

  it("rejects invalid --key-format with --wrapped", async () => {
    const result = await runCapture(
      [
        "inspect",
        "inv_00000000000000000000000000",
        "--wrapped",
        "--kind",
        "u32",
        "--key-format",
        "bogus",
      ],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects invalid IDS_WRAPPING_KEY_FORMAT", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex, IDS_WRAPPING_KEY_FORMAT: "bogus" } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects an invalid brand with --wrapped", async () => {
    const result = await runCapture(
      ["inspect", "12X_00000000000000000000000000", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("rejects a missing --key-format value with --wrapped", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u32", "--key-format"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("reads IDS_WRAPPING_KEY from process.env when env is not injected", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("ire", {
      kind: "u32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(99);
    const previousKey = process.env.IDS_WRAPPING_KEY;
    process.env.IDS_WRAPPING_KEY = testWrappingKeyHex;
    try {
      let stdout = "";
      let stderr = "";
      const exitCode = await run({
        argv: ["inspect", id, "--wrapped", "--kind", "u32"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: (s) => {
          stderr += s;
        },
      });
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("lookup-key: 99");
    } finally {
      if (previousKey === undefined) delete process.env.IDS_WRAPPING_KEY;
      else process.env.IDS_WRAPPING_KEY = previousKey;
    }
  });

  it("reads IDS_WRAPPING_KEY_FORMAT from process.env when env is not injected", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("irf", {
      kind: "u32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(55);
    const keyB64 = encodeWrappingKey(testWrappingKeyBytes, "base64url");
    const previousKey = process.env.IDS_WRAPPING_KEY;
    const previousFmt = process.env.IDS_WRAPPING_KEY_FORMAT;
    process.env.IDS_WRAPPING_KEY = keyB64;
    process.env.IDS_WRAPPING_KEY_FORMAT = "base64url";
    try {
      let stdout = "";
      let stderr = "";
      const exitCode = await run({
        argv: ["inspect", id, "--wrapped", "--kind", "u32"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: (s) => {
          stderr += s;
        },
      });
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("lookup-key: 55");
    } finally {
      if (previousKey === undefined) delete process.env.IDS_WRAPPING_KEY;
      else process.env.IDS_WRAPPING_KEY = previousKey;
      if (previousFmt === undefined) delete process.env.IDS_WRAPPING_KEY_FORMAT;
      else process.env.IDS_WRAPPING_KEY_FORMAT = previousFmt;
    }
  });
});

describe("cli generate --reverse", () => {
  it("mints a Reverse Timestamp ID and exits 0", async () => {
    const expected = createReverseTimestampId("usr", {
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
      allowDuplicateBrand: true,
    }).generate();
    const result = await runCapture(["generate", "usr", "--reverse"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${expected}\n`);
  });

  it("--reverse --count N mints N Reverse Timestamp IDs", async () => {
    let counter = 0;
    const result = await runCapture(["generate", "usr", "--reverse", "--count", "3"], {
      rng: (target) => {
        target.fill(0);
        target[9] = counter++;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.split("\n");
    expect(lines.at(-1)).toBe("");
    const ids = lines.slice(0, -1);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("--reverse rejects an invalid brand", async () => {
    const result = await runCapture(["generate", "BAD", "--reverse"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("--reverse rejects a missing brand", async () => {
    const result = await runCapture(["generate", "--reverse"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("--reverse with --opaque emits a conflict error and exits 2", async () => {
    const result = await runCapture(["generate", "usr", "--reverse", "--opaque"], {
      env: { IDS_KEY: testKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("usage documents --reverse for generate", async () => {
    const result = await runCapture(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--reverse");
  });
});

describe("cli inspect --reverse", () => {
  it("decodes a Reverse Timestamp ID and exits 0", async () => {
    const nowMs = new Date("2026-05-27T10:24:22.469Z").getTime();
    const codec = createReverseTimestampId("usr", {
      now: () => nowMs,
      rng: (target) => target.fill(0x00),
      allowDuplicateBrand: true,
    });
    const id = codec.generate();
    const expectedTimestamp = codec.extractTimestamp(id).toISOString();
    const result = await runCapture(["inspect", id, "--reverse"], {
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(
      "note: timestamp assumes a plaintext Timestamp ID; if this ID was Opaque-encoded, the timestamp is meaningless — re-run with --opaque and the correct IDS_KEY\n",
    );
    expect(result.stdout).toContain("brand:     usr");
    expect(result.stdout).toContain(`timestamp: ${expectedTimestamp}`);
    expect(result.stdout).toContain(`canonical: ${id}`);
    expect(result.stdout).toContain("input:     canonical");
  });

  it("--reverse falls back to Date.now when not overridden", async () => {
    const codec = createReverseTimestampId("usr", {
      now: () => new Date("2026-05-28T12:00:00Z").getTime(),
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = codec.generate();
    let stdout = "";
    const exitCode = await run({
      argv: ["inspect", id, "--reverse"],
      stdout: (s) => {
        stdout += s;
      },
      stderr: () => {},
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
  });

  it("--reverse rejects an invalid brand", async () => {
    const result = await runCapture(["inspect", "12X_00000000000000000000000000", "--reverse"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("--reverse rejects invalid base32 payload", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!", "--reverse"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_id");
  });

  it("--reverse with --opaque emits a conflict error and exits 2", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--reverse", "--opaque"],
      { env: { IDS_KEY: testKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("--reverse with --wrapped emits a conflict error and exits 2", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--reverse", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });
});

const testSigningKeyBytes = new Uint8Array(32).fill(0xef);
const testSigningKeyHex = encodeSigningKey(testSigningKeyBytes, "hex");

describe("cli keygen --signed", () => {
  it("emits a 256-bit hex signing key by default", async () => {
    const result = await runCapture(["keygen", "--signed"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(KEYGEN_WARNING);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keygen --signed output round-trips through decodeSigningKey", async () => {
    const result = await runCapture(["keygen", "--signed"]);
    expect(result.exitCode).toBe(0);
    const bytes = decodeSigningKey(result.stdout.trim(), "hex");
    expect(bytes).toHaveLength(32);
  });

  it("supports --bits 128", async () => {
    const result = await runCapture(["keygen", "--signed", "--bits", "128"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("supports --bits 192", async () => {
    const result = await runCapture(["keygen", "--signed", "--bits", "192"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{48}$/);
  });

  it("supports base64url output with --key-format", async () => {
    const result = await runCapture([
      "keygen",
      "--signed",
      "--bits",
      "128",
      "--key-format",
      "base64url",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.stdout.trim()).toHaveLength(22);
  });

  it("rejects --signed and --wrapped together", async () => {
    const result = await runCapture(["keygen", "--signed", "--wrapped"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --wrapped and --signed together (reverse order)", async () => {
    const result = await runCapture(["keygen", "--wrapped", "--signed"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --opaque with --signed (--opaque is unsupported for keygen)", async () => {
    const result = await runCapture(["keygen", "--signed", "--opaque"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("keygen --signed is distinct from keygen and keygen --wrapped (separate secret domains)", async () => {
    const opaqueResult = await runCapture(["keygen"]);
    const wrappedResult = await runCapture(["keygen", "--wrapped"]);
    const signedResult = await runCapture(["keygen", "--signed"]);
    expect(opaqueResult.exitCode).toBe(0);
    expect(wrappedResult.exitCode).toBe(0);
    expect(signedResult.exitCode).toBe(0);
    expect(opaqueResult.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(wrappedResult.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(signedResult.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("usage documents --signed flag for keygen", async () => {
    const result = await runCapture(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--signed");
    expect(result.stdout).toContain("IDS_SIGNING_KEY");
  });

  it("stdout contains only the signing key — no warning text", async () => {
    const result = await runCapture(["keygen", "--signed"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(result.stdout).not.toContain("Warning");
  });
});

describe("cli generate --signed", () => {
  it("mints a signed ID that verifies with the same key", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
      allowDuplicateBrand: true,
    });
    const expected = await usr.generate();
    const result = await runCapture(["generate", "usr", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${expected}\n`);
  });

  it("without IDS_SIGNING_KEY exits 2 with a clear error", async () => {
    const result = await runCapture(["generate", "usr", "--signed"], { env: {} });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --signed and --opaque together", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--opaque"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_KEY: testKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --signed and --reverse together", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--reverse"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --signed and --wrapped together (--wrapped is unsupported in generate)", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--wrapped"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--wrapped");
  });

  it("rejects malformed IDS_SIGNING_KEY", async () => {
    const result = await runCapture(["generate", "usr", "--signed"], {
      env: { IDS_SIGNING_KEY: "not-hex!" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_key_encoding");
  });

  it("rejects an invalid brand with --signed", async () => {
    const result = await runCapture(["generate", "BAD", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("--signed --count N mints N signed IDs", async () => {
    let counter = 0;
    const result = await runCapture(["generate", "usr", "--signed", "--count", "3"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
      now: () => 0x123456789abc,
      rng: (target) => {
        target.fill(0);
        target[4] = counter++;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.split("\n");
    expect(lines.at(-1)).toBe("");
    const ids = lines.slice(0, -1);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("reads base64url IDS_SIGNING_KEY when IDS_SIGNING_KEY_FORMAT is base64url", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
      allowDuplicateBrand: true,
    });
    const expected = await usr.generate();
    const keyB64 = encodeSigningKey(testSigningKeyBytes, "base64url");
    const result = await runCapture(["generate", "usr", "--signed"], {
      env: { IDS_SIGNING_KEY: keyB64, IDS_SIGNING_KEY_FORMAT: "base64url" },
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${expected}\n`);
  });

  it("--key-format on the command line wins over IDS_SIGNING_KEY_FORMAT", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const expected = await createSignedTimestampId("usr", {
      keys: [key],
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
      allowDuplicateBrand: true,
    }).generate();
    const result = await runCapture(["generate", "usr", "--signed", "--key-format=hex"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_SIGNING_KEY_FORMAT: "base64url" },
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${expected}\n`);
  });

  it("rejects --key-format without --signed, --opaque, or --digest for generate", async () => {
    const result = await runCapture(["generate", "usr", "--key-format", "base64url"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects an invalid IDS_SIGNING_KEY_FORMAT", async () => {
    const result = await runCapture(["generate", "usr", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_SIGNING_KEY_FORMAT: "bogus" },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects an invalid --key-format with --signed", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--key-format", "bogus"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects a missing --key-format value with --signed", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--key-format"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects a missing brand with --signed", async () => {
    const result = await runCapture(["generate", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("reads IDS_SIGNING_KEY from process.env when env is not injected", async () => {
    const previous = process.env.IDS_SIGNING_KEY;
    process.env.IDS_SIGNING_KEY = testSigningKeyHex;
    try {
      const result = await runCapture(["generate", "usr", "--signed"], {
        now: () => 0x123456789abc,
        rng: (target) => target.fill(0x00),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}\n$/);
    } finally {
      if (previous === undefined) delete process.env.IDS_SIGNING_KEY;
      else process.env.IDS_SIGNING_KEY = previous;
    }
  });

  it("falls back to Date.now and crypto.getRandomValues when not overridden (--signed)", async () => {
    let stdout = "";
    const exitCode = await run({
      argv: ["generate", "usr", "--signed"],
      stdout: (s) => {
        stdout += s;
      },
      stderr: () => {},
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}\n$/);
  });
});

describe("cli inspect --signed", () => {
  it("without IDS_SIGNING_KEY: exits 1 with verification: unavailable", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => fixed.getTime(),
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const result = await runCapture(["inspect", id, "--signed"], {
      env: {},
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing IDS_SIGNING_KEY");
    expect(result.stdout).toContain("brand:     usr");
    expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
    expect(result.stdout).toContain(`canonical: ${id}`);
    expect(result.stdout).toContain("verification: unavailable");
  });

  it("with correct IDS_SIGNING_KEY: prints verification: ok and exits 0", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => fixed.getTime(),
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const result = await runCapture(["inspect", id, "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("brand:     usr");
    expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
    expect(result.stdout).toContain("verification: ok");
    expect(result.stdout).toContain(`canonical: ${id}`);
  });

  it("with wrong IDS_SIGNING_KEY: prints verification: failed and exits 1", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => fixed.getTime(),
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const wrongKeyBytes = new Uint8Array(32).fill(0x11);
    const wrongKeyHex = encodeSigningKey(wrongKeyBytes, "hex");
    const result = await runCapture(["inspect", id, "--signed"], {
      env: { IDS_SIGNING_KEY: wrongKeyHex },
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("verification_failed");
    expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
    expect(result.stdout).toContain("verification: failed");
  });

  it("the verification: ok/failed line appears between timestamp and canonical", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => fixed.getTime(),
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const result = await runCapture(["inspect", id, "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^brand:/);
    expect(lines[1]).toMatch(/^timestamp:/);
    expect(lines[2]).toBe("verification: ok");
    expect(lines[3]).toMatch(/^canonical:/);
    expect(lines[4]).toMatch(/^uuid:/);
    expect(lines[5]).toMatch(/^input:/);
  });

  it("rejects --signed and --opaque together", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--opaque"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_KEY: testKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --signed and --wrapped together", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--wrapped", "--kind", "u32"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --signed and --reverse together", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--reverse"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --key-format without --opaque, --wrapped, or --signed", async () => {
    const result = await runCapture([
      "inspect",
      "usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
      "--key-format",
      "base64url",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects an invalid --key-format with --signed", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--key-format", "bogus"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("routes empty IDS_SIGNING_KEY through loadSigningKey (exits 1 with verification: unavailable)", async () => {
    const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--signed"], {
      env: { IDS_SIGNING_KEY: "" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("verification: unavailable");
    expect(result.stderr).toContain("missing IDS_SIGNING_KEY");
  });

  it("rejects malformed IDS_SIGNING_KEY", async () => {
    const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--signed"], {
      env: { IDS_SIGNING_KEY: "not-hex!" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("verification: unavailable");
    expect(result.stderr).toContain("invalid_key_encoding");
  });

  it("rejects invalid base32 payload with --signed (no key)", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!", "--signed"], {
      env: {},
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_id");
  });

  it("rejects invalid base32 payload with --signed (key present)", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_id");
  });

  it("reads base64url IDS_SIGNING_KEY when IDS_SIGNING_KEY_FORMAT is base64url", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => fixed.getTime(),
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const keyB64 = encodeSigningKey(testSigningKeyBytes, "base64url");
    const result = await runCapture(["inspect", id, "--signed"], {
      env: { IDS_SIGNING_KEY: keyB64, IDS_SIGNING_KEY_FORMAT: "base64url" },
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("verification: ok");
    expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
  });

  it("rejects an invalid IDS_SIGNING_KEY_FORMAT", async () => {
    const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_SIGNING_KEY_FORMAT: "bogus" },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects an invalid brand with --signed", async () => {
    const result = await runCapture(["inspect", "12X_00000000000000000000000000", "--signed"], {
      env: {},
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("rejects a missing --key-format value with --signed (inspect)", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--key-format"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("reads IDS_SIGNING_KEY from process.env when env is not injected (inspect)", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => fixed.getTime(),
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const previous = process.env.IDS_SIGNING_KEY;
    process.env.IDS_SIGNING_KEY = testSigningKeyHex;
    try {
      let stdout = "";
      let stderr = "";
      const exitCode = await run({
        argv: ["inspect", id, "--signed"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: (s) => {
          stderr += s;
        },
      });
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("verification: ok");
      expect(stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
    } finally {
      if (previous === undefined) delete process.env.IDS_SIGNING_KEY;
      else process.env.IDS_SIGNING_KEY = previous;
    }
  });
});

const testDigestKeyBytes = new Uint8Array(32).fill(0xde);
const testDigestKeyHex = encodeDigestKey(testDigestKeyBytes, "hex");
const testDigestKeyBase64url = encodeDigestKey(testDigestKeyBytes, "base64url");

async function runCaptureWithStdin(
  argv: string[],
  stdinContent: string,
  opts: {
    env?: Readonly<Record<string, string | undefined>>;
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let stdout = "";
  let stderr = "";
  const exitCode = await run({
    argv,
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    readStdin: () => Promise.resolve(stdinContent),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
  });
  return { stdout, stderr, exitCode };
}

describe("cli keygen --digest", () => {
  it("emits a 256-bit hex digest key by default", async () => {
    const result = await runCapture(["keygen", "--digest"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(KEYGEN_WARNING);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits a 128-bit hex digest key with --bits 128", async () => {
    const result = await runCapture(["keygen", "--digest", "--bits", "128"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(KEYGEN_WARNING);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("emits a 256-bit base64url digest key with --key-format base64url", async () => {
    const result = await runCapture(["keygen", "--digest", "--key-format", "base64url"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(KEYGEN_WARNING);
    // base64url 256-bit key is 43 chars (ceil(256/6))
    expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("conflicts: --digest and --signed → error", async () => {
    const result = await runCapture(["keygen", "--digest", "--signed"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot use");
    expect(result.stderr).toContain("--digest");
    expect(result.stderr).toContain("--signed");
  });

  it("conflicts: --digest and --wrapped → error", async () => {
    const result = await runCapture(["keygen", "--digest", "--wrapped"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot use");
  });

  it("rejects --ns with --digest (generate-only flag)", async () => {
    const result = await runCapture(["keygen", "--digest", "--ns", "foo"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("rejects --ns before --digest (flag order does not matter)", async () => {
    const result = await runCapture(["keygen", "--ns", "foo", "--digest"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("stdout contains only the digest key — no warning text", async () => {
    const result = await runCapture(["keygen", "--digest"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    expect(result.stdout).not.toContain("Warning");
  });
});

describe("cli generate --digest", () => {
  it("generates a deterministic ID from stdin material", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toMatch(/^idk_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("produces the same ID for the same material + ns + key (determinism)", async () => {
    const material = "order-123";
    const run1 = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout"],
      material,
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    const run2 = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout"],
      material,
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(run1.exitCode).toBe(0);
    expect(run2.exitCode).toBe(0);
    expect(run1.stdout).toBe(run2.stdout);
  });

  it("produces different IDs for different namespaces with the same material", async () => {
    const material = "order-123";
    const run1 = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout"],
      material,
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    const run2 = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "invoices"],
      material,
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(run1.exitCode).toBe(0);
    expect(run2.exitCode).toBe(0);
    expect(run1.stdout).not.toBe(run2.stdout);
  });

  it("accepts base64url key format via --key-format", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout", "--key-format", "base64url"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyBase64url } },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toMatch(/^idk_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("rejects missing IDS_DIGEST_KEY → exit 2, stderr mentions IDS_DIGEST_KEY", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout"],
      "order-123",
      { env: {} },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("IDS_DIGEST_KEY");
  });

  it("rejects missing --ns → exit 2, stderr mentions --ns", async () => {
    const result = await runCaptureWithStdin(["generate", "idk", "--digest"], "order-123", {
      env: { IDS_DIGEST_KEY: testDigestKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--ns");
  });

  it("rejects --ns without value → exit 2, error message", async () => {
    const result = await runCaptureWithStdin(["generate", "idk", "--digest", "--ns"], "order-123", {
      env: { IDS_DIGEST_KEY: testDigestKeyHex },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--ns");
  });

  it("rejects malformed IDS_DIGEST_KEY → exit 1, error on stderr", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout"],
      "order-123",
      { env: { IDS_DIGEST_KEY: "not-valid-hex!!!" } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBeTruthy();
  });

  it("conflicts: --digest and --signed → exit 2", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--signed"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot use");
  });

  it("conflicts: --digest and --opaque → exit 2", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--opaque"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot use");
  });

  it("conflicts: --digest and --reverse → exit 2", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--reverse"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot use");
  });
});

describe("cli generate --digest --count > 1 guard", () => {
  it("rejects --count 3 with --digest: exit 2, error on stderr, stdout empty", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout", "--count", "3"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--count N > 1 is rejected with --digest");
  });

  it("rejects --count 2 with --digest: exit 2, error on stderr", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout", "--count", "2"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--count N > 1 is rejected with --digest");
  });

  it("accepts --count 1 with --digest: exit 0, one ID on stdout", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout", "--count", "1"],
      "order-123",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toMatch(/^idk_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("no --count with --digest: exit 0, one ID on stdout", async () => {
    const result = await runCaptureWithStdin(
      ["generate", "idk", "--digest", "--ns", "checkout"],
      "material-no-count",
      { env: { IDS_DIGEST_KEY: testDigestKeyHex } },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toMatch(/^idk_[0-9a-hjkmnp-tv-z]{26}$/);
  });
});

describe("cli inspect --digest (unsupported, one-way)", () => {
  it("rejects --digest flag on inspect with a clear error", async () => {
    const result = await runCapture(["inspect", "idk_00000000000000000000000000", "--digest"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--digest");
  });
});

describe("cli per-subcommand --help", () => {
  it("generate --help prints generate usage to stdout and exits 0", async () => {
    const result = await runCapture(["generate", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("generate");
    expect(result.stdout).toContain("--count");
    expect(result.stdout).toContain("--opaque");
  });

  it("generate -h prints generate usage to stdout and exits 0", async () => {
    const result = await runCapture(["generate", "-h"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("generate");
  });

  it("inspect --help prints inspect usage to stdout and exits 0", async () => {
    const result = await runCapture(["inspect", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("inspect");
    expect(result.stdout).toContain("--opaque");
    expect(result.stdout).toContain("--wrapped");
  });

  it("inspect -h prints inspect usage to stdout and exits 0", async () => {
    const result = await runCapture(["inspect", "-h"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("inspect");
  });

  it("keygen --help prints keygen usage to stdout and exits 0", async () => {
    const result = await runCapture(["keygen", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("keygen");
    expect(result.stdout).toContain("--bits");
    expect(result.stdout).toContain("importOpaqueKey");
  });

  it("keygen -h prints keygen usage to stdout and exits 0", async () => {
    const result = await runCapture(["keygen", "-h"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("keygen");
  });

  it("per-subcommand help does not print to stderr", async () => {
    for (const argv of [
      ["generate", "--help"],
      ["inspect", "--help"],
      ["keygen", "--help"],
    ]) {
      const result = await runCapture(argv);
      expect(result.stderr).toBe("");
    }
  });
});

describe("cli exit code contract", () => {
  it("usage error (unknown flag) exits 2, not 1", async () => {
    const result = await runCapture(["generate", "usr", "--bogus"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--bogus");
  });

  it("runtime error (malformed key material) exits 1, not 2", async () => {
    const result = await runCapture(["generate", "usr", "--opaque"], {
      env: { IDS_KEY: "not-valid-hex!" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBeTruthy();
  });

  it("top-level --help documents exit codes 0, 1, and 2", async () => {
    const result = await runCapture(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Exit codes:");
    expect(result.stdout).toContain("0");
    expect(result.stdout).toContain("1");
    expect(result.stdout).toContain("2");
  });

  it("unexpected throw escaping a command handler maps to exit 1", async () => {
    const result = await runCapture(["generate", "idk", "--digest", "--ns", "test"], {
      env: { IDS_DIGEST_KEY: testDigestKeyHex },
      readStdin: () => {
        throw new Error("boom");
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBeTruthy();
  });
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("cli inspect uuid: line", () => {
  it("inspect <id> output contains a uuid: line with a valid UUID value", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkw"], {
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(
      /uuid:\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    expect(result.stdout).toContain("uuid:      0062758e-69c5-fb50-b383-b2708d0b309f");
  });

  it("inspect --reverse <id> output includes a uuid: line", async () => {
    const codec = createReverseTimestampId("usr", {
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
      allowDuplicateBrand: true,
    });
    const id = codec.generate();
    const result = await runCapture(["inspect", id, "--reverse"], {
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    const uuidLine = result.stdout.split("\n").find((l) => l.startsWith("uuid:"));
    expect(uuidLine).toBeDefined();
    expect(uuidLine!.trim().split(/\s+/)[1]).toMatch(uuidPattern);
  });

  it("inspect --opaque <id> output includes a uuid: line", async () => {
    const key = await importOpaqueKey(testKeyBytes);
    const usr = createOpaqueTimestampId("usr", {
      key,
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const result = await runCapture(["inspect", id, "--opaque"], {
      env: { IDS_KEY: testKeyHex },
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    const uuidLine = result.stdout.split("\n").find((l) => l.startsWith("uuid:"));
    expect(uuidLine).toBeDefined();
    expect(uuidLine!.trim().split(/\s+/)[1]).toMatch(uuidPattern);
  });

  it("inspect --wrapped <id> output includes a uuid: line", async () => {
    const key = await importWrappingKey(testWrappingKeyBytes);
    const inv = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [key],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(42);
    const result = await runCapture(["inspect", id, "--wrapped", "--kind", "u32"], {
      env: { IDS_WRAPPING_KEY: testWrappingKeyHex },
    });
    expect(result.exitCode).toBe(0);
    const uuidLine = result.stdout.split("\n").find((l) => l.startsWith("uuid:"));
    expect(uuidLine).toBeDefined();
    expect(uuidLine!.trim().split(/\s+/)[1]).toMatch(uuidPattern);
  });

  it("inspect --signed <id> output includes a uuid: line (verification ok)", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const result = await runCapture(["inspect", id, "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    const uuidLine = result.stdout.split("\n").find((l) => l.startsWith("uuid:"));
    expect(uuidLine).toBeDefined();
    expect(uuidLine!.trim().split(/\s+/)[1]).toMatch(uuidPattern);
  });

  it("inspect --signed <id> without key still includes a uuid: line (verification unavailable)", async () => {
    const key = await importSigningKey(testSigningKeyBytes);
    const usr = createSignedTimestampId("usr", {
      keys: [key],
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x42),
      allowDuplicateBrand: true,
    });
    const id = await usr.generate();
    const result = await runCapture(["inspect", id, "--signed"], {
      env: {},
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(1);
    const uuidLine = result.stdout.split("\n").find((l) => l.startsWith("uuid:"));
    expect(uuidLine).toBeDefined();
    expect(uuidLine!.trim().split(/\s+/)[1]).toMatch(uuidPattern);
  });
});

describe("cli generate --uuid", () => {
  it("emits the UUID form of the generated ID and exits 0", async () => {
    const result = await runCapture(["generate", "usr", "--uuid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trimEnd()).toMatch(uuidPattern);
  });

  it("emits a deterministic UUID for known now/rng", async () => {
    const result = await runCapture(["generate", "usr", "--uuid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("12345678-9abc-0000-0000-000000000000\n");
  });

  it("--uuid --count N emits N UUID lines", async () => {
    let counter = 0;
    const result = await runCapture(["generate", "usr", "--uuid", "--count", "3"], {
      rng: (target) => {
        target.fill(0);
        target[9] = counter++;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.split("\n");
    expect(lines.at(-1)).toBe("");
    const uuids = lines.slice(0, -1);
    expect(uuids).toHaveLength(3);
    for (const uuid of uuids) expect(uuid).toMatch(uuidPattern);
  });

  it("--uuid is listed in generate usage text", async () => {
    const result = await runCapture(["generate", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--uuid");
  });

  it("--uuid works with --opaque", async () => {
    const result = await runCapture(["generate", "usr", "--opaque", "--uuid"], {
      env: { IDS_KEY: testKeyHex },
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trimEnd()).toMatch(uuidPattern);
  });

  it("--uuid works with --reverse", async () => {
    const result = await runCapture(["generate", "usr", "--reverse", "--uuid"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trimEnd()).toMatch(uuidPattern);
  });

  it("--uuid works with --signed", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--uuid"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
      now: () => 0x123456789abc,
      rng: (target) => target.fill(0x00),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trimEnd()).toMatch(uuidPattern);
  });
});

describe("cli inspect --from-uuid", () => {
  it("--from-uuid <valid-uuid> --brand usr writes the canonical id to stdout and exits 0", async () => {
    const result = await runCapture([
      "inspect",
      "--from-uuid",
      "0062758e-69c5-fb50-b383-b2708d0b309f",
      "--brand",
      "usr",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("usr_01h7b3k9rqxn1cw3p9r8t2sgkw\n");
  });

  it("--from-uuid round-trips through toUUID (generate then inspect)", async () => {
    const generateResult = await runCapture(["generate", "usr", "--uuid"]);
    expect(generateResult.exitCode).toBe(0);
    const uuid = generateResult.stdout.trim();
    const inspectResult = await runCapture(["inspect", "--from-uuid", uuid, "--brand", "usr"]);
    expect(inspectResult.exitCode).toBe(0);
    expect(inspectResult.stdout.trim()).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
    const backUuid = await runCapture(["generate", "usr", "--uuid"]);
    expect(backUuid.stdout.trim()).toBe(uuid);
  });

  it("--from-uuid <invalid-uuid> --brand usr writes invalid_uuid: to stderr and exits 1", async () => {
    const result = await runCapture([
      "inspect",
      "--from-uuid",
      "not-a-valid-uuid",
      "--brand",
      "usr",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^invalid_uuid:/);
  });

  it("--from-uuid without --brand exits 2 with a usage error", async () => {
    const result = await runCapture([
      "inspect",
      "--from-uuid",
      "0062758e-69c5-fb50-b383-b2708d0b309f",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBeTruthy();
  });

  it("--from-uuid without a value exits 2", async () => {
    const result = await runCapture(["inspect", "--from-uuid", "--brand", "usr"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("--from-uuid with invalid brand exits 1 with a brand error", async () => {
    const result = await runCapture([
      "inspect",
      "--from-uuid",
      "0062758e-69c5-fb50-b383-b2708d0b309f",
      "--brand",
      "BAD",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid_brand");
  });

  it("--from-uuid accepts uppercase UUID (case-insensitive)", async () => {
    const result = await runCapture([
      "inspect",
      "--from-uuid",
      "0062758E-69C5-FB50-B383-B2708D0B309F",
      "--brand",
      "usr",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("usr_01h7b3k9rqxn1cw3p9r8t2sgkw\n");
  });

  it("--from-uuid is listed in inspect usage text", async () => {
    const result = await runCapture(["inspect", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--from-uuid");
    expect(result.stdout).toContain("--brand");
  });
});
