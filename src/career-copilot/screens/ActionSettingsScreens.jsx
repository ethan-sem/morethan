import { useEffect, useRef, useState } from "react";
import { Beaker, BriefcaseBusiness, Check, FileText, KeyRound, LockKeyhole, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { ScreenHeading } from "../components/CopilotChrome.jsx";
import { ConclusionSourceBadges } from "../components/ConclusionSourceBadges.jsx";

const ACTION_WINDOW_META = [
  ["48_hours", "48 小时", "先修复最影响判断的证据缺口"],
  ["7_days", "7 天", "形成可投递的证据与岗位组合"],
  ["30_days", "30 天", "用真实反馈复盘并校准策略"],
];

export function ActionsScreen({ actionPlan, completedIds = new Set(), onToggleComplete, conclusionProvenance, resumeFacts, onSettings }) {
  if (!actionPlan) {
    return (
      <div className="copilot-actions-screen">
        <ScreenHeading number="07" eyebrow="YOUR ACTIONS" title="完成真实诊断后，再生成你的行动计划" text="示例报告不会生成个性化任务。上传或粘贴简历、确认事实并完成方向判断后，这里会展示最多 5 项行动。" />
        <div className="copilot-action-empty"><p>当前没有可执行的个性化行动计划。</p><button type="button" className="copilot-secondary" onClick={onSettings}><LockKeyhole size={16} />数据与设置</button></div>
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
      <div className="copilot-actions-footer"><button type="button" className="copilot-secondary" onClick={onSettings}><LockKeyhole size={16} />数据与设置</button></div>
    </div>
  );
}

export function SettingsScreen({ onReset, byok = { available: false } }) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const cancelButtonRef = useRef(null);
  const clearButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const clearingRef = useRef(false);

  useEffect(() => {
    if (!confirming) return undefined;
    const returnFocusTo = clearButtonRef.current;
    cancelButtonRef.current?.focus();
    const dialog = dialogRef.current;
    const keepFocusInside = (event) => {
      if (event.key === "Escape" && !clearingRef.current) {
        event.preventDefault();
        setConfirming(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", keepFocusInside);
    return () => {
      dialog?.removeEventListener("keydown", keepFocusInside);
      returnFocusTo?.focus();
    };
  }, [confirming]);
  const openConfirmation = () => setConfirming(true);
  const confirmClear = async () => {
    if (clearing) return;
    clearingRef.current = true;
    setClearing(true);
    await onReset();
  };

  return (
    <div className="copilot-settings-screen">
      <ScreenHeading number="08" eyebrow="YOUR DATA" title="本次资料，只在当前页面处理" text="当前版本没有账号和云端档案；原始文件和报告不会写入浏览器持久化存储。" />
      <div className="copilot-settings-list">
        <article><div><FileText size={20} /><span><strong>原始简历</strong><small>只在当前页面内存中处理，刷新即清除</small></span></div><button type="button" disabled>不保存</button></article>
        <article><div><BriefcaseBusiness size={20} /><span><strong>结构化职业档案</strong><small>MVP 不创建云端档案或历史报告</small></span></div><button type="button" disabled>不保存</button></article>
        <article><div><ShieldCheck size={20} /><span><strong>流程位置</strong><small>本次浏览会话仅保存当前步骤和已访问步骤</small></span></div><button type="button" disabled>会话结束清除</button></article>
      </div>
      {byok.available && <ByokExperiment byok={byok} />}
      <div className="copilot-danger-zone"><div><strong>一键清除本次数据</strong><p>清除简历、事实、JD、分析报告、行动状态和流程位置，同时停止仍在运行的本地解析。</p></div><button ref={clearButtonRef} type="button" onClick={openConfirmation}>清除本次数据</button></div>
      <p className="copilot-clear-boundary"><ShieldCheck size={15} />已复制到剪贴板或由你保存到设备上的 PDF 不受网页控制，需要你自行管理。</p>
      {confirming && <div className="copilot-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !clearing) setConfirming(false); }}>
        <section ref={dialogRef} className="copilot-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-dialog-title" aria-describedby="clear-dialog-description">
          <button type="button" className="copilot-confirm-close" aria-label="关闭清除确认" disabled={clearing} onClick={() => setConfirming(false)}><X size={17} /></button>
          <ShieldAlert size={30} />
          <p className="copilot-eyebrow">IRREVERSIBLE ACTION</p>
          <h2 id="clear-dialog-title">确认清除本次所有数据？</h2>
          <p id="clear-dialog-description">清除后将返回开始页，当前简历文本、已确认事实、JD、分析报告和行动状态无法恢复。正在运行的解析会立即停止。</p>
          <ul><li>清除当前页面内存与临时文件引用</li><li>终止本次解析和事实提取 Worker</li><li>清除求职助手命名空间下的浏览器数据</li></ul>
          <div><button ref={cancelButtonRef} type="button" className="copilot-secondary" disabled={clearing} onClick={() => setConfirming(false)}>取消，保留数据</button><button type="button" className="copilot-danger-confirm" disabled={clearing} onClick={confirmClear}>{clearing ? "正在清除…" : "确认清除且不可恢复"}</button></div>
        </section>
      </div>}
    </div>
  );
}

function ByokExperiment({ byok }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [provider, setProvider] = useState(byok.provider ?? "openai-compatible");
  const [draftKey, setDraftKey] = useState("");
  const [error, setError] = useState("");

  const saveKey = () => {
    const result = byok.onStoreKey?.(provider, draftKey);
    if (!result?.ok) {
      setError(result?.code === "BYOK_KEY_TOO_SHORT" ? "密钥长度过短，请核对后重试。" : result?.code === "BYOK_KEY_TOO_LONG" ? "密钥长度超出安全上限。" : "请输入有效的自有 API 密钥。");
      return;
    }
    setDraftKey("");
    setError("");
  };

  if (!byok.active) return (
    <section className="copilot-byok-panel" aria-labelledby="byok-title">
      <div className="copilot-byok-head"><Beaker size={21} /><div><p className="copilot-eyebrow">OPTIONAL EXPERIMENT</p><h2 id="byok-title">BYOK 自备密钥实验模式</h2></div><span>默认关闭</span></div>
      <p>本地规则版始终完整可用。当前实验只建立安全的临时密钥会话，不会发起模型请求，也不会提升或改变本次报告。</p>
      <label className="copilot-byok-consent"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>我理解：密钥只驻留当前页面内存；未来如主动调用模型，所选内容将直接发送给相应供应商并受其条款约束。</span></label>
      <button type="button" className="copilot-secondary" disabled={!acknowledged} onClick={byok.onEnable}><KeyRound size={16} />主动开启实验模式</button>
    </section>
  );

  return (
    <section className="copilot-byok-panel is-active" aria-labelledby="byok-title">
      <div className="copilot-byok-head"><KeyRound size={21} /><div><p className="copilot-eyebrow">MEMORY-ONLY KEY</p><h2 id="byok-title">BYOK 实验模式已开启</h2></div><span>仅当前页面</span></div>
      <div className="copilot-byok-warning"><ShieldAlert size={17} /><p><strong>当前不会发送任何材料。</strong>密钥不会写入存储、URL、日志或埋点；刷新、关闭、一键清除或主动关闭实验模式后即失效。</p></div>
      <div className="copilot-byok-fields">
        <label htmlFor="copilot-byok-provider"><span>兼容供应商类型</span><select id="copilot-byok-provider" value={provider} disabled={byok.hasKey} onChange={(event) => setProvider(event.target.value)}><option value="openai-compatible">OpenAI 兼容 API</option><option value="anthropic-compatible">Anthropic 兼容 API</option><option value="gemini-compatible">Gemini 兼容 API</option></select></label>
        <label htmlFor="copilot-byok-key"><span>自有 API 密钥</span><input id="copilot-byok-key" type="password" autoComplete="new-password" aria-invalid={Boolean(error)} aria-describedby={error ? "copilot-byok-error" : undefined} value={draftKey} disabled={byok.hasKey} onChange={(event) => { setDraftKey(event.target.value); setError(""); }} placeholder={byok.hasKey ? "密钥已在内存中就绪" : "仅在当前页面内存中保存"} /></label>
      </div>
      {error && <p id="copilot-byok-error" className="copilot-byok-error" role="alert">{error}</p>}
      <div className="copilot-byok-actions">{byok.hasKey ? <><p role="status"><ShieldCheck size={15} />密钥已临时保存；页面不会显示或导出密钥内容。</p><button type="button" className="copilot-secondary" onClick={byok.onClearKey}>清除临时密钥</button></> : <button type="button" className="copilot-primary" disabled={!draftKey.trim()} onClick={saveKey}>临时保存到内存</button>}<button type="button" className="copilot-link" onClick={byok.onDisable}>关闭实验模式</button></div>
    </section>
  );
}
