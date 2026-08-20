import { ArrowRight, BriefcaseBusiness, CircleHelp, ShieldCheck } from "lucide-react";
import { ScreenHeading } from "../components/CopilotChrome.jsx";
import { FactReviewWorkspace } from "../components/FactReviewWorkspace.jsx";

export function FactsScreen({ resumeFacts, resumeText, onChange, onNext }) {
  return (
    <div className="copilot-form-screen">
      <ScreenHeading number="02" eyebrow="CONFIRM FACTS" title="先确认事实，再形成判断" text="逐条核对本地识别结果。只有你明确确认的事实，才会进入后续分析。" />
      <FactReviewWorkspace resumeFacts={resumeFacts} resumeText={resumeText} onChange={onChange} onComplete={onNext} />
    </div>
  );
}

const DIRECTION_OPTIONS = Object.freeze([
  ["product-manager", "产品经理"],
  ["product-operations", "产品/用户运营"],
  ["marketing-growth", "市场/品牌/增长"],
  ["software-engineering", "软件研发"],
  ["data-business-analysis", "数据分析/商业分析"],
  ["finance-accounting", "金融/财会通用"],
  ["auto", "请先帮我判断"],
]);

const CITY_OPTIONS = Object.freeze(["上海", "北京", "杭州", "深圳", "广州", "可异地"]);
const START_OPTIONS = Object.freeze([
  ["now", "立即开始"],
  ["30_days", "未来 30 天"],
  ["60_days", "未来 60 天"],
  ["flexible", "时间灵活"],
]);

export function GoalsScreen({ stage, direction, backupDirections, targetLocations, applicationStart, hardConstraints, exclusions, onStageChange, onDirectionChange, onBackupDirectionsChange, onTargetLocationsChange, onApplicationStartChange, onHardConstraintsChange, onExclusionsChange, onNext }) {
  const toggleBackupDirection = (id) => {
    if (id === direction || id === "auto") return;
    if (backupDirections.includes(id)) onBackupDirectionsChange(backupDirections.filter((value) => value !== id));
    else if (backupDirections.length < 2) onBackupDirectionsChange([...backupDirections, id]);
  };
  const toggleLocation = (location) => {
    if (targetLocations.includes(location)) {
      if (targetLocations.length > 1) onTargetLocationsChange(targetLocations.filter((value) => value !== location));
    } else onTargetLocationsChange([...targetLocations, location]);
  };
  return (
    <div className="copilot-form-screen">
      <ScreenHeading number="03" eyebrow="SET DIRECTION" title="告诉我们，你主要看什么" text="首版只覆盖实习与校招；所有条件都区分必须、偏好与可接受。" />
      <div className="copilot-goal-grid">
        <fieldset><legend>求职阶段</legend><div className="copilot-choice-row"><button type="button" className={stage === "internship" ? "is-selected" : ""} aria-pressed={stage === "internship"} onClick={() => onStageChange("internship")}>实习</button><button type="button" className={stage === "campus" ? "is-selected" : ""} aria-pressed={stage === "campus"} onClick={() => onStageChange("campus")}>校招</button></div></fieldset>
        <fieldset><legend>主投方向</legend><div className="copilot-choice-row">{DIRECTION_OPTIONS.map(([id, label]) => <button key={id} type="button" className={direction === id ? "is-selected" : ""} aria-pressed={direction === id} onClick={() => onDirectionChange(id)}>{label}</button>)}</div></fieldset>
        <fieldset><legend>备选方向（最多两个）</legend><div className="copilot-choice-row">{DIRECTION_OPTIONS.filter(([id]) => id !== "auto").map(([id, label]) => <button key={id} type="button" disabled={id === direction || (!backupDirections.includes(id) && backupDirections.length >= 2)} className={backupDirections.includes(id) ? "is-selected" : ""} aria-pressed={backupDirections.includes(id)} onClick={() => toggleBackupDirection(id)}>{label}</button>)}</div><small className="copilot-goal-hint">已选 {backupDirections.length}/2；主投方向不能同时作为备选。</small></fieldset>
        <fieldset><legend>目标城市（至少一个）</legend><div className="copilot-choice-row">{CITY_OPTIONS.map((location) => <button key={location} type="button" className={targetLocations.includes(location) ? "is-selected" : ""} aria-pressed={targetLocations.includes(location)} onClick={() => toggleLocation(location)}>{location}</button>)}</div></fieldset>
        <fieldset><legend>开始投递时间</legend><div className="copilot-choice-row">{START_OPTIONS.map(([id, label]) => <button key={id} type="button" className={applicationStart === id ? "is-selected" : ""} aria-pressed={applicationStart === id} onClick={() => onApplicationStartChange(id)}>{label}</button>)}</div></fieldset>
        <fieldset className="copilot-goal-wide"><legend>必须满足的硬约束</legend><label className="copilot-goal-field"><span>例如毕业时间、每周到岗天数、不能出差等；没有可留空</span><textarea aria-label="求职硬约束" value={hardConstraints} onChange={(event) => onHardConstraintsChange(event.target.value)} maxLength={500} placeholder="只填写会直接影响是否投递的条件" /></label></fieldset>
        <fieldset className="copilot-goal-wide"><legend>排除条件（本地重算）</legend><div className="copilot-exclusion-grid"><label><span>排除公司</span><input aria-label="排除公司" value={exclusions.companies} onChange={(event) => onExclusionsChange({ ...exclusions, companies: event.target.value })} placeholder="例如：A 公司、B 公司" /></label><label><span>排除城市</span><input aria-label="排除城市" value={exclusions.locations} onChange={(event) => onExclusionsChange({ ...exclusions, locations: event.target.value })} placeholder="例如：北京、深圳" /></label><label><span>排除行业</span><input aria-label="排除行业" value={exclusions.industries} onChange={(event) => onExclusionsChange({ ...exclusions, industries: event.target.value })} placeholder="例如：金融、消费品" /></label></div><small className="copilot-goal-hint">多个条件可用逗号、顿号或换行分隔；只在浏览器本地过滤。</small></fieldset>
      </div>
      <div className="copilot-screen-cta"><button type="button" className="copilot-primary" onClick={onNext}>保存目标 <ArrowRight size={17} /></button></div>
    </div>
  );
}

export function QuestionsScreen({ jdText, jdError, jdAnalysisEnabled, evidenceDegradation, onDegradationAnswer, onCorrectFacts, onJdChange, onNext }) {
  const questions = evidenceDegradation?.items.filter((item) => item.configuredAction === "ask_user") ?? [];
  const automatic = evidenceDegradation?.items.filter((item) => item.configuredAction !== "ask_user") ?? [];
  return (
    <div className="copilot-question-screen">
      <ScreenHeading number="04" eyebrow="EVIDENCE CHECK" title="先回答关键缺口，再对齐目标 JD" text="问题只决定报告如何降级，不会自动写入或确认简历事实；不确定时可以明确省略判断。" />
      {evidenceDegradation && <section className="copilot-degradation-questions" aria-labelledby="degradation-questions-title">
        <div className="copilot-degradation-head"><div><CircleHelp size={22} /><span><small>最多 3 项</small><h2 id="degradation-questions-title">证据不足时，先问可以回答的问题</h2></span></div><p>{evidenceDegradation.summary.pendingQuestion} 项待回答 · {evidenceDegradation.summary.conditionalAdvice} 项已使用条件式建议</p></div>
        {questions.length > 0 ? <div className="copilot-degradation-question-list">{questions.map((item) => <article key={item.id} className={`is-${item.outcome}`}><span>{item.displayTitle}</span><h3>{item.question}</h3><div role="group" aria-label={`${item.question}的回答`}><button type="button" className={item.answer === "has_evidence" ? "is-selected" : ""} aria-pressed={item.answer === "has_evidence"} onClick={() => onDegradationAnswer(item.id, "has_evidence")}>有，尚未写清</button><button type="button" className={item.answer === "not_available" ? "is-selected" : ""} aria-pressed={item.answer === "not_available"} onClick={() => onDegradationAnswer(item.id, "not_available")}>目前没有</button><button type="button" className={item.answer === "unsure" ? "is-selected" : ""} aria-pressed={item.answer === "unsure"} onClick={() => onDegradationAnswer(item.id, "unsure")}>无法确认</button></div>{item.answer && <p>{item.displayText}</p>}{item.outcome === "needs_fact_update" && <button type="button" className="copilot-link" onClick={onCorrectFacts}>返回事实页补充并确认</button>}</article>)}</div> : <p className="copilot-degradation-clear">当前没有需要追问的关键缺口。</p>}
        {automatic.length > 0 && <details className="copilot-automatic-degradation"><summary>查看 {automatic.length} 项自动降级处理</summary><ul>{automatic.map((item) => <li key={item.id}><strong>{item.displayTitle}</strong><span>{item.displayText}</span></li>)}</ul></details>}
        <p className="copilot-degradation-disclaimer"><ShieldCheck size={14} />{evidenceDegradation.disclaimer}</p>
      </section>}
      <div className="copilot-question-card">
        <div><BriefcaseBusiness size={22} /><span>可选 · 本地处理</span></div>
        <h2>粘贴一份目标岗位 JD</h2>
        <p>我们会提取职责、硬要求、加分项、任务词、技能词和需核实的招聘表达。不会上传或持久化原文。</p>
        <textarea aria-label="目标职位 JD" aria-invalid={Boolean(jdError)} aria-describedby={jdError ? "copilot-jd-error" : undefined} value={jdText} onChange={(event) => onJdChange(event.target.value)} disabled={!jdAnalysisEnabled} placeholder="例如：岗位职责、任职要求、加分项……" maxLength={30000} />
        <div className="copilot-jd-meta"><span>{jdText.length.toLocaleString("zh-CN")} / 30,000 字</span><span>{jdText.trim() ? "将进行本地提取" : "留空则使用通用规则"}</span></div>
        {jdError && <p id="copilot-jd-error" className="copilot-jd-error" role="alert">{jdError}</p>}
        {!jdAnalysisEnabled && <p className="copilot-jd-error" role="status">当前环境已关闭 JD 分析，将直接使用通用岗位族规则。</p>}
        <div className="copilot-question-actions"><button type="button" className="copilot-link" onClick={() => onJdChange("")}>清空并跳过</button><button type="button" className="copilot-primary" onClick={onNext}>{jdText.trim() ? "提取 JD 并继续" : "跳过 JD 并继续"} <ArrowRight size={17} /></button></div>
      </div>
    </div>
  );
}
