import { describe, expect, it } from "vitest";
import { createOpaqueTimestampId, importOpaqueKey } from "./opaque.js";
import { encodeOpaqueKey, decodeOpaqueKey } from "./opaque-key.js";
import {
  createSignedTimestampId,
  importSigningKey,
  encodeSigningKey,
  decodeSigningKey,
} from "./signed.js";
import {
  createWrappedKeyId,
  importWrappingKey,
  encodeWrappingKey,
  decodeWrappingKey,
} from "./wrapped.js";
import { createReverseTimestampId } from "./reverse.js";
import { run } from "./cli.js";
import { IdsError } from "./error.js";
import { formatCliError } from "./cli/format.js";

type Capture = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const testKeyBytes = new Uint8Array(32).fill(0xab);
const testKeyHex = encodeOpaqueKey(testKeyBytes, "hex");

async function runCapture(
  argv: string[],
  opts: {
    now?: () => number;
    rng?: (target: Uint8Array) => void;
    env?: Readonly<Record<string, string | undefined>>;
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

    it("unknown subcommand prints usage to stderr and exits 1", async () => {
      const result = await runCapture(["nope"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("inspect");
      expect(result.stderr).toContain("generate");
    });
  });

  describe("unsupported opaque typo flags", () => {
    it.each([
      ["inspect", ["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"]],
      ["generate", ["generate", "usr"]],
      ["keygen", ["keygen"]],
    ])("%s rejects a misspelled --opaque flag", async (_command, argv) => {
      const result = await runCapture([...argv, "--opqaue"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --opqaue\n");
    });

    it.each([
      ["inspect", ["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"]],
      ["generate", ["generate", "usr"]],
      ["keygen", ["keygen"]],
    ])("%s rejects a misspelled --opaque flag with an inline value", async (_command, argv) => {
      const result = await runCapture([...argv, "--opqaue=true"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --opqaue\n");
    });
  });

  describe("inspect", () => {
    it("rejects a misspelled --opaque flag before inspecting", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz", "--opqaue"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --opqaue\n");
    });

    it("rejects duplicate --opaque flags", async () => {
      const result = await runCapture(
        ["inspect", "usr_00000000000000000000000000", "--opaque", "--opaque"],
        { env: { IDS_KEY: testKeyHex } },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("duplicate flag: --opaque\n");
    });

    it("invalid base32 payload prints the parse error and exits 1", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("invalid base32 payload\n");
    });

    it("missing id arg prints usage to stderr and exits 1", async () => {
      const result = await runCapture(["inspect"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("inspect");
      expect(result.stderr).toContain("generate");
    });

    it("rejects an unexpected extra positional argument", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz", "extra"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unexpected argument: extra\n");
    });

    it("wrong-shape brand prints the createTimestampId error and exits 1", async () => {
      const result = await runCapture(["inspect", "12X_01h7b3k9rqxn1cw3p9r8t2sgkz"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("invalid_brand");
    });

    it("non-canonical (uppercase only) reports 'was uppercase' and shows canonical form", async () => {
      const result = await runCapture(["inspect", "USR_01H7B3K9RQXN1CW3P9R8T2SGKZ"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[0]).toBe("brand:     usr");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
      expect(lines[3]).toBe("input:     not canonical (was uppercase)");
    });

    it("non-canonical (aliases only) reports 'used Crockford aliases'", async () => {
      const result = await runCapture(["inspect", "usr_olh7b3k9rqxnicw3p9r8t2sgkz"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
      expect(lines[3]).toBe("input:     not canonical (used Crockford aliases)");
    });

    it("non-canonical (uppercase + aliases) reports both", async () => {
      const result = await runCapture(["inspect", "USR_Olh7b3k9rqxnIcw3p9r8t2sgkz"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
      expect(lines[3]).toBe("input:     not canonical (was uppercase + used Crockford aliases)");
    });

    it("`i` is an alias for inspect", async () => {
      const result = await runCapture(["i", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
    });

    it("falls back to Date.now when not overridden", async () => {
      let stdout = "";
      const exitCode = await run({
        argv: ["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
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
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"], {
        now: () => thenMs + offset,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`(${relative})`);
    });

    it("prints brand/timestamp/canonical/input for a canonical ID and exits 0", async () => {
      const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(
        [
          "brand:     usr",
          "timestamp: 1983-05-27T10:24:22.469Z (43 years ago)",
          "canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
          "input:     canonical",
          "",
        ].join("\n"),
      );
    });

    it("--opaque without IDS_KEY exits 1", async () => {
      const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--opaque"], {
        env: {},
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("missing IDS_KEY environment variable\n");
    });

    it("--opaque rejects an invalid --key-format", async () => {
      const result = await runCapture(
        ["inspect", "usr_00000000000000000000000000", "--opaque", "--key-format", "bogus"],
        { env: { IDS_KEY: testKeyHex } },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("--key-format must be hex or base64url, got 'bogus'\n");
    });

    it("--opaque rejects a missing --key-format value", async () => {
      const result = await runCapture(
        ["inspect", "usr_00000000000000000000000000", "--opaque", "--key-format"],
        { env: { IDS_KEY: testKeyHex } },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("--key-format requires a value\n");
    });

    it("rejects --key-format without --opaque, --wrapped, or --signed", async () => {
      const result = await runCapture([
        "inspect",
        "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
        "--key-format",
        "base64url",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("--key-format requires --opaque, --wrapped, or --signed\n");
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
      expect(result.stderr).toBe("invalid base32 payload\n");
    });

    it("--opaque rejects malformed IDS_KEY", async () => {
      const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--opaque"], {
        env: { IDS_KEY: "aabbcc" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("invalid AES key length: expected 16, 24, or 32 bytes, got 3\n");
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
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unexpected argument: extra\n");
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
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag for generate: --bits\n");
    });

    it("rejects flags that belong to another command before value-shape errors", async () => {
      const result = await runCapture(["generate", "usr", "--bits"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag for generate: --bits\n");
    });

    it("rejects an unsupported dash-prefixed token after a missing value flag", async () => {
      const result = await runCapture(["generate", "usr", "--count", "--opqaue"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --opqaue\n");
    });

    it("reports the missing value when the following dash-prefixed token is allowed", async () => {
      const result = await runCapture(["generate", "usr", "--count", "--opaque"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("--count requires a value\n");
    });

    it("rejects a misspelled --opaque flag before generating", async () => {
      const result = await runCapture(["generate", "usr", "--opqaue"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --opqaue\n");
    });

    it("rejects a misspelled --opaque flag with an inline value by flag name", async () => {
      const result = await runCapture(["generate", "usr", "--opqaue=true"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --opqaue\n");
    });

    it("rejects subcommand-local help for now", async () => {
      const result = await runCapture(["generate", "--help"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --help\n");
    });

    it("rejects -- as an unsupported flag", async () => {
      const result = await runCapture(["generate", "--", "usr"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --\n");
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
    ])("rejects %s %s with exit 1 and a stderr message", async (...flags) => {
      const result = await runCapture(["generate", "usr", ...flags]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/--count/);
    });

    it("rejects --count values above the CLI ceiling before generating", async () => {
      const result = await runCapture(["generate", "usr", "--count", "10001"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("--count must be at most 10000, got '10001'\n");
    });

    it.each(["9007199254740992", "9".repeat(400)])(
      "rejects oversized positive integer --count %s before generating",
      async (count) => {
        const result = await runCapture(["generate", "usr", "--count", count]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe(`--count must be at most 10000, got '${count}'\n`);
      },
    );

    it("rejects dash-prefixed count values as unsupported flags", async () => {
      const result = await runCapture(["generate", "usr", "--count", "-3"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: -3\n");
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
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("duplicate flag: --count\n");
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

    it("--opaque without IDS_KEY exits 1", async () => {
      const result = await runCapture(["generate", "usr", "--opaque"], { env: {} });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("missing IDS_KEY environment variable\n");
    });

    it("--opaque rejects --count above the CLI ceiling before loading IDS_KEY", async () => {
      const result = await runCapture(["generate", "usr", "--opaque", "--count", "10001"], {
        env: {},
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("--count must be at most 10000, got '10001'\n");
    });

    it("rejects an inline value for --opaque", async () => {
      const result = await runCapture(["generate", "usr", "--opaque=true"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("flag does not take a value: --opaque\n");
    });

    it("--opaque rejects an invalid --key-format", async () => {
      const result = await runCapture(["generate", "usr", "--opaque", "--key-format", "bogus"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("--key-format must be hex or base64url, got 'bogus'\n");
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
      expect(result.stderr).toBe("invalid hex key: expected [0-9a-fA-F] only\n");
    });

    it("--opaque rejects a base64url IDS_KEY when --key-format=hex", async () => {
      const keyB64 = encodeOpaqueKey(testKeyBytes, "base64url");
      const result = await runCapture(["generate", "usr", "--opaque", "--key-format=hex"], {
        env: { IDS_KEY: keyB64 },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/^invalid hex key:/);
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

    it("rejects --key-format without --opaque or --signed", async () => {
      const result = await runCapture(["generate", "usr", "--key-format", "base64url"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("--key-format requires --opaque or --signed\n");
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
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("duplicate flag: --key-format\n");
    });
  });

  describe("keygen", () => {
    it("rejects an unexpected positional argument", async () => {
      const result = await runCapture(["keygen", "extra"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unexpected argument: extra\n");
    });

    it("rejects flags that belong to another command", async () => {
      const result = await runCapture(["keygen", "--opaque"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag for keygen: --opaque\n");
    });

    it("rejects unknown flags", async () => {
      const result = await runCapture(["keygen", "--bogus"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("unsupported flag: --bogus\n");
    });

    it("emits a 256-bit hex key by default", async () => {
      const result = await runCapture(["keygen"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
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
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("duplicate flag: --bits\n");
    });

    it("rejects invalid --bits", async () => {
      const result = await runCapture(["keygen", "--bits", "384"]);
      expect(result.exitCode).toBe(1);
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
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("--bits requires a value\n");
    });

    it("accepts explicit --bits 256", async () => {
      const result = await runCapture(["keygen", "--bits", "256"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("rejects an invalid --key-format", async () => {
      const result = await runCapture(["keygen", "--key-format", "bogus"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("--key-format must be hex or base64url, got 'bogus'\n");
    });

    it("rejects a missing --key-format value", async () => {
      const result = await runCapture(["keygen", "--key-format"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("--key-format requires a value\n");
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
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("IDS_KEY_FORMAT must be hex or base64url, got 'bogus'\n");
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
  });
});

const testWrappingKeyBytes = new Uint8Array(32).fill(0xcd);
const testWrappingKeyHex = encodeWrappingKey(testWrappingKeyBytes, "hex");

describe("cli keygen --wrapped", () => {
  it("emits a 256-bit hex wrapping key by default", async () => {
    const result = await runCapture(["keygen", "--wrapped"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
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
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("unsupported flag: --bogus\n");
  });

  it("rejects --opaque with --wrapped (unsupported for keygen)", async () => {
    const result = await runCapture(["keygen", "--wrapped", "--opaque"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("unsupported flag for keygen: --opaque\n");
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
});

describe("cli inspect --wrapped", () => {
  it("requires --kind when --wrapped is passed", async () => {
    const result = await runCapture(["inspect", "inv_00000000000000000000000000", "--wrapped"], {
      env: { IDS_WRAPPING_KEY: testWrappingKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--kind is required with --wrapped\n");
  });

  it("rejects an invalid --kind value", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u8"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--kind must be u32, i32, u64, or i64, got 'u8'\n");
  });

  it("rejects a missing --kind value", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--kind requires a value\n");
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

  it("exits 1 when IDS_WRAPPING_KEY is missing", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u32"],
      { env: {} },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("missing IDS_WRAPPING_KEY environment variable\n");
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
    expect(result.stderr).toMatch(/invalid hex key/);
  });

  it("rejects invalid base32 payload with --wrapped", async () => {
    const result = await runCapture(
      ["inspect", "inv_01h7b3k9rqxn1cw3p9r8t2sgk!", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("invalid base32 payload\n");
  });

  it("rejects --wrapped and --opaque together", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--opaque", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --wrapped and --opaque together\n");
  });

  it("structural-only inspect (no --wrapped) is unchanged for a valid ID", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"], {
      now: () => new Date("2026-06-01T00:00:00Z").getTime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("brand:     usr");
    expect(result.stdout).toContain("timestamp:");
    expect(result.stdout).toContain("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
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
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format must be hex or base64url, got 'bogus'\n");
  });

  it("rejects invalid IDS_WRAPPING_KEY_FORMAT", async () => {
    const result = await runCapture(
      ["inspect", "inv_00000000000000000000000000", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex, IDS_WRAPPING_KEY_FORMAT: "bogus" } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("IDS_WRAPPING_KEY_FORMAT must be hex or base64url, got 'bogus'\n");
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
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format requires a value\n");
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

  it("--reverse with --opaque emits a conflict error and exits 1", async () => {
    const result = await runCapture(["generate", "usr", "--reverse", "--opaque"], {
      env: { IDS_KEY: testKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --reverse and --opaque together\n");
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
    expect(result.stderr).toBe("");
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
    expect(result.stderr).toBe("invalid base32 payload\n");
  });

  it("--reverse with --opaque emits a conflict error and exits 1", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--reverse", "--opaque"],
      { env: { IDS_KEY: testKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --reverse and --opaque together\n");
  });

  it("--reverse with --wrapped emits a conflict error and exits 1", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--reverse", "--wrapped", "--kind", "u32"],
      { env: { IDS_WRAPPING_KEY: testWrappingKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --reverse and --wrapped together\n");
  });
});

const testSigningKeyBytes = new Uint8Array(32).fill(0xef);
const testSigningKeyHex = encodeSigningKey(testSigningKeyBytes, "hex");

describe("cli keygen --signed", () => {
  it("emits a 256-bit hex signing key by default", async () => {
    const result = await runCapture(["keygen", "--signed"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
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
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --signed and --wrapped together\n");
  });

  it("rejects --wrapped and --signed together (reverse order)", async () => {
    const result = await runCapture(["keygen", "--wrapped", "--signed"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --signed and --wrapped together\n");
  });

  it("rejects --opaque with --signed (--opaque is unsupported for keygen)", async () => {
    const result = await runCapture(["keygen", "--signed", "--opaque"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("unsupported flag for keygen: --opaque\n");
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

  it("keygen preamble covers all three key types", async () => {
    const result = await runCapture(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("importOpaqueKey, importWrappingKey, or importSigningKey");
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

  it("without IDS_SIGNING_KEY exits 1 with a clear error", async () => {
    const result = await runCapture(["generate", "usr", "--signed"], { env: {} });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("missing IDS_SIGNING_KEY environment variable\n");
  });

  it("rejects --signed and --opaque together", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--opaque"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_KEY: testKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --signed and --opaque together\n");
  });

  it("rejects --signed and --reverse together", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--reverse"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --signed and --reverse together\n");
  });

  it("rejects --signed and --wrapped together (--wrapped is unsupported in generate)", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--wrapped"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--wrapped");
  });

  it("rejects malformed IDS_SIGNING_KEY", async () => {
    const result = await runCapture(["generate", "usr", "--signed"], {
      env: { IDS_SIGNING_KEY: "not-hex!" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/invalid hex key/);
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

  it("rejects --key-format without --signed or --opaque for generate", async () => {
    const result = await runCapture(["generate", "usr", "--key-format", "base64url"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format requires --opaque or --signed\n");
  });

  it("rejects an invalid IDS_SIGNING_KEY_FORMAT", async () => {
    const result = await runCapture(["generate", "usr", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_SIGNING_KEY_FORMAT: "bogus" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("IDS_SIGNING_KEY_FORMAT must be hex or base64url, got 'bogus'\n");
  });

  it("rejects an invalid --key-format with --signed", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--key-format", "bogus"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format must be hex or base64url, got 'bogus'\n");
  });

  it("rejects a missing --key-format value with --signed", async () => {
    const result = await runCapture(["generate", "usr", "--signed", "--key-format"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format requires a value\n");
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
  it("without IDS_SIGNING_KEY: decodes the timestamp and exits 0 (structural-only)", async () => {
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
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("brand:     usr");
    expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
    expect(result.stdout).toContain(`canonical: ${id}`);
    expect(result.stdout).not.toContain("verification:");
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
    expect(result.stderr).toBe("");
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
    expect(lines[4]).toMatch(/^input:/);
  });

  it("rejects --signed and --opaque together", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--opaque"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex, IDS_KEY: testKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --signed and --opaque together\n");
  });

  it("rejects --signed and --wrapped together", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--wrapped", "--kind", "u32"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --signed and --wrapped together\n");
  });

  it("rejects --signed and --reverse together", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--reverse"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("cannot use --signed and --reverse together\n");
  });

  it("rejects --key-format without --opaque, --wrapped, or --signed", async () => {
    const result = await runCapture([
      "inspect",
      "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
      "--key-format",
      "base64url",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format requires --opaque, --wrapped, or --signed\n");
  });

  it("rejects an invalid --key-format with --signed", async () => {
    const result = await runCapture(
      ["inspect", "usr_00000000000000000000000000", "--signed", "--key-format", "bogus"],
      { env: { IDS_SIGNING_KEY: testSigningKeyHex } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format must be hex or base64url, got 'bogus'\n");
  });

  it("routes empty IDS_SIGNING_KEY through loadSigningKey (exits 1 with error)", async () => {
    const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--signed"], {
      env: { IDS_SIGNING_KEY: "" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("missing IDS_SIGNING_KEY environment variable\n");
  });

  it("rejects malformed IDS_SIGNING_KEY", async () => {
    const result = await runCapture(["inspect", "usr_00000000000000000000000000", "--signed"], {
      env: { IDS_SIGNING_KEY: "not-hex!" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/invalid hex key/);
  });

  it("rejects invalid base32 payload with --signed (no key)", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!", "--signed"], {
      env: {},
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("invalid base32 payload\n");
  });

  it("rejects invalid base32 payload with --signed (key present)", async () => {
    const result = await runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!", "--signed"], {
      env: { IDS_SIGNING_KEY: testSigningKeyHex },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("invalid base32 payload\n");
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
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("IDS_SIGNING_KEY_FORMAT must be hex or base64url, got 'bogus'\n");
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
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--key-format requires a value\n");
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
