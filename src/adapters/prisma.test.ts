/**
 * Tests for the Prisma adapter.
 *
 * Unit tests exercise the read/write transform functions exported by idField()
 * directly — no live DB connection required.
 *
 * Integration-level type assertions import ResultFieldDefinition and ResultArgs
 * from @prisma/client/runtime/client and verify at compile time that idField()
 * returns a value whose shape is compatible with Prisma's $extends
 * result-component API. No prisma generate or database connection is needed —
 * the assertions are purely structural, surfaced via expectTypeOf at the vitest
 * level. This mirrors how drizzle.test.ts imports pgTable to validate column
 * types without a live DB.
 */
import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { makeSpyCodec } from "./test-helpers.js";
import type {
  GetPayloadResult,
  InternalArgs,
  ModelQueryOptionsCbArgs,
  QueryOptions,
  ResultArgs,
  ResultFieldDefinition,
} from "@prisma/client/runtime/client";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  idField,
  idFieldNonGenerating,
  idFieldReadOnly,
  nullableIdField,
  IdsError,
  isIdsError,
  type IdColumnCodec,
  type IdGeneratingCodec,
  type IdQueryField,
  type IdTransform,
  type NullableIdComputeField,
  type NullableIdTransform,
} from "./prisma.js";
import type { Id } from "../types.js";

describe("prisma", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const transform = idField(usr);

  it("write path passes Id<Brand> through unchanged as string", () => {
    const id = usr.generate();
    expect(transform.write(id)).toBe(id);
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(transform.read(id)).toBe(id);
  });

  it("IdColumnCodec type is satisfied by any codec variant with safeParse", () => {
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  it("idField infers Brand from codec", () => {
    expectTypeOf(idField<"usr">)
      .parameter(0)
      .toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  it("read result is typed as Id<Brand>", () => {
    const id = usr.generate();
    const result: Id<"usr"> = fromAny(transform.read(id));
    expectTypeOf(result).toEqualTypeOf<Id<"usr">>();
  });

  it("rejects a wrong-brand value", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      transform.read(orgId);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
  });

  it("rejects a malformed value", () => {
    let err: unknown;
    try {
      // valid prefix, invalid base32 payload
      transform.read("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_base32");
  });

  it("rejects a non-string value", () => {
    let err: unknown;
    try {
      transform.read(42);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("idField result field satisfies Prisma ResultFieldDefinition $extends compute shape", () => {
    // Mirrors how drizzle.test.ts uses pgTable to validate column types:
    // this verifies that idField.read fits the compute slot of a Prisma
    // $extends result component without requiring prisma generate or a DB.
    const resultField = {
      needs: { id: true },
      compute: (model: { id: unknown }) => transform.read(model.id),
    } satisfies ResultFieldDefinition;

    // compute(model) narrows the return type to Id<Brand>
    expectTypeOf(resultField.compute).toMatchTypeOf<(model: { id: unknown }) => Id<"usr">>();
  });

  it("extension spec satisfies Prisma ResultArgs — the $extends result block shape", () => {
    const resultSpec = {
      result: {
        user: {
          id: {
            needs: { id: true },
            compute: (model: { id: unknown }) => transform.read(model.id),
          },
        },
      },
    } satisfies ResultArgs;

    expectTypeOf(resultSpec.result["user"]!["id"]).toMatchTypeOf<ResultFieldDefinition>();
  });

  it("computeField returns a { needs, compute } object", () => {
    const field = transform.computeField("id");
    expect(field).toHaveProperty("needs", { id: true });
    expect(typeof field.compute).toBe("function");
  });

  it("computeField.compute parses a valid Id<Brand> value", () => {
    const id = usr.generate();
    const field = transform.computeField("id");
    expect(field.compute({ id })).toBe(id);
  });

  it("computeField.compute is typed to return Id<Brand>", () => {
    const field = transform.computeField("id");
    expectTypeOf(field.compute).returns.toEqualTypeOf<Id<"usr">>();
  });

  it("computeField.compute throws IdsError on invalid value", () => {
    const field = transform.computeField("id");
    let err: unknown;
    try {
      field.compute({ id: "not-a-valid-id" });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
  });

  it("computeField.compute throws IdsError on wrong-brand value", () => {
    const field = transform.computeField("id");
    const orgId = org.generate();
    let err: unknown;
    try {
      field.compute({ id: orgId });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
  });

  it("brand survives $extends result component — type-level assertion via GetPayloadResult", () => {
    // Simulates the type path that Prisma's $extends follows when computing
    // the model type for an extended client. InternalArgs wraps each field
    // definition as a thunk; GetPayloadResult extracts the compute return
    // type and uses it as the field type on the extended model.
    type MockUserBase = { id: string; name: string };
    const fieldDef = transform.computeField("id");

    type Args = InternalArgs<{ user: { id: typeof fieldDef } }>;
    type Extended = GetPayloadResult<MockUserBase, Args["result"]["user"]>;

    expectTypeOf<Extended["id"]>().toEqualTypeOf<Id<"usr">>();
  });

  it("IdTransform type exposes computeField", () => {
    expectTypeOf(transform).toMatchTypeOf<IdTransform<"usr">>();
    expectTypeOf(transform.computeField).toBeFunction();
  });

  describe("readNullable", () => {
    it("returns null for null input", () => {
      expect(transform.readNullable(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(transform.readNullable(undefined)).toBeNull();
    });

    it("returns Id<Brand> for a valid string", () => {
      const id = usr.generate();
      expect(transform.readNullable(id)).toBe(id);
      expectTypeOf(transform.readNullable(id)).toEqualTypeOf<Id<"usr"> | null>();
    });

    it("throws IdsError(invalid_id) for an invalid string", () => {
      let err: unknown;
      try {
        transform.readNullable("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });
  });

  describe("computeNullableField", () => {
    it("returns a { needs, compute } object", () => {
      const field = transform.computeNullableField("authorId");
      expect(field).toHaveProperty("needs", { authorId: true });
      expect(typeof field.compute).toBe("function");
    });

    it("compute returns null when field is null", () => {
      const field = transform.computeNullableField("authorId");
      expect(field.compute({ authorId: null })).toBeNull();
    });

    it("compute returns null when field is undefined", () => {
      const field = transform.computeNullableField("authorId");
      expect(field.compute({ authorId: undefined })).toBeNull();
    });

    it("compute returns Id<Brand> for a valid field value", () => {
      const field = transform.computeNullableField("authorId");
      const id = usr.generate();
      expect(field.compute({ authorId: id })).toBe(id);
    });

    it("compute is typed to return Id<Brand> | null", () => {
      const field = transform.computeNullableField("authorId");
      expectTypeOf(field.compute).returns.toEqualTypeOf<Id<"usr"> | null>();
    });

    it("compute throws IdsError on invalid value", () => {
      const field = transform.computeNullableField("authorId");
      let err: unknown;
      try {
        field.compute({ authorId: "not-a-valid-id" });
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("NullableIdComputeField type is satisfied", () => {
      const field = transform.computeNullableField("authorId");
      expectTypeOf(field).toMatchTypeOf<NullableIdComputeField<"usr">>();
    });
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("read calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      idField(spyCodec).read("any_value");
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });

  it("IdGeneratingCodec type is satisfied by createTimestampId codec", () => {
    expectTypeOf(usr).toMatchTypeOf<IdGeneratingCodec<"usr">>();
  });

  describe("defaultQuery", () => {
    function makeQueryArgs(
      operation: string,
      args: Record<string, unknown>,
    ): ModelQueryOptionsCbArgs {
      return {
        model: "user",
        operation,
        args: args as ModelQueryOptionsCbArgs["args"],
        query: async (a) => a,
      };
    }

    it("injects a generated ID when the field is absent from args.data (create)", async () => {
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("create", { data: { name: "Alice" } });
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.create!(cbArgs);
      const data = capturedArgs!.data as Record<string, unknown>;
      expect(typeof data.id).toBe("string");
      expect(usr.is(data.id as string)).toBe(true);
    });

    it("does not override an explicitly supplied ID (create)", async () => {
      const suppliedId = usr.generate();
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("create", { data: { id: suppliedId, name: "Alice" } });
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.create!(cbArgs);
      const data = capturedArgs!.data as Record<string, unknown>;
      expect(data.id).toBe(suppliedId);
    });

    it("injects a generated ID when the field is null (null treated as absent)", async () => {
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("create", { data: { id: null, name: "Alice" } });
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.create!(cbArgs);
      const data = capturedArgs!.data as Record<string, unknown>;
      expect(typeof data.id).toBe("string");
      expect(usr.is(data.id as string)).toBe(true);
    });

    it("handles createMany with a mix of items (some with, some without the field)", async () => {
      const existingId = usr.generate();
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("createMany", {
        data: [{ name: "Alice" }, { id: existingId, name: "Bob" }, { id: null, name: "Carol" }],
      });
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.createMany!(cbArgs);
      const data = capturedArgs!.data as Array<Record<string, unknown>>;
      // Alice: absent → injected
      expect(typeof data[0]!.id).toBe("string");
      expect(usr.is(data[0]!.id as string)).toBe(true);
      // Bob: explicit value → preserved
      expect(data[1]!.id).toBe(existingId);
      // Carol: null → injected
      expect(typeof data[2]!.id).toBe("string");
      expect(usr.is(data[2]!.id as string)).toBe(true);
    });

    it("injects into args.create when the field is absent (upsert)", async () => {
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("upsert", {
        where: { email: "alice@example.com" },
        create: { name: "Alice" },
        update: { name: "Alice" },
      });
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.upsert!(cbArgs);
      const create = capturedArgs!.create as Record<string, unknown>;
      expect(typeof create.id).toBe("string");
      expect(usr.is(create.id as string)).toBe(true);
      // update should be unchanged
      const update = capturedArgs!.update as Record<string, unknown>;
      expect(update.id).toBeUndefined();
    });

    it("passes args through unchanged for create when args.data is absent", async () => {
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("create", {});
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.create!(cbArgs);
      expect(capturedArgs!.data).toBeUndefined();
    });

    it("passes args through unchanged for createMany when args.data is absent", async () => {
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("createMany", {});
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.createMany!(cbArgs);
      expect(capturedArgs!.data).toBeUndefined();
    });

    it("passes args through unchanged for upsert when args.create is absent", async () => {
      const field = transform.defaultQuery("id");
      let capturedArgs: Record<string, unknown> | undefined;
      const cbArgs = makeQueryArgs("upsert", { where: { email: "alice@example.com" } });
      cbArgs.query = async (a) => {
        capturedArgs = a as Record<string, unknown>;
        return a;
      };
      await field.upsert!(cbArgs);
      expect(capturedArgs!.create).toBeUndefined();
    });

    it("IdQueryField type satisfies Prisma QueryOptions query-component shape", () => {
      const querySpec = {
        query: {
          user: transform.defaultQuery("id"),
        },
      } satisfies QueryOptions;

      expectTypeOf(querySpec.query["user"]).toMatchTypeOf<IdQueryField>();
    });

    it("IdTransform type exposes defaultQuery", () => {
      expectTypeOf(transform).toMatchTypeOf<IdTransform<"usr">>();
      expectTypeOf(transform.defaultQuery).toBeFunction();
    });
  });

  it("idFieldReadOnly is a deprecated wrapper around idFieldNonGenerating", () => {
    // idFieldReadOnly is a distinct wrapper function that delegates to idFieldNonGenerating.
    // Behavioral equivalence is verified by describeNonGeneratingBehavior below.
    expect(typeof idFieldReadOnly).toBe("function");
    expect(idFieldReadOnly).not.toBe(idFieldNonGenerating);
  });

  function describeNonGeneratingBehavior(suiteName: string, factory: typeof idFieldNonGenerating) {
    describe(suiteName, () => {
      function makeMinimalSpyCodec<Brand extends string>(brand: Brand): IdColumnCodec<Brand> {
        const fakeId: Id<Brand> = fromAny(`${brand}_00000000000000000000000000`);
        return {
          safeParse: fromAny(vi.fn(() => ({ ok: true as const, id: fakeId }))),
        };
      }

      it("accepts a safeParse-only codec (no generate required)", () => {
        const minimalCodec = makeMinimalSpyCodec("spy");
        const ro = factory(minimalCodec);
        expect(ro).toBeDefined();
      });

      it("return value has no defaultQuery property", () => {
        const minimalCodec = makeMinimalSpyCodec("spy");
        const ro = factory(minimalCodec);
        expect("defaultQuery" in ro).toBe(false);
      });

      it("return type excludes defaultQuery at the TypeScript level", () => {
        const minimalCodec = makeMinimalSpyCodec("spy");
        const ro = factory(minimalCodec);
        expectTypeOf(ro).not.toHaveProperty("defaultQuery");
      });

      it("read delegates to safeParse", () => {
        const id = usr.generate();
        const ro = factory(usr);
        expect(ro.read(id)).toBe(id);
      });

      it("read throws IdsError on invalid value", () => {
        const ro = factory(usr);
        let err: unknown;
        try {
          ro.read("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
        } catch (e) {
          err = e;
        }
        expect(isIdsError(err)).toBe(true);
        expect((err as IdsError).code).toBe("invalid_id");
      });

      it("readNullable returns null for null", () => {
        const ro = factory(usr);
        expect(ro.readNullable(null)).toBeNull();
      });

      it("readNullable returns null for undefined", () => {
        const ro = factory(usr);
        expect(ro.readNullable(undefined)).toBeNull();
      });

      it("readNullable returns Id<Brand> for a valid string", () => {
        const id = usr.generate();
        const ro = factory(usr);
        expect(ro.readNullable(id)).toBe(id);
      });

      it("write passes Id<Brand> through unchanged", () => {
        const id = usr.generate();
        const ro = factory(usr);
        expect(ro.write(id)).toBe(id);
      });

      it("computeField returns a { needs, compute } object", () => {
        const ro = factory(usr);
        const field = ro.computeField("id");
        expect(field).toHaveProperty("needs", { id: true });
        expect(typeof field.compute).toBe("function");
      });

      it("computeField.compute parses a valid Id<Brand> value", () => {
        const id = usr.generate();
        const ro = factory(usr);
        const field = ro.computeField("id");
        expect(field.compute({ id })).toBe(id);
      });

      it("computeField.compute is typed to return Id<Brand>", () => {
        const ro = factory(usr);
        const field = ro.computeField("id");
        expectTypeOf(field.compute).returns.toEqualTypeOf<Id<"usr">>();
      });

      it("computeField.compute throws IdsError on invalid value", () => {
        const ro = factory(usr);
        const field = ro.computeField("id");
        let err: unknown;
        try {
          field.compute({ id: "not-a-valid-id" });
        } catch (e) {
          err = e;
        }
        expect(isIdsError(err)).toBe(true);
        expect((err as IdsError).code).toBe("invalid_id");
      });

      it("computeNullableField.compute returns null when field is null", () => {
        const ro = factory(usr);
        const field = ro.computeNullableField("authorId");
        expect(field.compute({ authorId: null })).toBeNull();
      });

      it("computeNullableField.compute returns Id<Brand> for a valid field value", () => {
        const id = usr.generate();
        const ro = factory(usr);
        const field = ro.computeNullableField("authorId");
        expect(field.compute({ authorId: id })).toBe(id);
      });

      it("computeNullableField.compute is typed to return Id<Brand> | null", () => {
        const ro = factory(usr);
        const field = ro.computeNullableField("authorId");
        expectTypeOf(field.compute).returns.toEqualTypeOf<Id<"usr"> | null>();
      });

      it("calls only safeParse on the codec — no generate, wrap, or unwrap", () => {
        const minimalCodec = makeMinimalSpyCodec("spy");
        factory(minimalCodec).read("any_value");
        expect(minimalCodec.safeParse).toHaveBeenCalled();
      });
    });
  }

  describeNonGeneratingBehavior("idFieldNonGenerating", idFieldNonGenerating);
  describeNonGeneratingBehavior("idFieldReadOnly (deprecated alias)", idFieldReadOnly);

  describe("nullableIdField", () => {
    function makeMinimalSpyCodec<Brand extends string>(brand: Brand): IdColumnCodec<Brand> {
      const fakeId: Id<Brand> = fromAny(`${brand}_00000000000000000000000000`);
      return {
        safeParse: fromAny(vi.fn(() => ({ ok: true as const, id: fakeId }))),
      };
    }

    it("accepts a safeParse-only codec (no generate required)", () => {
      const minimalCodec = makeMinimalSpyCodec("spy");
      const result = nullableIdField(minimalCodec);
      expect(result).toBeDefined();
    });

    it("return type has no defaultQuery property", () => {
      const result = nullableIdField(usr);
      expect("defaultQuery" in result).toBe(false);
    });

    it("return type excludes defaultQuery at the TypeScript level", () => {
      const result = nullableIdField(usr);
      expectTypeOf(result).not.toHaveProperty("defaultQuery");
    });

    it("readNullable returns null for null", () => {
      const result = nullableIdField(usr);
      expect(result.readNullable(null)).toBeNull();
    });

    it("readNullable returns null for undefined", () => {
      const result = nullableIdField(usr);
      expect(result.readNullable(undefined)).toBeNull();
    });

    it("readNullable returns Id<Brand> for a valid canonical string", () => {
      const result = nullableIdField(usr);
      const id = usr.generate();
      expect(result.readNullable(id)).toBe(id);
      expectTypeOf(result.readNullable(id)).toEqualTypeOf<Id<"usr"> | null>();
    });

    it("readNullable throws IdsError(invalid_id) for an invalid string", () => {
      const result = nullableIdField(usr);
      let err: unknown;
      try {
        result.readNullable("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("write passes Id<Brand> through unchanged", () => {
      const result = nullableIdField(usr);
      const id = usr.generate();
      expect(result.write(id)).toBe(id);
    });

    it("computeNullableField returns a { needs, compute } object", () => {
      const result = nullableIdField(usr);
      const field = result.computeNullableField("authorId");
      expect(field).toHaveProperty("needs", { authorId: true });
      expect(typeof field.compute).toBe("function");
    });

    it("computeNullableField.compute is typed to return Id<Brand> | null", () => {
      const result = nullableIdField(usr);
      const field = result.computeNullableField("authorId");
      expectTypeOf(field.compute).returns.toEqualTypeOf<Id<"usr"> | null>();
    });

    it("computeNullableField.compute returns null for a null field", () => {
      const result = nullableIdField(usr);
      const field = result.computeNullableField("authorId");
      expect(field.compute({ authorId: null })).toBeNull();
    });

    it("computeNullableField.compute returns null for an undefined field", () => {
      const result = nullableIdField(usr);
      const field = result.computeNullableField("authorId");
      expect(field.compute({ authorId: undefined })).toBeNull();
    });

    it("computeNullableField.compute returns Id<Brand> for a valid field value", () => {
      const result = nullableIdField(usr);
      const field = result.computeNullableField("authorId");
      const id = usr.generate();
      expect(field.compute({ authorId: id })).toBe(id);
    });

    it("computeNullableField.compute throws IdsError(invalid_id) for an invalid non-null value", () => {
      const result = nullableIdField(usr);
      const field = result.computeNullableField("authorId");
      let err: unknown;
      try {
        field.compute({ authorId: "not-a-valid-id" });
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("NullableIdTransform<Brand> type is satisfied by the returned object", () => {
      const result = nullableIdField(usr);
      expectTypeOf(result).toMatchTypeOf<NullableIdTransform<"usr">>();
    });
  });
});
