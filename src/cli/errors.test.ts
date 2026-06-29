import { describe, expect, it } from "vitest";
import { exitCodeFor, isCliError, runtimeError, usageError } from "./errors.js";

describe("errors", () => {
  it("builds tagged usage and runtime errors", () => {
    expect(usageError("x")).toEqual({ kind: "usage", message: "x" });
    expect(runtimeError("y")).toEqual({ kind: "runtime", message: "y" });
  });

  it("narrows CliError values", () => {
    expect(isCliError(usageError("x"))).toBe(true);
    expect(isCliError({ kind: "nope", message: "" })).toBe(false);
    expect(isCliError({ kind: "usage" })).toBe(false);
    expect(isCliError(null)).toBe(false);
    expect(isCliError("x")).toBe(false);
  });

  it("maps kind to exit code", () => {
    expect(exitCodeFor(usageError("x"))).toBe(2);
    expect(exitCodeFor(runtimeError("y"))).toBe(1);
  });
});
