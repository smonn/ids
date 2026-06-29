import { describe, expect, it } from "vitest";
import { IdsError } from "../error.js";
import { formatCliError } from "./format.js";

describe("formatCliError", () => {
  it("renders an IdsError as code: message", () => {
    expect(formatCliError(new IdsError("invalid_brand", "bad brand"))).toBe(
      "invalid_brand: bad brand",
    );
  });

  it("renders a plain Error as its message", () => {
    expect(formatCliError(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-error values", () => {
    expect(formatCliError("nope")).toBe("nope");
  });
});
