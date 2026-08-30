export const FLOW_STEPS = Object.freeze([
  { id: "intro", label: "开始" },
  { id: "material", label: "提交材料" },
  { id: "facts", label: "确认事实" },
  { id: "goals", label: "求职目标" },
  { id: "questions", label: "关键追问" },
  { id: "generating", label: "生成诊断" },
  { id: "report", label: "诊断报告" },
  { id: "actions", label: "行动计划" },
]);

const STEP_IDS = new Set(FLOW_STEPS.map(({ id }) => id));
/** @type {Readonly<Record<string, string>>} */
const LEGACY_STEP_REDIRECTS = Object.freeze({ settings: "actions" });

export const DEFAULT_FLOW_STATE = Object.freeze({
  version: 1,
  step: "intro",
  visited: ["intro"],
});

/**
 * @typedef {{ version: number, step: string, visited: string[] }} FlowState
 * @typedef {{ type: "NEXT" | "BACK" | "RESET" } | { type: "NAVIGATE", step: string, allowUnvisited?: boolean }} FlowAction
 */

/** @param {unknown} value @returns {value is string} */
export function isFlowStep(value) {
  return typeof value === "string" && STEP_IDS.has(value);
}

/** @param {unknown} value @returns {FlowState} */
export function sanitizeFlowState(value) {
  if (!value || typeof value !== "object") return { ...DEFAULT_FLOW_STATE, visited: ["intro"] };

  const candidate = /** @type {{ step?: unknown, visited?: unknown }} */ (value);

  const migratedStep = typeof candidate.step === "string" ? LEGACY_STEP_REDIRECTS[candidate.step] : undefined;
  const step = isFlowStep(candidate.step) ? candidate.step : migratedStep ?? "intro";
  const visited = Array.isArray(candidate.visited)
    ? candidate.visited
      .map((item) => typeof item === "string" ? LEGACY_STEP_REDIRECTS[item] ?? item : item)
      .filter((item, index, items) => isFlowStep(item) && items.indexOf(item) === index)
    : [];

  if (!visited.includes("intro")) visited.unshift("intro");
  if (!visited.includes(step)) visited.push(step);

  return { version: 1, step, visited };
}

/** @param {string} step */
export function getFlowIndex(step) {
  const index = FLOW_STEPS.findIndex((item) => item.id === step);
  return index < 0 ? 0 : index;
}

/** @param {FlowState} state @param {FlowAction} action @returns {FlowState} */
export function flowReducer(state, action) {
  const current = sanitizeFlowState(state);
  const currentIndex = getFlowIndex(current.step);

  switch (action.type) {
    case "NEXT":
      return navigateTo(current, FLOW_STEPS[Math.min(currentIndex + 1, FLOW_STEPS.length - 1)].id);
    case "BACK":
      return navigateTo(current, FLOW_STEPS[Math.max(currentIndex - 1, 0)].id);
    case "NAVIGATE":
      return canNavigate(current, action.step, action.allowUnvisited) ? navigateTo(current, action.step) : current;
    case "RESET":
      return { ...DEFAULT_FLOW_STATE, visited: ["intro"] };
    default:
      return current;
  }
}

/** @param {FlowState} state @param {string} step @param {boolean} allowUnvisited */
function canNavigate(state, step, allowUnvisited = false) {
  if (!isFlowStep(step)) return false;
  if (allowUnvisited || state.visited.includes(step)) return true;

  const targetIndex = getFlowIndex(step);
  const currentIndex = getFlowIndex(state.step);
  return targetIndex === currentIndex + 1;
}

/** @param {FlowState} state @param {string} step @returns {FlowState} */
function navigateTo(state, step) {
  if (!isFlowStep(step)) return state;
  return {
    ...state,
    step,
    visited: state.visited.includes(step) ? state.visited : [...state.visited, step],
  };
}
