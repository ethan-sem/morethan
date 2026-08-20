import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "tmp/parser-probe",
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/career-copilot/parsers/dependencyProbe.js"),
      formats: ["es"],
      fileName: "dependency-probe",
    },
  },
});

