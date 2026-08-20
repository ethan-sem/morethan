import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

// JSDOM does not implement DOMMatrix; PDF.js only needs the browser primitive
// to exist while its display API module is evaluated in this dependency probe.
if (!("DOMMatrix" in globalThis)) {
  Object.defineProperty(globalThis, "DOMMatrix", {
    configurable: true,
    value: class DOMMatrixMock {},
  });
}
