import { ArrowRight, CheckCircle2, CircleAlert, Clock3, ExternalLink, LoaderCircle, SearchCheck, ShieldCheck, Target } from "lucide-react";
import { formatFactSummary } from "../domain/factReviewForm.js";
import { ConclusionSourceBadges, ConclusionSourceLegend, EvidenceFactList } from "../components/ConclusionSourceBadges.jsx";
import { findEvidenceDegradation } from "../domain/evidenceDegradation.js";

export function GeneratingScreen({ jdProfile, companyRoleStatus = "loading", onNext }) {
  return (
    <div className="copilot-generating-screen">
      <div className="copilot-loader"><LoaderCircle size={40} /><i /><i /></div>
      <p className="copilot-eyebrow">BUILDING YOUR DIAGNOSIS</p>
      <h1>正在把经历，转化为可以行动的判断</h1>
      <div className="copilot-generation-steps">
        <span className="is-complete"><CheckCircle2 size={18} />整理已确认事实</span>
        <span className="is-complete"><CheckCircle2 size={18} />匹配目标岗位画像</span>
        <span className="is-complete"><CheckCircle2 size={18} />{jdProfile ? `提取 ${jdProfile.responsibilities.length} 项职责与 ${jdProfile.requirements.required.length} 项硬要求` : "未提供 JD，使用通用岗位族规则"}</span>
        <span className={companyRoleStatus === "ready" ? "is-complete" : companyRoleStatus === "error" ? "is-warning" : "is-active"}>{companyRoleStatus === "ready" ? <CheckCircle2 size={18} /> : companyRoleStatus === "error" ? <CircleAlert size={18} /> : <LoaderCircle size={18} />}{companyRoleStatus === "ready" ? "带来源公司目标池已就绪" : companyRoleStatus === "error" ? "公司目标池暂时不可用，不影响个人报告" : "整理带来源公司目标池"}</span>
        <span><span className="empty-dot" />生成 7 天行动计划</span>
      </div>
      <p className="copilot-generation-note">已使用浏览器本地规则匹配方向与经历证据；不会上传简历。</p>
      {jdProfile?.riskItems.length > 0 && <p className="copilot-generation-warning"><CircleAlert size={16} />JD 中有 {jdProfile.riskItems.length} 项招聘表达建议进一步核实，不作法律定性。</p>}
      <button type="button" className="copilot-primary" onClick={onNext}>查看本地分析结果 <ArrowRight size={17} /></button>
    </div>
  );
}

export function ReportScreen({ analysis, jdGapAnalysis, applicationTierPlan, actionPlan, companyRoleRecommendations, companyRoleStatus = "ready", conclusionProvenance, evidenceDegradation, resumeFacts, careerGoals, onNext, onCorrect }) {
  if (!analysis || !resumeFacts) return <ExampleReport onNext={onNext} onCorrect={onCorrect} />;
  const strength = analysis.strengths[0] ?? analysis.insufficient[0] ?? null;
  const gap = [...analysis.gaps, ...analysis.insufficient].find((item) => item.id !== strength?.id && findEvidenceDegradation(evidenceDegradation, item.id)?.outcome !== "omitted") ?? null;
  const gapDegradation = gap ? findEvidenceDegradation(evidenceDegradation, gap.id) : null;
  const direction = analysis.direction.selectedLabel ?? "目标岗位";
  const facts = resumeFacts.facts;
  const factMap = new Map(resumeFacts.facts.map((fact) => [fact.id, fact]));
  const evidenceText = conclusionEvidence(strength, factMap);
  const confidence = analysis.strengths.length > 0 ? "中" : "低";
  const headline = analysis.strengths.length > 0
    ? analysis.gaps.length > 0 ? `你的${direction}方向已有可用证据，\n但仍有一项简历证据需要补齐。` : `你的${direction}方向，\n已经形成一组可用证据。`
    : "目前证据还不足，\n先补充事实再判断方向。";
  return (
    <div className="copilot-report-screen" data-report-document="career-copilot">
      <header className="copilot-print-only copilot-print-header"><strong>Edutoro 智能求职助手</strong><span>实习 / 校招脱敏诊断报告</span></header>
      <div className="copilot-report-head">
        <div><p className="copilot-eyebrow">30-SECOND DIAGNOSIS</p><h1>{headline.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1></div>
        <aside><span>分析置信度</span><strong>{confidence}</strong><small>基于 {analysis.factsConsideredIds.length} 条已确认事实</small></aside>
      </div>
      <div className="copilot-report-grid">
        <article className="is-strength"><span>{strength?.type === "strength" ? "最强证据" : "当前判断"}</span>{strength && <ConclusionSourceBadges provenance={conclusionProvenance} targetType="profile_conclusion" targetId={strength.id} facts={facts} />}<h2>{strength?.claim ?? "暂时没有足够的已确认事实"}</h2><p>{evidenceText}</p><small><SearchCheck size={15} />证据充分度：{strength?.confidence === "medium" ? "中" : "低"}</small></article>
        <article className="is-gap"><span>{gap?.type === "gap" ? "最大证据短板" : "仍需核实"}</span>{gap && <ConclusionSourceBadges provenance={conclusionProvenance} targetType="profile_conclusion" targetId={gap.id} facts={facts} />}<h2>{gapDegradation?.displayTitle ?? gap?.claim ?? "暂未识别到明确的简历证据短板"}</h2><p>{gapDegradation?.displayText ?? (gap ? "这描述的是当前简历证据，不代表你的真实能力不足。" : "后续可结合目标 JD 继续核对。")}</p><small><CircleAlert size={15} />处理：{degradationOutcomeLabel(gapDegradation?.outcome)}</small></article>
        <article className="is-action"><span>第一优先动作</span>{gap && <ConclusionSourceBadges provenance={conclusionProvenance} targetType="profile_conclusion" targetId={gap.id} facts={facts} />}<h2>{gapDegradation?.outcome === "needs_fact_update" ? "返回事实页补充真实证据" : gap ? "按证据条件处理最高优先缺口" : "继续验证目标岗位匹配"}</h2><p>{gapDegradation?.displayText ?? gap?.nextAction ?? "粘贴一份目标 JD，在下一步核对岗位要求与已有事实。"}</p><small><Target size={15} />依据规则：{gap?.ruleId ?? "方向画像"}</small></article>
      </div>
      <ConclusionSourceLegend provenance={conclusionProvenance} />
      {careerGoals && <CareerGoalSummary goals={careerGoals} />}
      <DirectionSummary analysis={analysis} facts={facts} />
      <StrengthGapDetails analysis={analysis} facts={facts} factMap={factMap} conclusionProvenance={conclusionProvenance} evidenceDegradation={evidenceDegradation} onCorrect={onCorrect} />
      {evidenceDegradation && <EvidenceDegradationSummary plan={evidenceDegradation} onCorrect={onCorrect} />}
      {jdGapAnalysis && <JdGapSummary analysis={jdGapAnalysis} facts={facts} factMap={factMap} conclusionProvenance={conclusionProvenance} />}
      {applicationTierPlan ? <ApplicationTierPlan plan={applicationTierPlan} facts={facts} conclusionProvenance={conclusionProvenance} /> : <div className="copilot-company-preview"><div><p className="copilot-eyebrow">COMPANY × ROLE</p><h2>岗位分层不是公司排名</h2></div><div className="tier-strip"><span>冲刺<small>强竞争 / 有差距</small></span><span className="is-main">主申<small>证据较匹配</small></span><span>稳妥<small>风险相对可控</small></span><span>探索<small>验证新方向</small></span></div></div>}
      {companyRoleRecommendations ? <CompanyRoleTargets recommendations={companyRoleRecommendations} /> : companyRoleStatus !== "idle" && <CompanyRoleLoadState status={companyRoleStatus} />}
      {actionPlan && <ActionPlanSummary actionPlan={actionPlan} facts={facts} conclusionProvenance={conclusionProvenance} onNext={onNext} />}
      <div className="copilot-report-actions no-print"><button type="button" className="copilot-secondary" onClick={onCorrect}>纠正事实</button><button type="button" className="copilot-primary" onClick={onNext}>查看行动计划 <ArrowRight size={17} /></button></div>
      <footer className="copilot-print-only copilot-print-footer">Edutoro · 本报告仅供求职规划参考 · 申请前请核验公司官方招聘信息</footer>
    </div>
  );
}

const GOAL_DIRECTION_LABELS = Object.freeze({
  "product-manager": "产品经理",
  "product-operations": "产品/用户运营",
  "marketing-growth": "市场/品牌/增长",
  "software-engineering": "软件研发",
  "data-business-analysis": "数据分析/商业分析",
  "finance-accounting": "金融/财会通用",
  auto: "由规则辅助判断",
});
const APPLICATION_START_LABELS = Object.freeze({ now: "立即开始", "30_days": "未来 30 天", "60_days": "未来 60 天", flexible: "时间灵活" });

function CareerGoalSummary({ goals }) {
  const exclusionCount = [goals.exclusions?.companies, goals.exclusions?.locations, goals.exclusions?.industries].filter((value) => value?.trim()).length;
  return (
    <section className="copilot-goal-summary" aria-labelledby="goal-summary-title">
      <div><p className="copilot-eyebrow">APPLICATION GOALS</p><h2 id="goal-summary-title">本次求职目标与筛选边界</h2></div>
      <dl><div><dt>求职阶段</dt><dd>{goals.stage === "campus" ? "校招" : "实习"}</dd></div><div><dt>主投方向</dt><dd>{GOAL_DIRECTION_LABELS[goals.direction] ?? goals.direction}</dd></div><div><dt>备选方向</dt><dd>{goals.backupDirections.length ? goals.backupDirections.map((id) => GOAL_DIRECTION_LABELS[id] ?? id).join("、") : "未设置"}</dd></div><div><dt>目标城市</dt><dd>{goals.targetLocations.join("、")}</dd></div><div><dt>开始投递</dt><dd>{APPLICATION_START_LABELS[goals.applicationStart] ?? goals.applicationStart}</dd></div><div><dt>排除条件</dt><dd>{exclusionCount ? `已应用 ${exclusionCount} 类本地过滤` : "未设置"}</dd></div></dl>
      <p><strong>硬约束：</strong>{goals.hardConstraints.trim() || "未设置；申请前仍需核验毕业时间、到岗和地点要求。"}</p>
    </section>
  );
}

export function CompanyRoleLoadState({ status }) {
  return (
    <section className={`copilot-company-targets copilot-company-load-state is-${status}`} aria-labelledby="company-targets-title" role="status">
      <div className="copilot-company-targets-head"><div><p className="copilot-eyebrow">SOURCED TARGET POOL</p><h2 id="company-targets-title">{status === "loading" ? "正在读取对应方向的公司目标池" : "公司目标池暂时无法读取"}</h2></div></div>
      <p className="copilot-company-targets-empty">{status === "loading" ? "个人诊断已经完成，公司公开资料会独立加载。" : "个人诊断、优势短板与行动建议不受影响；申请前可直接通过公司官方招聘页面自行核验。"}</p>
    </section>
  );
}

function DirectionSummary({ analysis, facts }) {
  const candidates = analysis.direction.matches.slice(0, 3);
  const selected = analysis.direction.selectedLabel ?? "暂不能判断";
  const selectedMatch = analysis.direction.matches.find((candidate) => candidate.id === analysis.direction.selected) ?? null;
  return (
    <section className="copilot-direction-summary" aria-labelledby="direction-summary-title">
      <div className="copilot-section-heading">
        <div><p className="copilot-eyebrow">DIRECTION</p><h2 id="direction-summary-title">方向判断：优先验证“{selected}”</h2></div>
        <p>{analysis.direction.status === "matched" ? "当前已确认事实与该方向存在关键词及经历证据交集。" : "当前证据覆盖有限，这一方向仅作为下一步验证假设。"}</p>
      </div>
      <div className="copilot-direction-grid">
        <article className="is-selected"><span>当前主方向</span><h3>{selected}</h3><p>{analysis.direction.requested === "auto" ? "由本地规则根据已确认事实排序" : "由你主动选择，并使用已确认事实校验"}</p><strong>{analysis.direction.status === "matched" ? "已有相关证据" : "证据不足，需继续验证"}</strong><details className="copilot-direction-trace"><summary>查看方向依据</summary><div><EvidenceFactList factIds={selectedMatch?.factIds ?? []} facts={facts} /><p>规则依据：岗位画像关键词匹配 · 画像版本 {analysis.roleProfileVersion}</p></div></details></article>
        <div className="copilot-direction-candidates" aria-label="方向匹配候选">
          {candidates.map((candidate, index) => <div key={candidate.id} className={candidate.id === analysis.direction.selected ? "is-current" : ""}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{candidate.label}</strong><small>{candidate.matchedKeywords.length ? `命中线索：${candidate.matchedKeywords.slice(0, 4).join("、")}` : "暂未找到直接关键词线索"}</small></div><em>{confidenceLabel(candidate.confidence)}</em></div>)}
        </div>
      </div>
      <p className="copilot-section-note"><ShieldCheck size={14} />方向排序只反映当前简历证据与岗位画像的匹配情况，不代表能力上限，也不建议仅凭该排序放弃其他方向。</p>
    </section>
  );
}

function StrengthGapDetails({ analysis, facts, factMap, conclusionProvenance, evidenceDegradation, onCorrect }) {
  const strengths = analysis.strengths.slice(0, 3);
  const gaps = [...analysis.gaps, ...analysis.insufficient]
    .filter((item) => findEvidenceDegradation(evidenceDegradation, item.id)?.outcome !== "omitted")
    .slice(0, 3);
  return (
    <section className="copilot-evidence-details" aria-labelledby="evidence-details-title">
      <div className="copilot-section-heading"><div><p className="copilot-eyebrow">STRENGTHS × GAPS</p><h2 id="evidence-details-title">优势与短板，都回到简历证据</h2></div><p>最多展示 3 项优势和 3 项问题；“未找到”只说明简历尚未提供足够证据。</p></div>
      <div className="copilot-evidence-columns">
        <ConclusionList title="核心优势" empty="当前没有达到展示门槛的优势证据。" items={strengths} tone="strength" facts={facts} factMap={factMap} conclusionProvenance={conclusionProvenance} evidenceDegradation={evidenceDegradation} />
        <ConclusionList title="主要短板与信息缺口" empty="当前没有需要优先展示的证据短板。" items={gaps} tone="gap" facts={facts} factMap={factMap} conclusionProvenance={conclusionProvenance} evidenceDegradation={evidenceDegradation} onCorrect={onCorrect} />
      </div>
    </section>
  );
}

function ConclusionList({ title, empty, items, tone, facts, factMap, conclusionProvenance, evidenceDegradation, onCorrect }) {
  return (
    <div className={`copilot-conclusion-list is-${tone}`}>
      <h3>{title}<span>{items.length}</span></h3>
      {items.length ? items.map((item, index) => {
        const degradation = findEvidenceDegradation(evidenceDegradation, item.id);
        return <article key={item.id}><div><span>{String(index + 1).padStart(2, "0")}</span><em>{item.type === "strength" ? confidenceLabel(item.confidence) : degradationOutcomeLabel(degradation?.outcome)}</em></div><ConclusionSourceBadges provenance={conclusionProvenance} targetType="profile_conclusion" targetId={item.id} facts={facts} /><h4>{degradation?.displayTitle ?? item.claim}</h4><p>{degradation?.displayText ?? conclusionEvidence(item, factMap)}</p><dl><div><dt>触发规则</dt><dd>{item.ruleId}</dd></div><div><dt>下一步</dt><dd>{item.nextAction}</dd></div></dl>{tone === "gap" && degradation?.outcome === "needs_fact_update" && <button type="button" className="copilot-link" onClick={onCorrect}>返回补充事实</button>}</article>;
      }) : <p className="copilot-conclusion-empty">{empty}</p>}
    </div>
  );
}

const ACTION_WINDOW_META = {
  "48_hours": ["48 小时", "先处理最影响判断的缺口"],
  "7_days": ["7 天", "形成可投递材料与岗位组合"],
  "30_days": ["30 天", "根据真实反馈校准策略"],
};

function ActionPlanSummary({ actionPlan, facts, conclusionProvenance, onNext }) {
  return (
    <section className="copilot-report-action-plan" aria-labelledby="report-action-plan-title">
      <div className="copilot-section-heading"><div><p className="copilot-eyebrow">NEXT ACTIONS</p><h2 id="report-action-plan-title">下一步：按三个时间窗推进</h2></div><p>共 {actionPlan.summary.total} 项，预计 {actionPlan.summary.totalEstimatedMinutes} 分钟；完整步骤与完成标准可在行动页查看。</p></div>
      <div className="copilot-report-action-grid">{Object.entries(ACTION_WINDOW_META).map(([window, [label, description]]) => {
        const items = actionPlan.items.filter((item) => item.window === window);
        return <article key={window}><header><Clock3 size={17} /><div><span>{label}</span><small>{description}</small></div><b>{items.length} 项</b></header>{items.length ? <ol>{items.map((item) => <li key={item.id}><div><ConclusionSourceBadges provenance={conclusionProvenance} targetType="action_item" targetId={item.id} facts={facts} /><strong>{item.title}</strong><small>产出物：{item.deliverable} · {item.estimatedMinutes} 分钟</small></div></li>)}</ol> : <p>当前窗口暂无任务。</p>}</article>;
      })}</div>
      <div className="copilot-report-action-footer"><p><ShieldCheck size={14} />{actionPlan.disclaimer}</p><button type="button" className="copilot-link" onClick={onNext}>查看完整行动计划 <ArrowRight size={15} /></button></div>
    </section>
  );
}

export function CompanyRoleTargets({ recommendations }) {
  if (!recommendations?.candidates?.length) return (
    <section className="copilot-company-targets" aria-labelledby="company-targets-title">
      <div className="copilot-company-targets-head"><div><p className="copilot-eyebrow">SOURCED TARGET POOL</p><h2 id="company-targets-title">当前方向暂无可展示的公司目标池</h2></div></div>
      <p className="copilot-company-targets-empty">请使用具体 JD 继续分析，或选择首发覆盖的六个岗位方向。</p>
    </section>
  );
  return (
    <section className={`copilot-company-targets is-${recommendations.status}`} aria-labelledby="company-targets-title">
      <div className="copilot-company-targets-head">
        <div><p className="copilot-eyebrow">SOURCED TARGET POOL</p><h2 id="company-targets-title">{recommendations.direction.label}：带来源的公司目标池</h2></div>
        <p>{recommendations.status === "current" ? `数据核验状态：当前有效 · 查看日期 ${recommendations.asOfDate}` : `数据核验状态：待自行核实 · 查看日期 ${recommendations.asOfDate}`}<br />目标地点：{recommendations.filters.targetLocations.join("、") || "未限定"}</p>
      </div>
      {recommendations.status === "needs_verification" && <div className="copilot-company-stale-alert" role="status"><CircleAlert size={17} /><span><strong>这些资料已超过复核期限。</strong>官方入口仍保留供你核对，但不要据此判断岗位正在招聘。</span></div>}
      <div className="copilot-company-target-grid">{recommendations.candidates.map((candidate) => <article key={candidate.id} className={`is-${candidate.verification.status}`}>
        <div><span>{candidate.recruitmentType === "internship" ? "实习方向" : "校招方向"}</span><em>{candidate.verification.status === "current" ? "入口已核验" : "待自行核实"}</em></div>
        <h3>{candidate.company.name}</h3>
        <p>{candidate.roleFamily.label}</p>
        <dl><div><dt>行业</dt><dd>{candidate.industryTags.map((tag) => tag.label).join("、") || "待核验"}</dd></div><div><dt>地点</dt><dd>{candidate.locations.length ? candidate.locations.join("、") : `${candidate.targetLocations.join("、") || "未限定"}（岗位页核验）`}</dd></div><div><dt>来源</dt><dd>{candidate.source.title}</dd></div><div><dt>核验日期</dt><dd>{candidate.source.verifiedAt}</dd></div><div><dt>有效至</dt><dd>{candidate.verification.expiresAt}</dd></div></dl>
        <details className="copilot-company-evidence"><summary>查看推荐依据</summary><div><p>该公司进入目标池，是因为公开招聘入口覆盖“{candidate.roleFamily.label}”岗位族；不表示存在当前在招的具体职位。</p><dl><div><dt>发布方</dt><dd>{candidate.source.publisher}</dd></div><div><dt>资料状态</dt><dd>{candidate.verification.status === "current" ? "当前复核期内" : "已过复核期"}</dd></div><div><dt>记录类型</dt><dd>公开资料 · 公司目标池</dd></div></dl><a href={candidate.source.url} target="_blank" rel="noopener noreferrer">查看引用来源 <ExternalLink size={13} /></a></div></details>
        <a href={candidate.entrance.url} target="_blank" rel="noopener noreferrer">打开官方招聘入口 <ExternalLink size={14} /></a>
        <small>{candidate.caveat}</small>
      </article>)}</div>
      <p className="copilot-company-targets-disclaimer"><ShieldCheck size={15} />{recommendations.disclaimer}</p>
    </section>
  );
}

function EvidenceDegradationSummary({ plan, onCorrect }) {
  return (
    <section className="copilot-degradation-report" aria-labelledby="degradation-report-title">
      <div><p className="copilot-eyebrow">EVIDENCE BOUNDARY</p><h2 id="degradation-report-title">证据不够时，不强行下结论</h2></div>
      <div className="copilot-degradation-result-list">{plan.items.map((item) => <article key={item.id} className={`is-${item.outcome}`}><span>{degradationOutcomeLabel(item.outcome)}</span><h3>{item.displayTitle}</h3><p>{item.displayText}</p>{item.outcome === "needs_fact_update" && <button type="button" className="copilot-link" onClick={onCorrect}>补充已确认事实</button>}</article>)}</div>
      <p><ShieldCheck size={14} />{plan.disclaimer}</p>
    </section>
  );
}

function degradationOutcomeLabel(outcome) {
  return { pending_question: "待回答", needs_fact_update: "需补事实", conditional_advice: "条件式建议", omitted: "已省略" }[outcome] ?? "规则降级";
}

function confidenceLabel(confidence) {
  return confidence === "medium" ? "中等证据" : "较低证据";
}

function ApplicationTierPlan({ plan, facts, conclusionProvenance }) {
  return (
    <section className="copilot-tier-plan" aria-labelledby="tier-plan-title">
      <div className="copilot-tier-plan-head"><div><p className="copilot-eyebrow">APPLICATION MIX</p><h2 id="tier-plan-title">四层是投递组合，不是公司排名</h2></div><p>{plan.strategyBasis === "role_profile_and_jd" ? "依据方向画像与当前 JD 样本" : "暂依据方向画像；补充 JD 后可进一步校准"}</p></div>
      <div className="copilot-tier-plan-grid">{plan.lanes.map((lane) => <article key={lane.id} className={`is-${lane.id}`}><div><span>{lane.label}</span><b>{lane.allocationPercent}%</b></div><small>{lane.status === "active" ? "当前可执行" : "条件式建议"}</small><ConclusionSourceBadges provenance={conclusionProvenance} targetType="tier_lane" targetId={lane.id} facts={facts} /><h3>{lane.targetLabel}</h3><p>{lane.rationale}</p><strong>{lane.condition}</strong><em>{lane.caution}</em></article>)}</div>
      <p className="copilot-tier-plan-disclaimer"><ShieldCheck size={15} />{plan.disclaimer}</p>
    </section>
  );
}

function JdGapSummary({ analysis, facts, factMap, conclusionProvenance }) {
  const priorityGaps = analysis.items.filter((item) => item.status !== "covered").sort((left, right) => {
    const priority = { required: 0, responsibility: 1, preferred: 2 };
    return priority[left.jdItemType] - priority[right.jdItemType] || left.score - right.score || left.sourceLine - right.sourceLine;
  }).slice(0, 3);
  return (
    <section className="copilot-jd-gap" aria-labelledby="jd-gap-title">
      <div className="copilot-jd-gap-head"><div><p className="copilot-eyebrow">RESUME × JD</p><h2 id="jd-gap-title">逐项看证据，不猜录取概率</h2></div><dl><div><dt>直接覆盖</dt><dd>{analysis.summary.covered}</dd></div><div><dt>证据较弱</dt><dd>{analysis.summary.partial}</dd></div><div><dt>未找到</dt><dd>{analysis.summary.notFound}</dd></div></dl></div>
      {priorityGaps.length > 0 ? <div className="copilot-jd-gap-list">{priorityGaps.map((item) => <article key={item.id} className={`is-${item.status}`}><div><span>{item.jdItemType === "required" ? "硬要求" : item.jdItemType === "responsibility" ? "岗位职责" : "加分项"} · JD 第 {item.sourceLine} 行</span><em>{item.status === "partial" ? "证据较弱" : "未找到证据"}</em></div><ConclusionSourceBadges provenance={conclusionProvenance} targetType="jd_gap" targetId={item.id} facts={facts} /><h3>{item.jdText}</h3><p>{item.interpretation}</p>{item.factRefs.length > 0 && <small>相关已确认事实：{item.factRefs.map((ref) => factMap.get(ref.factId)).filter(Boolean).map(formatFactSummary).join("；")}</small>}<strong>{item.nextAction}</strong></article>)}</div> : <p className="copilot-jd-gap-complete">当前提取到的 JD 条目均找到直接相关证据；投递前仍需核对表述真实性和具体程度。</p>}
      <p className="copilot-jd-gap-disclaimer"><ShieldCheck size={15} />{analysis.disclaimer}</p>
    </section>
  );
}

function ExampleReport({ onNext, onCorrect }) {
  return (
    <div className="copilot-report-screen">
      <div className="copilot-report-head"><div><p className="copilot-eyebrow">EXAMPLE REPORT</p><h1>你的经历有产品感，<br />但还缺一条强结果证据。</h1></div><aside><span>示例置信度</span><strong>中</strong><small>以下内容仅作结构演示</small></aside></div>
      <div className="copilot-report-grid"><article className="is-strength"><span>示例：最强证据</span><h2>能把零散反馈转化为结构化问题</h2><p>真实报告会在这里引用你已确认的事实。</p><small><SearchCheck size={15} />示例内容</small></article><article className="is-gap"><span>示例：最大阻碍</span><h2>结果指标没有证明实际影响</h2><p>真实报告只描述简历证据，不推断真实能力不足。</p><small><CircleAlert size={15} />示例内容</small></article><article className="is-action"><span>示例：第一优先动作</span><h2>补齐项目结果证据</h2><p>真实行动会引用触发规则。</p><small><Target size={15} />示例内容</small></article></div>
      <div className="copilot-report-actions"><button type="button" className="copilot-secondary" onClick={onCorrect}>开始真实诊断</button><button type="button" className="copilot-primary" onClick={onNext}>查看行动计划 <ArrowRight size={17} /></button></div>
      <p className="copilot-disclaimer"><ShieldCheck size={15} />这是示例报告，不代表对当前访客的判断。</p>
    </div>
  );
}

function conclusionEvidence(conclusion, factMap) {
  if (!conclusion?.factIds?.length) return "当前没有可引用的已确认事实，请先补充或核实材料。";
  const summaries = conclusion.factIds.map((id) => factMap.get(id)).filter(Boolean).map(formatFactSummary);
  return summaries.length ? `来自已确认事实：${summaries.join("；")}` : "当前没有可引用的已确认事实。";
}
