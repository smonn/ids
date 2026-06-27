import { describe, expect, it } from "vitest";
import {
  ADDRESSING_STATUS,
  mutexPresent,
  REVIEWING_STATUS,
  reviewScope,
  staleStatusToClear,
} from "./review-scope.mjs";

const AGENT = {
  headRepo: "smonn/ids",
  thisRepo: "smonn/ids",
  headRef: "agent/issue-123",
};

describe("mutexPresent", () => {
  it("detects any automation:* pause-mutex", () => {
    expect(mutexPresent(["automation:rebasing"])).toBe(true);
    expect(mutexPresent(["pr:reviewing", "area:codec", "automation:rebasing"])).toBe(true);
  });

  it("is false when no automation:* label is present", () => {
    expect(mutexPresent([])).toBe(false);
    expect(mutexPresent(["pr:reviewing", "do:review", "size:m"])).toBe(false);
  });
});

describe("reviewScope — in scope", () => {
  it("reviews on push/open/reopen of a same-repo agent branch", () => {
    for (const action of ["opened", "reopened", "synchronize"]) {
      expect(reviewScope({ eventName: "pull_request", action, ...AGENT })).toEqual({
        review: true,
        deferred: false,
        reason: "in-scope",
      });
    }
  });

  it("reviews on the do:review re-review trigger", () => {
    expect(
      reviewScope({ eventName: "pull_request", action: "labeled", label: "do:review", ...AGENT }),
    ).toEqual({ review: true, deferred: false, reason: "in-scope" });
  });

  it("reviews on manual dispatch", () => {
    expect(reviewScope({ eventName: "workflow_dispatch" })).toEqual({
      review: true,
      deferred: false,
      reason: "manual-dispatch",
    });
  });
});

describe("reviewScope — label count never moves a PR out of scope (bug: 'out of scope if more than one label changed')", () => {
  it("stays in scope on a push regardless of how many labels the PR carries", () => {
    const manyLabels = ["pr:reviewing", "area:codec", "size:l", "type:fix", "do:address"];
    expect(
      reviewScope({
        eventName: "pull_request",
        action: "synchronize",
        ...AGENT,
        labels: manyLabels,
      }),
    ).toMatchObject({ review: true, deferred: false });
  });

  it("a non-do:review label change is out of scope no matter how many labels exist", () => {
    // GitHub fires one `labeled` event per label; a status/descriptive write is never a
    // review trigger. Several such writes are each independently out of scope, never a
    // review and never a cancellation.
    for (const label of ["pr:reviewing", "area:codec", "size:m", "do:address"]) {
      expect(
        reviewScope({
          eventName: "pull_request",
          action: "labeled",
          label,
          ...AGENT,
          labels: ["pr:reviewing", "area:codec", "size:m"],
        }),
      ).toEqual({ review: false, deferred: false, reason: "out-of-scope" });
    }
  });
});

describe("reviewScope — out of scope", () => {
  it("does not review a forked PR (head repo differs)", () => {
    expect(
      reviewScope({
        eventName: "pull_request",
        action: "synchronize",
        headRepo: "fork/ids",
        thisRepo: "smonn/ids",
        headRef: "agent/issue-1",
      }),
    ).toEqual({ review: false, deferred: false, reason: "out-of-scope" });
  });

  it("does not review a non-agent branch", () => {
    expect(
      reviewScope({
        eventName: "pull_request",
        action: "synchronize",
        headRepo: "smonn/ids",
        thisRepo: "smonn/ids",
        headRef: "feature/manual",
      }),
    ).toEqual({ review: false, deferred: false, reason: "out-of-scope" });
  });
});

describe("reviewScope — deferred while a conflict rebase is in flight", () => {
  it("defers an in-scope push when an automation:* mutex is present", () => {
    expect(
      reviewScope({
        eventName: "pull_request",
        action: "synchronize",
        ...AGENT,
        labels: ["pr:reviewing", "automation:rebasing"],
      }),
    ).toEqual({ review: false, deferred: true, reason: "automation-mutex" });
  });

  it("defers a do:review re-review and a manual dispatch under the mutex too", () => {
    expect(
      reviewScope({
        eventName: "pull_request",
        action: "labeled",
        label: "do:review",
        ...AGENT,
        labels: ["automation:rebasing"],
      }),
    ).toMatchObject({ review: false, deferred: true });
    expect(
      reviewScope({ eventName: "workflow_dispatch", labels: ["automation:rebasing"] }),
    ).toMatchObject({ review: false, deferred: true });
  });
});

describe("staleStatusToClear — clear a stranded in-progress status on a no-op exit (bug: 'doesn't clear pr:reviewing when out of scope')", () => {
  it("returns the status when a superseded run left it set", () => {
    expect(staleStatusToClear(["pr:reviewing", "automation:rebasing"], REVIEWING_STATUS)).toEqual([
      REVIEWING_STATUS,
    ]);
    expect(
      staleStatusToClear(["pr:addressing-feedback", "automation:rebasing"], ADDRESSING_STATUS),
    ).toEqual([ADDRESSING_STATUS]);
  });

  it("is a no-op when the status is absent (idempotent, safe to call unconditionally)", () => {
    expect(staleStatusToClear([], REVIEWING_STATUS)).toEqual([]);
    expect(staleStatusToClear(["pr:ready", "area:codec"], REVIEWING_STATUS)).toEqual([]);
  });

  it("only clears its own namespace's status, not a sibling's", () => {
    expect(staleStatusToClear(["pr:addressing-feedback"], REVIEWING_STATUS)).toEqual([]);
  });
});
