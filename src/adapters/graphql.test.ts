import { GraphQLError, Kind } from "graphql";
import type { StringValueNode, IntValueNode } from "graphql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { idScalar } from "./graphql.js";

function makeStringNode(value: string): StringValueNode {
  return { kind: Kind.STRING, value };
}

function makeIntNode(value: string): IntValueNode {
  return { kind: Kind.INT, value };
}

describe("idScalar", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });
  const scalar = idScalar(usr, { name: "UserId", description: "A branded user ID." });

  describe("parseValue", () => {
    it("valid canonical input returns canonical Id", () => {
      const id = usr.generate();
      expect(scalar.parseValue(id)).toBe(id);
    });

    it("valid non-canonical input is normalized to canonical form", () => {
      const id = usr.generate();
      const nonCanonical = id.toUpperCase();
      expect(scalar.parseValue(nonCanonical)).toBe(id);
    });

    it("brand-mismatch input throws GraphQLError", () => {
      const orgId = org.generate();
      expect(() => scalar.parseValue(orgId)).toThrow(GraphQLError);
    });

    it("malformed input throws GraphQLError", () => {
      expect(() => scalar.parseValue("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu")).toThrow(GraphQLError);
    });

    it("non-string input throws GraphQLError", () => {
      expect(() => scalar.parseValue(42)).toThrow(GraphQLError);
    });
  });

  describe("parseLiteral", () => {
    it("Kind.STRING AST node with valid value returns canonical Id", () => {
      const id = usr.generate();
      expect(scalar.parseLiteral(makeStringNode(id), {})).toBe(id);
    });

    it("Kind.STRING AST node with non-canonical value normalizes to canonical form", () => {
      const id = usr.generate();
      expect(scalar.parseLiteral(makeStringNode(id.toUpperCase()), {})).toBe(id);
    });

    it("Kind.STRING AST node with brand-mismatch value throws GraphQLError", () => {
      const orgId = org.generate();
      expect(() => scalar.parseLiteral(makeStringNode(orgId), {})).toThrow(GraphQLError);
    });

    it("Kind.STRING AST node with malformed value throws GraphQLError", () => {
      expect(() =>
        scalar.parseLiteral(makeStringNode("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu"), {}),
      ).toThrow(GraphQLError);
    });

    it("non-string AST kind throws GraphQLError", () => {
      expect(() => scalar.parseLiteral(makeIntNode("123"), {})).toThrow(GraphQLError);
    });
  });

  describe("serialize", () => {
    it("returns the Id value as-is (identity pass-through)", () => {
      const id = usr.generate();
      expect(scalar.serialize(id)).toBe(id);
    });

    it("returns a string (Id<Brand> is already canonical)", () => {
      const id = usr.generate();
      const result = scalar.serialize(id);
      expect(typeof result).toBe("string");
    });
  });

  describe("scalar metadata", () => {
    it("has the correct name from config", () => {
      expect(scalar.name).toBe("UserId");
    });

    it("has the correct description from config", () => {
      expect(scalar.description).toBe("A branded user ID.");
    });

    it("description is undefined when not provided", () => {
      const s = idScalar(usr, { name: "UserId2" });
      expect(s.description).toBeUndefined();
    });
  });
});
