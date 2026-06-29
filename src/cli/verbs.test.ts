import { describe, expect, it } from "vitest";
import { IdsError } from "../error.js";
import { brandOfId, mapThrown } from "./verbs.js";

describe("mapThrown", () => {
  it("maps a usage-coded IdsError to a usage error", () => {
    expect(mapThrown(new IdsError("invalid_brand", "bad brand")).kind).toBe("usage");
  });

  it("maps a non-usage IdsError and any other error to a runtime error", () => {
    expect(mapThrown(new IdsError("verification_failed", "nope")).kind).toBe("runtime");
    expect(mapThrown(new Error("boom")).kind).toBe("runtime");
  });
});

describe("brandOfId", () => {
  it("extracts a lowercased brand from a well-formed id", () => {
    expect(brandOfId("USR_06f8")).toBe("usr");
  });

  it("returns undefined for a non-id token", () => {
    expect(brandOfId("not-an-id")).toBeUndefined();
  });
});
