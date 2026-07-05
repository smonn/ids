import { describe, expect, it } from "vitest";
import { lintAdrFrontMatter, loadAdrFiles, parseFrontMatter } from "./adr-front-matter-lint.mjs";

// Minimal valid front matter; override lines to break one rule at a time.
function fm(lines, body = "\n# Title\n\nProse.\n") {
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
const VALID = ["status: accepted", "created: 2026-06-24", "last-updated: 2026-07-04"];

describe("parseFrontMatter", () => {
  it("accepts a minimal valid block", () => {
    const { meta, errors } = parseFrontMatter(fm(VALID));
    expect(errors).toEqual([]);
    expect(meta).toEqual({
      status: "accepted",
      created: "2026-06-24",
      "last-updated": "2026-07-04",
    });
  });

  it("strips one layer of quotes from implemented-by and validates the PR-ref shape", () => {
    const ok = parseFrontMatter(fm([...VALID, 'implemented-by: "#317, #318"']));
    expect(ok.errors).toEqual([]);
    expect(ok.meta["implemented-by"]).toBe("#317, #318");

    const hash = parseFrontMatter(fm([...VALID, 'implemented-by: "3f4c2ab"']));
    expect(hash.errors).toEqual([
      'implemented-by must be a "#N, #N" PR-ref list (no commit hashes), got "3f4c2ab"',
    ]);
  });

  it("tolerates CRLF line endings", () => {
    const { errors } = parseFrontMatter(fm(VALID).replaceAll("\n", "\r\n"));
    expect(errors).toEqual([]);
  });

  it("reports a missing block, and diagnoses a lost terminator as unterminated even when the body has a thematic break", () => {
    expect(parseFrontMatter("# No front matter\n").errors).toEqual([
      "missing front matter (file must start with `---`)",
    ]);
    // No closing --- for the block; a thematic break much later must not be
    // mistaken for it (that would parse body prose as front-matter lines).
    const lost = `---\nstatus: accepted\n${"prose line\n".repeat(20)}---\nmore\n`;
    expect(parseFrontMatter(lost).errors).toEqual([
      "unterminated front matter (no closing `---` within 12 lines of the top)",
    ]);
  });

  it("rejects unknown keys, duplicate keys, bad status, bad dates, and inverted date order", () => {
    expect(parseFrontMatter(fm([...VALID, "author: me"])).errors[0]).toMatch(
      /unknown front-matter key "author"/,
    );
    expect(parseFrontMatter(fm([...VALID, "status: accepted"])).errors).toContain(
      'duplicate front-matter key "status"',
    );
    expect(parseFrontMatter(fm(["status: dropped", VALID[1], VALID[2]])).errors).toContain(
      'invalid status "dropped" (expected proposed | accepted | rejected | superseded)',
    );
    expect(
      parseFrontMatter(fm(["status: accepted", "created: 24 June 2026", VALID[2]])).errors,
    ).toContain('created is not a YYYY-MM-DD date: "24 June 2026"');
    expect(
      parseFrontMatter(fm(["status: accepted", "created: 2026-06-24", "last-updated: 2026-01-01"]))
        .errors,
    ).toContain("last-updated (2026-01-01) precedes created (2026-06-24)");
  });

  it("requires status/created/last-updated, and ties superseded-by to status: superseded both ways", () => {
    expect(parseFrontMatter(fm(["status: accepted"])).errors).toEqual([
      'missing required front-matter key "created"',
      'missing required front-matter key "last-updated"',
    ]);
    expect(parseFrontMatter(fm(["status: superseded", VALID[1], VALID[2]])).errors).toContain(
      'status is "superseded" but superseded-by is missing',
    );
    expect(parseFrontMatter(fm([...VALID, "superseded-by: ADR-0002"])).errors).toContain(
      'superseded-by is set but status is "accepted" (expected "superseded")',
    );
  });
});

describe("lintAdrFrontMatter (cross-file rules)", () => {
  const supersededPair = [
    {
      name: "0001-old.md",
      content: fm(["status: superseded", VALID[1], VALID[2], "superseded-by: ADR-0002"]),
    },
    { name: "0002-new.md", content: fm([...VALID, "supersedes: ADR-0001"]) },
  ];

  it("accepts a bidirectional superseded pair", () => {
    expect(lintAdrFrontMatter(supersededPair)).toEqual([]);
  });

  it("rejects a one-directional link, a dangling ref, and a malformed ref", () => {
    const oneWay = [supersededPair[0], { name: "0002-new.md", content: fm(VALID) }];
    expect(lintAdrFrontMatter(oneWay)).toEqual([
      '0001-old.md: superseded-by: ADR-0002 must declare supersedes: ADR-0001 (found "<unset>")',
    ]);
    expect(lintAdrFrontMatter([supersededPair[0]])).toEqual([
      "0001-old.md: superseded-by: ADR-0002 does not exist under docs/adr/",
    ]);
    const malformed = [{ name: "0003-x.md", content: fm([...VALID, "supersedes: adr 1"]) }];
    expect(lintAdrFrontMatter(malformed)).toEqual([
      '0003-x.md: supersedes must look like ADR-0008, got "adr 1"',
    ]);
  });

  it("distinguishes a ref to a parse-failed ADR from a missing one", () => {
    const files = [
      { name: "0002-new.md", content: fm([...VALID, "supersedes: ADR-0001"]) },
      { name: "0001-old.md", content: "# no front matter\n" },
    ];
    const errors = lintAdrFrontMatter(files);
    expect(errors).toContain("0001-old.md: missing front matter (file must start with `---`)");
    expect(errors).toContain(
      "0002-new.md: supersedes: ADR-0001 exists but its own front matter failed to parse",
    );
  });

  it("rejects duplicate ADR numbers", () => {
    const files = [
      { name: "0004-a.md", content: fm(VALID) },
      { name: "0004-b.md", content: fm(VALID) },
    ];
    expect(lintAdrFrontMatter(files)).toEqual([
      "0004-b.md: duplicate ADR number 0004 (also used by 0004-a.md)",
    ]);
  });
});

describe("the real ADR corpus", () => {
  it("passes the lint and excludes ADR-FORMAT.md from the corpus", () => {
    const files = loadAdrFiles();
    expect(files.length).toBeGreaterThanOrEqual(36);
    expect(files.map((f) => f.name)).not.toContain("ADR-FORMAT.md");
    expect(lintAdrFrontMatter(files)).toEqual([]);
  });
});
