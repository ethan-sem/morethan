import { DEFAULT_FLOW_STATE, sanitizeFlowState } from "../domain/flow.js";
import { CAREER_FLOW_STORAGE_KEY, validateCareerPersistenceEntry } from "../privacy/persistencePolicy.js";

export const FLOW_STORAGE_KEY = CAREER_FLOW_STORAGE_KEY;
const LEGACY_STORAGE_KEY = "morethan-career-copilot-prototype";

/** @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null} storage */
export function createFlowSessionStore(storage) {
  return {
    load() {
      if (!storage) return sanitizeFlowState(DEFAULT_FLOW_STATE);
      try {
        const stored = storage.getItem(FLOW_STORAGE_KEY);
        return stored ? sanitizeFlowState(JSON.parse(stored)) : sanitizeFlowState(DEFAULT_FLOW_STATE);
      } catch {
        return sanitizeFlowState(DEFAULT_FLOW_STATE);
      }
    },
    /** @param {import("../domain/flow.js").FlowState} state */
    save(state) {
      if (!storage) return false;
      try {
        const safeState = sanitizeFlowState(state);
        const serialized = JSON.stringify(safeState);
        if (!validateCareerPersistenceEntry("sessionStorage", FLOW_STORAGE_KEY, serialized).valid) return false;
        storage.setItem(FLOW_STORAGE_KEY, serialized);
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      if (!storage) return false;
      try {
        storage.removeItem(FLOW_STORAGE_KEY);
        storage.removeItem(LEGACY_STORAGE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function getBrowserFlowSessionStore() {
  if (typeof window === "undefined") return createFlowSessionStore(null);
  return createFlowSessionStore(window.sessionStorage);
}
