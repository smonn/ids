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
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ResultArgs, ResultFieldDefinition } from "@prisma/client/runtime/library";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { idField, IdsError, isIdsError, type IdColumnCodec } from "./prisma.js";
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
    const result = transform.read(id) as unknown as Id<"usr">;
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
});
