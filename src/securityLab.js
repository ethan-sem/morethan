/**
 * Opt-in release-security probe. It records only aggregate violation/error
 * counts and directive names; it never reads user inputs, storage, or URLs.
 */
export function startSecurityLab() {
  if (document.getElementById("morethan-security-lab")) return;
  const output = document.createElement("output");
  output.id = "morethan-security-lab";
  output.hidden = true;
  output.dataset.status = "active";
  output.dataset.cspViolations = "0";
  output.dataset.runtimeErrors = "0";
  output.dataset.directives = "none";
  document.body.append(output);

  const directives = new Set();
  window.addEventListener("securitypolicyviolation", (event) => {
    output.dataset.cspViolations = String(Number(output.dataset.cspViolations) + 1);
    if (event.effectiveDirective) directives.add(event.effectiveDirective);
    output.dataset.directives = [...directives].sort().join(",") || "none";
  });
  window.addEventListener("error", () => {
    output.dataset.runtimeErrors = String(Number(output.dataset.runtimeErrors) + 1);
  });
  window.addEventListener("unhandledrejection", () => {
    output.dataset.runtimeErrors = String(Number(output.dataset.runtimeErrors) + 1);
  });
}
