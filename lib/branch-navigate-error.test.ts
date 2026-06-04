import { describe, expect, it } from "vitest";
import { branchNavigateErrorKey } from "./branch-navigate-error";

describe("branchNavigateErrorKey", () => {
  it("maps missing model errors", () => {
    expect(branchNavigateErrorKey("No model selected")).toBe("branchNavigator.errorNoModel");
  });

  it("maps cancellation", () => {
    expect(branchNavigateErrorKey("navigate aborted")).toBe("branchNavigator.errorCancelled");
  });

  it("falls back to generic", () => {
    expect(branchNavigateErrorKey("network timeout")).toBe("branchNavigator.errorGeneric");
  });
});
