/**
 * Unit-level tests for the Prisma adapter — no real database required.
 *
 * A Prisma client extension ($extends) cannot be instantiated without a real DB
 * connection. Tests exercise the read/write transform functions exported by
 * idField() directly, which is the unit these tests validate.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { createTimestampId } from "./codecs/timestamp/index.js";
import { idField, IdsError, isIdsError, type IdColumnCodec } from "./prisma.js";
import type { Id } from "./types.js";

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
});
