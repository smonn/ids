import { describe, expect, it } from "vitest";
import { isLoadKeyError, loadKey } from "./key-io.js";
import type { KeyFacet, LoadKeyError } from "./key-io.js";
import { makeOpts } from "./test-helpers.js";

const dummyFacet: KeyFacet<string> = {
  envVar: "TEST_KEY",
  formatEnvVar: "TEST_KEY_FORMAT",
  encode: (bytes, _fmt) => Buffer.from(bytes).toString("hex"),
  decode: (raw, _fmt) => Buffer.from(raw, "hex"),
  import: (bytes) => `imported:${Buffer.from(bytes).toString("hex")}`,
};

describe("loadKey", () => {
  it("returns LoadKeyError with kind 'missing' when env var is absent", async () => {
    const result = await loadKey(makeOpts({}), "hex", dummyFacet);
    expect(isLoadKeyError(result)).toBe(true);
    const err = result as LoadKeyError;
    expect(err.kind).toBe("missing");
    expect(err.message).toContain("TEST_KEY");
  });

  it("returns LoadKeyError with kind 'missing' when env var is empty string", async () => {
    const result = await loadKey(makeOpts({ TEST_KEY: "" }), "hex", dummyFacet);
    expect(isLoadKeyError(result)).toBe(true);
    const err = result as LoadKeyError;
    expect(err.kind).toBe("missing");
    expect(err.message).toContain("TEST_KEY");
  });

  it("returns LoadKeyError with kind 'import-failure' when import throws", async () => {
    const throwingFacet: KeyFacet<string> = {
      ...dummyFacet,
      import: () => {
        throw new Error("bad key material");
      },
    };
    const result = await loadKey(makeOpts({ TEST_KEY: "aabb" }), "hex", throwingFacet);
    expect(isLoadKeyError(result)).toBe(true);
    const err = result as LoadKeyError;
    expect(err.kind).toBe("import-failure");
    expect(err.message).toBe("bad key material");
  });

  it("returns the imported key when env var is present and import succeeds", async () => {
    const result = await loadKey(makeOpts({ TEST_KEY: "aabb" }), "hex", dummyFacet);
    expect(isLoadKeyError(result)).toBe(false);
    expect(result).toBe("imported:aabb");
  });
});

describe("isLoadKeyError", () => {
  it("returns true for a missing-kind error", () => {
    const err: LoadKeyError = { kind: "missing", message: "missing X" };
    expect(isLoadKeyError(err)).toBe(true);
  });

  it("returns true for an import-failure-kind error", () => {
    const err: LoadKeyError = { kind: "import-failure", message: "oops" };
    expect(isLoadKeyError(err)).toBe(true);
  });

  it("returns false for a plain string", () => {
    expect(isLoadKeyError("missing foo")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isLoadKeyError(null)).toBe(false);
  });

  it("returns false for an object without kind", () => {
    expect(isLoadKeyError({ message: "oops" })).toBe(false);
  });

  it("returns false for an object with an unknown kind", () => {
    expect(isLoadKeyError({ kind: "other", message: "oops" })).toBe(false);
  });
});
