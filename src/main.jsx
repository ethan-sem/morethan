import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  HeartHandshake,
  Lightbulb,
  MapPin,
  MessageCircleMore,
  Scale,
  ScanSearch,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import "./styles.css";

if (new URLSearchParams(window.location.search).has("performance-lab")) {
  import("./performanceLab.js").then(({ startPerformanceLab }) => startPerformanceLab());
}
if (new URLSearchParams(window.location.search).has("security-lab")) {
  import("./securityLab.js").then(({ startSecurityLab }) => startSecurityLab());
}
import { CareerCopilotRoute } from "./CareerCopilotRoute.jsx";
import { careerCopilotFeatures } from "./career-copilot/config.js";
import { resolveSitePage } from "./siteRouting.js";

document.documentElement.dataset.careerCopilotEnabled = String(careerCopilotFeatures.enabled);

const navItems = [
  { id: "career-copilot", label: "智能求职助手" },
  { id: "services", label: "服务方案" },
  { id: "proof", label: "学员案例" },
  { id: "community", label: "求职社群" },
  { id: "game", label: "求职生存模拟器" },
  { id: "about", label: "关于我们" },
];

const services = [
  { no: "01", name: "启航计划", title: "校招陪跑", desc: "面向应届生，建立完整而清晰的校招路径" },
  { no: "02", name: "护航计划", title: "实习陪跑", desc: "从第一段实习出发，逐步建立求职优势" },
  { no: "03", name: "求职突围", title: "简历优化", desc: "让每一段真实经历，都被准确看见" },
  { no: "04", name: "求职突围", title: "面试模拟", desc: "在真实面试到来前，完成有针对性的演练" },
];

const stages = [
  { id: "diagnosis", no: "01", en: "DIAGNOSIS", title: "深入分析个人背景", text: "从背景、目标与差距出发，找到真正影响求职结果的关键变量。", tags: ["背景盘点", "短板识别", "目标校准"], icon: ScanSearch },
  { id: "positioning", no: "02", en: "POSITIONING", title: "深度职业规划", text: "将模糊的选择，转化为岗位、企业与时间三条清晰路径。", tags: ["岗位定位", "企业分层", "路径规划"], icon: MapPin },
  { id: "upgrade", no: "03", en: "UPGRADE", title: "全面简历重构", text: "重构简历与项目表达，让真实经历成为经得起追问的有效证据。", tags: ["简历重构", "项目表达", "背景提升"], icon: FileCheck2 },
  { id: "delivery", no: "04", en: "DELIVERY", title: "全流程陪跑", text: "围绕招聘节点、内推机会与阶段复盘，持续而有序地向目标推进。", tags: ["节点管理", "内推机会", "进度复盘"], icon: ArrowUpRight },
  { id: "interview", no: "05", en: "INTERVIEW", title: "大厂导师1v1面试辅导", text: "通过高还原模拟、深入追问与系统复盘，建立稳定的表达能力。", tags: ["模拟面试", "深挖追问", "表达训练"], icon: MessageCircleMore },
  { id: "decision", no: "06", en: "DECISION", title: "选择最适合自己的offer", text: "综合比较平台、成长与回报，在多个 offer 之间找到更适合自己的答案。", tags: ["offer 比较", "谈薪建议", "签约决策"], icon: Target },
];

const internshipJourney = [
  { id: "intern-diagnosis", no: "01", en: "AUDIT", title: "盘点实习竞争力", text: "从年级、专业、现有实习和项目经历出发，判断距离目标岗位还缺少哪些背景、经验与能力。", tags: ["背景盘点", "经历评估", "差距识别"], icon: ScanSearch },
  { id: "intern-positioning", no: "02", en: "DIRECTION", title: "确定实习主攻方向", text: "明确本轮实习的主投岗位、企业分层与投递时间表，让第一段或下一段实习服务于长期发展。", tags: ["岗位选择", "企业分层", "投递规划"], icon: MapPin },
  { id: "intern-upgrade", no: "03", en: "RESUME", title: "打造可投递简历", text: "结合实习岗位JD深挖课程、项目与校园经历，让经历尚少的同学也能形成清晰、可信的表达。", tags: ["经历深挖", "JD匹配", "简历精修"], icon: FileCheck2 },
  { id: "intern-delivery", no: "04", en: "APPLICATION", title: "推进投递与内推", text: "持续同步实习机会与内推信息，规划投递顺序，复盘面邀反馈，并由导师督促每个关键动作。", tags: ["实习机会", "内推直达", "进度督促"], icon: ArrowUpRight },
  { id: "intern-interview", no: "05", en: "INTERVIEW", title: "提前演练实习面试", text: "围绕目标岗位完成简历深挖、专业问题与高还原模拟，帮助经验较少的同学提前熟悉真实面试。", tags: ["面试押题", "模拟演练", "复盘改进"], icon: MessageCircleMore },
  { id: "intern-decision", no: "06", en: "VALUE", title: "选择高价值实习offer", text: "比较岗位内容、平台、成长空间与后续校招价值，选择真正能够补强背景、形成长期优势的实习。", tags: ["含金量判断", "长期价值", "offer选择"], icon: Target },
];

const campusJourney = [
  { id: "campus-diagnosis", no: "01", en: "ASSESSMENT", title: "完成校招五维诊断", text: "从学历、专业、实习、项目与技能五个维度分析优势和差距，确定当届校招中真实可行的起点。", tags: ["五维分析", "竞争力判断", "目标校准"], icon: ScanSearch },
  { id: "campus-positioning", no: "02", en: "STRATEGY", title: "制定完整校招战略", text: "确定主投方向、后备方向、目标企业清单、合理薪资区间与网申节奏，形成完整校招作战方案。", tags: ["方向定位", "企业清单", "校招排期"], icon: MapPin },
  { id: "campus-upgrade", no: "03", en: "CALIBRATION", title: "完成导师与HR双重校准", text: "结合校招规划完成背景与简历准备，由求职导师和HR视角共同评估，确保简历达到校招筛选标准。", tags: ["背景补强", "简历精修", "HR评估"], icon: FileCheck2 },
  { id: "campus-delivery", no: "04", en: "CAMPAIGN", title: "管理网申与笔试节奏", text: "覆盖网申、笔试、投递与招聘节点管理，持续同步校招进度、内推资源和当年真题资料。", tags: ["网申排期", "笔试真题", "投递管理"], icon: ArrowUpRight },
  { id: "campus-interview", no: "05", en: "INTERVIEW", title: "覆盖全场景校招面试", text: "针对群面、Case面、业务面、HR面与加签面开展专项辅导和模拟复盘，系统应对多轮筛选。", tags: ["全场景面试", "1v1模拟", "多轮复盘"], icon: MessageCircleMore },
  { id: "campus-decision", no: "06", en: "SIGNING", title: "完成谈薪、签约与offer决策", text: "从薪资、成长、团队与行业前景等维度评估offer，并提供谈薪、三方签约和违约风险建议。", tags: ["多维评估", "谈薪指导", "签约决策"], icon: Target },
];

const escortComparison = [
  ["适用阶段", "需要寻找实习的非应届本科、硕士与博士生", "参加校招的海内外应届本科、硕士与博士生"],
  ["核心目标", "获得高质量实习，提前建立背景、经验与认知优势", "在正式校招中获得满意offer，完成从学生到职场的转换"],
  ["服务重点", "实习定位、背景补强、简历、投递内推、实习面试与offer选择", "校招战略、简历与HR评估、网申笔试、多轮面试、谈薪与签约"],
  ["导师配置", "2v1专属服务团队，兼顾专业辅导与全程推进", "3v1专属陪跑团队，增加HR视角的校招实战支持"],
  ["服务周期", "从报名持续至成功入职实习后一周", "从报名持续至获得offer，并覆盖谈薪与签约阶段"],
];

const cases = [
  { company: "美团", role: "测试开发实习", profile: "双非大一", result: "3 天入职", track: "研发" },
  { company: "美团", role: "产品运营实习", profile: "商科转型", result: "获得转正机会", track: "互联网" },
  { company: "京东", role: "采销校招 offer", profile: "211 本科", result: "高薪运营岗", track: "校招" },
  { company: "AI 科技", role: "算法 offer", profile: "双 C9 硕", result: "重做求职策略", track: "技术" },
];

const members = [
  ["Ethan", "主管合伙人", "互联网 / 商科", "./assets/team-ethan.jpg", "曾供职于多家互联网中大厂，具备多段商科及互联网行业工作经验，拥有多年求职培训服务经验，尤其擅长互联网行业求职服务。"],
  ["Alex", "互联网团队负责人", "BAT 核心业务线", "./assets/team-alex.jpg", "2019年校招加入BAT，并在核心业务线持续工作至今，在互联网实习、校招及社招求职领域具备丰富经验。"],
  ["William", "商科团队负责人", "金融 / 财会", "./assets/team-william.jpg", "曾供职于银行、事务所、券商等多家金融机构，在金融、财会等财经领域拥有丰富的求职服务执行经验。"],
  ["Mia", "技术团队负责人", "大模型 / 算法", "./assets/team-mia.jpg", "持有清华大学博士学位，毕业后校招进入头部互联网大厂从事大模型算法工作，目前负责团队各方向技术岗位求职服务。"],
  ["Lucas", "国央企团队负责人", "国央企求职", "./assets/team-lucas.jpg", "毕业后持续任职于国企，具备丰富的国央企求职支持经验，在团队中专注于国央企相关求职服务。"],
];

const values = [
  ["敢为极致", "为了1分的改善，甘愿付出100分的努力", Target],
  ["用户至上", "极度关注用户，用户第一、员工第二", HeartHandshake],
  ["结果第一", "以结果为中心，看成绩说话", Trophy],
  ["持续创新", "接受世界始终变化，并主动跟随", Lightbulb],
  ["求真务实", "从实际出发，实事求是，遇事不死脑筋", Scale],
  ["主人翁精神", "勤勉思考、积极行动、主动承担", BriefcaseBusiness],
];

const serviceCatalog = [
  {
    id: "resume",
    no: "01",
    title: "简历修改",
    subtitle: "让真实经历，被准确看见",
    summary: "专业导师围绕目标行业、岗位与JD逐字精修，重构经历表达、量化成果，并对齐招聘筛选标准。",
    directorySummary: ["专业导师围绕目标行业、岗位与JD逐字精修，", "重构经历表达、量化成果，并对齐招聘筛选标准。"],
    audience: ["简历投递后面邀较少", "不知道经历应该如何表达", "希望针对目标岗位深度优化"],
    features: ["目标岗位与JD拆解", "个人经历、优势深挖", "大厂导师1v1精修", "根据学员反馈调整"],
    process: ["提交目标岗位、JD与现有简历", "导师分析问题并沟通目标", "完成简历修改", "内部评估后交付并根据反馈微调"],
    deliverables: ["优化后的简历成品", "针对目标岗位的表达方案", "简历问题与修改逻辑", "后续反馈微调"],
  },
  {
    id: "consulting",
    no: "02",
    title: "1v1咨询",
    subtitle: "大厂导师在线答疑解惑",
    summary: "围绕职业规划、行业认知、岗位选择与offer决策开展一对一深度咨询，提供针对个人情况的求职策略与答疑。",
    directorySummary: ["围绕职业规划、行业认知、岗位选择与offer决策开展一对一深度咨询，", "提供针对个人情况的求职策略与答疑。"],
    audience: ["不确定应该选择什么行业", "不清楚适合投递哪些岗位", "面对多个offer难以做决定"],
    features: ["一对一专属沟通", "个人情况与问题全面拆解", "高密度求职信息", "后续沟通与进一步答疑"],
    process: ["详细描述问题与个人情况", "服务团队进行前置分析", "与专业导师一对一沟通答疑", "形成下一步行动建议并继续答疑"],
    deliverables: ["问题分析与判断依据", "针对个人情况的求职建议", "关键选择的比较框架", "下一步行动方向"],
  },
  {
    id: "interview",
    no: "03",
    title: "面试辅导",
    subtitle: "在真实面试到来前，完成针对性演练",
    summary: "基于目标岗位JD与个人简历定制模拟面试，通过真人演练、深度追问与系统复盘，提升面试表达与应对能力。",
    directorySummary: ["基于目标岗位JD与个人简历定制模拟面试，", "通过真人演练、深度追问与系统复盘，提升面试表达与应对能力。"],
    audience: ["面试经验不足、容易紧张", "各轮面试通过率较低", "希望冲击更高质量offer"],
    features: ["基于岗位JD定制问题", "压力面、情景面与简历深挖", "从回答、语气和状态多维复盘", "面试录屏与后续答疑"],
    process: ["提交目标岗位、JD与简历", "导师准备定制模拟面试", "完成真人模拟、点评与优化", "复盘问题并进行后续答疑"],
    deliverables: ["定制面试问题清单", "真人模拟面试", "逐题点评与改进建议", "面试录屏与复盘资料"],
  },
  {
    id: "background",
    no: "04",
    title: "背景提升",
    subtitle: "内容筹备中",
    summary: "该服务页面正在整理，暂不展示未经确认的服务内容。",
    directorySummary: ["该服务页面正在整理，", "暂不展示未经确认的服务内容。"],
    placeholder: true,
  },
  {
    id: "internship",
    no: "05",
    title: "实习陪跑",
    subtitle: "从0到1的实习一站式解决方案",
    summary: "面向需要寻找实习的非应届本科、硕士与博士生，围绕求职规划、简历、投递、面试与offer选择提供全流程陪跑。",
    directorySummary: ["面向需要寻找实习的非应届本科、硕士与博士生，", "围绕求职规划、简历、投递、面试与offer选择提供全流程陪跑。"],
    audience: ["希望获得第一段高质量实习", "需要用垂直经历为校招建立优势", "求职方向模糊或缺乏有效节奏"],
    features: ["专属导师团队全程陪跑", "定制投递规划与背景分析", "简历优化与模拟面试", "内推机会、答疑与offer管理"],
    process: ["充分沟通个人情况与目标", "制定实习定位与投递规划", "完成简历、投递与面试准备", "持续复盘进展并管理offer选择"],
    deliverables: ["个人实习求职规划", "针对性简历优化", "投递指导与内推信息", "模拟面试、答疑与offer建议"],
    journeyTitle: <>从第一段高质量实习开始，<br />建立背景、经验与认知优势</>,
    journey: internshipJourney,
  },
  {
    id: "campus",
    no: "06",
    title: "校招陪跑",
    subtitle: "从0到1的校招一站式解决方案",
    summary: "面向海内外应届本科、硕士与博士生，从校招定位、背景与简历准备，到投递、笔面试、谈薪及签约进行全周期陪跑。",
    directorySummary: ["面向海内外应届本科、硕士与博士生，", "从校招定位、背景与简历准备，到投递、笔面试、谈薪及签约进行全周期陪跑。"],
    audience: ["即将参加校招的海内外应届生", "需要系统规划投递方向与目标企业", "希望获得全周期支持并提升offer质量"],
    features: ["多导师协同的专属陪跑团队", "定制校招定位与目标企业清单", "简历、笔试与全场景面试辅导", "投递管理、谈薪与签约指导"],
    process: ["分析学历、专业、实习、项目与技能", "制定主投方向、企业清单与时间安排", "完成简历、笔试、投递与面试准备", "持续陪跑至offer比较、谈薪与签约"],
    deliverables: ["完整校招规划方案", "简历与竞争力评估", "笔面试辅导与投递管理", "offer评估、谈薪及签约建议"],
    journeyTitle: <>从校招定位到签约选择，<br />走好每一个关键阶段</>,
    journey: campusJourney,
  },
  {
    id: "solution",
    no: "07",
    title: "求职解决方案",
    subtitle: "充分结合个人背景的一对一定制",
    summary: "如您希望充分结合个人背景，规划包括背景提升、实习陪跑、校招陪跑在内的长周期求职解决方案，我们可以为您1v1定制求职解决方案。",
    directorySummary: ["如您希望充分结合个人背景，规划包括背景提升、实习陪跑、", "校招陪跑在内的长周期求职解决方案，我们可以为您1v1定制求职解决方案。"],
    audience: ["需要规划长周期求职路径", "希望组合多项服务解决复杂问题", "需要根据个人背景定制服务重点"],
    features: ["个人背景与长期目标诊断", "服务模块按实际需要组合", "阶段目标、节奏与重点动态调整", "由专属导师持续跟进"],
    process: ["一对一沟通个人背景与目标", "识别关键差距与服务优先级", "制定长周期组合服务方案", "按阶段执行、复盘并动态调整"],
    deliverables: ["个人求职问题诊断", "长周期求职路径", "定制服务组合与阶段目标", "持续复盘和调整建议"],
  },
];

const homeSlides = [
  {
    id: "services",
    eyebrow: "01 / SERVICES",
    title: "一套完整、系统的\n求职服务解决方案",
    text: "从方向诊断、背景提升到简历优化与面试训练，我们陪伴学员走过求职中的每一个关键阶段。",
    action: "了解服务",
    visual: "path",
  },
  {
    id: "proof",
    eyebrow: "02 / OUTCOMES",
    title: "海量真实案例，\n坚持用结果说话",
    text: "团队帮助学员取得卓越成果，并依托这些结果建立了伟大的口碑与声誉。",
    action: "查看案例",
    visual: "results",
  },
  {
    id: "about",
    eyebrow: "03 / TEAM",
    title: "全方向、多领域的专业导师\n立足一线的服务团队",
    text: "由互联网、商科、技术与国央企方向的专业人士组成，以持续更新的经验回应真实求职市场。",
    action: "认识团队",
    visual: "team",
  },
  {
    id: "community",
    eyebrow: "04 / COMMUNITY",
    title: "加入社群，\n与更多同学并肩前行",
    text: "及时获得岗位机会、真题资料与关键节点信息，也在交流与互助中获得更长期的支持。",
    action: "加入社群",
    visual: "community",
  },
];

function isKnownPage(page) {
  return resolveSitePage(page, { careerCopilotEnabled: true, serviceIds: serviceCatalog.map((service) => service.id) }) === page;
}

function App() {
  const resolvePage = () => {
    const requested = window.location.hash.replace("#", "") || "home";
    return resolveSitePage(requested, { careerCopilotEnabled: careerCopilotFeatures.enabled, serviceIds: serviceCatalog.map((service) => service.id) });
  };
  const [activePage, setActivePage] = useState(resolvePage);
  const [introActive, setIntroActive] = useState(() => !window.location.hash || window.location.hash === "#home");
  const [homeVisit, setHomeVisit] = useState(0);
  const [activeMember, setActiveMember] = useState(0);
  const activePageRef = useRef(activePage);
  const careerCopilotLeaveGuardRef = useRef(null);
  activePageRef.current = activePage;

  const registerCareerCopilotLeaveGuard = useCallback((guard) => {
    careerCopilotLeaveGuardRef.current = guard;
    return () => { if (careerCopilotLeaveGuardRef.current === guard) careerCopilotLeaveGuardRef.current = null; };
  }, []);

  const changeMember = (direction) => {
    setActiveMember((current) => (current + direction + members.length) % members.length);
  };

  const navigate = (page) => {
    const requestedPage = isKnownPage(page) ? page : "home";
    const resolvedPage = !careerCopilotFeatures.enabled && requestedPage === "career-copilot" ? "home" : requestedPage;
    if (activePageRef.current === "career-copilot" && resolvedPage !== "career-copilot" && careerCopilotLeaveGuardRef.current && !careerCopilotLeaveGuardRef.current()) return false;
    if (resolvedPage === "home" && activePage !== "home") {
      setHomeVisit((visit) => visit + 1);
    }
    setActivePage(resolvedPage);
    activePageRef.current = resolvedPage;
    window.location.hash = resolvedPage === "home" ? "" : resolvedPage;
    return true;
  };

  useEffect(() => {
    const syncHash = () => {
      const resolvedPage = resolvePage();
      const requested = window.location.hash.replace("#", "") || "home";
      if (activePageRef.current === "career-copilot" && resolvedPage !== "career-copilot" && careerCopilotLeaveGuardRef.current && !careerCopilotLeaveGuardRef.current()) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#career-copilot`);
        return;
      }
      if (!isKnownPage(requested)) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      if (!careerCopilotFeatures.enabled && window.location.hash === "#career-copilot") window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setActivePage(resolvedPage);
      activePageRef.current = resolvedPage;
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setIntroActive(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setIntroActive(false), 2200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const items = document.querySelectorAll(".reveal");
    items.forEach((item) => item.classList.remove("is-visible"));
    window.scrollTo({ top: 0, behavior: "auto" });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      items.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.18 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [activePage]);

  return (
    <main data-page={activePage} className={introActive ? "intro-active" : "intro-complete"}>
      {introActive && (
        <div className="brand-intro" aria-hidden="true">
          <div className="intro-signature">
            <LogoMark />
            <span>MoreThan<b>求职</b></span>
          </div>
          <div className="intro-curtain" />
        </div>
      )}
      <Header activePage={activePage} navigate={navigate} navItems={navItems.filter((item) => item.id !== "career-copilot" || careerCopilotFeatures.enabled)} />

      <section id="home" key={`home-${homeVisit}`} className="hero reveal site-page page-home">
        <img className="hero-art" src="./assets/morethan-career-path-hero-v2.webp" width="1672" height="941" fetchPriority="high" alt="从诊断、简历到 offer 的求职成长路径" />
        <div className="shell hero-inner">
          <div className="hero-copy">
            <p className="kicker">MORETHAN CAREER EDUCATION</p>
            <h1>
              <span className="title-mask"><span>让每一步求职，</span></span>
              <span className="title-mask"><span>都有清晰方向</span></span>
            </h1>
            <p className="lead">面向实习与校招，以专业、可信的服务，陪伴每一位学员走好长期求职之路。</p>
            <div className="actions">
              <button className="button primary" onClick={() => navigate("services")}>了解服务 <ArrowRight size={17} /></button>
              <button className="button text-button" onClick={() => navigate("proof")}>查看学员案例 <ArrowRight size={17} /></button>
            </div>
          </div>
          <div className="hero-stats" aria-label="服务数据">
            <span><strong>500+</strong>服务学员</span>
            <span><strong>100+</strong>offer 案例</span>
            <span><strong>1000+</strong>深度服务</span>
          </div>
        </div>
          <button className="scroll-cue" onClick={() => document.getElementById("overview")?.scrollIntoView({ behavior: "smooth" })} aria-label="继续浏览首页"><ArrowDown size={18} /></button>
        </section>

        <HomeOverview navigate={navigate} />

      <ServiceHub navigate={navigate} />

      {careerCopilotFeatures.enabled && activePage === "career-copilot" && <CareerCopilotRoute navigate={navigate} registerLeaveGuard={registerCareerCopilotLeaveGuard} />}

      {activePage.startsWith("service-") && (
        <ServiceDetailPage service={serviceCatalog.find((item) => `service-${item.id}` === activePage)} navigate={navigate} />
      )}

      <section id="proof" className="section dark-section reveal site-page page-proof">
        <div className="shell">
          <SectionHead title="每一种结果，都有成长作为证据" light singleLine />
          <div className="case-grid">
            {cases.map((item, index) => (
              <article key={item.role} className="case-item">
                <div><span>{String(index + 1).padStart(2, "0")}</span><small>{item.track}</small></div>
                <strong>{item.company}</strong>
                <h3>{item.role}</h3>
                <p>{item.profile}</p>
                <b>{item.result}</b>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="community" className="section community-section reveal site-page page-community">
        <div className="shell community-layout">
          <div className="community-board" aria-label="社群信息示意">
            <div className="board-head"><span>MORETHAN COMMUNITY</span><b>LIVE</b></div>
            {[
              ["今日内推机会更新", "刚刚更新"],
              ["笔面试真题资料", "海量真题"],
              ["秋招关键节点提醒", "刚刚更新"],
              ["求职问题实时答疑", "免费咨询"],
            ].map(([item, status], index) => (
              <div className="feed" key={item}><span>0{index + 1}</span><strong>{item}</strong><small>{status}</small></div>
            ))}
          </div>
          <div>
              <SectionHead title={<>与更多同行者，<br />一起奔赴远大未来</>} text="及时获得机会、真题与关键节点信息，也遇见与你并肩前进的人。" />
              <div className="check-list">
                {["海量内推机会", "笔面试真题资料", "免费答疑咨询", "同伴交流互助"].map((item) => <span key={item}><Check size={16} />{item}</span>)}
            </div>
            <button className="button primary" onClick={() => navigate("contact")}>免费加入 <ArrowRight size={17} /></button>
          </div>
        </div>
      </section>

      {activePage === "game" && <CareerGamePage />}

        <section id="about" className="section about-section reveal site-page page-about">
          <div className="shell">
            <div className="about-profile">
              <div>
                <p className="kicker">ABOUT MORETHAN</p>
                <h2>一家行业领先的<br />教育咨询服务机构</h2>
              </div>
              <div className="about-profile-copy">
                <p>MoreThan求职是一家行业领先的教育咨询服务机构。自成立以来深度服务24-27届共计1000+名学生，为广泛的非应届生、应届生及职场中期转型人士提供包括求职辅导、背景提升、求职内推及全流程求职陪跑在内的一系列求职咨询服务。</p>
                <p>如今，我们已成长为一站式综合性求职服务方案提供商。</p>
              </div>
            </div>
            <div className="team-layout">
            <div className="team-statement">
              <LogoMark />
              <p>MoreThan不止帮助学员收获 offer，更希望帮助他们建立受益长远的判断力、行动力与成长能力。</p>
            </div>
            <div className="team-carousel" aria-label="导师团队轮播">
              <div className="team-card-stage">
                {members.map(([name, role, domain, image, bio], index) => {
                  const offset = (index - activeMember + members.length) % members.length;
                  const position = offset === 0 ? "is-active" : offset === 1 ? "is-next" : offset === members.length - 1 ? "is-prev" : "is-hidden";
                  return (
                    <article className={`team-card ${position} member-${name.toLowerCase()}`} key={name} aria-hidden={offset !== 0}>
                      <div className="team-portrait"><img src={image} alt={`${name}导师肖像`} /></div>
                      <div className="team-card-copy">
                        <span>0{index + 1} / TEAM</span>
                        <h3>{name}</h3>
                        <strong>{role}</strong>
                        <small>{domain}</small>
                        <p>{bio}</p>
                      </div>
                    </article>
                  );
                })}
                <button className="team-arrow is-left" type="button" aria-label="上一位导师" onClick={() => changeMember(-1)}><ChevronLeft /></button>
                <button className="team-arrow is-right" type="button" aria-label="下一位导师" onClick={() => changeMember(1)}><ChevronRight /></button>
              </div>
              <div className="team-dots" aria-label="选择导师">
                {members.map(([name], index) => <button className={index === activeMember ? "is-active" : ""} type="button" key={name} aria-label={`查看${name}`} onClick={() => setActiveMember(index)} />)}
              </div>
            </div>
            </div>
            <div className="values-section">
              <div className="values-heading">
                <p className="kicker">OUR VALUES</p>
                <h2>我们的价值观</h2>
              </div>
              <div className="values-grid">
                {values.map(([title, text, Icon], index) => (
                  <article key={title}>
                    <div className="value-meta">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {Icon && <span className="value-icon"><Icon size={22} strokeWidth={1.7} /></span>}
                    </div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

      <section id="contact" className="section contact-section reveal site-page page-contact">
        <div className="shell contact-layout">
          <div>
            <p className="kicker light-kicker">START WITH CLARITY</p>
            <h2>先看清问题，<br />再走好下一步。</h2>
            <p>添加微信，从方向定位、简历短板识别开始，获得下一阶段更清晰的行动建议。</p>
            <div className="contact-points">
              <span><b>01</b>方向定位</span><span><b>02</b>短板识别</span><span><b>03</b>行动规划</span>
            </div>
          </div>
          <div className="qr-panel">
            <div className="qr-placeholder">QR</div>
            <strong>MoreThan 求职顾问</strong>
            <span>真实二维码待替换</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function CareerGamePage() {
  return (
    <section id="game" className="site-page page-game game-page">
      <div className="shell game-page-intro">
        <div>
          <p className="kicker">MORETHAN CAREER LAB</p>
          <h1>《活到秋招》</h1>
        </div>
        <div className="game-page-copy">
          <strong>求职生存模拟器</strong>
          <p>用 12—16 次决策走完八个求职阶段。每一局都会根据角色、属性、历史选择和随机种子匹配不同故事。</p>
          <div className="game-page-meta" aria-label="游戏信息">
            <span>单局约 8—12 分钟</span>
            <span>无需登录</span>
            <span>不保存个人信息</span>
          </div>
        </div>
      </div>
      <div className="shell game-embed-shell">
        <div className="game-embed-toolbar">
          <div><b>MoreThan求职</b><span> / 《活到秋招》</span></div>
          <a href="./game/index.html" target="_blank" rel="noopener noreferrer">
            在新窗口打开 <ArrowUpRight size={17} />
          </a>
        </div>
        <iframe
          className="game-embed-frame"
          src="./game/index.html?embed=1"
          title="《活到秋招》求职生存模拟器"
          allow="clipboard-write"
        />
      </div>
    </section>
  );
}

function ServiceHub({ navigate }) {
  return (
    <section id="services" className="site-page page-services service-hub">
      <div className="service-hub-intro">
        <div className="shell service-hub-grid">
          <div>
            <p className="kicker">MORETHAN SERVICES</p>
            <h1>覆盖实习与校招的<br />全链路求职服务</h1>
          </div>
          <div className="service-hub-copy">
            <p>我们提供实习陪跑、校招陪跑、简历修改、面试辅导、答疑咨询与背景提升等服务，同时支持根据个人背景一对一定制求职方案。</p>
            <div><span>超高性价比</span><span>大厂导师</span><span>1v1定制</span></div>
          </div>
        </div>
      </div>
      <div className="shell service-directory">
        <div className="directory-heading">
          <p className="kicker">SERVICE DIRECTORY</p>
          <h2>全链路求职服务</h2>
        </div>
        <div className="directory-group">
          <div className="directory-group-label"><span>01</span><strong>单项服务</strong></div>
          <div className="directory-list">
            {serviceCatalog.slice(0, 4).map((service) => <ServiceDirectoryItem key={service.id} service={service} navigate={navigate} />)}
          </div>
        </div>
        <div className="directory-group">
          <div className="directory-group-label"><span>02</span><strong>陪跑服务</strong></div>
          <div className="directory-list">
            {serviceCatalog.slice(4).map((service) => <ServiceDirectoryItem key={service.id} service={service} navigate={navigate} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceDirectoryItem({ service, navigate }) {
  return (
    <button type="button" onClick={() => navigate(`service-${service.id}`)}>
      <span>{service.no}</span>
      <strong>{service.title}</strong>
      <p>{(service.directorySummary || [service.summary]).map((line) => <span key={line}>{line}</span>)}</p>
      <ArrowUpRight size={22} />
    </button>
  );
}

function ServiceDetailPage({ service, navigate }) {
  if (!service) return null;
  return (
    <section className={`site-page active-service-page service-detail-page${service.placeholder ? " is-placeholder" : ""}`}>
      <div className="service-detail-hero">
        <div className="shell">
          <button className="service-back" type="button" onClick={() => navigate("services")}><ChevronLeft size={18} />服务目录</button>
          <div className="service-detail-title">
            <div>
              <p className="kicker">SERVICE {service.no}</p>
              <h1>{service.title}</h1>
            </div>
            <div>
              <strong>{service.subtitle}</strong>
              <p>{service.summary}</p>
            </div>
          </div>
        </div>
      </div>

      {service.placeholder ? (
        <div className="shell placeholder-service">
          <span>04</span>
          <h2>内容筹备中</h2>
          <p>该服务的具体内容将在完成确认后更新。</p>
          <button className="button primary" type="button" onClick={() => navigate("services")}>返回服务目录 <ArrowRight size={17} /></button>
        </div>
      ) : (
        <>
          <div className="service-audience-band">
            <div className="shell service-audience-grid">
              <div><p className="kicker">WHO IT IS FOR</p><h2>适合谁</h2></div>
              <div>{service.audience.map((item, index) => <p key={item}><span>0{index + 1}</span>{item}</p>)}</div>
            </div>
          </div>
          {service.journey && <EscortComparison active={service.id} />}
          {service.journey && <ServiceJourney service={service} />}
          <ServiceFeatureSection title={service.journey ? "服务保障" : "服务内容"} eyebrow={service.journey ? "SERVICE SUPPORT" : "WHAT WE DO"} items={service.features} />
          <div className="service-detail-cta">
            <div className="shell"><h2>联系求职小助手，获取免费咨询机会</h2><button className="button primary" onClick={() => navigate("contact")}>免费咨询 <ArrowRight size={17} /></button></div>
          </div>
        </>
      )}
    </section>
  );
}

function EscortComparison({ active }) {
  const [hovered, setHovered] = useState(null);
  const highlighted = hovered || active;
  const columnProps = (column) => ({
    className: highlighted === column ? "is-active" : "",
    onMouseEnter: () => setHovered(column),
  });

  return (
    <div className="escort-comparison" onMouseLeave={() => setHovered(null)}>
      <div className="shell">
        <div className="comparison-heading">
          <p className="kicker">WHICH PROGRAM</p>
          <h2>实习陪跑与校招陪跑，<br />有什么不同？</h2>
        </div>
        <div className="comparison-table">
          <div className="comparison-row is-header"><span aria-hidden="true" /><strong {...columnProps("internship")}>实习陪跑</strong><strong {...columnProps("campus")}>校招陪跑</strong></div>
          {escortComparison.map(([label, internship, campus]) => (
            <div className="comparison-row" key={label}>
              <span>{label}</span>
              <p {...columnProps("internship")}>{internship}</p>
              <p {...columnProps("campus")}>{campus}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ServiceJourney({ service }) {
  return (
    <>
      <div className="process-intro service-journey-intro">
        <div className="shell process-heading">
          <p className="kicker">THE MORETHAN METHOD</p>
          <h2>{service.journeyTitle}</h2>
          <div className="process-line">
            {service.journey.map((stage) => <span key={stage.id}><b>{stage.no}</b>{stage.title}</span>)}
          </div>
        </div>
      </div>
      {service.journey.map((stage, index) => <ProcessSection key={stage.id} stage={stage} flip={index % 2 === 1} embedded />)}
    </>
  );
}

function ServiceFeatureSection({ title, eyebrow, items, dark = false }) {
  return (
    <div className={`service-feature-band${dark ? " is-dark" : ""}`}>
      <div className="shell">
        <div className="service-section-heading"><p className="kicker">{eyebrow}</p><h2>{title}</h2></div>
        <div className="service-feature-list">
          {items.map((item, index) => <article key={item}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item}</h3></article>)}
        </div>
      </div>
    </div>
  );
}

function Header({ activePage, navigate, navItems }) {
  return (
    <header className="topbar">
      <div className="shell nav-inner">
        <button className="brand" onClick={() => navigate("home")} aria-label="回到首页"><LogoMark /><span>MoreThan<b>求职</b></span></button>
        <nav aria-label="主导航">{navItems.map((item) => <button className={activePage === item.id || (item.id === "services" && activePage.startsWith("service-")) ? "is-active" : ""} key={item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}</nav>
        <button className="nav-cta" onClick={() => navigate("contact")}>免费咨询 <ArrowUpRight size={16} /></button>
      </div>
    </header>
  );
}

function HomeOverview({ navigate }) {
  const [activeSlide, setActiveSlide] = useState(0);

  const changeSlide = (next) => {
    setActiveSlide((next + homeSlides.length) % homeSlides.length);
  };

  return (
    <section
      id="overview"
      className="home-overview site-page page-home"
      aria-label="MoreThan求职概览"
      tabIndex="0"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") changeSlide(activeSlide - 1);
        if (event.key === "ArrowRight") changeSlide(activeSlide + 1);
      }}
    >
      <div className={`overview-viewport is-${homeSlides[activeSlide].visual}`}>
        <div className="overview-track" style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
          {homeSlides.map((slide) => (
            <article className={`overview-slide overview-${slide.visual}`} key={slide.id}>
              <div className="overview-copy">
                <p className="kicker">{slide.eyebrow}</p>
                <h2>{slide.title}</h2>
                <p>{slide.text}</p>
                <button className="overview-action" onClick={() => navigate(slide.id)}>{slide.action}<ArrowRight size={19} /></button>
              </div>
              <OverviewVisual type={slide.visual} />
            </article>
          ))}
        </div>
        <button className="overview-arrow is-left" type="button" aria-label="上一张" title="上一张" onClick={() => changeSlide(activeSlide - 1)}><ChevronLeft size={24} /></button>
        <button className="overview-arrow is-right" type="button" aria-label="下一张" title="下一张" onClick={() => changeSlide(activeSlide + 1)}><ChevronRight size={24} /></button>
        <div className="overview-dots" role="tablist" aria-label="切换首页概览">
          {homeSlides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-label={`查看${slide.title}`}
              aria-selected={activeSlide === index}
              className={activeSlide === index ? "is-active" : ""}
              onClick={() => changeSlide(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function OverviewVisual({ type }) {
  if (type === "path") {
    return <div className="overview-visual path-visual"><img src="./assets/morethan-career-path-hero-v2.webp" width="1672" height="941" loading="lazy" decoding="async" alt="求职服务路径" /></div>;
  }
  if (type === "results") {
    return <div className="overview-visual results-visual"><span>100+</span><strong>OFFER</strong><div><b>500+</b> 服务学员</div><div><b>1000+</b> 深度服务</div></div>;
  }
  if (type === "team") {
    return <div className="overview-visual team-visual">{members.map(([name, role]) => <div key={name}><span>{name[0]}</span><p><strong>{name}</strong><small>{role}</small></p></div>)}</div>;
  }
  return <div className="overview-visual community-visual"><Users size={34} strokeWidth={1.35} /><div><span>岗位机会</span><span>真题资料</span><span>节点答疑</span><span>同伴交流</span></div></div>;
}

function LogoMark() {
  return <img className="logo" src="./assets/morethan-logo-mark.png" alt="" aria-hidden="true" />;
}

function SectionHead({ title, text, light = false, singleLine = false }) {
  return (
    <div className={`section-head ${light ? "is-light" : ""} ${!text ? "no-description" : ""} ${singleLine ? "single-line" : ""}`}>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

function ProcessSection({ stage, flip, embedded = false }) {
  const Icon = stage.icon;
  return (
    <section id={stage.id} className={`process-section reveal ${embedded ? "long-process-section" : "site-page page-services"} ${flip ? "is-flipped" : ""}`}>
      <div className="shell process-layout">
        <div className="process-visual">
          <div className="visual-plane"><span>{stage.no}</span><Icon size={58} strokeWidth={1.35} /><i /><i /><i /></div>
          <p>{stage.en}</p>
        </div>
        <div className="process-copy">
          <span className="process-number">{stage.no}</span>
          <p className="kicker">{stage.en}</p>
          <h2>{stage.title}</h2>
          <p>{stage.text}</p>
          <div className="check-list">{stage.tags.map((tag) => <span key={tag}><Check size={16} />{tag}</span>)}</div>
        </div>
      </div>
    </section>
  );
}

const rootElement = document.getElementById("root");
const root = globalThis.__moreThanRoot ?? createRoot(rootElement);
globalThis.__moreThanRoot = root;
root.render(<App />);
