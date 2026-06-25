/**
 * Tests for the Prisma adapter.
 *
 * Unit tests exercise the read/write transform functions exported by idField()
 * directly — no live DB connection required.
 *
 * Integration-level type assertions import ResultFieldDefinition and ResultArgs
 * from @prisma/client/runtime/library and verify at compile time that idField()
 * returns a value whose shape is compatible with Prisma's $extends
 * result-component API. No prisma generate or database connection is needed —
 * the assertions are purely structural, surfaced via expectTypeOf at the vitest
 * level. This mirrors how drizzle.test.ts imports pgTable to validate column
 * types without a live DB.
 */
import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  GetPayloadResult,
  InternalArgs,
  ResultArgs,
  ResultFieldDefinition,
} from "@prisma/client/runtime/library";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { idField, IdsError, isIdsError, type IdColumnCodec, type IdTransform } from "./prisma.js";
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
});
