import { describe, expect, expectTypeOf, it, vi, afterAll, beforeAll } from "vitest";
import { createTimestampId } from "./timestamp.js";
import { idColumn, type IdColumnCodec, type IdColumnType } from "./kysely.js";
import type { Id } from "./types.js";
import type { ColumnType } from "kysely";

describe("kysely", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const usrCol = idColumn(usr);

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expect(usrCol.toDriver(id)).toBe(id);
    expectTypeOf(usrCol.toDriver(id)).toEqualTypeOf<string>();
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(usrCol.fromDriver(id as unknown as string)).toBe(id);
    expectTypeOf(usrCol.fromDriver(id as unknown as string)).toEqualTypeOf<Id<"usr">>();
  });

  it("brand round-trip typing — idColumn infers Brand from codec", () => {
    expectTypeOf(idColumn<"usr">)
      .parameter(0)
      .toMatchTypeOf<IdColumnCodec<"usr">>();
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
    const id = usr.generate();
    const fromDb = usrCol.fromDriver(id as unknown as string);
    expect(fromDb).toBe(id);
  });

  it("IdColumnType is assignable to Kysely ColumnType", () => {
    expectTypeOf<IdColumnType<"usr">>().toMatchTypeOf<
      ColumnType<Id<"usr">, Id<"usr">, Id<"usr">>
    >();
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    expect(() => usrCol.fromDriver(orgId as unknown as string)).toThrow(
      "[ids] invalid ID from database: invalid_prefix",
    );
  });

  it("rejects a malformed value from DB", () => {
    expect(() => usrCol.fromDriver("not-a-valid-id")).toThrow("[ids] invalid ID from database:");
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });
});
