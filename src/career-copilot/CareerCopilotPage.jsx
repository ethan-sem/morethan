import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { careerCopilotFeatures } from "./config.js";
import { getFlowIndex } from "./domain/flow.js";
import { useCareerFlow } from "./hooks/useCareerFlow.js";
import { CopilotErrorBoundary } from "./components/CopilotErrorBoundary.jsx";
import { CopilotFooter, CopilotHeader, CopilotProgress } from "./components/CopilotChrome.jsx";
import { IntroScreen, MaterialScreen } from "./screens/IntroMaterialScreens.jsx";
import { PDF_PARSE_ERROR_MESSAGES } from "./parsers/pdfParser.js";
import { DOCX_PARSE_ERROR_MESSAGES } from "./parsers/docxParser.js";
import { preparePlainText, TXT_PARSE_ERROR_MESSAGES } from "./parsers/txtParser.js";
import { parseResumeInWorker } from "./parsers/resumeParserWorkerClient.js";
import { RESUME_WORKER_ERROR_MESSAGES } from "./parsers/resumeParserWorkerRuntime.js";
import { detectPrivateFields } from "./privacy/piiDetector.js";
import { extractResumeFactsInWorker } from "./extractors/resumeFactsWorkerClient.js";
import { FACTS_WORKER_ERROR_MESSAGES } from "./extractors/resumeFactsWorkerRuntime.js";
import {
  FILE_VALIDATION_ERROR_MESSAGES,
  getResumeErrorDetails,
  inferResumeFormatFromName,
  validateResumeFile,
} from "./parsers/resumeFileValidation.js";
import { createCareerSessionResourceRegistry } from "./lib/careerSessionCleanup.js";

const FOOTER_HIDDEN_STEPS = new Set(["intro", "report", "actions"]);
const EMPTY_PARSE_STATE = Object.freeze({ status: "idle", progress: 0, result: null, error: null });
const EMPTY_COMPANY_ROLE_STATE = Object.freeze({ status: "idle", recommendations: null });
const EMPTY_RECOMMENDATION_EXCLUSIONS = Object.freeze({ companies: "", locations: "", industries: "" });
const FactsScreen = lazyNamed(() => import("./screens/FactsGoalsScreens.jsx"), "FactsScreen");
const GoalsScreen = lazyNamed(() => import("./screens/FactsGoalsScreens.jsx"), "GoalsScreen");
const QuestionsScreen = lazyNamed(() => import("./screens/FactsGoalsScreens.jsx"), "QuestionsScreen");
const GeneratingScreen = lazyNamed(() => import("./screens/AnalysisScreens.jsx"), "GeneratingScreen");
const ReportScreen = lazyNamed(() => import("./screens/AnalysisScreens.jsx"), "ReportScreen");
const ActionsScreen = lazyNamed(() => import("./screens/ActionSettingsScreens.jsx"), "ActionsScreen");
const loadAnalysisPipeline = () => import("./domain/analysisPipeline.js");

export function CareerCopilotPage({ navigate, registerLeaveGuard }) {
  return (
    <CopilotErrorBoundary>
      <CareerCopilotExperience navigate={navigate} registerLeaveGuard={registerLeaveGuard} />
    </CopilotErrorBoundary>
  );
}

export function CareerCopilotExperience({ navigate, registerLeaveGuard }) {
  const { state, navigate: navigateFlow, next, back } = useCareerFlow();
  const [resumeName, setResumeName] = useState("");
  const [notice, setNotice] = useState("");
  const [documentParse, setDocumentParse] = useState(EMPTY_PARSE_STATE);
  const [careerStage, setCareerStage] = useState("internship");
  const [targetDirection, setTargetDirection] = useState("product-manager");
  const [backupDirections, setBackupDirections] = useState([]);
  const [targetLocations, setTargetLocations] = useState(["上海"]);
  const [applicationStart, setApplicationStart] = useState("30_days");
  const [hardConstraints, setHardConstraints] = useState("");
  const [recommendationExclusions, setRecommendationExclusions] = useState(EMPTY_RECOMMENDATION_EXCLUSIONS);
  const [careerAnalysis, setCareerAnalysis] = useState(null);
  const [jdText, setJdText] = useState("");
  const [jdProfile, setJdProfile] = useState(null);
  const [jdError, setJdError] = useState("");
  const [jdGapAnalysis, setJdGapAnalysis] = useState(null);
  const [applicationTierPlan, setApplicationTierPlan] = useState(null);
  const [actionPlan, setActionPlan] = useState(null);
  const [completedActionIds, setCompletedActionIds] = useState(() => new Set());
  const [conclusionProvenance, setConclusionProvenance] = useState(null);
  const [evidenceDegradation, setEvidenceDegradation] = useState(null);
  const [companyRoleState, setCompanyRoleState] = useState(EMPTY_COMPANY_ROLE_STATE);
  const parseControllerRef = useRef(null);
  const documentSequenceRef = useRef(0);
  const stageRef = useRef(null);
  const previousStepRef = useRef(state.step);
  const companyLoadSequenceRef = useRef(0);
  const sessionResourcesRef = useRef(null);
  if (sessionResourcesRef.current === null) sessionResourcesRef.current = createCareerSessionResourceRegistry();

  const protectAndExtractParsedResult = async (result, format, signal) => {
    documentSequenceRef.current += 1;
    const documentId = `resume-document-${documentSequenceRef.current}`;
    const privateFields = detectPrivateFields(result.text, { documentId });
    setDocumentParse((current) => ({ ...current, phase: "extracting", progress: 100 }));
    const resumeFacts = await extractResumeFactsInWorker({
      text: result.text,
      documentId,
      format,
      characterCount: result.characterCount,
      pages: result.pages,
      privateFields,
      signal,
    });
    return {
      ...result,
      format,
      documentId,
      privateFields: resumeFacts.privateFields,
      resumeFacts,
    };
  };

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (previousStepRef.current === state.step) return;
    previousStepRef.current = state.step;
    const focusHeading = () => {
      const heading = stageRef.current?.querySelector("h1");
      if (!heading) return false;
      heading.setAttribute("tabindex", "-1");
      heading.focus();
      return true;
    };
    if (focusHeading()) return undefined;
    const observer = new MutationObserver(() => { if (focusHeading()) observer.disconnect(); });
    if (stageRef.current) observer.observe(stageRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [state.step]);

  useEffect(() => () => {
    sessionResourcesRef.current?.clear("page_unmounted");
  }, []);

  const hasUnsavedReportSession = Boolean(documentParse.result || jdText || careerAnalysis || actionPlan);
  const shouldWarnBeforeLeave = hasUnsavedReportSession;
  useEffect(() => {
    if (!shouldWarnBeforeLeave) return undefined;
    const warnBeforeLeave = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [shouldWarnBeforeLeave]);

  useEffect(() => {
    if (typeof registerLeaveGuard !== "function") return undefined;
    return registerLeaveGuard(() => !shouldWarnBeforeLeave || window.confirm("本次简历、分析和行动计划不会自动保存。确定离开智能求职助手吗？"));
  }, [registerLeaveGuard, shouldWarnBeforeLeave]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    parseControllerRef.current?.abort();
    setResumeName(file.name);

    const controller = new AbortController();
    const unregisterController = sessionResourcesRef.current.registerAbortController(controller);
    parseControllerRef.current = controller;
    let format = inferResumeFormatFromName(file.name) ?? "file";
    setDocumentParse({ status: "loading", format, progress: 0, result: null, error: null });

    try {
      const validated = await validateResumeFile(file, { signal: controller.signal });
      format = validated.format;
      setDocumentParse((current) => ({ ...current, format }));
      const result = await parseResumeInWorker({
        format,
        data: validated.data,
        signal: controller.signal,
        onProgress: ({ percent }) => setDocumentParse((current) => ({ ...current, progress: percent })),
      });
      if (controller.signal.aborted) return;
      const protectedResult = await protectAndExtractParsedResult(result, format, controller.signal);
      if (controller.signal.aborted) return;
      setDocumentParse({ status: "success", format, progress: 100, result: protectedResult, error: null });
      setNotice(format === "pdf" ? `已在本地读取 ${result.pageCount} 页 PDF` : `已在本地读取 ${format.toUpperCase()} 正文`);
    } catch (error) {
      if (controller.signal.aborted) return;
      const fallbackCode = format === "pdf" ? "PDF_PARSE_FAILED" : format === "docx" ? "DOCX_PARSE_FAILED" : format === "txt" ? "TXT_UNSUPPORTED_INPUT" : "FILE_INVALID_INPUT";
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : fallbackCode;
      const messages = format === "pdf" ? PDF_PARSE_ERROR_MESSAGES : format === "docx" ? DOCX_PARSE_ERROR_MESSAGES : format === "txt" ? TXT_PARSE_ERROR_MESSAGES : FILE_VALIDATION_ERROR_MESSAGES;
      const message = FILE_VALIDATION_ERROR_MESSAGES[code] ?? RESUME_WORKER_ERROR_MESSAGES[code] ?? FACTS_WORKER_ERROR_MESSAGES[code] ?? messages[code] ?? messages[fallbackCode] ?? FILE_VALIDATION_ERROR_MESSAGES.FILE_INVALID_INPUT;
      setDocumentParse({
        status: "error",
        format,
        progress: 0,
        result: null,
        error: getResumeErrorDetails(code, message),
      });
    } finally {
      unregisterController();
      if (parseControllerRef.current === controller) parseControllerRef.current = null;
    }
  };

  const handleTextSubmit = async (text, source) => {
    parseControllerRef.current?.abort();
    const controller = new AbortController();
    const unregisterController = sessionResourcesRef.current.registerAbortController(controller);
    parseControllerRef.current = controller;
    setDocumentParse({ status: "loading", format: source, phase: "extracting", progress: 100, result: null, error: null });
    try {
      const result = preparePlainText(text, { source });
      setResumeName(source === "paste" ? "已粘贴简历文本" : "已手工填写简历信息");
      const protectedResult = await protectAndExtractParsedResult(result, source, controller.signal);
      if (controller.signal.aborted) return;
      setDocumentParse({ status: "success", format: source, progress: 100, result: protectedResult, error: null });
      setNotice(source === "paste" ? "已使用粘贴文本" : "已整理手工填写内容");
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "TXT_UNSUPPORTED_INPUT";
      setDocumentParse({
        status: "error",
        format: source,
        progress: 0,
        result: null,
        error: getResumeErrorDetails(code, FACTS_WORKER_ERROR_MESSAGES[code] ?? TXT_PARSE_ERROR_MESSAGES[code] ?? TXT_PARSE_ERROR_MESSAGES.TXT_UNSUPPORTED_INPUT),
      });
    } finally {
      unregisterController();
      if (parseControllerRef.current === controller) parseControllerRef.current = null;
    }
  };

  const handleCancelParse = () => {
    const controller = parseControllerRef.current;
    if (!controller) return;
    controller.abort("user_cancelled");
    parseControllerRef.current = null;
    setResumeName("");
    setDocumentParse(EMPTY_PARSE_STATE);
    setCareerStage("internship");
    setTargetDirection("product-manager");
    setBackupDirections([]);
    setTargetLocations(["上海"]);
    setApplicationStart("30_days");
    setHardConstraints("");
    setRecommendationExclusions(EMPTY_RECOMMENDATION_EXCLUSIONS);
    setCareerAnalysis(null);
    setJdText("");
    setJdProfile(null);
    setJdError("");
    setJdGapAnalysis(null);
    setApplicationTierPlan(null);
    setActionPlan(null);
    setCompletedActionIds(new Set());
    setConclusionProvenance(null);
    setEvidenceDegradation(null);
    companyLoadSequenceRef.current += 1;
    setCompanyRoleState(EMPTY_COMPANY_ROLE_STATE);
    setNotice("已停止本地解析");
  };

  const handleResumeFactsChange = (resumeFacts) => {
    setCareerAnalysis(null);
    setJdGapAnalysis(null);
    setApplicationTierPlan(null);
    setActionPlan(null);
    setCompletedActionIds(new Set());
    setConclusionProvenance(null);
    setEvidenceDegradation(null);
    companyLoadSequenceRef.current += 1;
    setCompanyRoleState(EMPTY_COMPANY_ROLE_STATE);
    setDocumentParse((current) => current.result ? { ...current, result: { ...current.result, resumeFacts } } : current);
  };

  const handleFactsComplete = (resumeFacts) => {
    handleResumeFactsChange(resumeFacts);
    next();
  };

  const loadCompanyRecommendations = (directionId, recruitmentType) => {
    const sequence = companyLoadSequenceRef.current + 1;
    companyLoadSequenceRef.current = sequence;
    setCompanyRoleState({ status: "loading", recommendations: null });
    Promise.all([
      import("./lib/companyRolePoolLoader.js"),
      import("./domain/companyRoleRecommendations.js"),
    ]).then(async ([loader, recommendations]) => {
      const pool = await loader.loadCompanyRolePoolByDirection(directionId);
      return recommendations.createCompanyRoleRecommendations(pool, {
        directionId,
        recruitmentType,
        targetLocations,
        excludedCompanies: splitGoalTerms(recommendationExclusions.companies),
        excludedLocations: splitGoalTerms(recommendationExclusions.locations),
        excludedIndustries: splitGoalTerms(recommendationExclusions.industries),
      });
    }).then((result) => {
      if (companyLoadSequenceRef.current === sequence) setCompanyRoleState({ status: "ready", recommendations: result });
    }).catch(() => {
      if (companyLoadSequenceRef.current === sequence) setCompanyRoleState({ status: "error", recommendations: null });
    });
  };

  const handleGoalsComplete = async () => {
    const resumeFacts = documentParse.result?.resumeFacts;
    if (!resumeFacts) return;
    try {
      const pipeline = await loadAnalysisPipeline();
      const initial = pipeline.createInitialAnalysis(resumeFacts, targetDirection);
      setJdProfile(null);
      setJdGapAnalysis(null);
      setApplicationTierPlan(null);
      setActionPlan(null);
      setCompletedActionIds(new Set());
      setConclusionProvenance(null);
      companyLoadSequenceRef.current += 1;
      setCompanyRoleState(EMPTY_COMPANY_ROLE_STATE);
      setCareerAnalysis(initial.careerAnalysis);
      setEvidenceDegradation(initial.evidenceDegradation);
      next();
    } catch {
      setNotice("暂时无法生成关键追问，请返回核对已确认事实");
    }
  };

  const handleDegradationAnswer = async (itemId, answer) => {
    const pipeline = await loadAnalysisPipeline();
    setEvidenceDegradation((current) => current ? pipeline.answerAnalysisQuestion(current, itemId, answer) : current);
  };

  const handleQuestionsComplete = async () => {
    const resumeFacts = documentParse.result?.resumeFacts;
    if (!resumeFacts) {
      setNotice("请先完成事实确认，再生成方向画像");
      return;
    }
    try {
      const pipeline = await loadAnalysisPipeline();
      const result = pipeline.createCompleteAnalysis({ resumeFacts, targetDirection, jdText, jdAnalysisEnabled: careerCopilotFeatures.jdAnalysis, careerStage, previousDegradation: evidenceDegradation });
      setJdProfile(result.jdProfile);
      setJdGapAnalysis(result.jdGapAnalysis);
      setApplicationTierPlan(result.applicationTierPlan);
      setActionPlan(result.actionPlan);
      setCompletedActionIds(new Set());
      setConclusionProvenance(result.conclusionProvenance);
      setEvidenceDegradation(result.evidenceDegradation);
      setJdError("");
      setCareerAnalysis(result.careerAnalysis);
      loadCompanyRecommendations(result.careerAnalysis.direction.selected, careerStage);
      next();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code.startsWith("JD_")) {
        setJdError(code === "JD_TEXT_TOO_SHORT" ? "JD 内容过短，请粘贴更完整的职责或要求；也可以清空后跳过。" : code === "JD_TEXT_TOO_LONG" ? "JD 超过 30,000 字，请只保留岗位职责、要求和加分项。" : "JD 未能识别，请检查文本后重试或清空跳过。");
        return;
      }
      setNotice("本地分析未能完成，请返回核对事实后重试");
    }
  };

  const handleJdChange = (value) => {
    setJdText(value);
    setJdProfile(null);
    setJdGapAnalysis(null);
    setApplicationTierPlan(null);
    setActionPlan(null);
    setCompletedActionIds(new Set());
    setConclusionProvenance(null);
    companyLoadSequenceRef.current += 1;
    setCompanyRoleState(EMPTY_COMPANY_ROLE_STATE);
    setJdError("");
  };

  const handleDirectionChange = (direction) => {
    setTargetDirection(direction);
    setBackupDirections((current) => current.filter((value) => value !== direction));
  };
  const toggleActionComplete = (id) => setCompletedActionIds((current) => {
    const updated = new Set(current);
    if (updated.has(id)) updated.delete(id); else updated.add(id);
    return updated;
  });

  const screen = {
    intro: <IntroScreen onStart={() => navigateFlow("material")} onExample={() => navigateFlow("report", { allowUnvisited: true })} />,
    material: <MaterialScreen resumeName={resumeName} onFile={handleFile} onTextSubmit={handleTextSubmit} onCancelParse={handleCancelParse} onNext={next} parsingEnabled={careerCopilotFeatures.localResumeParsing} documentParse={documentParse} />,
    facts: <FactsScreen resumeFacts={documentParse.result?.resumeFacts ?? null} resumeText={documentParse.result?.text ?? ""} onChange={handleResumeFactsChange} onNext={handleFactsComplete} />,
    goals: <GoalsScreen stage={careerStage} direction={targetDirection} backupDirections={backupDirections} targetLocations={targetLocations} applicationStart={applicationStart} hardConstraints={hardConstraints} exclusions={recommendationExclusions} onStageChange={setCareerStage} onDirectionChange={handleDirectionChange} onBackupDirectionsChange={setBackupDirections} onTargetLocationsChange={setTargetLocations} onApplicationStartChange={setApplicationStart} onHardConstraintsChange={setHardConstraints} onExclusionsChange={setRecommendationExclusions} onNext={handleGoalsComplete} />,
    questions: <QuestionsScreen jdText={jdText} jdError={jdError} jdAnalysisEnabled={careerCopilotFeatures.jdAnalysis} evidenceDegradation={evidenceDegradation} onDegradationAnswer={handleDegradationAnswer} onCorrectFacts={() => navigateFlow("facts", { allowUnvisited: true })} onJdChange={handleJdChange} onNext={handleQuestionsComplete} />,
    generating: <GeneratingScreen jdProfile={jdProfile} companyRoleStatus={companyRoleState.status} onNext={next} />,
    report: <ReportScreen analysis={careerAnalysis} jdGapAnalysis={jdGapAnalysis} applicationTierPlan={applicationTierPlan} actionPlan={actionPlan} companyRoleRecommendations={companyRoleState.recommendations} companyRoleStatus={companyRoleState.status} conclusionProvenance={conclusionProvenance} evidenceDegradation={evidenceDegradation} resumeFacts={documentParse.result?.resumeFacts ?? null} careerGoals={{ stage: careerStage, direction: targetDirection, backupDirections, targetLocations, applicationStart, hardConstraints, exclusions: recommendationExclusions }} onNext={() => navigateFlow("actions")} onCorrect={() => navigateFlow(careerAnalysis ? "facts" : "material", { allowUnvisited: true })} />,
    actions: <ActionsScreen actionPlan={actionPlan} completedIds={completedActionIds} onToggleComplete={toggleActionComplete} conclusionProvenance={conclusionProvenance} resumeFacts={documentParse.result?.resumeFacts ?? null} />,
  }[state.step];

  return (
    <section id="career-copilot" className="site-page page-career-copilot copilot-page" data-local-parsing-enabled={String(careerCopilotFeatures.localResumeParsing)}>
      <div className="copilot-ambient" aria-hidden="true"><i /><i /><i /></div>
      <div className="copilot-shell">
        <CopilotHeader onExit={() => navigate("home")} />
        {state.step !== "intro" && <CopilotProgress state={state} onNavigate={navigateFlow} />}
        <section ref={stageRef} className="copilot-stage" aria-label="智能求职助手当前步骤" data-flow-state={state.step} data-flow-index={getFlowIndex(state.step)}><Suspense fallback={<StageLoading />}>{screen}</Suspense></section>
        {!FOOTER_HIDDEN_STEPS.has(state.step) && <CopilotFooter onBack={back} />}
      </div>
      <div className={`copilot-notice ${notice ? "is-visible" : ""}`} aria-live="polite">{notice}</div>
      {shouldWarnBeforeLeave && <div className="copilot-ephemeral-reminder" role="status"><ShieldCheck size={15} /><span><strong>本次内容不会自动保存</strong>刷新或关闭页面后，简历与报告将被清除；请先复制或保存 PDF。</span></div>}
    </section>
  );
}

function StageLoading() {
  return <div className="copilot-stage-loading" role="status" aria-live="polite"><span aria-hidden="true" /><strong>正在准备当前步骤</strong><small>你的本次输入仍保留在页面内存中</small></div>;
}

function lazyNamed(loader, name) {
  return lazy(() => loader().then((module) => ({ default: module[name] })));
}

function splitGoalTerms(value) {
  return String(value ?? "").split(/[，、,;；\n]+/).map((term) => term.trim()).filter(Boolean);
}
