import { findConclusionProvenance } from "../domain/conclusionProvenance.js";
import { formatFactSummary } from "../domain/factReviewForm.js";

const SOURCE_LABELS = {
  confirmed_fact: "已确认事实",
  rule_inference: "规则推断",
  public_source: "公开资料",
};

const FACT_CATEGORY_LABELS = {
  education: "教育经历",
  internship: "实习经历",
  project: "项目经历",
  campus: "校园经历",
  skill: "技能",
  certification: "证书",
  achievement: "成果与奖项",
};

export function ConclusionSourceBadges({ provenance, targetType, targetId, facts = [] }) {
  if (!provenance) return null;
  const item = findConclusionProvenance(provenance, targetType, targetId);
  if (!item) return null;
  const factMap = new Map(facts.map((fact) => [fact.id, fact]));
  const evidenceFacts = item.factIds.map((factId) => factMap.get(factId)).filter(Boolean);
  return (
    <div className="copilot-source-provenance" aria-label={`结论来源：${item.sourceTypes.map((type) => SOURCE_LABELS[type]).join("、")}`} title={item.explanation}>
      <div className="copilot-source-badges">
        {item.sourceTypes.map((type) => <span key={type} className={`is-${type.replace("_", "-")}`}>{SOURCE_LABELS[type]}</span>)}
      </div>
      <details className="copilot-evidence-trace">
        <summary>查看判断依据</summary>
        <div className="copilot-evidence-trace-body">
          <p>{item.explanation}</p>
          <EvidenceFactList factIds={item.factIds} facts={evidenceFacts} />
          <div className="copilot-evidence-rule-list"><strong>触发规则</strong><ul>{item.ruleIds.map((ruleId) => <li key={ruleId}><code>{ruleId}</code></li>)}</ul></div>
          {item.publicSources.length > 0 ? <div className="copilot-evidence-public-list"><strong>公开来源</strong><ul>{item.publicSources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><small>核验于 {source.verifiedAt}</small></li>)}</ul></div> : <p className="copilot-evidence-no-public">本条判断未使用公开资料。</p>}
        </div>
      </details>
    </div>
  );
}

export function EvidenceFactList({ factIds, facts }) {
  if (!factIds.length) return <p className="copilot-evidence-empty">当前没有直接引用已确认简历事实。</p>;
  const factMap = new Map(facts.map((fact) => [fact.id, fact]));
  return (
    <div className="copilot-evidence-fact-list">
      <strong>简历证据</strong>
      <ul>{factIds.map((factId) => {
        const fact = factMap.get(factId);
        return <li key={factId}>{fact ? <><span>{FACT_CATEGORY_LABELS[fact.category] ?? fact.category} · 已确认</span><b>{formatFactSummary(fact)}</b><small>{formatSourceLocation(fact)}</small></> : <><span>已确认事实</span><b>该事实当前不可查看</b><small>引用编号：{factId}</small></>}</li>;
      })}</ul>
    </div>
  );
}

function formatSourceLocation(fact) {
  if (!fact.sourceRefs?.length) return fact.provenance === "user_added" ? "来源：用户手工补充" : "来源位置：当前不可用";
  const locations = fact.sourceRefs.map((ref) => {
    if (ref.page) return `第 ${ref.page} 页${ref.section ? ` · ${ref.section}` : ""}`;
    if (ref.section) return ref.section;
    return `原材料字符 ${ref.startOffset + 1}–${ref.endOffset}`;
  });
  return `来源位置：${locations.join("；")}`;
}

export function ConclusionSourceLegend({ provenance }) {
  if (!provenance) return null;
  return (
    <aside className="copilot-source-legend" aria-label="结论来源标记说明">
      <strong>如何读来源标记</strong>
      <span><i className="is-confirmed-fact" />已确认事实：来自你确认过的简历内容</span>
      <span><i className="is-rule-inference" />规则推断：由浏览器本地规则形成的判断</span>
      <span><i className="is-public-source" />公开资料：仅在有来源链接和核验日期时显示</span>
      <small>点击任一结论下方的“查看判断依据”，可核对简历事实、规则编号和公开来源。</small>
    </aside>
  );
}
