import { describe, expect, it } from "vitest";
import { createFlowSessionStore, FLOW_STORAGE_KEY } from "./sessionStore.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

describe("flow session store", () => {
  it("stores only the sanitized navigation state", () => {
    const storage = memoryStorage();
    const store = createFlowSessionStore(storage);
    store.save({ step: "facts", visited: ["intro", "material", "facts"], resumeName: "private.pdf" });

    const raw = storage.getItem(FLOW_STORAGE_KEY);
    expect(raw).not.toContain("private.pdf");
    expect(store.load().step).toBe("facts");
  });

  it("recovers from unavailable storage", () => {
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(createFlowSessionStore(broken).load().step).toBe("intro");
  });

  it("clears the current flow", () => {
    const storage = memoryStorage();
    const store = createFlowSessionStore(storage);
    store.save({ step: "material", visited: ["intro", "material"] });
    expect(store.clear()).toBe(true);
    expect(storage.getItem(FLOW_STORAGE_KEY)).toBeNull();
  });
});

