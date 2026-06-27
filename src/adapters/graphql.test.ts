import {
  GraphQLError,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  Kind,
  graphql,
} from "graphql";
import type { IntValueNode, StringValueNode } from "graphql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { idScalar } from "./graphql.js";
import { makeFailingSpyCodec, makeSpyCodec } from "./test-helpers.js";

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
      expect(() => scalar.parseValue(orgId)).toThrow(
        expect.objectContaining({ message: "invalid UserId" }),
      );
    });

    it("malformed input throws GraphQLError", () => {
      expect(() => scalar.parseValue("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu")).toThrow(GraphQLError);
      expect(() => scalar.parseValue("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu")).toThrow(
        expect.objectContaining({ message: "invalid UserId" }),
      );
    });

    it("non-string input throws GraphQLError", () => {
      expect(() => scalar.parseValue(42)).toThrow(GraphQLError);
      expect(() => scalar.parseValue(42)).toThrow(
        expect.objectContaining({ message: "invalid UserId" }),
      );
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
      expect(() => scalar.parseLiteral(makeStringNode(orgId), {})).toThrow(
        expect.objectContaining({ message: "invalid UserId" }),
      );
    });

    it("Kind.STRING AST node with malformed value throws GraphQLError", () => {
      expect(() =>
        scalar.parseLiteral(makeStringNode("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu"), {}),
      ).toThrow(GraphQLError);
      expect(() =>
        scalar.parseLiteral(makeStringNode("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu"), {}),
      ).toThrow(expect.objectContaining({ message: "invalid UserId" }));
    });

    it("non-string AST kind throws GraphQLError", () => {
      expect(() => scalar.parseLiteral(makeIntNode("123"), {})).toThrow(GraphQLError);
      expect(() => scalar.parseLiteral(makeIntNode("123"), {})).toThrow(
        expect.objectContaining({ message: expect.stringContaining("must be a string literal") }),
      );
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

    it("non-canonical input (uppercase) throws GraphQLError", () => {
      const id = usr.generate();
      expect(() => scalar.serialize(id.toUpperCase())).toThrow(GraphQLError);
      expect(() => scalar.serialize(id.toUpperCase())).toThrow(
        expect.objectContaining({ message: "invalid UserId" }),
      );
    });

    it("wrong-brand ID throws GraphQLError", () => {
      const orgId = org.generate();
      expect(() => scalar.serialize(orgId)).toThrow(GraphQLError);
      expect(() => scalar.serialize(orgId)).toThrow(
        expect.objectContaining({ message: "invalid UserId" }),
      );
    });

    it("invalid string throws GraphQLError", () => {
      expect(() => scalar.serialize("not-an-id-at-all")).toThrow(GraphQLError);
      expect(() => scalar.serialize("not-an-id-at-all")).toThrow(
        expect.objectContaining({ message: "invalid UserId" }),
      );
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

  describe("hook-codec contract (spy codec)", () => {
    it("serialize calls only is() on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      const spyScalar = idScalar(spyCodec, { name: "SpyId" });
      const fakeId = spyCodec.generate();
      spyScalar.serialize(fakeId);
      expect(spyCodec.is).toHaveBeenCalled();
      expect(spyCodec.safeParse).not.toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });

    it("parseValue calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      const spyScalar = idScalar(spyCodec, { name: "SpyId" });
      spyScalar.parseValue("any_input");
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.is).not.toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });

    it("failure-mapping: failing spy codec causes parseValue to throw GraphQLError", () => {
      const failingCodec = makeFailingSpyCodec("spy", "not_string");
      const failScalar = idScalar(failingCodec, { name: "SpyId" });
      expect(() => failScalar.parseValue("any_input")).toThrow(GraphQLError);
    });

    it("failure-mapping: failing spy codec causes serialize to throw GraphQLError", () => {
      const failingCodec = makeFailingSpyCodec("spy", "not_string");
      const failScalar = idScalar(failingCodec, { name: "SpyId" });
      expect(() => failScalar.serialize("any_input")).toThrow(GraphQLError);
    });
  });
});

describe("idScalar — graphql() execution engine (integration)", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const UserId = idScalar(usr, { name: "UserId" });

  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      fields: {
        echo: {
          type: UserId,
          args: { id: { type: new GraphQLNonNull(UserId) } },
          resolve: (_root: unknown, args: { id: unknown }) => args.id,
        },
        greeting: {
          type: GraphQLString,
          args: { id: { type: new GraphQLNonNull(UserId) } },
          resolve: (_root: unknown, args: { id: unknown }) => `hello ${String(args.id)}`,
        },
      },
    }),
  });

  it("happy path (variable): graphql() resolves with canonical Id", async () => {
    const id = usr.generate();
    const result = await graphql({
      schema,
      source: "query($id: UserId!) { echo(id: $id) }",
      variableValues: { id },
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.["echo"]).toBe(id);
  });

  it("happy path (inline literal): graphql() resolves with canonical Id", async () => {
    const id = usr.generate();
    const result = await graphql({ schema, source: `{ greeting(id: "${id}") }` });
    expect(result.errors).toBeUndefined();
    expect(result.data?.["greeting"]).toBe(`hello ${id}`);
  });

  it("error path (variable): invalid Id variable produces a GraphQLError", async () => {
    const result = await graphql({
      schema,
      source: "query($id: UserId!) { echo(id: $id) }",
      variableValues: { id: "not-a-valid-id" },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toBeInstanceOf(GraphQLError);
  });

  it("error path (inline literal): wrong-brand literal produces a GraphQLError", async () => {
    const result = await graphql({
      schema,
      source: '{ greeting(id: "org_00000000000000000000000000") }',
    });
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toBeInstanceOf(GraphQLError);
  });

  it("failure-mapping: failing spy codec causes parseValue error in graphql() execution", async () => {
    const failingCodec = makeFailingSpyCodec("spy", "not_string");
    const SpyId = idScalar(failingCodec, { name: "SpyId" });
    const failSchema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          test: {
            type: GraphQLString,
            args: { id: { type: SpyId } },
            resolve: () => "ok",
          },
        },
      }),
    });
    const result = await graphql({
      schema: failSchema,
      source: "query($id: SpyId) { test(id: $id) }",
      variableValues: { id: "any-value" },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toBeInstanceOf(GraphQLError);
  });

  it("failure-mapping: failing spy codec causes serialize error in graphql() execution", async () => {
    const failingCodec = makeFailingSpyCodec("spy", "not_string");
    const SpyId = idScalar(failingCodec, { name: "SpyId" });
    const serializeSchema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          echo: {
            type: SpyId,
            resolve: () => "some-value",
          },
        },
      }),
    });
    const result = await graphql({ schema: serializeSchema, source: "{ echo }" });
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toBeInstanceOf(GraphQLError);
  });

  describe("execution-engine integration", () => {
    it("inline string literal is coerced to canonical Id<Brand> through the graphql execution engine", async () => {
      const execUsr = createTimestampId("usr", {
        allowDuplicateBrand: true,
        now: () => new Date("2026-05-28T12:00:00Z").getTime(),
        rng: (target) => target.fill(0x42),
      });
      const execScalar = idScalar(execUsr, { name: "UserId" });

      let resolvedId: unknown;
      const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: "Query",
          fields: {
            user: {
              type: GraphQLString,
              args: { id: { type: new GraphQLNonNull(execScalar) } },
              resolve(_root, args: { id: unknown }) {
                resolvedId = args.id;
                return "ok";
              },
            },
          },
        }),
      });

      const id = execUsr.generate();
      const result = await graphql({ schema, source: `{ user(id: "${id}") }` });

      expect(result.errors).toBeUndefined();
      expect(resolvedId).toBe(id);
      expect(execUsr.is(resolvedId)).toBe(true);
    });
  });
});
