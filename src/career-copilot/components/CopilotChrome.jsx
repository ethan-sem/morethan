import { ArrowLeft, Bot, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { FLOW_STEPS, getFlowIndex } from "../domain/flow.js";

export function CopilotHeader({ onExit }) {
  return (
    <header className="copilot-local-nav">
      <button type="button" className="copilot-back-brand" onClick={onExit}>
        <ArrowLeft size={17} />返回 MoreThan
      </button>
      <div className="copilot-product-name"><Bot size={18} /><span>智能求职助手</span><small>MVP</small></div>
      <div className="copilot-trust"><ShieldCheck size={16} />完整免费 · 浏览器本地处理</div>
    </header>
  );
}

export function CopilotProgress({ state, onNavigate }) {
  const currentIndex = getFlowIndex(state.step);
  return (
    <nav className="copilot-progress" aria-label="智能求职助手流程">
      <div className="copilot-progress-line"><i style={{ width: `${(currentIndex / (FLOW_STEPS.length - 1)) * 100}%` }} /></div>
      {FLOW_STEPS.slice(1).map((step, index) => {
        const stepIndex = index + 1;
        const stateClass = stepIndex === currentIndex ? "is-current" : stepIndex < currentIndex ? "is-complete" : "";
        const isVisited = state.visited.includes(step.id);
        return (
          <button
            type="button"
            key={step.id}
            className={stateClass}
            onClick={() => isVisited && onNavigate(step.id)}
            disabled={!isVisited}
            aria-current={stepIndex === currentIndex ? "step" : undefined}
          >
            <span>{stepIndex < currentIndex ? <Check size={13} /> : String(stepIndex).padStart(2, "0")}</span>
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}

export function CopilotFooter({ onBack }) {
  return (
    <footer className="copilot-footer-actions">
      <button type="button" className="copilot-secondary" onClick={onBack}><ArrowLeft size={16} />上一步</button>
      <p><LockKeyhole size={15} />仅保存流程位置，不保存简历内容或文件名</p>
    </footer>
  );
}

export function ScreenHeading({ number, eyebrow, title, text }) {
  return (
    <div className="copilot-screen-heading">
      <span>{number}</span>
      <div><p>{eyebrow}</p><h1>{title}</h1>{text && <small>{text}</small>}</div>
    </div>
  );
}

