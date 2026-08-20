import { useState } from "react";
import { AlertTriangle, Ban, Check, CircleHelp, FileText, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { FACT_CATEGORY_LABELS, FACT_FORM_FIELDS, createBlankFactDraft, factToFormValues, formValuesToFactData, formatFactSummary, getMaskedFactSourceExcerpt } from "../domain/factReviewForm.js";
import { getFactReviewGuidance } from "../domain/factReviewGuidance.js";
import { addResumeFact, completeResumeFactsReview, deleteResumeFact, getResumeFactsReviewProgress, setFactReviewStatus, setTimelineFlagStatus, updateResumeFactData } from "../domain/resumeFactsReview.js";

const CATEGORY_ORDER = ["education", "internship", "project", "campus", "skill", "certification", "achievement"];
const CONFIDENCE_LABELS = { high: "高置信", medium: "中置信", low: "低置信" };
const REVIEW_LABELS = { pending: "待确认", confirmed: "已确认", excluded: "不参与分析", uncertain: "无法确认" };
const TIMELINE_MESSAGES = {
  date_missing: "没有识别到日期，请通过“修改”补充或确认是否确实未提供。",
  date_invalid: "原文中存在无法成立的日期，请核对月份或日期。",
  date_conflict: "开始时间晚于结束时间，请核对起止顺序。",
  date_overlap: "两条同类经历的时间存在重叠，请确认是否为并行经历。",
};

export function FactReviewWorkspace({ resumeFacts, resumeText, onChange, onComplete }) {
  const [showAdd, setShowAdd] = useState(false);
  const [addCategory, setAddCategory] = useState("education");
  const [error, setError] = useState("");

  if (!resumeFacts) {
    return <div className="copilot-facts-empty" role="alert"><FileText size={24} /><strong>本次页面内没有可确认的简历事实</strong><p>请返回“提交材料”重新读取简历。刷新或关闭页面后，内存中的材料不会保留。</p></div>;
  }

  const progress = getResumeFactsReviewProgress(resumeFacts);
  const canComplete = progress.pending === 0 && progress.confirmed > 0;
  const groups = CATEGORY_ORDER.map((category) => ({ category, facts: resumeFacts.facts.filter((fact) => fact.category === category) })).filter((group) => group.facts.length);

  const apply = (operation) => {
    try {
      const next = operation();
      onChange(next);
      setError("");
      return true;
    } catch (operationError) {
      setError(reviewErrorMessage(operationError));
      return false;
    }
  };

  const finish = () => {
    try {
      const completed = completeResumeFactsReview(resumeFacts);
      onChange(completed);
      onComplete(completed);
    } catch (operationError) {
      setError(reviewErrorMessage(operationError));
    }
  };

  return (
    <div className="copilot-facts-workspace">
      <section className="copilot-review-summary" aria-label="事实确认进度">
        <div><span>{progress.total}</span><small>全部事实</small></div>
        <div className="is-confirmed"><span>{progress.confirmed}</span><small>已确认</small></div>
        <div className="is-pending"><span>{progress.pending}</span><small>待处理</small></div>
        <div><span>{progress.excluded + progress.uncertain}</span><small>不进入分析</small></div>
        <button type="button" className="copilot-secondary" onClick={() => setShowAdd((current) => !current)}><Plus size={16} />新增事实</button>
      </section>

      {resumeFacts.timelineFlags.length > 0 && <TimelineNotice flags={resumeFacts.timelineFlags} facts={resumeFacts.facts} onStatus={(flagId, status) => apply(() => setTimelineFlagStatus(resumeFacts, flagId, status))} />}

      {showAdd && (
        <section className="copilot-add-fact" aria-label="新增事实">
          <div className="copilot-add-fact-head">
            <div><small>ADD VERIFIED DETAIL</small><h2>补充简历中没有识别到的事实</h2></div>
            <button type="button" aria-label="关闭新增事实" onClick={() => setShowAdd(false)}><X size={18} /></button>
          </div>
          <label>事实类型
            <select value={addCategory} onChange={(event) => setAddCategory(event.target.value)}>
              {CATEGORY_ORDER.map((category) => <option key={category} value={category}>{FACT_CATEGORY_LABELS[category]}</option>)}
            </select>
          </label>
          <FactEditor
            key={addCategory}
            fact={createBlankFactDraft(addCategory)}
            submitLabel="保存新增事实"
            onCancel={() => setShowAdd(false)}
            onSave={(data) => {
              const saved = apply(() => addResumeFact(resumeFacts, { category: addCategory, data }));
              if (saved) setShowAdd(false);
              return saved;
            }}
          />
        </section>
      )}

      {groups.length ? groups.map((group) => (
        <section className="copilot-fact-group" key={group.category} aria-labelledby={`fact-group-${group.category}`}>
          <header><h2 id={`fact-group-${group.category}`}>{FACT_CATEGORY_LABELS[group.category]}</h2><span>{group.facts.length} 条</span></header>
          <div className="copilot-fact-list">
            {group.facts.map((fact, index) => (
              <FactReviewCard
                key={fact.id}
                fact={fact}
                number={resumeFacts.facts.indexOf(fact) + 1 || index + 1}
                resumeText={resumeText}
                privateFields={resumeFacts.privateFields}
                onStatus={(status) => apply(() => setFactReviewStatus(resumeFacts, fact.id, status))}
                onSave={(data) => apply(() => updateResumeFactData(resumeFacts, fact.id, data))}
                onDelete={() => apply(() => deleteResumeFact(resumeFacts, fact.id))}
              />
            ))}
          </div>
        </section>
      )) : <div className="copilot-facts-empty"><strong>还没有事实</strong><p>可以使用“新增事实”补充至少一条真实经历。</p></div>}

      {error && <div className="copilot-review-error" role="alert">{error}</div>}
      <div className="copilot-review-completion">
        <p>{progress.pending > 0 ? `还有 ${progress.pending} 条事实需要确认或排除。` : progress.confirmed === 0 ? "至少确认一条事实后才能继续。" : `将使用 ${progress.confirmed} 条已确认事实进入后续分析。`}</p>
        <button type="button" className="copilot-primary" disabled={!canComplete} onClick={finish}>完成事实确认 <Check size={17} /></button>
      </div>
    </div>
  );
}

function FactReviewCard({ fact, number, resumeText, privateFields, onStatus, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const source = fact.sourceRefs[0];
  const sourceMeta = source ? [source.section, source.page ? `PDF 第 ${source.page} 页` : null].filter(Boolean).join(" · ") : "用户手动新增";
  const guidance = getFactReviewGuidance(fact);

  if (editing) {
    return (
      <article className="copilot-fact-card is-editing">
        <span>F{String(number).padStart(2, "0")}</span>
        <div className="copilot-fact-editor-wrap">
          <small>{FACT_CATEGORY_LABELS[fact.category]} · 修改后需重新确认</small>
          <FactEditor fact={fact} submitLabel="保存修改" onCancel={() => setEditing(false)} onSave={(data) => {
            const saved = onSave(data);
            if (saved) setEditing(false);
            return saved;
          }} />
        </div>
      </article>
    );
  }

  return (
    <article className={`copilot-fact-card is-${fact.review.status}${guidance.needsAttention ? " needs-attention" : ""}`}>
      <span>F{String(number).padStart(2, "0")}</span>
      <div className="copilot-fact-content">
        <div className="copilot-fact-title"><small>{FACT_CATEGORY_LABELS[fact.category]} · {sourceMeta}</small><strong>{formatFactSummary(fact)}</strong></div>
        <blockquote><FileText size={15} /><span>{getMaskedFactSourceExcerpt(resumeText, fact, privateFields)}</span></blockquote>
        {guidance.needsAttention && <div className="copilot-fact-guidance" role="note"><CircleHelp size={16} /><div><strong>{guidance.title}</strong><p>{guidance.description}</p>{guidance.missing.length > 0 && <small>建议补充：{guidance.missing.join("、")}</small>}</div></div>}
        <div className="copilot-inline-actions">
          {fact.review.status === "pending" && <button type="button" className="is-confirm" onClick={() => onStatus("confirmed")}><Check size={15} />正确</button>}
          {fact.review.status === "confirmed" && <button type="button" className="is-confirm is-active" disabled><Check size={15} />已确认</button>}
          {fact.review.status === "excluded" || fact.review.status === "uncertain" ? <button type="button" onClick={() => onStatus("pending")}><RotateCcw size={15} />恢复待确认</button> : <button type="button" onClick={() => onStatus("excluded")}><Ban size={15} />不参与分析</button>}
          {fact.review.status === "pending" && <button type="button" className="is-uncertain" onClick={() => onStatus("uncertain")}><CircleHelp size={15} />无法确认</button>}
          <button type="button" onClick={() => setEditing(true)}><Pencil size={15} />修改</button>
          {!deletePending ? <button type="button" className="is-delete" onClick={() => setDeletePending(true)}><Trash2 size={15} />删除</button> : <span className="copilot-delete-confirm">确认删除？ <button type="button" onClick={onDelete}>删除</button><button type="button" onClick={() => setDeletePending(false)}>取消</button></span>}
        </div>
      </div>
      <div className="copilot-fact-badges"><em className={`is-${fact.confidence.level}`}>{CONFIDENCE_LABELS[fact.confidence.level]}</em><em className={`is-review-${fact.review.status}`}>{REVIEW_LABELS[fact.review.status]}</em></div>
    </article>
  );
}

function FactEditor({ fact, onSave, onCancel, submitLabel }) {
  const [values, setValues] = useState(() => factToFormValues(fact));
  const [error, setError] = useState("");
  const errorId = `copilot-fact-editor-error-${fact.id}`;
  const hasDateRange = "dateRange" in fact.data;

  const submit = (event) => {
    event.preventDefault();
    try {
      const data = formValuesToFactData(fact, values);
      const saved = onSave(data);
      if (saved !== false) setError("");
    } catch (formError) {
      setError(formError && typeof formError === "object" && "code" in formError && formError.code === "DATE_INVALID" ? "日期格式无效，请使用 YYYY、YYYY-MM 或 YYYY-MM-DD。" : "当前字段无法保存，请检查后重试。");
    }
  };

  return (
    <form className="copilot-fact-editor" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onSubmit={submit}>
      <div className="copilot-fact-editor-grid">
        {FACT_FORM_FIELDS[fact.category].map((field) => (
          <label key={field.key} className={field.type === "list" || field.type === "longtext" ? "is-wide" : ""}>{field.label}
            {field.type === "list" || field.type === "longtext"
              ? <textarea value={String(values[field.key] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
              : <input type="text" value={String(values[field.key] ?? "")} placeholder={field.type === "date" ? "YYYY-MM" : ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />}
          </label>
        ))}
        {hasDateRange && <label className="copilot-ongoing"><input type="checkbox" checked={Boolean(values.ongoing)} onChange={(event) => setValues((current) => ({ ...current, ongoing: event.target.checked }))} />仍在进行中</label>}
      </div>
      {error && <p id={errorId} className="copilot-field-error" role="alert">{error}</p>}
      <div className="copilot-fact-editor-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit">{submitLabel}</button></div>
    </form>
  );
}

function TimelineNotice({ flags, facts, onStatus }) {
  const openFlags = flags.filter((flag) => flag.status === "open");
  return (
    <section className="copilot-timeline-notice" aria-labelledby="timeline-notice-title">
      <div><AlertTriangle size={20} /><div><h2 id="timeline-notice-title">有 {openFlags.length} 项时间信息待处理</h2><p>这些只是规则提示，不代表材料不真实；处理结果也不会自动改变事实状态。</p></div></div>
      <ul>{flags.map((flag) => <li key={flag.id} className={`is-${flag.status}`}><strong>{flag.factIds.map((id) => formatFactSummary(facts.find((fact) => fact.id === id) ?? createBlankFactDraft("project"))).join(" / ")}</strong><span>{TIMELINE_MESSAGES[flag.type]}</span><div>{flag.status === "open" ? <><button type="button" onClick={() => onStatus(flag.id, "confirmed")}>确认需注意</button><button type="button" onClick={() => onStatus(flag.id, "dismissed")}>不适用</button></> : <button type="button" disabled>{flag.status === "confirmed" ? "已标记需注意" : "已标记不适用"}</button>}</div></li>)}</ul>
    </section>
  );
}

function reviewErrorMessage(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "FACT_PRIMARY_REQUIRED") return "请至少填写该事实的核心名称或组织信息。";
  if (code === "REVIEW_PENDING_FACTS") return "仍有待确认事实，处理后才能继续。";
  if (code === "REVIEW_NO_CONFIRMED_FACTS") return "至少确认一条事实后才能继续。";
  return "本次修改未能保存，请检查字段后重试。";
}
