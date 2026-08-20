export const BYOK_SESSION_POLICY_VERSION = "1.0.0";
export const BYOK_KEY_MIN_LENGTH = 12;
export const BYOK_KEY_MAX_LENGTH = 512;

/**
 * Keeps a user-supplied key in a closure only. The secret is never exposed by
 * status, serialization or errors and can only be used through consume().
 */
export function createByokMemoryVault() {
  /** @type {string | null} */
  let secret = null;
  /** @type {"openai-compatible" | "anthropic-compatible" | "gemini-compatible" | null} */
  let provider = null;

  return Object.freeze({
    /** @param {unknown} providerId @param {unknown} apiKey */
    set(providerId, apiKey) {
      if (!isProviderId(providerId)) return { ok: false, code: "BYOK_PROVIDER_REQUIRED" };
      if (typeof apiKey !== "string") return { ok: false, code: "BYOK_KEY_REQUIRED" };
      const normalized = apiKey.trim();
      if (normalized.length < BYOK_KEY_MIN_LENGTH) return { ok: false, code: "BYOK_KEY_TOO_SHORT" };
      if (normalized.length > BYOK_KEY_MAX_LENGTH) return { ok: false, code: "BYOK_KEY_TOO_LONG" };
      secret = normalized;
      provider = providerId;
      return { ok: true, code: null };
    },
    clear() {
      secret = null;
      provider = null;
    },
    status() {
      return Object.freeze({ policyVersion: BYOK_SESSION_POLICY_VERSION, hasKey: secret !== null, provider });
    },
    /** @param {(credentials: { provider: string, apiKey: string }) => unknown | Promise<unknown>} callback */
    async consume(callback) {
      if (typeof callback !== "function") throw new ByokSessionError("BYOK_CONSUMER_REQUIRED");
      if (secret === null || provider === null) throw new ByokSessionError("BYOK_KEY_UNAVAILABLE");
      const currentSecret = secret;
      const currentProvider = provider;
      try { return await callback(Object.freeze({ provider: currentProvider, apiKey: currentSecret })); }
      finally {
        secret = null;
        provider = null;
      }
    },
    toJSON() {
      return { policyVersion: BYOK_SESSION_POLICY_VERSION, hasKey: secret !== null, provider };
    },
  });
}

export class ByokSessionError extends Error {
  /** @param {string} code */
  constructor(code) { super(code); this.name = "ByokSessionError"; this.code = code; }
}

/** @param {unknown} value */
function isProviderId(value) { return value === "openai-compatible" || value === "anthropic-compatible" || value === "gemini-compatible"; }
