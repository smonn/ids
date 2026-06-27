import { describe, expect, it } from "vitest";
import { addressGate } from "./address-gate.mjs";

const BOT = "smonn[bot]";
const gate = (over = {}) =>
  addressGate({ labels: [], sender: BOT, maxRounds: 3, botLogin: BOT, ...over });

describe("addressGate — already escalated", () => {
  it("does not proceed and churns no labels when needs-human is present", () => {
    const d = gate({ labels: ["needs-human", "auto-round:2", "pr:addressing-feedback"] });
    expect(d.proceed).toBe(false);
    expect(d.reason).toBe("already-escalated");
    expect(d.escalate).toBe(false);
    expect(d.labelsToAdd).toEqual([]);
    expect(d.labelsToRemove).toEqual([]);
  });
});

describe("addressGate — human sender resets the cap", () => {
  it("proceeds and removes a stale round label for a human-applied trigger", () => {
    const d = gate({ labels: ["auto-round:2"], sender: "alice" });
    expect(d.proceed).toBe(true);
    expect(d.reason).toBe("human-reset");
    expect(d.labelsToRemove).toEqual(["auto-round:2"]);
    expect(d.labelsToAdd).toEqual([]);
  });

  it("proceeds with no churn when a human triggers and no round label exists", () => {
    const d = gate({ labels: [], sender: "alice" });
    expect(d.proceed).toBe(true);
    expect(d.reason).toBe("human-reset");
    expect(d.labelsToRemove).toEqual([]);
  });
});

describe("addressGate — bot round advance", () => {
  it("starts the counter at auto-round:1 when no round label exists yet", () => {
    const d = gate({ labels: [] });
    expect(d.proceed).toBe(true);
    expect(d.reason).toBe("advance");
    expect(d.labelsToAdd).toEqual(["auto-round:1"]);
    expect(d.labelsToRemove).toEqual([]);
  });

  it("advances to the next round and drops the previous round label", () => {
    const d = gate({ labels: ["auto-round:1"] });
    expect(d.proceed).toBe(true);
    expect(d.reason).toBe("advance");
    expect(d.labelsToAdd).toEqual(["auto-round:2"]);
    expect(d.labelsToRemove).toEqual(["auto-round:1"]);
  });
});

describe("addressGate — bot cap reached", () => {
  it("escalates instead of proceeding once the round count hits maxRounds", () => {
    const d = gate({ labels: ["auto-round:3"], maxRounds: 3 });
    expect(d.proceed).toBe(false);
    expect(d.reason).toBe("cap-reached");
    expect(d.escalate).toBe(true);
    expect(d.labelsToAdd).toEqual(["needs-human"]);
    expect(d.labelsToRemove).toEqual(["auto-round:3"]);
    expect(d.comment).toContain("3 round(s)");
  });
});

describe("addressGate — automation mutex defer", () => {
  it("defers and clears a stale pr:addressing-feedback when present", () => {
    const d = gate({ labels: ["automation:rebasing", "pr:addressing-feedback"] });
    expect(d.proceed).toBe(false);
    expect(d.reason).toBe("automation-mutex");
    expect(d.labelsToRemove).toEqual(["pr:addressing-feedback"]);
    expect(d.labelsToAdd).toEqual([]);
  });

  it("defers without removing pr:addressing-feedback when it is absent", () => {
    const d = gate({ labels: ["automation:rebasing"] });
    expect(d.proceed).toBe(false);
    expect(d.reason).toBe("automation-mutex");
    expect(d.labelsToRemove).toEqual([]);
  });

  it("outranks the round cap — a mutex defers even when the bot is at the cap", () => {
    const d = gate({ labels: ["automation:rebasing", "auto-round:3"], maxRounds: 3 });
    expect(d.reason).toBe("automation-mutex");
    expect(d.escalate).toBe(false);
  });
});
