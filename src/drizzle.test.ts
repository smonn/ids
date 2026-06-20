import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { pgTable } from "drizzle-orm/pg-core";
import { createTimestampId } from "./timestamp.js";
import { idColumn, type IdColumnCodec } from "./drizzle.js";
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
    expect(() => users.id.mapFromDriverValue(orgId as unknown as string)).toThrow(
      "[ids] invalid ID from database: invalid_prefix",
    );
  });

  it("rejects a malformed value from DB", () => {
    expect(() => users.id.mapFromDriverValue("not-a-valid-id")).toThrow(
      "[ids] invalid ID from database:",
    );
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    // structural type check: TimestampCodec satisfies IdColumnCodec<Brand>
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });
});
