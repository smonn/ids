import { describe, expect, it } from "vitest";
import {
  flatLifecycleFromEvents,
  issueLifecyclePlan,
  nsIssueStatus,
} from "./lifecycle-classifier.mjs";

describe("nsIssueStatus", () => {
  it("mirrors the flat → namespaced mapping in lifecycle-status.sh", () => {
    expect(nsIssueStatus("needs-triage")).toBe("issue:triage");
    expect(nsIssueStatus("needs-info")).toBe("issue:needs-info");
    expect(nsIssueStatus("ready-for-agent")).toBe("issue:ready-agent");
    expect(nsIssueStatus("ready-for-human")).toBe("issue:ready-human");
    expect(nsIssueStatus("in-progress")).toBe("issue:in-progress");
    expect(nsIssueStatus("blocked")).toBe("issue:blocked");
    expect(nsIssueStatus("wontfix")).toBe("issue:wontfix");
  });

  it("returns null for a flat label with no issue: counterpart", () => {
    expect(nsIssueStatus("needs-human")).toBeNull();
    expect(nsIssueStatus("needs-review")).toBeNull();
    expect(nsIssueStatus("")).toBeNull();
  });
});

describe("flatLifecycleFromEvents", () => {
  it("takes the last lifecycle label still in effect", () => {
    const events = [
      { event: "labeled", label: "needs-triage" },
      { event: "labeled", label: "ready-for-agent" },
      { event: "labeled", label: "in-progress" },
    ];
    expect(flatLifecycleFromEvents(events)).toBe("in-progress");
  });

  it("honours a later unlabeled of the current label", () => {
    const events = [
      { event: "labeled", label: "blocked" },
      { event: "unlabeled", label: "blocked" },
    ];
    expect(flatLifecycleFromEvents(events)).toBeNull();
  });

  it("ignores unlabeled of a non-current label and non-lifecycle labels", () => {
    const events = [
      { event: "labeled", label: "bug" }, // not a lifecycle label
      { event: "labeled", label: "ready-for-agent" },
      { event: "unlabeled", label: "needs-triage" }, // not the current one
    ];
    expect(flatLifecycleFromEvents(events)).toBe("ready-for-agent");
  });

  it("returns null with no events", () => {
    expect(flatLifecycleFromEvents()).toBeNull();
    expect(flatLifecycleFromEvents([])).toBeNull();
  });
});

describe("issueLifecyclePlan", () => {
  it("defaults an open issue with no history to issue:triage", () => {
    const { add, remove } = issueLifecyclePlan({ current: ["bug", "type:fix"] });
    expect(add).toEqual(["issue:triage"]);
    expect(remove).toEqual([]);
  });

  it("recovers the namespaced status from the timeline", () => {
    const { add, remove } = issueLifecyclePlan({
      current: ["enhancement"],
      events: [
        { event: "labeled", label: "needs-triage" },
        { event: "labeled", label: "ready-for-agent" },
      ],
    });
    expect(add).toEqual(["issue:ready-agent"]);
    expect(remove).toEqual([]);
  });

  it("is a no-op when a namespaced status is already present", () => {
    const { add, remove } = issueLifecyclePlan({
      current: ["issue:in-progress", "type:feat"],
      events: [{ event: "labeled", label: "blocked" }],
    });
    expect(add).toEqual([]);
    expect(remove).toEqual([]);
  });

  it("de-duplicates stray sibling statuses to a single value", () => {
    const { add, remove } = issueLifecyclePlan({
      current: ["issue:triage", "issue:blocked"],
    });
    expect(add).toEqual([]);
    expect(remove).toEqual(["issue:blocked"]);
  });
});
