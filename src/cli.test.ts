import { describe, expect, it } from "vitest";
import { run } from "./cli.js";

type Capture = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

function runCapture(
  argv: string[],
  opts: { now?: () => number; rng?: (target: Uint8Array) => void } = {},
): Capture {
  let stdout = "";
  let stderr = "";
  const exitCode = run({
    argv,
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    now: opts.now ?? (() => 0x123456789abc),
    rng: opts.rng ?? ((target) => target.fill(0x00)),
  });
  return { stdout, stderr, exitCode };
}

describe("cli", () => {
  describe("usage", () => {
    it("no args prints usage to stdout and exits 0", () => {
      const result = runCapture([]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("inspect");
      expect(result.stdout).toContain("generate");
    });

    it.each(["--help", "-h"])("%s prints usage to stdout and exits 0", (flag) => {
      const result = runCapture([flag]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("inspect");
      expect(result.stdout).toContain("generate");
    });

    it("unknown subcommand prints usage to stderr and exits 1", () => {
      const result = runCapture(["nope"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("inspect");
      expect(result.stderr).toContain("generate");
    });
  });

  describe("inspect", () => {
    it("invalid base32 payload prints the parse error and exits 1", () => {
      const result = runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("invalid base32 payload\n");
    });

    it("missing id arg prints usage to stderr and exits 1", () => {
      const result = runCapture(["inspect"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("inspect");
      expect(result.stderr).toContain("generate");
    });

    it("wrong-shape brand prints the createId error and exits 1", () => {
      const result = runCapture(["inspect", "12X_01h7b3k9rqxn1cw3p9r8t2sgkz"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
    });

    it("non-canonical (uppercase only) reports 'was uppercase' and shows canonical form", () => {
      const result = runCapture(["inspect", "USR_01H7B3K9RQXN1CW3P9R8T2SGKZ"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[0]).toBe("brand:     usr");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
      expect(lines[3]).toBe("input:     not canonical (was uppercase)");
    });

    it("non-canonical (aliases only) reports 'used Crockford aliases'", () => {
      const result = runCapture(["inspect", "usr_olh7b3k9rqxnicw3p9r8t2sgkz"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
      expect(lines[3]).toBe("input:     not canonical (used Crockford aliases)");
    });

    it("non-canonical (uppercase + aliases) reports both", () => {
      const result = runCapture(["inspect", "USR_Olh7b3k9rqxnIcw3p9r8t2sgkz"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines[2]).toBe("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
      expect(lines[3]).toBe("input:     not canonical (was uppercase + used Crockford aliases)");
    });

    it("`i` is an alias for inspect", () => {
      const result = runCapture(["i", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"], {
        now: () => new Date("2026-06-01T00:00:00Z").getTime(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
    });

    it("falls back to Date.now when not overridden", () => {
      let stdout = "";
      const exitCode = run({
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
    ])("renders relative time as '%s'", (relative, offset) => {
      const thenMs = new Date("1983-05-27T10:24:22.469Z").getTime();
      const result = runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"], {
        now: () => thenMs + offset,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`(${relative})`);
    });

    it("prints brand/timestamp/canonical/input for a canonical ID and exits 0", () => {
      const result = runCapture(["inspect", "usr_01h7b3k9rqxn1cw3p9r8t2sgkz"], {
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
  });

  describe("generate", () => {
    it("prints one canonical ID and exits 0", () => {
      const result = runCapture(["generate", "usr"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("usr_28t5cy4tqg0000000000000000\n");
    });

    it("`g` is an alias for generate", () => {
      const result = runCapture(["g", "usr"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("usr_28t5cy4tqg0000000000000000\n");
    });

    it("falls back to default now/rng when not overridden", () => {
      let stdout = "";
      const exitCode = run({
        argv: ["generate", "usr"],
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
      });
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}\n$/);
    });

    it("missing brand arg surfaces the createId error and exits 1", () => {
      const result = runCapture(["generate"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("invalid brand, expected three lowercase a-z characters\n");
    });

    it("invalid brand surfaces the createId error and exits 1", () => {
      const result = runCapture(["generate", "BAD"]);
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
    ])("rejects %s %s with exit 1 and a stderr message", (...flags) => {
      const result = runCapture(["generate", "usr", ...flags]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/--count/);
    });

    it("`-c` is an alias for --count", () => {
      let counter = 0;
      const result = runCapture(["generate", "usr", "-c", "3"], {
        rng: (target) => {
          target.fill(0);
          target[9] = counter++;
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trimEnd().split("\n")).toHaveLength(3);
    });

    it("--count N prints N distinct IDs, one per line", () => {
      let counter = 0;
      const result = runCapture(["generate", "usr", "--count", "3"], {
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
  });
});
