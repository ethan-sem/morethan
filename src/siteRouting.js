const CORE_PAGE_IDS = Object.freeze(["home", "services", "proof", "community", "about", "contact", "career-copilot"]);

export function resolveSitePage(requestedPage, { careerCopilotEnabled = true, hiddenPageIds = [], serviceIds = [] } = {}) {
  const requested = requestedPage || "home";
  const knownPages = new Set([...CORE_PAGE_IDS, ...serviceIds.map((id) => `service-${id}`)]);
  if (!knownPages.has(requested)) return "home";
  if (hiddenPageIds.includes(requested)) return "home";
  if (!careerCopilotEnabled && requested === "career-copilot") return "home";
  return requested;
}

