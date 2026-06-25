import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBrand, resetBrandRegistry } from "./registry.js";

describe("brand registry", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetBrandRegistry();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
    resetBrandRegistry();
  });

  it("resetBrandRegistry clears prior registrations so the same brand re-registers cleanly", () => {
    registerBrand("usr", undefined);
    registerBrand("usr", undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockClear();
    resetBrandRegistry();

    registerBrand("usr", undefined);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn on a brand's first registration", () => {
    registerBrand("usr", undefined);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns on a duplicate registration of the same brand", () => {
    registerBrand("usr", undefined);
    registerBrand("usr", undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns at most once per brand, however many duplicates follow", () => {
    registerBrand("usr", undefined);
    registerBrand("usr", undefined);
    registerBrand("usr", undefined);
    registerBrand("usr", undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("allowDuplicateBrand on the duplicate suppresses the warning", () => {
    registerBrand("usr", undefined);
    registerBrand("usr", true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("no-ops in production: no warning, and the registry is not populated", () => {
    vi.stubEnv("NODE_ENV", "production");
    registerBrand("usr", undefined);
    registerBrand("usr", undefined);
    expect(warnSpy).not.toHaveBeenCalled();

    // Lifting the production gate must find an empty registry: a single
    // registration still must not warn, only a genuine duplicate afterwards.
    vi.unstubAllEnvs();
    registerBrand("usr", undefined);
    expect(warnSpy).not.toHaveBeenCalled();
    registerBrand("usr", undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
