import { describe, expect, it, vi } from "vitest";
import { CAREER_STORAGE_PREFIX, clearCareerCopilotBrowserData, createCareerSessionResourceRegistry } from "./careerSessionCleanup.js";

function memoryStorage(entries) {
  const data = new Map(entries);
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

describe("career session cleanup", () => {
  it("aborts active work, disposes resources and revokes tracked object URLs once", () => {
    const revokeObjectURL = vi.fn();
    const dispose = vi.fn();
    const registry = createCareerSessionResourceRegistry({ revokeObjectURL });
    const first = new AbortController();
    const second = new AbortController();
    registry.registerAbortController(first);
    registry.registerAbortController(second);
    registry.registerDisposer(dispose);
    registry.trackObjectUrl("blob:resume-preview");
    registry.trackObjectUrl("https://example.com/not-owned");
    expect(registry.snapshot()).toEqual({ controllers: 2, disposers: 1, objectUrls: 1 });

    expect(registry.clear()).toEqual({ aborted: 2, disposed: 1, revoked: 1 });
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:resume-preview");
    expect(registry.clear()).toEqual({ aborted: 0, disposed: 0, revoked: 0 });
  });

  it("removes only namespaced storage and cache data", async () => {
    const sessionStorage = memoryStorage([[`${CAREER_STORAGE_PREFIX}-flow-v1`, "private"], ["unrelated-session", "keep"]]);
    const localStorage = memoryStorage([[`${CAREER_STORAGE_PREFIX}-draft`, "private"], ["site-theme", "dark"]]);
    const cacheDelete = vi.fn().mockResolvedValue(true);
    const result = await clearCareerCopilotBrowserData({
      sessionStorage,
      localStorage,
      caches: { keys: vi.fn().mockResolvedValue([`${CAREER_STORAGE_PREFIX}-cache`, "brand-assets"]), delete: cacheDelete },
    });
    expect(result).toMatchObject({ sessionRemoved: 1, localRemoved: 1, cachesRemoved: 1, databasesRemoved: 0 });
    expect(sessionStorage.getItem(`${CAREER_STORAGE_PREFIX}-flow-v1`)).toBeNull();
    expect(localStorage.getItem(`${CAREER_STORAGE_PREFIX}-draft`)).toBeNull();
    expect(sessionStorage.getItem("unrelated-session")).toBe("keep");
    expect(localStorage.getItem("site-theme")).toBe("dark");
    expect(cacheDelete).toHaveBeenCalledWith(`${CAREER_STORAGE_PREFIX}-cache`);
  });

  it("deletes namespaced indexed databases without failing unsupported browsers", async () => {
    const deleted = [];
    const indexedDB = {
      databases: vi.fn().mockResolvedValue([{ name: `${CAREER_STORAGE_PREFIX}-reports` }, { name: "other-db" }]),
      deleteDatabase(name) {
        deleted.push(name);
        const request = {};
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    };
    const result = await clearCareerCopilotBrowserData({ indexedDB });
    expect(result.databasesRemoved).toBe(1);
    expect(deleted).toEqual([`${CAREER_STORAGE_PREFIX}-reports`]);
  });
});
