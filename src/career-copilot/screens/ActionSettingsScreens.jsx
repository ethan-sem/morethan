import { Check } from "lucide-react";
import { ScreenHeading } from "../components/CopilotChrome.jsx";
import { ConclusionSourceBadges } from "../components/ConclusionSourceBadges.jsx";

const ACTION_WINDOW_META = [
  ["48_hours", "48 小时", "先修复最影响判断的证据缺口"],
  ["7_days", "7 天", "形成可投递的证据与岗位组合"],
  ["30_days", "30 天", "用真实反馈复盘并校准策略"],
];

export function ActionsScreen({ actionPlan, completedIds = new Set(), onToggleComplete, conclusionProvenance, resumeFacts }) {
  if (!actionPlan) {
    return (
      <div className="copilot-actions-screen">
        <ScreenHeading number="07" eyebrow="YOUR ACTIONS" title="完成真实诊断后，再生成你的行动计划" text="示例报告不会生成个性化任务。上传或粘贴简历、确认事实并完成方向判断后，这里会展示最多 5 项行动。" />
        <div className="copilot-action-empty"><p>当前没有可执行的个性化行动计划。请返回“提交材料”开始真实诊断。</p></div>
      </div>
    );
  }

  const completedCount = actionPlan.items.filter((item) => completedIds.has(item.id)).length;
  return (
    <div className="copilot-actions-screen">
      <ScreenHeading number="07" eyebrow="NEXT 30 DAYS" title="把判断变成三个时间窗内的动作" text="行动由本次已确认事实、岗位缺口和投递分层共同触发；同时最多保留 5 项，每项都有产出物与可核验完成标准。" />
      <div className="copilot-action-summary" aria-label="行动计划摘要">
        <span><strong>{completedCount}/{actionPlan.summary.total}</strong> 已完成</span>
        <span><strong>{actionPlan.summary.totalEstimatedMinutes}</strong> 预计总分钟</span>
        <span>勾选状态仅保存在当前页面内存</span>
      </div>
      {ACTION_WINDOW_META.map(([window, label, description]) => {
        const items = actionPlan.items.filter((item) => item.window === window);
        return (
          <section className="copilot-action-window" key={window} aria-labelledby={`action-window-${window}`}>
            <header><div><small>TIME WINDOW</small><h2 id={`action-window-${window}`}>{label}</h2></div><p>{description} · {items.length} 项</p></header>
            <div className="copilot-task-list">
              {items.map((item) => {
                const completed = completedIds.has(item.id);
                return (
                  <article key={item.id} className={completed ? "is-complete" : ""}>
                    <span>{String(item.priority).padStart(2, "0")}</span>
                    <div className="copilot-task-content">
                      <small>{item.triggerRule}</small>
                      <ConclusionSourceBadges provenance={conclusionProvenance} targetType="action_item" targetId={item.id} facts={resumeFacts?.facts ?? []} />
                      <h3>{item.title}</h3>
                      <p>{item.why}</p>
                      <dl><div><dt>产出物</dt><dd>{item.deliverable}</dd></div></dl>
                      <details><summary>查看步骤与完成标准</summary><div className="copilot-task-details"><div><strong>执行步骤</strong><ol>{item.steps.map((step) => <li key={step}>{step}</li>)}</ol></div><div><strong>完成标准</strong><ul>{item.doneCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></div></div></details>
                    </div>
                    <b>{item.estimatedMinutes} 分钟</b>
                    <button type="button" aria-label={`${completed ? "取消完成" : "标记完成"}：${item.title}`} aria-pressed={completed} onClick={() => onToggleComplete?.(item.id)}><Check size={18} /></button>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="copilot-action-disclaimer">{actionPlan.disclaimer}</p>
    </div>
  );
}
