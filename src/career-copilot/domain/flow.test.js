import { describe, expect, it } from "vitest";
import { DEFAULT_FLOW_STATE, flowReducer, sanitizeFlowState } from "./flow.js";

describe("career copilot flow", () => {
  it("falls back safely when stored state is invalid", () => {
    expect(sanitizeFlowState({ step: "unknown", visited: ["bad"] })).toEqual(DEFAULT_FLOW_STATE);
  });

  it("moves forward and records visited steps", () => {
    const next = flowReducer(DEFAULT_FLOW_STATE, { type: "NEXT" });
    expect(next.step).toBe("material");
    expect(next.visited).toEqual(["intro", "material"]);
  });

  it("migrates the removed settings step to actions without preserving it in route state", () => {
    expect(sanitizeFlowState({ step: "settings", visited: ["intro", "actions", "settings"] })).toEqual({
      version: 1,
      step: "actions",
      visited: ["intro", "actions"],
    });
  });

  it("blocks unvisited jumps unless explicitly allowed", () => {
    const blocked = flowReducer(DEFAULT_FLOW_STATE, { type: "NAVIGATE", step: "report" });
    const example = flowReducer(DEFAULT_FLOW_STATE, { type: "NAVIGATE", step: "report", allowUnvisited: true });
    expect(blocked.step).toBe("intro");
    expect(example.step).toBe("report");
  });

  it("resets to a fresh flow", () => {
    const state = { version: 1, step: "goals", visited: ["intro", "material", "facts", "goals"] };
    expect(flowReducer(state, { type: "RESET" })).toEqual(DEFAULT_FLOW_STATE);
  });
});

