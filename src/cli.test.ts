import { describe, expect, it } from "vitest";
import { createOpaqueId, importOpaqueKey } from "./opaque.js";
import { encodeOpaqueKey } from "./opaque-key.js";
import { run } from "./cli.js";

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

    it("unknown subcommand prints usage to stderr and exits 1", async () => {
      const result = await runCapture(["nope"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("inspect");
      expect(result.stderr).toContain("generate");
    });
  });

  describe("inspect", () => {
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

    it("wrong-shape brand prints the createId error and exits 1", async () => {
      const result = await runCapture(["inspect", "12X_01h7b3k9rqxn1cw3p9r8t2sgkz"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
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

    it("--opaque rejects an invalid brand", async () => {
      const result = await runCapture(["inspect", "12X_00000000000000000000000000", "--opaque"], {
        env: { IDS_KEY: testKeyHex },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
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
      const id = await createOpaqueId("usr", {
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
      const usr = createOpaqueId("usr", {
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
      expect(result.stdout).toContain("timestamp: 2026-05-28T12:00:00.000Z");
      expect(result.stdout).toContain(`canonical: ${id}`);
    });
  });

  describe("generate", () => {
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

    it("missing brand arg surfaces the createId error and exits 1", async () => {
      const result = await runCapture(["generate"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
    });

    it("invalid brand surfaces the createId error and exits 1", async () => {
      const result = await runCapture(["generate", "BAD"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
    });

    it.each([
      ["--count", "abc"],
      ["--count", "0"],
      ["--count", "-3"],
      ["--count", "1.5"],
      ["--count"],
    ])("rejects %s %s with exit 1 and a stderr message", async (...flags) => {
      const result = await runCapture(["generate", "usr", ...flags]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/--count/);
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
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
    });

    it("--opaque rejects a missing brand", async () => {
      const result = await runCapture(["generate", "--opaque"], { env: { IDS_KEY: testKeyHex } });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
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
      const usr = createOpaqueId("usr", {
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
  });

  describe("keygen", () => {
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

    it("rejects invalid --bits", async () => {
      const result = await runCapture(["keygen", "--bits", "192"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/--bits must be 128 or 256/);
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
      const expected = await createOpaqueId("usr", {
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
