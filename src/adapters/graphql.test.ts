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
import { fromAny } from "@total-typescript/shoehorn";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { createSignedTimestampId, importSigningKey } from "../codecs/signed/index.js";
import { idScalar, verifyIdArgs } from "./graphql.js";
import { makeFailingSpyCodec, makeSpyCodec, makeVerifiableSpyCodec } from "./test-helpers.js";

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

describe("verifyIdArgs", () => {
  it("passes a valid signed ID arg through to the wrapped resolver unchanged", async () => {
    const usr = makeVerifiableSpyCodec("usr", "ok");
    const id = usr.generate();
    const resolver = vi.fn((_root: unknown, args: { id: unknown }) => `got ${String(args.id)}`);
    const wrapped = verifyIdArgs({ id: usr }, resolver);

    const result = await wrapped(null, { id }, {}, fromAny({}));

    expect(result).toBe(`got ${id}`);
    expect(resolver).toHaveBeenCalledWith(null, { id }, {}, expect.anything());
  });

  it("rejects a forged tag with GraphQLError before the wrapped resolver runs", async () => {
    const usr = makeVerifiableSpyCodec("usr", "fail");
    const resolver = vi.fn(() => "should not run");
    const wrapped = verifyIdArgs({ id: usr }, resolver);

    await expect(wrapped(null, { id: "usr_forged" }, {}, fromAny({}))).rejects.toThrow(
      GraphQLError,
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it("skips verification when the arg is null or undefined and still runs the resolver", async () => {
    const usr = makeVerifiableSpyCodec("usr", "fail");
    const resolver = vi.fn(() => "ran");
    const wrapped = verifyIdArgs<unknown, unknown, { id?: unknown }>({ id: usr }, resolver);

    await expect(wrapped(null, { id: null }, {}, fromAny({}))).resolves.toBe("ran");
    await expect(wrapped(null, {}, {}, fromAny({}))).resolves.toBe("ran");
    expect(usr.safeVerify).not.toHaveBeenCalled();
  });

  it("verifies every present arg in a multi-arg map and runs the resolver when all pass", async () => {
    const usr = makeVerifiableSpyCodec("usr", "ok");
    const org = makeVerifiableSpyCodec("org", "ok");
    const userId = usr.generate();
    const orgId = org.generate();
    const resolver = vi.fn(() => "linked");
    const wrapped = verifyIdArgs({ userId: usr, orgId: org }, resolver);

    await expect(wrapped(null, { userId, orgId }, {}, fromAny({}))).resolves.toBe("linked");
    expect(usr.safeVerify).toHaveBeenCalledWith(userId);
    expect(org.safeVerify).toHaveBeenCalledWith(orgId);
  });

  it("names the failing arg in the GraphQLError message", async () => {
    const usr = makeVerifiableSpyCodec("usr", "ok");
    const org = makeVerifiableSpyCodec("org", "fail");
    const resolver = vi.fn(() => "linked");
    const wrapped = verifyIdArgs({ userId: usr, orgId: org }, resolver);

    await expect(
      wrapped(null, { userId: usr.generate(), orgId: "org_forged" }, {}, fromAny({})),
    ).rejects.toThrow(expect.objectContaining({ message: "invalid orgId" }));
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects a wrong-brand signed ID (structural prefix mismatch)", async () => {
    const key = await importSigningKey(new Uint8Array(32).fill(0x11));
    const usr = createSignedTimestampId("usr", { keys: [key], allowDuplicateBrand: true });
    const org = createSignedTimestampId("org", { keys: [key], allowDuplicateBrand: true });
    const resolver = vi.fn(() => "ran");
    // Verifier expects "usr" but receives a genuinely-signed "org" ID.
    const wrapped = verifyIdArgs({ id: usr }, resolver);

    const orgId = await org.generate();
    await expect(wrapped(null, { id: orgId }, {}, fromAny({}))).rejects.toThrow(
      expect.objectContaining({ message: "invalid id" }),
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects an ID signed under a different key (missing/invalid key)", async () => {
    const signingKey = await importSigningKey(new Uint8Array(32).fill(0x22));
    const otherKey = await importSigningKey(new Uint8Array(32).fill(0x33));
    const signer = createSignedTimestampId("sgn", {
      keys: [signingKey],
      allowDuplicateBrand: true,
    });
    const verifier = createSignedTimestampId("sgn", {
      keys: [otherKey],
      allowDuplicateBrand: true,
    });
    const resolver = vi.fn(() => "ran");
    const wrapped = verifyIdArgs({ id: verifier }, resolver);

    const id = await signer.generate();
    await expect(wrapped(null, { id }, {}, fromAny({}))).rejects.toThrow(
      expect.objectContaining({ message: "invalid id" }),
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects a non-verifiable codec (no safeVerify) at compile time", () => {
    const plain = createTimestampId("pln", { allowDuplicateBrand: true });
    // A plain Timestamp codec satisfies IdCodec but not IdVerifiableCodec.
    // @ts-expect-error — codec map values must expose safeVerify (IdVerifiableCodec).
    verifyIdArgs({ id: plain }, () => "unreachable");
    expect(true).toBe(true);
  });
});

describe("verifyIdArgs — graphql() execution engine (integration)", () => {
  // Flip a base32 char firmly inside the tag region so the ID still parses structurally
  // (canonical final char untouched) but its HMAC no longer matches.
  function forgeTag(id: string): string {
    const idx = id.length - 2;
    const c = id[idx]!;
    return id.slice(0, idx) + (c === "0" ? "1" : "0") + id.slice(idx + 1);
  }

  it("resolves a genuinely signed ID and rejects a forged one before the resolver runs", async () => {
    const key = await importSigningKey(new Uint8Array(32).fill(0x42));
    const sgn = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const SignedId = idScalar(sgn, { name: "SignedId" });

    let resolverRuns = 0;
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: {
          resource: {
            type: GraphQLString,
            args: { id: { type: new GraphQLNonNull(SignedId) } },
            resolve: verifyIdArgs({ id: sgn }, (_root, args: { id: unknown }) => {
              resolverRuns += 1;
              return `ok ${String(args.id)}`;
            }),
          },
        },
      }),
    });

    const id = await sgn.generate();
    const good = await graphql({ schema, source: `{ resource(id: "${id}") }` });
    expect(good.errors).toBeUndefined();
    expect(good.data?.["resource"]).toBe(`ok ${id}`);
    expect(resolverRuns).toBe(1);

    const forged = forgeTag(id);
    const bad = await graphql({ schema, source: `{ resource(id: "${forged}") }` });
    expect(bad.errors).toBeDefined();
    expect(bad.errors![0]).toBeInstanceOf(GraphQLError);
    expect(bad.errors![0]?.message).toBe("invalid id");
    // Forgery is structurally valid, so it clears the scalar and is caught by the wrapper —
    // the resolver body still never runs.
    expect(resolverRuns).toBe(1);
  });
});
