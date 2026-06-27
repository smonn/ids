import { describe, expect, it } from "vitest";
import { wireMethods } from "./codec-shell.js";
import { IdsError, isIdsError } from "../error.js";
import type { Id, ParseError } from "../types.js";

const PREFIX = "usr_" as const;
type Brand = "usr";
const CANONICAL_ID = `${PREFIX}${"0".repeat(26)}` as Id<Brand>;

describe("wireMethods", () => {
  const methods = wireMethods(PREFIX);

  describe("is", () => {
    it("returns true for a valid canonical ID", () => {
      expect(methods.is(CANONICAL_ID)).toBe(true);
    });

    it("returns false for garbage", () => {
      expect(methods.is("garbage")).toBe(false);
    });
  });

  describe("parse", () => {
    it("returns the canonical Id<Brand> for valid input", () => {
      expect(methods.parse(CANONICAL_ID)).toBe(CANONICAL_ID);
    });

    it("throws IdsError with code 'invalid_id' for an invalid input", () => {
      let thrown: unknown;
      try {
        methods.parse("garbage");
      } catch (err) {
        thrown = err;
      }
      expect(isIdsError(thrown)).toBe(true);
      expect((thrown as IdsError).code).toBe("invalid_id");
    });

    it("carries the underlying ParseError on .cause", () => {
      let thrown: unknown;
      try {
        methods.parse("garbage");
      } catch (err) {
        thrown = err;
      }
      expect((thrown as IdsError).cause).toBe("invalid_prefix" satisfies ParseError);
    });
  });

  describe("safeParse", () => {
    it("returns { ok: true, id } for valid input", () => {
      expect(methods.safeParse(CANONICAL_ID)).toEqual({ ok: true, id: CANONICAL_ID });
    });

    it("returns { ok: false, error } for invalid input", () => {
      expect(methods.safeParse("garbage")).toEqual({ ok: false, error: "invalid_prefix" });
    });
  });
});
