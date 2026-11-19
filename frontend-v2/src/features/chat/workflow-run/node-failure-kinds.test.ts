import { describe, expect, it } from "vitest";
import { interactiveSessionScenario } from "./node-failure-kinds";

describe("interactiveSessionScenario", () => {
  it("classifies a reattached checkout Node no longer knows on a first turn", () => {
    expect(
      interactiveSessionScenario(
        "Node no longer knows the run's checkout; resuming from the failure starts the node on a fresh clone",
      ),
    ).toBe("checkout_unknown");
  });

  it("classifies a checkout that no longer exists on a later turn", () => {
    expect(
      interactiveSessionScenario(
        "the run's checkout no longer exists, so the node's conversation cannot continue",
      ),
    ).toBe("workspace_gone");
  });

  it("classifies a session setup the agent refused", () => {
    expect(
      interactiveSessionScenario(
        "Node refused the Agent session on the run's directory: checkout_unavailable",
      ),
    ).toBe("setup_refused");
    expect(
      interactiveSessionScenario("the Agent session could not be set up: session_binding_rejected"),
    ).toBe("setup_refused");
  });

  it("falls back for anything else", () => {
    expect(interactiveSessionScenario("")).toBe("other");
    expect(interactiveSessionScenario("some other failure")).toBe("other");
  });
});
