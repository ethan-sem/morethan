/** @param {string | undefined} value @param {boolean} fallback */
function envFlag(value, fallback) {
  if (value === undefined) return fallback;
  return value === "true";
}

export const careerCopilotFeatures = Object.freeze({
  enabled: envFlag(import.meta.env.VITE_COPILOT_ENABLED, true),
  localResumeParsing: envFlag(import.meta.env.VITE_COPILOT_LOCAL_PARSING, true),
  jdAnalysis: envFlag(import.meta.env.VITE_COPILOT_JD_ANALYSIS, true),
  reportPrinting: envFlag(import.meta.env.VITE_COPILOT_REPORT_PRINTING, true),
  bringYourOwnKey: envFlag(import.meta.env.VITE_COPILOT_BYOK, false),
});
