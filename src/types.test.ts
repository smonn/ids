import { describe, it } from "vitest";
import type { Id } from "./types.js";

describe("Id<Brand> unique-symbol branding", () => {
  it("a structurally equivalent __brand object is not assignable to Id<Brand>", () => {
    // This mirrors the old __brand-based structure. With the unique-symbol brand
    // it can no longer be assigned to Id<"usr"> without going through the library.
    type FakeUsrId = `usr_${string}` & { readonly __brand: "usr" };
    // @ts-expect-error — FakeUsrId must not satisfy Id<"usr"> after unique-symbol branding
    const _: Id<"usr"> = "usr_0000000000000000000000000000" as FakeUsrId;
    void _;
  });
});
