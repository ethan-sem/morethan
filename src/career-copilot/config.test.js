import { describe, expect, it } from "vitest";
import { careerCopilotFeatures } from "./config.js";

describe("career copilot feature flags", () => {
  it("keeps optional BYOK disabled by default", () => {
    expect(careerCopilotFeatures.bringYourOwnKey).toBe(false);
  });

  it("exposes the MVP capabilities independently", () => {
    expect(careerCopilotFeatures).toMatchObject({
      enabled: true,
      localResumeParsing: true,
      jdAnalysis: true,
      reportPrinting: true,
    });
  });
});
