import { useCallback, useEffect, useReducer, useRef } from "react";
import { flowReducer } from "../domain/flow.js";
import { getBrowserFlowSessionStore } from "../lib/sessionStore.js";

export function useCareerFlow() {
  const [state, dispatch] = useReducer(flowReducer, undefined, () => getBrowserFlowSessionStore().load());
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      getBrowserFlowSessionStore().clear();
      return;
    }
    getBrowserFlowSessionStore().save(state);
  }, [state]);

  const navigate = useCallback((step, options = {}) => {
    dispatch({ type: "NAVIGATE", step, allowUnvisited: options.allowUnvisited === true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);
  const reset = useCallback(() => {
    skipNextSaveRef.current = true;
    getBrowserFlowSessionStore().clear();
    dispatch({ type: "RESET" });
  }, []);

  return { state, navigate, next, back, reset };
}
