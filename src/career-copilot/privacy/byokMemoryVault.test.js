import { describe, expect, it, vi } from "vitest";
import { ByokSessionError, createByokMemoryVault } from "./byokMemoryVault.js";

const SECRET = "sk-user-owned-secret-123456";

describe("BYOK memory vault", () => {
  it("accepts a supported provider and exposes only non-secret status", () => {
    const vault = createByokMemoryVault();
    expect(vault.set("openai-compatible", SECRET)).toEqual({ ok: true, code: null });
    expect(vault.status()).toMatchObject({ hasKey: true, provider: "openai-compatible" });
    expect(JSON.stringify(vault)).not.toContain(SECRET);
  });

  it("rejects invalid input with codes that never contain the key", () => {
    const vault = createByokMemoryVault();
    const result = vault.set("openai-compatible", "short");
    expect(result).toEqual({ ok: false, code: "BYOK_KEY_TOO_SHORT" });
    expect(JSON.stringify(result)).not.toContain("short");
  });

  it("clears the secret explicitly", async () => {
    const vault = createByokMemoryVault();
    vault.set("anthropic-compatible", SECRET);
    vault.clear();
    expect(vault.status()).toMatchObject({ hasKey: false, provider: null });
    await expect(vault.consume(vi.fn())).rejects.toEqual(expect.objectContaining({ code: "BYOK_KEY_UNAVAILABLE" }));
  });

  it("makes the key available to one consumer and clears it even on failure", async () => {
    const vault = createByokMemoryVault();
    vault.set("gemini-compatible", SECRET);
    await expect(vault.consume(({ provider, apiKey }) => {
      expect(provider).toBe("gemini-compatible");
      expect(apiKey).toBe(SECRET);
      throw new Error("provider failed");
    })).rejects.toThrow("provider failed");
    expect(vault.status().hasKey).toBe(false);
  });

  it("rejects direct consumption without a callback", async () => {
    const vault = createByokMemoryVault();
    vault.set("openai-compatible", SECRET);
    await expect(vault.consume()).rejects.toBeInstanceOf(ByokSessionError);
  });
});
