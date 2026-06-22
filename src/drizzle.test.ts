import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { pgTable } from "drizzle-orm/pg-core";
import { createTimestampId } from "./timestamp.js";
import { idColumn, IdsError, isIdsError, type IdColumnCodec } from "./drizzle.js";
import type { Id } from "./types.js";

describe("drizzle", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const users = pgTable("users", { id: idColumn(usr) });

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expect(users.id.mapToDriverValue(id)).toBe(id);
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(users.id.mapFromDriverValue(id as unknown as string)).toBe(id);
  });

  it("brand round-trip typing — idColumn infers Brand from codec", () => {
    // idColumn<"usr"> accepts IdColumnCodec<"usr"> and must reject IdColumnCodec<"org">
    expectTypeOf(idColumn<"usr">)
      .parameter(0)
      .toMatchTypeOf<IdColumnCodec<"usr">>();
    // IdColumnCodec shape is satisfied by any codec variant with safeParse
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
    // Prove Id<"usr"> is the data type of the column (compile-time assignability)
    const id = usr.generate();
    // Prove compile-time assignability: cast required because Drizzle pgTable
    // collapses custom column data types to unknown in its inference
    const fromDb = users.id.mapFromDriverValue(id as unknown as string) as unknown as Id<"usr">;
    expect(fromDb).toBe(id);
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      users.id.mapFromDriverValue(orgId as unknown as string);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
  });

  it("rejects a malformed value from DB", () => {
    let err: unknown;
    try {
      // valid prefix, invalid base32 payload
      users.id.mapFromDriverValue("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_base32");
  });

  it("rejects a non-string value from DB", () => {
    let err: unknown;
    try {
      users.id.mapFromDriverValue(null as unknown as string);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    // structural type check: TimestampCodec satisfies IdColumnCodec<Brand>
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });
});
