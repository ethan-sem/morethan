import { useState } from "react";
import { ArrowRight, Bot, Check, ClipboardPaste, FileText, ListPlus, LockKeyhole, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { ScreenHeading } from "../components/CopilotChrome.jsx";
import { maskPrivateFieldsInText } from "../privacy/piiDetector.js";

export function IntroScreen({ onStart, onExample }) {
  return (
    <div className="copilot-intro-screen">
      <div className="copilot-intro-copy">
        <p className="copilot-eyebrow">EDUTORO CAREER COPILOT / 01</p>
        <h1>先看清位置，<br />再决定怎么走。</h1>
        <p className="copilot-intro-lead">提交简历和求职方向，获得一份有证据、有分层、有优先级的求职诊断。</p>
        <div className="copilot-intro-actions">
          <button type="button" className="copilot-primary" onClick={onStart}>开始免费诊断 <ArrowRight size={18} /></button>
          <button type="button" className="copilot-link" onClick={onExample}>查看示例报告 <ArrowRight size={17} /></button>
        </div>
        <div className="copilot-intro-meta">
          <span><FileText size={16} />支持 PDF / DOCX / TXT</span>
          <span><LockKeyhole size={16} />简历仅在本地处理</span>
          <span><Sparkles size={16} />完整功能免费</span>
        </div>
      </div>
      <div className="copilot-decision-panel" aria-label="诊断内容预览">
        <div className="decision-panel-head"><span>CAREER DIAGNOSIS</span><b>LOCAL</b></div>
        <div className="decision-orbit" aria-hidden="true"><i /><i /><Bot size={48} /></div>
        <div className="decision-signals">
          <article><small>01</small><strong>核心优势</strong><span>证据化判断</span></article>
          <article><small>02</small><strong>公司分层</strong><span>岗位 × 批次</span></article>
          <article><small>03</small><strong>行动计划</strong><span>7 天 / 30 天</span></article>
        </div>
        <p><ShieldCheck size={16} />规则生成建议，不构成录用保证</p>
      </div>
    </div>
  );
}

export function MaterialScreen({ resumeName, onFile, onTextSubmit, onCancelParse, onNext, parsingEnabled, documentParse }) {
  const isLoading = documentParse.status === "loading";
  const [textMode, setTextMode] = useState("paste");
  const [pastedText, setPastedText] = useState("");
  const [manualFields, setManualFields] = useState({ education: "", experience: "", projects: "", skills: "" });
  const updateManual = (field, value) => setManualFields((current) => ({ ...current, [field]: value }));
  const submitManual = () => {
    const labels = { education: "教育经历", experience: "实习/工作经历", projects: "项目经历", skills: "技能与证书" };
    const text = Object.entries(manualFields).filter(([, value]) => value.trim()).map(([key, value]) => `${labels[key]}\n${value.trim()}`).join("\n\n");
    onTextSubmit(text, "manual");
  };
  const inputModes = ["paste", "manual"];
  const handleTextModeKeyDown = (event) => {
    const currentIndex = inputModes.indexOf(textMode);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % inputModes.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + inputModes.length) % inputModes.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = inputModes.length - 1;
    else return;
    event.preventDefault();
    const nextMode = inputModes[nextIndex];
    setTextMode(nextMode);
    document.getElementById(`copilot-text-tab-${nextMode}`)?.focus();
  };
  return (
    <div className="copilot-form-screen">
      <ScreenHeading number="01" eyebrow="SUBMIT MATERIAL" title="从一份真实简历开始" text="支持 PDF、DOCX、TXT、直接粘贴或手工填写；所有内容都只在浏览器本地处理。" />
      <div className="copilot-upload-grid">
        <label className="copilot-upload-zone" aria-disabled={!parsingEnabled}>
          <input type="file" accept=".pdf,.docx,.txt" onChange={onFile} disabled={!parsingEnabled || isLoading} />
          <UploadCloud size={42} strokeWidth={1.4} />
          <strong>{resumeName || "选择 PDF、DOCX 或文本简历"}</strong>
          <span>{isLoading ? `正在本地读取 ${documentParse.format.toUpperCase()}${documentParse.format === "pdf" ? ` · ${documentParse.progress}%` : ""}` : resumeName ? "文件与提取文本只保留在当前页面内存中" : "单个文件上限 10MB，建议 PDF 不超过 20 页"}</span>
          <b>{parsingEnabled ? (isLoading ? "正在解析" : resumeName ? "重新选择" : "选择文件") : "本地解析暂时关闭"}</b>
        </label>
        <aside className="copilot-privacy-card">
          <ShieldCheck size={24} />
          <h2>提交前，请先保护自己</h2>
          <p>建议删除身份证号、详细住址、银行卡、健康信息，以及与求职无关的第三方联系方式。</p>
          <div><Check size={15} />姓名与联系方式不参与能力分析</div>
          <div><Check size={15} />原始文件、正文和报告不自动保存</div>
          <div><Check size={15} />当前版本没有账号和云端档案</div>
          <div><Check size={15} />本地规则生成，不调用生成式 AI</div>
        </aside>
      </div>
      <section className="copilot-text-entry" aria-labelledby="copilot-text-entry-title">
        <div className="copilot-text-entry-head">
          <div><small>NO FILE? NO PROBLEM</small><h2 id="copilot-text-entry-title">也可以直接提供文字</h2></div>
          <div role="tablist" aria-label="选择文字输入方式">
            <button id="copilot-text-tab-paste" type="button" role="tab" aria-controls="copilot-text-panel-paste" aria-selected={textMode === "paste"} tabIndex={textMode === "paste" ? 0 : -1} className={textMode === "paste" ? "is-selected" : ""} onKeyDown={handleTextModeKeyDown} onClick={() => setTextMode("paste")}><ClipboardPaste size={16} />粘贴完整简历</button>
            <button id="copilot-text-tab-manual" type="button" role="tab" aria-controls="copilot-text-panel-manual" aria-selected={textMode === "manual"} tabIndex={textMode === "manual" ? 0 : -1} className={textMode === "manual" ? "is-selected" : ""} onKeyDown={handleTextModeKeyDown} onClick={() => setTextMode("manual")}><ListPlus size={16} />手工填写</button>
          </div>
        </div>
        {textMode === "paste" ? (
          <div id="copilot-text-panel-paste" className="copilot-paste-panel" role="tabpanel" aria-labelledby="copilot-text-tab-paste">
            <label htmlFor="copilot-pasted-resume">粘贴简历全文</label>
            <textarea id="copilot-pasted-resume" value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="从 Word、PDF 或招聘网站复制简历文字到这里……" />
            <div><small>{pastedText.replace(/\s/gu, "").length} 个非空白字符</small><button type="button" onClick={() => onTextSubmit(pastedText, "paste")}>使用粘贴文本 <ArrowRight size={16} /></button></div>
          </div>
        ) : (
          <div id="copilot-text-panel-manual" className="copilot-manual-panel" role="tabpanel" aria-labelledby="copilot-text-tab-manual">
            <ManualField id="education" label="教育经历" value={manualFields.education} onChange={(value) => updateManual("education", value)} placeholder="学校、专业、学历、起止时间" />
            <ManualField id="experience" label="实习/工作经历" value={manualFields.experience} onChange={(value) => updateManual("experience", value)} placeholder="公司、岗位、职责和结果" />
            <ManualField id="projects" label="项目经历" value={manualFields.projects} onChange={(value) => updateManual("projects", value)} placeholder="项目目标、你的动作和成果" />
            <ManualField id="skills" label="技能与证书" value={manualFields.skills} onChange={(value) => updateManual("skills", value)} placeholder="工具、语言、证书或作品链接说明" />
            <div className="copilot-manual-submit"><button type="button" onClick={submitManual}>整理填写内容 <ArrowRight size={16} /></button></div>
          </div>
        )}
      </section>
      <DocumentParseStatus state={documentParse} onCancel={onCancelParse} />
      <div className="copilot-screen-cta"><button type="button" className="copilot-primary" onClick={onNext} disabled={documentParse.status !== "success"}>{documentParse.status === "success" ? "确认文本并继续" : "请先提供简历材料"} <ArrowRight size={17} /></button></div>
    </div>
  );
}

function ManualField({ id, label, value, onChange, placeholder }) {
  return <label htmlFor={`copilot-manual-${id}`}><span>{label}</span><textarea id={`copilot-manual-${id}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function DocumentParseStatus({ state, onCancel }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    const isIndeterminate = state.format !== "pdf";
    const isExtracting = state.phase === "extracting";
    return (
      <div className={`copilot-parse-status is-loading${isIndeterminate ? " is-indeterminate" : ""}`} role="status">
        <span style={isIndeterminate ? undefined : { width: `${state.progress}%` }} />
        <strong>{isExtracting ? "正在独立线程识别经历事实" : `正在独立解析线程读取 ${state.format.toUpperCase()}`}</strong>
        <small>{isExtracting ? "正在生成带来源位置和置信度的待确认事实" : "页面仍可操作，不会向网络发送文件或正文"}</small>
        <button type="button" className="copilot-cancel-parse" onClick={onCancel}>停止解析</button>
      </div>
    );
  }
  if (state.status === "error") {
    return <div className="copilot-parse-status is-error" role="alert"><strong>{state.error.title ?? "当前内容暂时无法使用"}</strong><p>{state.error.message}</p>{state.error.action && <p className="copilot-error-action">下一步：{state.error.action}</p>}<small>错误码：{state.error.code}</small></div>;
  }
  if (state.status === "success") {
    const protectedText = maskPrivateFieldsInText(state.result.text, state.result.privateFields ?? [], { documentId: state.result.documentId });
    const preview = protectedText.slice(0, 360);
    const privateFieldCount = state.result.privateFields?.length ?? 0;
    const factCount = state.result.resumeFacts?.facts.length ?? 0;
    const timelineFlagCount = state.result.resumeFacts?.timelineFlags.length ?? 0;
    const formatLabels = { pdf: "PDF", docx: "DOCX", txt: "TXT", paste: "粘贴文本", manual: "手工填写" };
    const summary = state.result.format === "pdf"
      ? `${state.result.pageCount} 页`
      : `${state.result.paragraphCount} 个文本段落`;
    return (
      <div className="copilot-parse-status is-success" role="status">
        <strong><Check size={17} />本地文本读取完成</strong>
        <small>{formatLabels[state.result.format]} · {summary} · {state.result.characterCount} 个非空白字符{factCount ? ` · ${factCount} 条事实待确认` : ""}{timelineFlagCount ? ` · ${timelineFlagCount} 项时间提示` : ""}{privateFieldCount ? ` · ${privateFieldCount} 项敏感信息已默认遮罩` : ""}{state.result.warnings.length ? ` · ${state.result.warnings.length} 项解析提示` : ""}</small>
        <pre>{preview}{protectedText.length > preview.length ? "…" : ""}</pre>
      </div>
    );
  }
  return null;
}
