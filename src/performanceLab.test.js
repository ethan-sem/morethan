import { afterEach, describe, expect, it, vi } from "vitest";
import { startPerformanceLab } from "./performanceLab.js";

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("performance lab", () => {
  it("stays opt-in and exposes only aggregate browser timing values", async () => {
    vi.useFakeTimers();
    startPerformanceLab();
    await vi.advanceTimersByTimeAsync(2_500);

    const output = document.getElementById("morethan-performance-lab");
    expect(output).toBeInstanceOf(HTMLOutputElement);
    expect(output).toHaveAttribute("hidden");
    expect(output.dataset).toMatchObject({ status: "ready", cls: "0.0000", inp: "0", longTasks: "0" });
    expect(Object.keys(output.dataset)).not.toContain(expect.stringMatching(/resume|jd|text|storage|url/i));
  });
});
