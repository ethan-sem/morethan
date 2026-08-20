import { describe, expect, it } from "vitest";
import { resolveSitePage } from "./siteRouting.js";

describe("site hash routing", () => {
  const options = { careerCopilotEnabled: true, serviceIds: ["resume", "consulting"] };

  it("falls back to home for unknown or stale hashes", () => {
    expect(resolveSitePage("unknown-route", options)).toBe("home");
    expect(resolveSitePage("service-removed", options)).toBe("home");
  });

  it("keeps known pages and controlled service detail routes", () => {
    expect(resolveSitePage("career-copilot", options)).toBe("career-copilot");
    expect(resolveSitePage("service-resume", options)).toBe("service-resume");
  });

  it("returns home when the assistant feature is disabled", () => {
    expect(resolveSitePage("career-copilot", { ...options, careerCopilotEnabled: false })).toBe("home");
  });
});
