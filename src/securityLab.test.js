import { beforeEach, describe, expect, it } from "vitest";
import { startSecurityLab } from "./securityLab.js";

describe("release security lab", () => {
  beforeEach(() => document.getElementById("morethan-security-lab")?.remove());

  it("exposes aggregate-only CSP and runtime counters", () => {
    startSecurityLab();
    const output = document.getElementById("morethan-security-lab");
    expect(output).toHaveAttribute("hidden");
    expect({ ...output.dataset }).toEqual({ status: "active", cspViolations: "0", runtimeErrors: "0", directives: "none" });

    const event = new Event("securitypolicyviolation");
    Object.defineProperty(event, "effectiveDirective", { value: "connect-src" });
    window.dispatchEvent(event);
    expect(output.dataset.cspViolations).toBe("1");
    expect(output.dataset.directives).toBe("connect-src");
  });
});
