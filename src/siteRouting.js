const CORE_PAGE_IDS = Object.freeze(["home", "services", "proof", "community", "game", "about", "contact", "career-copilot"]);

export function resolveSitePage(requestedPage, { careerCopilotEnabled = true, serviceIds = [] } = {}) {
  const requested = requestedPage || "home";
  const knownPages = new Set([...CORE_PAGE_IDS, ...serviceIds.map((id) => `service-${id}`)]);
  if (!knownPages.has(requested)) return "home";
  if (!careerCopilotEnabled && requested === "career-copilot") return "home";
  return requested;
}

