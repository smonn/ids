import { describe, expect, expectTypeOf, it } from "vitest";
import { isIdsError } from "../error.js";
import type { Id, ParseError } from "../types.js";
import {
  readIdColumn,
  readIdColumnNullable,
  resolveIdParamFailure,
  resolveVerifyFailure,
  writeIdColumn,
  writeIdColumnNullable,
} from "./adapter-types.js";
import { makeSpyCodec } from "./test-helpers.js";
import { createTimestampId } from "../codecs/timestamp/index.js";

describe("readIdColumn", () => {
  it("caught IdsError.cause is typed as ParseError | undefined", () => {
    expect.assertions(1);
    const codec = { safeParse: () => ({ ok: false as const, error: "invalid_prefix" as const }) };
    try {
      readIdColumn(codec, "bad_value");
    } catch (err) {
      if (isIdsError(err)) {
        expectTypeOf(err.cause).toEqualTypeOf<ParseError | Error | undefined>();
        expect(err.cause).toBe("invalid_prefix");
      }
    }
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("readIdColumn calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      readIdColumn(spyCodec, "any_value");
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });
});

describe("readIdColumnNullable", () => {
  const codec = {
    safeParse: (value: unknown) => {
      if (typeof value !== "string") return { ok: false as const, error: "not_string" as const };
      if (!value.startsWith("spy_"))
        return { ok: false as const, error: "invalid_prefix" as const };
      return {
        ok: true as const,
        id: value as ReturnType<typeof readIdColumnNullable<"spy">> & string,
      };
    },
  };

  it("returns null for null input", () => {
    expect(readIdColumnNullable(codec, null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(readIdColumnNullable(codec, undefined)).toBeNull();
  });

  it("returns Id<Brand> for a valid string", () => {
    expect(readIdColumnNullable(codec, "spy_00000000000000000000000000")).toBe(
      "spy_00000000000000000000000000",
    );
  });

  it("throws IdsError(invalid_id) for an invalid string", () => {
    expect.assertions(2);
    try {
      readIdColumnNullable(codec, "bad_value");
    } catch (err) {
      if (isIdsError(err)) {
        expect(err.code).toBe("invalid_id");
        expect(err.cause).toBe("invalid_prefix");
      }
    }
  });
});

describe("resolveIdParamFailure", () => {
  it("maps invalid_prefix to brand_mismatch with default status 404", () => {
    const result = resolveIdParamFailure("invalid_prefix");
    expect(result).toEqual({ reason: "brand_mismatch", status: 404 });
  });

  it("maps invalid_base32 to malformed with default status 400", () => {
    const result = resolveIdParamFailure("invalid_base32");
    expect(result).toEqual({ reason: "malformed", status: 400 });
  });

  it("maps not_string to malformed with default status 400", () => {
    const result = resolveIdParamFailure("not_string");
    expect(result).toEqual({ reason: "malformed", status: 400 });
  });

  it("options.status.brand_mismatch overrides the 404 default", () => {
    const result = resolveIdParamFailure("invalid_prefix", { status: { brand_mismatch: 422 } });
    expect(result).toEqual({ reason: "brand_mismatch", status: 422 });
  });

  it("options.status.malformed overrides the 400 default", () => {
    const result = resolveIdParamFailure("invalid_base32", { status: { malformed: 422 } });
    expect(result).toEqual({ reason: "malformed", status: 422 });
  });

  it("options.status.brand_mismatch does not affect malformed status", () => {
    const result = resolveIdParamFailure("invalid_base32", { status: { brand_mismatch: 422 } });
    expect(result).toEqual({ reason: "malformed", status: 400 });
  });

  it("options.status.malformed does not affect brand_mismatch status", () => {
    const result = resolveIdParamFailure("invalid_prefix", { status: { malformed: 422 } });
    expect(result).toEqual({ reason: "brand_mismatch", status: 404 });
  });
});

describe("resolveVerifyFailure", () => {
  it("returns reason:malformed with default status 400", () => {
    const result = resolveVerifyFailure();
    expect(result).toEqual({ reason: "malformed", status: 400 });
  });

  it("options.status.malformed overrides the 400 default", () => {
    const result = resolveVerifyFailure({ status: { malformed: 422 } });
    expect(result).toEqual({ reason: "malformed", status: 422 });
  });
});

describe("writeIdColumn", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });

  it("passes a valid Id<Brand> through unchanged", () => {
    const id = usr.generate();
    expect(writeIdColumn(usr, id)).toBe(id);
  });

  it("throws IdsError(invalid_id) for a cast-smuggled invalid string", () => {
    expect.assertions(2);
    try {
      writeIdColumn(usr, "not_an_id" as Id<"usr">);
    } catch (err) {
      if (isIdsError(err)) {
        expect(err.code).toBe("invalid_id");
        expect(err.cause).toBeDefined();
      }
    }
  });

  it("throws IdsError(invalid_id) when called with null at runtime", () => {
    expect.assertions(2);
    try {
      writeIdColumn(usr, null as unknown as Id<"usr">);
    } catch (err) {
      if (isIdsError(err)) {
        expect(err.code).toBe("invalid_id");
        expect(err.cause).toBeDefined();
      }
    }
  });

  it("throws IdsError(invalid_id) when called with undefined at runtime", () => {
    expect.assertions(2);
    try {
      writeIdColumn(usr, undefined as unknown as Id<"usr">);
    } catch (err) {
      if (isIdsError(err)) {
        expect(err.code).toBe("invalid_id");
        expect(err.cause).toBeDefined();
      }
    }
  });
});

describe("writeIdColumnNullable", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });

  it("passes a valid Id<Brand> through unchanged", () => {
    const id = usr.generate();
    expect(writeIdColumnNullable(usr, id)).toBe(id);
  });

  it("returns null for null input", () => {
    expect(writeIdColumnNullable(usr, null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(writeIdColumnNullable(usr, undefined)).toBeNull();
  });

  it("throws IdsError(invalid_id) for a cast-smuggled invalid string", () => {
    expect.assertions(2);
    try {
      writeIdColumnNullable(usr, "not_an_id" as Id<"usr">);
    } catch (err) {
      if (isIdsError(err)) {
        expect(err.code).toBe("invalid_id");
        expect(err.cause).toBeDefined();
      }
    }
  });
});
