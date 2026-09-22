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
  X,
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
import { cases } from "./caseData.js";
import { resolveSitePage } from "./siteRouting.js";

document.documentElement.dataset.careerCopilotEnabled = String(careerCopilotFeatures.enabled);

const navItems = [
  { id: "career-copilot", label: "智能求职助手" },
  { id: "services", label: "服务方案" },
  { id: "proof", label: "学员案例" },
  { id: "community", label: "求职社群" },
  { id: "about", label: "关于我们" },
];

const hiddenPublicPageIds = Object.freeze(["career-copilot"]);

const caseDetailDemos = Object.freeze({
  "美团-测试开发实习": {
    classYear: "27届",
    offer: "美团测试开发实习",
    background: "华东地区双非本科｜计算机科学与技术",
    experience: "本地软件企业测试实习（3个月）；校内自动化测试平台项目",
    highlight: "补齐测试方法与接口自动化表达后，完成两轮技术面试。",
  },
  "宝洁-品牌管理实习": {
    classYear: "26届",
    offer: "宝洁品牌管理暑期实习",
    background: "985商科硕士｜市场营销",
    experience: "头部快消市场部实习；校园品牌策划项目负责人",
    highlight: "将市场研究经历重构为消费者洞察案例，并完成英文案例面试训练。",
  },
  "美团-产品运营实习": {
    classYear: "25届",
    offer: "美团产品运营实习",
    background: "211本科｜国际商务",
    experience: "本地生活平台运营实习；校园创业项目核心成员",
    highlight: "围绕用户增长与活动复盘补强数据表达，实现商科背景向互联网运营转型。",
  },
  "中金公司-投行实习": {
    classYear: "24届",
    offer: "中金公司投行实习",
    background: "985金融硕士｜金融学",
    experience: "头部券商行业研究实习；四大交易咨询项目经历",
    highlight: "统一项目口径并强化财务分析细节，完成高强度专业问题模拟。",
  },
});

const caseDetailProfiles = Object.freeze([
  {
    test: (item) => item.industry === "咨询",
    major: "商科 / 理工科 / 人文社科相关专业",
    experiences: ["精品咨询公司项目实习；商业案例竞赛经历", "企业战略部门实习；校内咨询社团项目", "行业研究助理实习；商业分析课程项目", "创业公司战略实习；跨学科案例项目"],
    highlights: ["将开放问题拆解为结构化分析框架，强化假设、验证与结论表达。", "围绕市场规模、盈利逻辑和落地建议完成多轮 Case 模拟。", "补强数据判断与高压沟通，在有限时间内形成清晰、有依据的建议。"],
  },
  {
    test: (item) => /金融|银行|财会/.test(item.industry),
    major: "金融 / 会计 / 经济相关专业",
    experiences: ["区域券商研究助理实习；校级投资分析大赛项目", "会计师事务所审计实习；企业估值课程项目", "精品咨询公司项目实习；商业案例竞赛经历", "银行业务部门实习；校园金融社团研究项目"],
    highlights: ["重构项目逻辑与财务分析口径，强化专业问题的结构化回答。", "补齐行业研究框架，并围绕估值、商业模式和风险点完成模拟面试。", "将零散项目整理为完整案例，提升数据敏感度与高压表达稳定性。"],
  },
  {
    test: (item) => /测试|开发|算法|前端|后端/.test(item.role),
    major: "计算机 / 软件工程相关专业",
    experiences: ["中型科技公司研发实习；校内系统开发项目", "实验室算法项目；开源社区协作经历", "软件企业技术实习；课程设计与工程实践项目", "校园技术团队核心成员；独立开发项目经历"],
    highlights: ["梳理技术栈与项目难点，用可验证的指标呈现工程能力。", "围绕基础知识、项目深挖与系统设计完成多轮模拟面试。", "补齐岗位核心知识，并提升技术方案取舍与复盘表达。"],
  },
  {
    test: (item) => /供应链|采销|渠道|零售规划/.test(item.role),
    major: "工业工程 / 供应链 / 商科相关专业",
    experiences: ["制造企业供应链实习；库存优化课程项目", "零售企业运营实习；校园采购分析项目", "物流企业计划岗实习；数据建模竞赛经历", "快消渠道支持实习；市场调研项目经历"],
    highlights: ["围绕需求预测、库存和跨部门协作重构经历表达。", "补充业务指标与复盘逻辑，强化供应链场景题的分析能力。", "将执行型经历转化为可量化的效率与经营改善成果。"],
  },
  {
    test: (item) => /数据|分析|研究|收益管理/.test(item.role),
    major: "统计学 / 经济学 / 数据科学相关专业",
    experiences: ["互联网平台数据实习；用户行为分析课程项目", "咨询公司分析实习；商业数据竞赛经历", "校内研究助理；独立完成数据建模项目", "零售企业经营分析实习；市场洞察项目"],
    highlights: ["统一业务口径并补强 SQL、指标体系与分析结论的闭环表达。", "从描述数据升级为解释问题，突出洞察形成与业务落地过程。", "围绕估算、案例分析和图表解读完成针对性面试训练。"],
  },
  {
    test: (item) => /产品|策划/.test(item.role),
    major: "商科 / 人文社科 / 工科相关专业",
    experiences: ["创业团队产品实习；校园小程序项目负责人", "互联网运营实习；用户调研与原型设计项目", "创新创业项目核心成员；独立产品分析作品集", "行业研究实习；校园数字化产品项目"],
    highlights: ["从功能描述转向用户问题、方案取舍与结果验证，建立产品闭环。", "围绕需求分析、优先级判断和产品案例完成高还原面试演练。", "重构跨专业经历，突出用户洞察、协作推进与数据复盘能力。"],
  },
  {
    test: () => true,
    major: "市场营销 / 商科 / 人文社科相关专业",
    experiences: ["成长型企业运营实习；校园活动项目负责人", "品牌市场实习；社交媒体内容项目经历", "学生组织核心成员；校企合作项目经历", "本地生活企业实习；用户增长课程项目"],
    highlights: ["将执行事项转化为目标、动作和结果，补强量化与复盘表达。", "围绕用户洞察、活动策略和跨部门协作完成案例面试训练。", "重构岗位匹配逻辑，突出业务理解、推进能力与结果意识。"],
  },
]);

const buildCaseDetail = (item, index) => {
  const featured = caseDetailDemos[`${item.company}-${item.role}`];
  if (featured) return featured;

  const allocationRank = (index * 29) % 64;
  const classYear = allocationRank < 6 ? "24届" : allocationRank < 18 ? "25届" : allocationRank < 38 ? "26届" : "27届";
  const profile = caseDetailProfiles.find((candidate) => candidate.test(item));

  return {
    classYear,
    offer: `${item.company}｜${item.role}`,
    background: `${item.profile}｜${profile.major}`,
    experience: profile.experiences[index % profile.experiences.length],
    highlight: profile.highlights[index % profile.highlights.length],
  };
};

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
  { id: "campus-diagnosis", no: "01", en: "ASSESSMENT", title: "完成求职背景诊断", text: "从学历、专业、实习、项目与技能五个维度分析优势和差距，确定当届校招中真实可行的起点。", tags: ["五维分析", "竞争力判断", "目标校准"], icon: ScanSearch },
  { id: "campus-positioning", no: "02", en: "STRATEGY", title: "制定完整校招战略", text: "确定主投方向、后备方向、目标企业清单、合理薪资区间与网申节奏，形成完整校招作战方案。", tags: ["方向定位", "企业清单", "校招排期"], icon: MapPin },
  { id: "campus-upgrade", no: "03", en: "CALIBRATION", title: "大厂导师与HR辅导", lineTitle: "大厂导师与HR全程陪跑", text: "结合校招规划完成背景与简历准备，由求职导师和HR视角共同评估，确保简历达到校招筛选标准。", tags: ["背景补强", "简历精修", "HR评估"], icon: FileCheck2 },
  { id: "campus-delivery", no: "04", en: "CAMPAIGN", title: "管理网申与笔试节奏", text: "覆盖网申、笔试、投递与招聘节点管理，持续同步校招进度、内推资源和当年真题资料。", tags: ["网申排期", "笔试真题", "投递管理"], icon: ArrowUpRight },
  { id: "campus-interview", no: "05", en: "INTERVIEW", title: "覆盖全场景校招面试", text: "针对群面、Case面、业务面、HR面与加签面开展专项辅导和模拟复盘，系统应对多轮筛选。", tags: ["全场景面试", "1v1模拟", "多轮复盘"], icon: MessageCircleMore },
  { id: "campus-decision", no: "06", en: "SIGNING", title: "完成谈薪、签约\n与offer决策", lineTitle: "完成谈薪、签约\n与offer决策", text: "从薪资、成长、团队与行业前景等维度评估offer，并提供谈薪、三方签约和违约风险建议。", tags: ["多维评估", "谈薪指导", "签约决策"], icon: Target },
];

const escortComparison = [
  ["适用阶段", "需要寻找实习的非应届本科、硕士与博士生", "参加校招的海内外应届本科、硕士与博士生"],
  ["核心目标", "获得高质量实习，提前建立背景、经验与认知优势", "在正式校招中获得满意offer，完成从学生到职场的转换"],
  ["服务重点", "实习定位、背景补强、简历、投递内推、实习面试与offer选择", "校招战略、简历与HR评估、网申笔试、多轮面试、谈薪与签约"],
  ["导师配置", "2v1专属服务团队，兼顾专业辅导与全程推进", "3v1专属陪跑团队，增加HR视角的校招实战支持"],
  ["服务周期", "从报名持续至成功入职实习后一周", "从报名持续至获得offer，并覆盖谈薪与签约阶段"],
];

const members = [
  ["Leon", "主管合伙人", "互联网 / 商科", "./assets/team-ethan.jpg", "Leon曾供职于美团、京东、字节跳动等多家互联网头部大厂，具备丰富互联网行业工作经验，并拥有多年求职培训服务经验。"],
  ["Alex", "互联网团队负责人", "BAT 核心业务线", "./assets/team-alex.jpg", "2019年校招加入BAT，并在核心业务线持续工作至今，在互联网实习、校招及社招求职领域具备丰富经验。"],
  ["Rhea", "商科团队负责人", "战略 / 咨询 / PEVC", "./assets/team-rhea.jpg", "清华大学金融本硕，具备丰富的一二级工作与求职辅导经验，尤其是在战略/咨询/pevc等领域具备诸多卓越洞察。"],
  ["Mia", "技术团队负责人", "大模型 / 算法", "./assets/team-mia.jpg", "持有清华大学博士学位，毕业后校招进入头部互联网大厂从事大模型算法工作，目前负责团队各方向技术岗位求职服务。"],
  ["Lucas", "国央企团队负责人", "国央企求职", "./assets/team-lucas.jpg", "毕业后持续任职于国企，具备丰富的国央企求职支持经验，在团队中专注于国央企相关求职服务。"],
  ["木木", "互联网-产品团队负责人", "斩获美团北斗计划等顶级offer", "./assets/team-mumu.webp", "曾供职于美团、腾讯、字节等大厂，具备多年产品经理正职工作与求职辅导经验。秋招曾收获美团北斗计划、字节sp、腾讯ssp、拼多多管培、快手、虾皮等顶级offer。"],
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
    subtitle: "让真实经历被准确看见",
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
    audience: ["不确定应该选择什么行业", "不清楚适合投递哪些岗位", "面对多个offer难以做决定", "更多求职路上的困惑疑问"],
    features: ["一对一专属沟通", "问题全面拆解", "高密度求职信息", "后续沟通与进一步答疑"],
    process: ["详细描述问题与个人情况", "服务团队进行前置分析", "与专业导师一对一沟通答疑", "形成下一步行动建议并继续答疑"],
    deliverables: ["问题分析与判断依据", "针对个人情况的求职建议", "关键选择的比较框架", "下一步行动方向"],
  },
  {
    id: "interview",
    no: "03",
    title: "面试辅导",
    subtitle: "在真实面试到来前完成针对性演练",
    summary: "基于目标岗位JD与个人简历定制模拟面试，通过真人演练、深度追问与系统复盘，提升面试表达与应对能力。",
    directorySummary: ["基于目标岗位JD与个人简历定制模拟面试，", "通过真人演练、深度追问与系统复盘，提升面试表达与应对能力。"],
    audience: ["面试经验不足、容易紧张", "各轮面试通过率较低", "希望冲击更高质量offer"],
    features: ["基于岗位JD定制问题", "压力面、情景面\n与简历深挖", "从回答、语气和状态\n多维复盘", "面试录屏与后续答疑"],
    process: ["提交目标岗位、JD与简历", "导师准备定制模拟面试", "完成真人模拟、点评与优化", "复盘问题并进行后续答疑"],
    deliverables: ["定制面试问题清单", "真人模拟面试", "逐题点评与改进建议", "面试录屏与复盘资料"],
  },
  {
    id: "background",
    no: "04",
    title: "背景提升",
    subtitle: "高效补齐背景，提升竞争力",
    summary: "大厂导师1v1带教，在真实项目过程中助力学员提升竞争力，极限提升背景",
    directorySummary: ["大厂导师真实项目带教。", "助力学员高效完善简历、补齐背景"],
    placeholder: true,
  },
  {
    id: "internship",
    no: "05",
    title: "精英实习陪跑营",
    subtitle: "从0到1的实习一站式解决方案",
    summary: "面向需要寻找实习的非应届本科、硕士与博士生，围绕求职规划、简历、投递、面试与offer选择提供全流程陪跑。",
    directorySummary: ["面向需要寻找实习的非应届本科、硕士与博士生，", "围绕求职规划、简历、投递、面试与offer选择提供全流程陪跑。"],
    audience: ["希望获得第一段高质量实习", "需要用垂直经历为校招建立优势", "求职方向模糊或缺乏有效节奏"],
    features: ["专属导师团队全程陪跑", "定制投递规划", "简历优化与模拟面试", "内推机会、答疑\n与offer管理"],
    process: ["充分沟通个人情况与目标", "制定实习定位与投递规划", "完成简历、投递与面试准备", "持续复盘进展并管理offer选择"],
    deliverables: ["个人实习求职规划", "针对性简历优化", "投递指导与内推信息", "模拟面试、答疑与offer建议"],
    journeyTitle: <>从第一段高质量实习开始，<br />建立背景、经验与认知优势</>,
    journey: internshipJourney,
  },
  {
    id: "campus",
    no: "06",
    title: "精英校招陪跑营",
    subtitle: "从0到1的校招一站式解决方案",
    summary: "面向海内外应届本科、硕士与博士生，从校招定位、背景与简历准备，到投递、笔面试、谈薪及签约进行全周期陪跑。",
    directorySummary: ["面向海内外应届本科、硕士与博士生，", "从校招定位、背景与简历准备，到投递、笔面试、谈薪及签约进行全周期陪跑。"],
    audience: ["即将参加校招的海内外应届生", "需要系统规划投递方向与目标企业", "希望获得全周期支持并提升offer质量"],
    features: ["多导师协同的\n专属陪跑团队", "定制校招定位\n与目标企业清单", "简历、笔试与\n全场景面试辅导", "投递管理、谈薪\n与签约指导"],
    process: ["分析学历、专业、实习、项目与技能", "制定主投方向、企业清单与时间安排", "完成简历、笔试、投递与面试准备", "持续陪跑至offer比较、谈薪与签约"],
    deliverables: ["完整校招规划方案", "简历与竞争力评估", "笔面试辅导与投递管理", "offer评估、谈薪及签约建议"],
    journeyTitle: <>从校招定位到签约选择，<br />走好每一个关键阶段</>,
    journey: campusJourney,
  },
  {
    id: "solution",
    no: "07",
    title: "顶尖名企计划",
    directoryTitle: "求职陪跑方案定制",
    titleNote: "——1v1定制求职解决方案",
    subtitle: "高阶定制 · 长期求职陪跑",
    summary: "基于学员背景，灵活组合求职服务模块，设计最契合你的专属求职陪跑方案。在长期陪跑过程中，持续积累竞争力。",
    directorySummary: ["结合个人背景与求职目标，灵活组合背景提升、实习陪跑和校招陪跑，", "定制长周期成长路径，并随阶段进展持续调整。"],
    audience: ["希望提前布局求职的研0/低年级同学", "跨专业求职、需要补齐对口经历的同学", "背景或履历较弱、需要系统提升的应届生", "距离秋招尚有一段时间，希望极限逆天改命。"],
    features: ["长期陪跑，\n按阶段设定目标", "针对性方案，\n服务模块灵活组合", "持续复盘，\n不断调整陪跑计划", "多对一求职陪跑服务，\n专业团队持续陪跑"],
    modules: [
      ["背景提升", "补齐对口经历，最快建立基础背景。"],
      ["实习陪跑", "针对于实习的短周期陪跑，详见服务方案—实习陪跑部分。"],
      ["校招陪跑", "针对于校招的最终陪跑，详见服务方案—校招陪跑部分。"],
    ],
    customSteps: [
      ["深度诊断", "梳理学员背景、短板、时间规划。"],
      ["定制方案", "求职团队定制专属陪跑方案。"],
      ["沟通确认", "对齐优先级，明确最终方案。"],
      ["执行复盘", "正式启动求职陪跑服务。"],
    ],
  },
];

const solutionCases = [
  {
    label: "研0长期布局",
    title: "从一段审计实习到大厂转正",
    summary: "3段实习陪跑 + 1轮校招陪跑",
    result: "字节跳动·抖音电商转正 offer",
    startingPoint: "2024年9月，学员推免至两财一贸，研0阶段签约；当时仅有一段事务所审计实习。",
    plan: "结合课程安排、就业目标与预算，将3段实习陪跑安排在研0阶段，并衔接1轮校招陪跑，持续跟进约两年。",
    progress: "陪跑期间陆续获得得物、京东实习机会，逐步积累互联网相关经历。",
  },
  {
    label: "研0提前积累",
    title: "从零实习到快消大厂正式 offer",
    summary: "2段实习陪跑 + 1轮校招陪跑",
    result: "快消大厂正式 offer",
    startingPoint: "2025年12月，学员获得UCL硕士录取，并于研0阶段签约；起点为零实习经历。",
    plan: "根据时间安排与求职目标，规划2段研0实习陪跑及1轮校招陪跑，分阶段跟进求职进展。",
    progress: "陪跑过程中陆续获得大厂实习机会，逐步建立与目标岗位匹配的履历。",
  },
  {
    label: "本科求职转向",
    title: "7个月积累三段实习经历",
    summary: "日常实习冲刺 + 校招陪跑",
    result: "拼多多正式 offer",
    startingPoint: "2026年2月，普通211本科大三学员确定无法保研，且几乎没有实习经历。",
    plan: "团队调整原有方向，转而集中冲刺日常实习，以连续的实习积累补齐求职履历。",
    progress: "7个月内完成三段实习积累，并在后续校招中形成更完整的岗位竞争力。",
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
    title: "多领域的专业导师\n立足一线的服务团队",
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
  return resolveSitePage(page, {
    careerCopilotEnabled: true,
    hiddenPageIds: hiddenPublicPageIds,
    serviceIds: serviceCatalog.map((service) => service.id),
  }) === page;
}

function App() {
  const resolvePage = () => {
    const requested = window.location.hash.replace("#", "") || "home";
    return resolveSitePage(requested, {
      careerCopilotEnabled: careerCopilotFeatures.enabled,
      hiddenPageIds: hiddenPublicPageIds,
      serviceIds: serviceCatalog.map((service) => service.id),
    });
  };
  const [activePage, setActivePage] = useState(resolvePage);
  const [introActive, setIntroActive] = useState(() => !window.location.hash || window.location.hash === "#home");
  const [homeVisit, setHomeVisit] = useState(0);
  const [activeMember, setActiveMember] = useState(0);
  const [activeCaseDetail, setActiveCaseDetail] = useState(null);
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
    const caseItems = document.querySelectorAll(".case-item");
    items.forEach((item) => item.classList.remove("is-visible"));
    caseItems.forEach((item) => item.classList.remove("is-visible"));
    window.scrollTo({ top: 0, behavior: "auto" });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      items.forEach((item) => item.classList.add("is-visible"));
      caseItems.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.01 },
    );
    const caseObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          caseObserver.unobserve(entry.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    items.forEach((item) => observer.observe(item));
    caseItems.forEach((item) => caseObserver.observe(item));
    return () => {
      observer.disconnect();
      caseObserver.disconnect();
    };
  }, [activePage]);

  useEffect(() => {
    if (!activeCaseDetail) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setActiveCaseDetail(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeCaseDetail]);

  return (
    <main data-page={activePage} className={introActive ? "intro-active" : "intro-complete"}>
      {introActive && (
        <div className="brand-intro" aria-hidden="true">
          <div className="intro-signature">
            <LogoMark />
            <span>Edutoro<b>求职</b></span>
          </div>
          <div className="intro-curtain" />
        </div>
      )}
      <Header
        activePage={activePage}
        navigate={navigate}
        navItems={navItems.filter((item) => !hiddenPublicPageIds.includes(item.id) && (item.id !== "career-copilot" || careerCopilotFeatures.enabled))}
      />

      <section id="home" key={`home-${homeVisit}`} className="hero reveal site-page page-home">
        <div className="shell hero-inner">
          <div className="hero-copy">
            <p className="kicker">✦ 2026 求职服务已更新</p>
            <h1>
              <span className="title-mask"><span>让每一步求职，</span></span>
              <span className="title-mask"><span>都有清晰方向</span></span>
            </h1>
            <p className="lead">从方向诊断到简历、面试与 offer 决策，<br />用专业方法和全程陪伴，把求职每一步做实。</p>
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
        <HeroJourneyVisual />
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
          <SectionHead title="每一种成长，都有结果作为证据" light singleLine />
          <div className="case-grid">
            {cases.map((item, index) => {
              const detail = buildCaseDetail(item, index);
              const openDetail = () => setActiveCaseDetail({ ...item, ...detail });
              return (
                <article
                  key={`${item.company}-${item.role}`}
                  className="case-item is-interactive"
                  style={{ "--case-delay": `${(index % 4) * 70}ms` }}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看${detail.offer}匿名化案例`}
                  onClick={openDetail}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetail();
                    }
                  }}
                >
                  <div><small>{item.industry}</small></div>
                  <strong>{item.company}</strong>
                  <h3>{item.role}</h3>
                  <p>{item.profile}</p>
                  <span className="case-open-hint">查看案例 <ArrowUpRight size={15} /></span>
                </article>
              );
            })}
          </div>
        </div>
        {activeCaseDetail && (
          <div className="case-modal-backdrop" role="presentation" onMouseDown={() => setActiveCaseDetail(null)}>
            <article className="case-modal" role="dialog" aria-modal="true" aria-labelledby="case-modal-title" onMouseDown={(event) => event.stopPropagation()}>
              <button className="case-modal-close" type="button" onClick={() => setActiveCaseDetail(null)} aria-label="关闭案例详情" autoFocus><X size={20} /></button>
              <span className="case-modal-year">{activeCaseDetail.classYear}</span>
              <h2 id="case-modal-title">{activeCaseDetail.offer}</h2>
              <dl>
                <div><dt>学员届次</dt><dd>{activeCaseDetail.classYear}</dd></div>
                <div><dt>Offer</dt><dd>{activeCaseDetail.offer}</dd></div>
                <div><dt>BG</dt><dd>{activeCaseDetail.background}</dd></div>
                <div><dt>实习经历</dt><dd>{activeCaseDetail.experience}</dd></div>
              </dl>
              <div className="case-modal-highlight"><small>关键提升</small><p>{activeCaseDetail.highlight}</p></div>
            </article>
          </div>
        )}
      </section>

      <section id="community" className="section community-section reveal site-page page-community">
        <div className="shell community-layout">
          <div className="community-board" aria-label="社群信息示意">
            <div className="board-head"><span>EDUTORO COMMUNITY</span><b>LIVE</b></div>
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

        <section id="about" className="section about-section reveal site-page page-about">
          <div className="shell">
            <div className="about-profile">
              <div>
                <p className="kicker">ABOUT EDUTORO</p>
                <h2>一家行业领先的<br />教育咨询服务机构</h2>
              </div>
              <div className="about-profile-copy">
                <p>Edutoro是一家行业领先的教育咨询服务机构。自成立以来深度服务24-27届共计1000+名学生，为广泛的非应届生、应届生及职场中期转型人士提供包括求职辅导、背景提升、求职内推及全流程求职陪跑在内的一系列求职服务。</p>
                <p>如今，我们已成长为一站式综合性求职服务方案提供商。</p>
              </div>
            </div>
            <div className="team-layout">
            <div className="team-statement">
              <LogoMark />
              <p>Edutoro不止帮助学员收获 offer，更希望以知识连接成长，用专业陪伴每一个关键选择。</p>
            </div>
            <div className="team-carousel" aria-label="导师团队轮播">
              <div className="team-card-stage">
                {members.map(([name, role, domain, image, bio], index) => {
                  const offset = (index - activeMember + members.length) % members.length;
                  const position = offset === 0 ? "is-active" : offset === 1 ? "is-next" : offset === members.length - 1 ? "is-prev" : "is-hidden";
                  return (
                    <article className={`team-card ${position} member-${name.toLowerCase()}`} key={name} aria-hidden={offset !== 0}>
                      <div className="team-portrait"><img src={offset <= 1 || offset === members.length - 1 ? image : undefined} data-src={image} loading={offset === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={offset === 0 ? "high" : "auto"} alt={`${name}导师肖像`} /></div>
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
            <h2>有温度的团队，<br />做有温度的教育</h2>
            <p>添加求职小助手，领取免费求职福利。</p>
          </div>
          <div className="qr-panel">
            <img className="qr-image" src="./assets/contact-wechat-qr.jpg" alt="Edutoro求职小助手微信二维码" />
            <strong>Edutoro 求职小助手</strong>
            <span>微信扫码添加好友</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function ServiceHub({ navigate }) {
  return (
    <section id="services" className="site-page page-services service-hub">
      <div className="service-hub-intro">
        <div className="shell service-hub-grid">
          <div>
            <p className="kicker">EDUTORO SERVICES</p>
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
      <strong>{service.directoryTitle || service.title}</strong>
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
            <div className={["internship", "campus"].includes(service.id) ? "service-title-raised" : undefined}>
              <p className="kicker">SERVICE {service.no}</p>
              <h1 className={["internship", "campus", "solution"].includes(service.id) ? "is-compact-title" : undefined}>
                {service.title}
                {service.titleNote && <small>{service.titleNote}</small>}
              </h1>
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
          <p>背景提升项目需与学员1v1沟通需求与项目。请点击【免费咨询】，与求职小助手联系。</p>
          <button className="button primary" type="button" onClick={() => navigate("contact")}>免费咨询 <ArrowRight size={17} /></button>
        </div>
      ) : (
        <>
          <div className="service-audience-band">
            <div className="shell service-audience-grid">
              <div><p className="kicker">WHO IT IS FOR</p><h2>适合谁</h2></div>
              <div>{service.audience.map((item, index) => <p key={item}><span>0{index + 1}</span>{item}</p>)}</div>
            </div>
          </div>
          {service.modules && <SolutionDetails service={service} />}
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

function SolutionDetails({ service }) {
  const [activeSolutionCase, setActiveSolutionCase] = useState(null);

  useEffect(() => {
    if (!activeSolutionCase) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setActiveSolutionCase(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeSolutionCase]);

  return (
    <div className="solution-details">
      <div className="shell">
        <div className="solution-details-intro">
          <p className="kicker">BUILT AROUND YOU</p>
          <h2>私人定制求职陪跑方案<br />让服务适配学员具体背景</h2>
          <p>三大模块可按需组合，专业团队针对性定制陪跑方案，在超长周期的陪跑中持续积累优势，领先同届竞争对手。</p>
        </div>
        <div className="solution-module-grid">
          {service.modules.map(([title, description], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="solution-steps">
          <div><p className="kicker">HOW IT WORKS</p><h2>方案制定流程</h2></div>
          <ol>
            {service.customSteps.map(([title, description]) => (
              <li key={title}><strong>{title}</strong><span>{description}</span></li>
            ))}
          </ol>
        </div>
        <div className="solution-cases">
          <div className="solution-cases-heading">
            <p className="kicker">GROWTH STORIES</p>
            <h2>典型陪跑案例</h2>
          </div>
          <div className="solution-case-grid">
            {solutionCases.map((item) => (
              <button className="solution-case-card" type="button" key={item.title} onClick={() => setActiveSolutionCase(item)}>
                <small>{item.label}</small>
                <strong>{item.title}</strong>
                <span>{item.summary}</span>
                <span className="solution-case-result">结果：{item.result}</span>
                <span className="solution-case-more">查看详情 <ArrowUpRight size={16} /></span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {activeSolutionCase && (
        <div className="case-modal-backdrop" role="presentation" onMouseDown={() => setActiveSolutionCase(null)}>
          <article className="case-modal solution-case-modal" role="dialog" aria-modal="true" aria-labelledby="solution-case-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="case-modal-close" type="button" onClick={() => setActiveSolutionCase(null)} aria-label="关闭案例详情" autoFocus><X size={20} /></button>
            <span className="case-modal-year">{activeSolutionCase.label}</span>
            <h2 id="solution-case-modal-title">{activeSolutionCase.title}</h2>
            <dl>
              <div><dt>起点</dt><dd>{activeSolutionCase.startingPoint}</dd></div>
              <div><dt>定制方案</dt><dd>{activeSolutionCase.plan}</dd></div>
              <div><dt>陪跑过程</dt><dd>{activeSolutionCase.progress}</dd></div>
              <div><dt>求职结果</dt><dd>{activeSolutionCase.result}</dd></div>
            </dl>
          </article>
        </div>
      )}
    </div>
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
          <h2>实习陪跑与校招陪跑<span>有什么不同？</span></h2>
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
          <p className="kicker">THE EDUTORO METHOD</p>
          <h2>{service.journeyTitle}</h2>
          <div className="process-line">
            {service.journey.map((stage) => <span key={stage.id}><b>{stage.no}</b>{stage.lineTitle || stage.title}</span>)}
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
        <button className="brand" onClick={() => navigate("home")} aria-label="Edutoro，回到首页"><span className="brand-logo" aria-hidden="true"><img src="./assets/edutoro-logo-source.png" alt="" /></span></button>
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
      aria-label="Edutoro求职概览"
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
    return <HeroJourneyVisual compact />;
  }
  if (type === "results") {
    return <div className="overview-visual results-visual"><span>100+</span><strong>OFFER</strong><div><b>500+</b> 服务学员</div><div><b>1000+</b> 深度服务</div></div>;
  }
  if (type === "team") {
    return <div className="overview-visual team-visual">{members.slice(0, 4).map(([name, role]) => <div key={name}><span>{name[0]}</span><p><strong>{name}</strong><small>{role}</small></p></div>)}</div>;
  }
  return <div className="overview-visual community-visual"><Users size={34} strokeWidth={1.35} /><div><span>岗位机会</span><span>真题资料</span><span>节点答疑</span><span>同伴交流</span></div></div>;
}

function LogoMark() {
  return <img className="logo" src="./assets/edutoro-logo-mark.svg" alt="" aria-hidden="true" />;
}

function HeroJourneyVisual({ compact = false }) {
  const steps = [
    ["方向诊断", ScanSearch],
    ["简历优化", FileCheck2],
    ["面试训练", MessageCircleMore],
    ["理想 offer", Trophy],
  ];
  return (
    <div className={`hero-journey${compact ? " is-compact overview-visual path-visual" : ""}`} aria-label="Edutoro全链路求职陪跑路径">
      <div className="hero-journey-head"><span>全链路求职陪跑</span><b>EDUTORO METHOD</b></div>
      <div className="hero-journey-track">
        {steps.map(([title, Icon]) => (
          <article key={title}>
            <i><Icon size={compact ? 20 : 26} strokeWidth={1.8} /></i>
            <strong>{title}</strong>
          </article>
        ))}
      </div>
      <div className="hero-journey-proof"><span>专业方法论</span><span>导师 1v1 陪伴</span><span>数据驱动优化</span></div>
    </div>
  );
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
