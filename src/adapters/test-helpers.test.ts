import { describe, expect, it } from "vitest";
import { IdsError } from "../error.js";
import { expectInvalidIdError } from "./test-helpers.js";

describe("expectInvalidIdError", () => {
  it("resolves when a sync fn throws IdsError(invalid_id)", async () => {
    await expectInvalidIdError(() => {
      throw new IdsError("invalid_id", "test");
    });
  });

  it("resolves when an async fn rejects with IdsError(invalid_id)", async () => {
    await expectInvalidIdError(async () => {
      throw new IdsError("invalid_id", "async test");
    });
  });

  it("assertion fails when fn does not throw", async () => {
    await expect(expectInvalidIdError(() => {})).rejects.toThrow();
  });

  it("assertion fails when fn throws a plain Error", async () => {
    await expect(
      expectInvalidIdError(() => {
        throw new Error("plain");
      }),
    ).rejects.toThrow();
  });

  it("assertion fails when fn throws IdsError with a different code", async () => {
    await expect(
      expectInvalidIdError(() => {
        throw new IdsError("invalid_brand", "wrong code");
      }),
    ).rejects.toThrow();
  });

  it("resolves when fn throws IdsError(invalid_id) with matching cause", async () => {
    await expectInvalidIdError(
      () => {
        throw new IdsError("invalid_id", "test", { cause: "invalid_prefix" });
      },
      { cause: "invalid_prefix" },
    );
  });

  it("assertion fails when fn throws IdsError(invalid_id) with mismatched cause", async () => {
    await expect(
      expectInvalidIdError(
        () => {
          throw new IdsError("invalid_id", "test", { cause: "invalid_base32" });
        },
        { cause: "invalid_prefix" },
      ),
    ).rejects.toThrow();
  });
});
