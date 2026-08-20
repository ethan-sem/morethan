"use strict";

document.documentElement?.classList?.toggle(
  "is-embedded",
  new URLSearchParams(window.location?.search ?? "").get("embed") === "1",
);

const content = window.GAME_CONTENT;

if (!content || !Array.isArray(content.events) || content.events.length < 48) {
  throw new Error("T-006 内容库未正确加载");
}

const STAT_LABELS = {
  experience: "经历",
  skill: "技能",
  interview: "面试",
  network: "人脉",
  energy: "精力",
  money: "金钱",
};

const OFFER_RANK = { NONE: 0, C: 1, B: 2, A: 3, S: 4 };
const BALANCE = {
  resumePass: 40,
  interviewPass: 38,
  offerThresholds: { S: 55, A: 47.8, B: 43, C: 40 },
};
const OFFER_LEVEL_DETAILS = {
  NONE: { range: "低于 40", nextLevel: "C", nextThreshold: 40 },
  C: { range: "40 ≤ 分数 < 43", nextLevel: "B", nextThreshold: 43 },
  B: { range: "43 ≤ 分数 < 47.8", nextLevel: "A", nextThreshold: 47.8 },
  A: { range: "47.8 ≤ 分数 < 55", nextLevel: "S", nextThreshold: 55 },
  S: { range: "分数 ≥ 55", nextLevel: null, nextThreshold: null },
};
const RESUME_COMPONENT_LABELS = {
  education: "学历背景",
  experience: "经历",
  skill: "技能",
  jobMatch: "岗位匹配",
  network: "人脉",
};
const INTERVIEW_COMPONENT_LABELS = {
  interview: "面试表达",
  experience: "经历",
  skill: "技能",
  energy: "当前精力",
};
const RESUME_COMPONENT_MAX = {
  education: 25,
  experience: 35,
  skill: 20,
  jobMatch: 10,
  network: 10,
};
const INTERVIEW_COMPONENT_MAX = {
  interview: 40,
  experience: 25,
  skill: 20,
  energy: 15,
};
const OFFER_COUNT_CAPS = { NONE: 0, C: 1, B: 2, A: 2, S: 3 };
const OFFER_SOURCE_LABELS = {
  conversion: "暑期转正",
  big_tech: "大厂流程",
  small_core: "小团队流程",
  referral: "内推机会",
  mass_apply: "海投流程",
  direct_apply: "正式投递",
};
const OPPORTUNITY_CHANNELS = [
  {
    source: "conversion",
    tags: ["conversion_ready", "summer_core_output"],
  },
  {
    source: "big_tech",
    tags: ["big_tech_pipeline", "high_target_pipeline"],
  },
  {
    source: "small_core",
    tags: ["small_core_pipeline", "small_team_intern"],
  },
  {
    source: "referral",
    tags: ["internal_referral", "hidden_headcount"],
  },
  {
    source: "mass_apply",
    tags: ["mass_applicant"],
  },
];

const characters = [
  {
    id: "non_elite_business",
    name: "双非经管生",
    summary: "学校名气帮不上忙，但生活费和精力还留有余地。第一份像样的项目得靠自己找。",
    difficulty: "难度 3/5",
    strategy: {
      advantage: "精力和现金相对宽裕，能承担一次试错或异地机会。",
      weakness: "简历容易停在筛选环节，空白经历尤其显眼。",
      opening: "先拿到一段真实经历，或做出能当场打开的作品。",
    },
    educationScore: 48,
    tags: ["role_non_elite_business", "business_background", "resource_buffer"],
    stats: { experience: 14, skill: 22, interview: 24, network: 20, energy: 78, money: 72 },
  },
  {
    id: "elite_liberal_arts",
    name: "985 文科生",
    summary: "学校能让简历多停几秒，面试官接下来会问：除了会说，你具体做过什么？",
    difficulty: "难度 2/5",
    strategy: {
      advantage: "更容易通过首轮筛选，表达和约人请教也不算吃力。",
      weakness: "项目深挖时容易只剩观点，没有数据和交付物。",
      opening: "尽快补一项硬技能，再做一份经得住追问的作品。",
    },
    educationScore: 82,
    tags: ["role_elite_liberal_arts", "liberal_arts_background", "skill_gap"],
    stats: { experience: 12, skill: 16, interview: 30, network: 26, energy: 72, money: 54 },
  },
  {
    id: "key_engineering",
    name: "211 理工生",
    summary: "数据和技术题不太吓人，真正麻烦的是把作业讲成一件有人愿意用的产品。",
    difficulty: "难度 3/5",
    strategy: {
      advantage: "数据、逻辑和技术协作起点最高。",
      weakness: "面试容易讲完实现过程，却没回答为什么要做。",
      opening: "把一份技术作业改成有用户、有取舍的项目。",
    },
    educationScore: 72,
    tags: ["role_key_engineering", "engineering_background", "interview_gap"],
    stats: { experience: 18, skill: 38, interview: 16, network: 18, energy: 76, money: 58 },
  },
];

const chapters = [...content.chapters].sort((left, right) => left.index - right.index);
const eventsByChapter = new Map(
  chapters.map((chapter) => [
    chapter.id,
    content.events.filter((event) => event.chapterId === chapter.id),
  ]),
);

const state = {
  screen: "home",
  character: null,
  seed: 0,
  rngCursor: 0,
  extraChapterIndexes: new Set(),
  chapterIndex: 0,
  phase: "main",
  stats: null,
  tags: new Set(),
  history: [],
  pending: [],
  seenEventIds: new Set(),
  currentEvent: null,
  latest: null,
  extraFeedback: null,
  arrivalChanges: [],
  recruitment: null,
  burnoutTiming: null,
};

const app = document.querySelector("#app");
const announcer = document.querySelector("#announcer");

function clamp(value) {
  return Math.min(100, Math.max(0, value));
}

function cloneStats(stats) {
  return Object.fromEntries(Object.entries(stats));
}

function randomAt(seed, cursor) {
  let value = (seed + Math.imul(cursor + 1, 0x6d2b79f5)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function nextRandom() {
  const value = randomAt(state.seed, state.rngCursor);
  state.rngCursor += 1;
  return value;
}

function createSeed() {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return 2_026_080_001;
}

function planExtraChapters() {
  const indexes = chapters.map((chapter) => chapter.index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextRandom() * (index + 1));
    [indexes[index], indexes[target]] = [indexes[target], indexes[index]];
  }
  const count = 4 + (state.seed % 5);
  return new Set(indexes.slice(0, count));
}

function announce(message) {
  announcer.textContent = "";
  window.setTimeout(() => {
    announcer.textContent = message;
  }, 20);
}

function focusScreen() {
  const heading = app.querySelector("h1, h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus();
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setScreen(screen) {
  state.screen = screen;
  render();
  focusScreen();
}

function resetGame() {
  state.screen = "home";
  state.character = null;
  state.seed = 0;
  state.rngCursor = 0;
  state.extraChapterIndexes = new Set();
  state.chapterIndex = 0;
  state.phase = "main";
  state.stats = null;
  state.tags = new Set();
  state.history = [];
  state.pending = [];
  state.seenEventIds = new Set();
  state.currentEvent = null;
  state.latest = null;
  state.extraFeedback = null;
  state.arrivalChanges = [];
  state.recruitment = null;
  render();
  focusScreen();
}

function getStateValue(field) {
  if (field === "offerCount") return state.recruitment?.offerCount ?? 0;
  return state.stats?.[field];
}

function matchesCondition(condition) {
  if (condition.type === "tag") {
    return condition.operator === "has" && state.tags.has(condition.tag);
  }
  if (condition.type === "tagAny") {
    return condition.operator === "hasAny" &&
      condition.tags.some((tag) => state.tags.has(tag));
  }

  let actual;
  if (condition.type === "offer") {
    actual = state.recruitment?.[condition.field] ?? "NONE";
  } else if (condition.type === "character") {
    actual = state.character.id;
  } else {
    actual = getStateValue(condition.stat);
  }

  if (condition.operator === "eq") return actual === condition.value;
  if (condition.operator === "gte") return actual >= condition.value;
  if (condition.operator === "lte") return actual <= condition.value;
  if (condition.operator === "lt") return actual < condition.value;
  if (condition.operator === "gt") return actual > condition.value;
  if (condition.operator === "in") return condition.value.includes(actual);
  if (condition.operator === "contains") {
    return Array.isArray(actual) && actual.includes(condition.value);
  }
  return false;
}

function isEligible(event) {
  return (
    !state.seenEventIds.has(event.id) &&
    (event.conditions ?? []).every(matchesCondition)
  );
}

function hasEnergySafeChoice(event) {
  return event.choices.some((choice) => {
    const energyEffect = choice.immediateEffects.find((effect) => effect.stat === "energy");
    return !energyEffect || energyEffect.delta >= -3;
  });
}

function eventWeight(event) {
  let weight = Math.max(1, Number(event.weight) || 1);
  const roleTag = `role_${state.character.id}`;

  if (event.kind === "conditional") weight += 2;
  if (event.tags.includes(roleTag)) {
    weight += Number.isFinite(event.roleBias) ? event.roleBias : 5;
  }
  if (event.tags.some((tag) => state.tags.has(tag))) weight += 2;
  if (event.tags.includes("skill_gap") && state.stats.skill < 45) weight += 3;
  if (event.tags.includes("interview_gap") && state.stats.interview < 50) weight += 3;
  if (event.tags.includes("resource_pressure") && state.stats.money < 45) weight += 3;
  if (event.tags.includes("recover_energy") && state.stats.energy < 35) weight += 4;

  const recentTags = new Set(
    state.history.slice(-2).flatMap((entry) => entry.eventTags ?? []),
  );
  if (event.tags.some((tag) => recentTags.has(tag) && !tag.startsWith("chapter_"))) {
    weight = Math.max(1, weight - 2);
  }

  return weight;
}

function weightedPick(candidates) {
  if (!candidates.length) return null;
  const stableCandidates = [...candidates].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  let safeCandidates = stableCandidates;
  if (state.stats.energy <= 25) {
    const protectedCandidates = stableCandidates.filter(hasEnergySafeChoice);
    if (protectedCandidates.length) safeCandidates = protectedCandidates;
  }

  const weights = safeCandidates.map(eventWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = nextRandom() * total;

  for (let index = 0; index < safeCandidates.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return safeCandidates[index];
  }
  return safeCandidates[safeCandidates.length - 1];
}

function selectMainEvent() {
  const candidates = (eventsByChapter.get(chapters[state.chapterIndex].id) ?? [])
    .filter((event) => event.kind === "main")
    .filter(isEligible);
  const selected = weightedPick(candidates);
  if (!selected) throw new Error(`第 ${state.chapterIndex + 1} 章没有可用主事件`);
  return selected;
}

function selectExtraEvent() {
  const events = eventsByChapter.get(chapters[state.chapterIndex].id) ?? [];
  const conditional = events
    .filter((event) => event.kind === "conditional")
    .filter(isEligible);
  const random = events
    .filter((event) => event.kind === "random")
    .filter(isEligible);
  if (state.chapterIndex === 2 || state.chapterIndex === 5) {
    return weightedPick([...conditional, ...random]);
  }
  return weightedPick(conditional.length ? conditional : random);
}

function applyEffects(effects, source) {
  const changes = [];
  for (const effect of effects ?? []) {
    const before = state.stats[effect.stat];
    const clamped = clamp(before + effect.delta);
    const after =
      effect.stat === "energy" && clamped === 0 && state.history.length < 11
        ? 1
        : clamped;
    state.stats[effect.stat] = after;
    changes.push({
      stat: effect.stat,
      before,
      after,
      delta: after - before,
      source,
    });
  }
  return changes;
}

function queueDelayedEffects(choice) {
  (choice.delayedEffects ?? []).forEach((effect, effectIndex) => {
    state.pending.push({
      ...effect,
      createdDecisionIndex: state.history.length,
      effectIndex,
      sourceEventId: state.currentEvent.id,
      sourceEventTitle: state.currentEvent.title,
      sourceChoiceId: choice.id,
      sourceChoiceText: choice.text,
    });
  });
}

function applyDueEffects() {
  const due = state.pending
    .filter((effect) => effect.dueChapterIndex === state.chapterIndex)
    .sort(
      (left, right) =>
        left.dueChapterIndex - right.dueChapterIndex ||
        left.createdDecisionIndex - right.createdDecisionIndex ||
        left.effectIndex - right.effectIndex ||
        left.id.localeCompare(right.id),
  );
  state.arrivalChanges = [];
  due.forEach((effect) => {
    const changes = applyEffects(effect.effects, effect.id);
    const tagsRemoved = [];
    (effect.removeTags ?? []).forEach((tag) => {
      if (state.tags.has(tag)) tagsRemoved.push(tag);
      state.tags.delete(tag);
    });
    const tagsAdded = [];
    (effect.addTags ?? []).forEach((tag) => {
      if (!state.tags.has(tag)) tagsAdded.push(tag);
      state.tags.add(tag);
    });
    state.arrivalChanges.push({
      effectId: effect.id,
      sourceEventId: effect.sourceEventId,
      sourceEventTitle: effect.sourceEventTitle,
      sourceChoiceId: effect.sourceChoiceId,
      sourceChoiceText: effect.sourceChoiceText,
      changes,
      tagsAdded,
      tagsRemoved,
    });
  });
  const dueEffects = new Set(due);
  state.pending = state.pending.filter((effect) => !dueEffects.has(effect));
}

function scoreJobMatch() {
  let value = 60;
  if (state.tags.has("direction_product")) value += 4;
  if (state.tags.has("targeted_apply")) value += 10;
  if (state.tags.has("segmented_resume")) value += 6;
  if (state.tags.has("positioning_technical")) value += state.character.id === "key_engineering" ? 8 : 3;
  if (state.tags.has("positioning_business")) value += state.character.id !== "key_engineering" ? 7 : 3;
  if (state.tags.has("mass_applicant")) value -= 5;
  return clamp(value);
}

function determineOfferLevel(offerScore, resumeScore, interviewScore) {
  if (resumeScore < BALANCE.resumePass || interviewScore < BALANCE.interviewPass) return "NONE";
  if (offerScore >= BALANCE.offerThresholds.S) return "S";
  if (offerScore >= BALANCE.offerThresholds.A) return "A";
  if (offerScore >= BALANCE.offerThresholds.B) return "B";
  if (offerScore >= BALANCE.offerThresholds.C) return "C";
  return "NONE";
}

function collectOpportunityEvidence(tags, history) {
  const evidence = OPPORTUNITY_CHANNELS.flatMap((channel) => {
    const matchedTags = channel.tags.filter((tag) => tags.has(tag));
    if (!matchedTags.length) return [];
    return [{
      source: channel.source,
      tags: matchedTags,
      choiceIds: history
        .filter((entry) =>
          (entry.tagsAdded ?? []).some((tag) => matchedTags.includes(tag)),
        )
        .map((entry) => entry.choiceId),
    }];
  });

  const directEntries = history.filter(
    (entry) =>
      entry.eventKind === "main" &&
      (entry.chapterIndex === 4 || entry.chapterIndex === 6),
  );
  if (directEntries.length) {
    evidence.push({
      source: "direct_apply",
      tags: [],
      choiceIds: directEntries.map((entry) => entry.choiceId),
    });
  }

  return evidence;
}

function determineOfferCount(bestOfferLevel, opportunityEvidence) {
  const cap = OFFER_COUNT_CAPS[bestOfferLevel] ?? 0;
  if (cap === 0 || !opportunityEvidence.length) return 0;
  return Math.min(cap, opportunityEvidence.length);
}

function calculateRecruitment(useRandom = true) {
  const jobMatch = scoreJobMatch();
  const resumeComponents = {
    education: state.character.educationScore * 0.25,
    experience: state.stats.experience * 0.35,
    skill: state.stats.skill * 0.2,
    jobMatch: jobMatch * 0.1,
    network: state.stats.network * 0.1,
  };
  const resumeBase = Object.values(resumeComponents).reduce((sum, value) => sum + value, 0);
  const resumeVariance = useRandom ? Math.floor(nextRandom() * 11) - 5 : 0;
  const resumeScore = clamp(resumeBase + resumeVariance);
  const resumePassed = resumeScore >= BALANCE.resumePass;

  const interviewComponents = {
    interview: state.stats.interview * 0.4,
    experience: state.stats.experience * 0.25,
    skill: state.stats.skill * 0.2,
    energy: state.stats.energy * 0.15,
  };
  const interviewBase = Object.values(interviewComponents).reduce(
    (sum, value) => sum + value,
    0,
  );
  const interviewVariance = resumePassed && useRandom
    ? Math.floor(nextRandom() * 11) - 5
    : 0;
  const interviewScore = resumePassed
    ? clamp(interviewBase + interviewVariance)
    : null;
  const interviewPassed =
    interviewScore !== null && interviewScore >= BALANCE.interviewPass;
  const offerScore = interviewPassed
    ? resumeScore * 0.45 + interviewScore * 0.55
    : null;
  const scoredOfferLevel = offerScore === null
    ? "NONE"
    : determineOfferLevel(offerScore, resumeScore, interviewScore);

  const opportunityEvidence = collectOpportunityEvidence(state.tags, state.history);
  const bestOfferLevel =
    opportunityEvidence.length && scoredOfferLevel !== "NONE"
      ? scoredOfferLevel
      : "NONE";
  const offerCount = determineOfferCount(bestOfferLevel, opportunityEvidence);
  const offerSources = opportunityEvidence
    .slice(0, offerCount)
    .map((evidence) => evidence.source);

  return {
    jobMatch,
    resumeComponents,
    resumeBase,
    resumeVariance,
    resumeScore,
    resumePassed,
    interviewComponents,
    interviewBase,
    interviewVariance,
    interviewScore,
    interviewPassed,
    offerScore,
    scoredOfferLevel,
    bestOfferLevel,
    offerCount,
    offerSources,
    opportunityEvidence,
    calculatedAtDecisionIndex: state.history.length,
  };
}

function ensureRecruitment() {
  if (!state.recruitment) state.recruitment = calculateRecruitment(true);
}

function beginChapter() {
  state.arrivalChanges = [];
  state.extraFeedback = null;
  applyDueEffects();

  if (state.chapterIndex === 7) ensureRecruitment();

  if (state.extraChapterIndexes.has(state.chapterIndex)) {
    const extra = selectExtraEvent();
    if (extra) {
      state.phase = "extra";
      state.currentEvent = extra;
      setScreen("game");
      return;
    }
  }

  state.phase = "main";
  state.currentEvent = selectMainEvent();
  setScreen("game");
}

function initializeGame(characterId, injectedSeed) {
  const character = characters.find((item) => item.id === characterId);
  if (!character) return;
  state.character = character;
  state.seed = Number.isInteger(injectedSeed) ? injectedSeed >>> 0 : createSeed();
  state.rngCursor = 0;
  state.extraChapterIndexes = planExtraChapters();
  state.chapterIndex = 0;
  state.stats = cloneStats(character.stats);
  state.tags = new Set(character.tags);
  state.history = [];
  state.pending = [];
  state.seenEventIds = new Set();
  state.latest = null;
  state.extraFeedback = null;
  state.arrivalChanges = [];
  state.recruitment = null;
  state.burnoutTiming = null;
  beginChapter();
  announce(`已选择${character.name}，本局种子 ${state.seed}。`);
}

function choose(choiceIndex, button) {
  const event = state.currentEvent;
  const choice = event?.choices[choiceIndex];
  if (!event || !choice || state.screen !== "game" || state.extraFeedback) return;
  button.disabled = true;

  const changes = applyEffects(choice.immediateEffects, choice.id);
  (choice.removeTags ?? []).forEach((tag) => state.tags.delete(tag));
  (choice.addTags ?? []).forEach((tag) => state.tags.add(tag));
  queueDelayedEffects(choice);
  state.seenEventIds.add(event.id);

  const record = {
    eventId: event.id,
    eventTitle: event.title,
    eventKind: event.kind,
    eventTags: event.tags,
    chapterIndex: state.chapterIndex,
    choiceId: choice.id,
    choiceText: choice.text,
    resultText: choice.resultText ?? "这项选择已经改变了后续安排。",
    choiceIndex,
    changes,
    tagsAdded: choice.addTags ?? [],
  };
  state.history.push(record);
  state.latest = {
    ...record,
    delayedEffects: choice.delayedEffects ?? [],
  };

  if (state.stats.energy === 0) {
    const hadRecruitmentSnapshot = Boolean(state.recruitment);
    if (!hadRecruitmentSnapshot) {
      state.recruitment = calculateRecruitment(false);
    }
    state.burnoutTiming = hadRecruitmentSnapshot
      ? "after_recruitment"
      : "before_recruitment";
    setScreen("result");
    announce("精力已经清零，本局提前结束。");
    return;
  }

  if (state.phase === "extra") {
    state.extraFeedback = state.latest;
    render();
    focusScreen();
    announce("额外事件结果已生效，继续进入本章主要选择。");
  } else {
    setScreen("settlement");
    announce(`第 ${state.chapterIndex + 1} 章主要选择已结算。`);
  }
}

function continueAfterExtra() {
  state.extraFeedback = null;
  state.phase = "main";
  state.currentEvent = selectMainEvent();
  setScreen("game");
}

function continueAfterSettlement() {
  if (state.chapterIndex >= chapters.length - 1) {
    setScreen("result");
    announce("本局已完成，正在展示最终结局。");
    return;
  }
  state.chapterIndex += 1;
  beginChapter();
}

function matchEnding() {
  ensureRecruitment();
  const result = state.recruitment;
  const levelAtLeast = (level) =>
    OFFER_RANK[result.bestOfferLevel] >= OFFER_RANK[level];
  const hasOfferSource = (source) => result.offerSources.includes(source);
  const keyEvidenceTags = [
    "targeted_apply",
    "segmented_resume",
    "internal_referral",
    "summer_core_output",
    "ai_product_project",
    "technical_evidence",
    "business_translation",
    "research_to_decision",
    "informed_offer_choice",
  ];
  const keyEvidenceCount = keyEvidenceTags.filter((tag) => state.tags.has(tag)).length;

  if (state.stats.energy === 0) {
    const hasOffer = result.offerCount > 0;
    const burnoutAfterRecruitment = state.burnoutTiming === "after_recruitment";
    return {
      id: "burnout_break",
      title: "电脑合上以后",
      description: hasOffer
        ? `你已经拿到 ${result.offerCount} 个 Offer，也把最后一点精力用完了。签约邮件还在收件箱里，但今晚先不回复。`
        : burnoutAfterRecruitment
          ? "最后一批流程没有带来 Offer。你把招聘软件移出首页，先去补一顿不对着电脑吃的饭。"
          : "流程还没走完，身体先按了暂停。未读消息留到明天，今天不再刷新邮箱。",
      reason: hasOffer
        ? `最终精力为 0，休整结局优先；精力清零前的招聘快照仍保留 ${result.bestOfferLevel} 级、${result.offerCount} 个 Offer。`
        : burnoutAfterRecruitment
          ? "最终精力为 0，休整结局优先；此前招聘快照为零 Offer。"
          : "最终精力为 0，且发生在正式招聘快照生成前。",
    };
  }
  if (
    levelAtLeast("A") &&
    hasOfferSource("conversion") &&
    state.tags.has("ai_product_project") &&
    (state.tags.has("summer_core_output") || state.tags.has("conversion_ready")) &&
    state.stats.skill >= 70 &&
    state.stats.interview >= 70
  ) {
    return {
      id: "aipm_chosen_intern",
      title: "AIPM 天选实习生",
      description: "面试官追问作品时，你打开原型、实验数据和暑期项目复盘。三样东西恰好讲的是同一个问题。",
      reason: "A 级以上转正机会、AI 产品作品、暑期核心产出或转正答辩证据，以及技能和面试双达标。",
    };
  }
  if (
    result.offerCount >= 2 &&
    state.tags.has("wrong_team_selected")
  ) {
    return {
      id: "multiple_offers_wrong_team",
      title: "手握多个 Offer 但选错团队",
      description: "入职群建好后，你才知道未来负责人刚换组。面试时问过平台和薪资，唯独没问这个团队半年后要做什么。",
      reason: "至少两个 Offer，并在最终选择中命中团队信息不足标签。",
    };
  }
  if (
    state.tags.has("summer_intern") &&
    state.tags.has("conversion_failed") &&
    result.offerCount === 0
  ) {
    return {
      id: "summer_conversion_failed",
      title: "暑期实习转正失败者",
      description: "答辩结束，导师说结果受名额影响。工牌周五失效，做过的项目还在，只是这次没换来留用邮件。",
      reason: "经历暑期实习、命中转正失败标签且最终没有 Offer。",
    };
  }
  if (
    state.stats.experience >= 75 &&
    state.stats.interview < 60 &&
    result.offerCount === 0
  ) {
    return {
      id: "many_internships_weak_story",
      title: "实习很多但项目讲不清",
      description: "面试官翻到第三段实习，仍然问：“哪件事是你自己决定的？”你列得出任务，却说不清那一次决定。",
      reason: "经历属性较高，但面试不足且最终没有 Offer。",
    };
  }
  if (
    levelAtLeast("A") &&
    hasOfferSource("big_tech") &&
    state.tags.has("selected_offer") &&
    !state.tags.has("big_tech_edge") &&
    !state.tags.has("small_core") &&
    keyEvidenceCount >= 2
  ) {
    return {
      id: "big_tech_management_trainee",
      title: "大厂产品管培生",
      description: "你签下大厂管培项目。轮岗表、导师名单和第一周日程一同发进邮箱，下一轮筛选从入职后开始。",
      reason: "A 级以上 Offer 来自大厂流程、完成签约选择，并由至少两类历史证据共同支撑。",
    };
  }
  if (
    result.offerCount >= 1 &&
    hasOfferSource("big_tech") &&
    state.tags.has("big_tech_edge")
  ) {
    return {
      id: "big_tech_edge_role",
      title: "大厂边缘业务螺丝钉",
      description: "你进了大平台，具体业务在入职后才揭晓。系统、流程和会议都很完整，至于能负责什么，还要等第一次排期。",
      reason: "Offer 来自大厂流程，选择大平台边缘业务，并由至少两类历史证据共同支撑。",
    };
  }
  if (
    result.offerCount >= 1 &&
    hasOfferSource("small_core") &&
    state.tags.has("small_core")
  ) {
    return {
      id: "small_core_pm",
      title: "核心业务小厂产品经理",
      description: "你去了小团队。入职第一周，用户群、数据后台和业务负责人同时向你开放，没人替你把问题排好顺序。",
      reason: "Offer 来自小团队流程、明确选择核心业务，并由至少两类历史证据共同支撑。",
    };
  }
  if (result.offerCount === 0) {
    return {
      id: "zero_offer_retry",
      title: "秋招零 Offer，准备春招再战",
      description: "最后一个流程变成“已结束”。投递表没有 Offer，但留下了作品、面试记录，以及几处下次不能再含糊过去的问题。",
      reason: "未命中更高优先级结局，最终 Offer 数为 0。",
    };
  }
  if (
    state.tags.has("single_offer_declined") ||
    state.tags.has("offer_window_negotiated")
  ) {
    const declined = state.tags.has("single_offer_declined");
    return {
      id: "mass_apply_ashore",
      title: "拿到 Offer，仍在等待更匹配机会",
      description: declined
        ? "你主动拒绝了手里的 Offer。确认邮件发出后，收件箱重新归零，另外几条流程仍没有结果。"
        : "你和公司协商了入职窗口，把日期往后挪了一周。多出的不只是时间，还有七个需要刷新邮箱的早晨。",
      reason: declined
        ? "获得一个 Offer 后选择拒绝，未将历史 Offer 抹零，但不再使用已经签约的叙事。"
        : "获得一个 Offer 后协商入职时间，当前仍处于保留机会并继续比较的状态。",
    };
  }
  if (hasOfferSource("mass_apply")) {
    return {
      id: "mass_apply_ashore",
      title: "海投千份终于上岸",
      description: "投递表拉得很长，终于有一行走到签约。回头看，真正有回复的岗位并没有想象中那么随机。",
      reason: "至少获得一个来自海投流程的 Offer，作为剩余有 Offer 状态的最终兜底。",
    };
  }
  return {
    id: "mass_apply_ashore",
    title: "秋招流程终于上岸",
    description: "签约邮件抵达收件箱。它不是所有问题的答案，只是这段从收藏 JD 开始的日子终于有了落款。",
    reason: "至少获得一个 Offer，但未命中带有公司、团队或海投事实的专属结局，使用中性兜底。",
  };
}

function aggregateChanges() {
  const totals = Object.fromEntries(Object.keys(STAT_LABELS).map((stat) => [stat, 0]));
  state.history.forEach((entry) => {
    entry.changes.forEach((change) => {
      totals[change.stat] += change.delta;
    });
  });
  return Object.entries(totals).sort((left, right) => right[1] - left[1]);
}

function effectTrend(effects) {
  return effects
    .map((effect) => `${STAT_LABELS[effect.stat]} ${effect.delta > 0 ? "↑" : effect.delta < 0 ? "↓" : "→"}`)
    .join(" · ");
}

function delayedPreview(delayedEffects) {
  return (delayedEffects ?? [])
    .map((effect) => {
      const chapter = chapters[effect.dueChapterIndex];
      const stage = chapter
        ? `第 ${effect.dueChapterIndex + 1} 章（${chapter.time}）`
        : "后续章节";
      const trends = effectTrend(effect.effects ?? []);
      const hasTagChange = (effect.addTags ?? []).length || (effect.removeTags ?? []).length;
      return [stage, trends, hasTagChange ? "路径状态将变化" : ""].filter(Boolean).join(" · ");
    })
    .join("；");
}

function exactEffectText(changes) {
  return changes
    .map(
      (change) =>
        `${STAT_LABELS[change.stat]} ${change.delta > 0 ? "+" : ""}${change.delta}`,
    )
    .join(" · ");
}

function formatScore(value) {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function offerProgress(result) {
  if (!result.resumePassed) {
    return {
      stage: "简历筛选",
      range: "未进入 Offer 等级判定",
      nextText: `先补足简历门槛，还差 ${formatScore(BALANCE.resumePass - result.resumeScore)} 分`,
    };
  }
  if (!result.interviewPassed) {
    return {
      stage: "面试判定",
      range: "未进入 Offer 等级判定",
      nextText: `先补足面试门槛，还差 ${formatScore(BALANCE.interviewPass - result.interviewScore)} 分`,
    };
  }

  const scoredLevel = result.scoredOfferLevel ?? result.bestOfferLevel;
  const detail = OFFER_LEVEL_DETAILS[scoredLevel] ?? OFFER_LEVEL_DETAILS.NONE;
  const sourceNote = result.bestOfferLevel === "NONE" && scoredLevel !== "NONE"
    ? `分数达到 ${scoredLevel} 区间，但缺少独立招聘机会证据`
    : `当前分数位于 ${scoredLevel} 区间`;
  return {
    stage: "Offer 等级",
    range: `${detail.range}；${sourceNote}`,
    nextText: detail.nextLevel
      ? `距离 ${detail.nextLevel} 还差 ${formatScore(Math.max(0, detail.nextThreshold - result.offerScore))} 分`
      : "已达最高等级",
  };
}

function topContributions(components, labels) {
  return Object.entries(components)
    .map(([key, value]) => ({ key, label: labels[key] ?? key, value }))
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key))
    .slice(0, 2);
}

function largestWeightedDeficits(components, maxima, labels, prefix) {
  return Object.entries(maxima)
    .map(([key, maximum]) => ({
      key: `${prefix}_${key}`,
      label: `${prefix === "resume" ? "简历" : "面试"}·${labels[key] ?? key}`,
      deficit: Math.max(0, maximum - (components[key] ?? 0)),
    }))
    .sort((left, right) => right.deficit - left.deficit || left.key.localeCompare(right.key));
}

function recruitmentInsights(result) {
  const resumeTop = topContributions(result.resumeComponents, RESUME_COMPONENT_LABELS);
  const interviewTop = topContributions(
    result.interviewComponents,
    INTERVIEW_COMPONENT_LABELS,
  );
  let stage;
  let riskPool;
  if (!result.resumePassed) {
    stage = "简历筛选未通过";
    riskPool = largestWeightedDeficits(
      result.resumeComponents,
      RESUME_COMPONENT_MAX,
      RESUME_COMPONENT_LABELS,
      "resume",
    );
  } else if (!result.interviewPassed) {
    stage = "面试判定未通过";
    riskPool = largestWeightedDeficits(
      result.interviewComponents,
      INTERVIEW_COMPONENT_MAX,
      INTERVIEW_COMPONENT_LABELS,
      "interview",
    );
  } else {
    stage = result.bestOfferLevel === "NONE"
      ? "Offer 尚未形成"
      : "当前评分提升空间";
    riskPool = [
      ...largestWeightedDeficits(
        result.resumeComponents,
        RESUME_COMPONENT_MAX,
        RESUME_COMPONENT_LABELS,
        "resume",
      ),
      ...largestWeightedDeficits(
        result.interviewComponents,
        INTERVIEW_COMPONENT_MAX,
        INTERVIEW_COMPONENT_LABELS,
        "interview",
      ),
    ].sort((left, right) => right.deficit - left.deficit || left.key.localeCompare(right.key));
  }
  return {
    resumeTop,
    interviewTop,
    riskStage: stage,
    scoreRisks: riskPool.slice(0, 2),
  };
}

function renderHome() {
  app.innerHTML = `
    <section class="screen" data-screen="home" aria-labelledby="home-title">
      <div>
        <p class="eyebrow">MORETHAN CAREER LAB</p>
        <h1 id="home-title">同一个秋招，<br />不会有同一条故事线。</h1>
        <p class="lede">
          从 48 个事件中按角色、属性、历史选择和随机种子匹配本局故事。
          用 12—16 次决策走完八个阶段，看看你最终能拿到什么 Offer。
        </p>
        <div class="actions">
          <button class="button primary" type="button" data-action="start">开始新故事</button>
          <a class="button secondary" href="#how-to-play">查看玩法</a>
        </div>
      </div>
      <div id="how-to-play" class="how-grid" aria-label="玩法说明">
        <article class="how-card">
          <h3>1. 选择起点</h3>
          <p>三个角色拥有不同资源和事件权重，但都存在高等级结局路径。</p>
        </article>
        <article class="how-card">
          <h3>2. 面对不同事件</h3>
          <p>每局包含 8 个主事件和 4—8 个额外事件，不同种子会改变故事组合。</p>
        </article>
        <article class="how-card">
          <h3>3. 看懂结果</h3>
          <p>结局页解释简历、面试和 Offer 门槛，不用一个 0 分概括全部努力。</p>
        </article>
      </div>
      <p class="notice"><strong>MoreThan求职实验室：</strong>本游戏不保存个人信息、不调用 AI，也不连接真实诊断服务。</p>
    </section>
  `;
}

function renderCharacters() {
  app.innerHTML = `
    <section class="screen" data-screen="character" aria-labelledby="character-title">
      <div>
        <p class="eyebrow">选择起点</p>
        <h2 id="character-title">这次从哪种背景开始？</h2>
        <p class="lede">难度表示决策容错率，不代表学校、专业或个人价值。</p>
      </div>
      <div class="character-grid">
        ${characters
          .map(
            (character) => `
              <button class="character-card" type="button" data-character="${character.id}">
                <strong>${character.name}</strong>
                <p>${character.summary}</p>
                <span class="difficulty">${character.difficulty}</span>
                <span class="character-section-title">六项初始属性</span>
                <span class="character-stats" aria-label="${character.name}六项初始属性">
                  ${Object.entries(character.stats)
                    .map(([stat, value]) => `
                      <span class="character-stat">
                        <span>${STAT_LABELS[stat]}</span>
                        <b>${value}</b>
                      </span>
                    `)
                    .join("")}
                </span>
                <span class="character-guidance">
                  <span><b>优势：</b>${character.strategy.advantage}</span>
                  <span><b>主要短板：</b>${character.strategy.weakness}</span>
                  <span><b>起手建议：</b>${character.strategy.opening}</span>
                </span>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="actions">
        <button class="button secondary" type="button" data-action="home">返回首页</button>
      </div>
    </section>
  `;
}

function statMarkup() {
  return Object.entries(state.stats)
    .map(
      ([stat, value]) => `
        <div class="stat">
          <div class="stat-head"><span>${STAT_LABELS[stat]}</span><strong>${value}</strong></div>
          <div class="stat-track" aria-hidden="true">
            <div class="stat-fill" style="width: ${value}%"></div>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderArrivalChanges() {
  if (!state.arrivalChanges.length) return "";
  return `
    <section class="delayed-note delayed-results" aria-label="延迟结果已生效">
      <strong>此前选择的延迟结果已生效：</strong>
      <ul class="delayed-result-list">
        ${state.arrivalChanges
          .map((result) => {
            const tagChanges = [
              result.tagsAdded.length ? `新增路径标记：${result.tagsAdded.join("、")}` : "",
              result.tagsRemoved.length ? `移除路径标记：${result.tagsRemoved.join("、")}` : "",
            ].filter(Boolean);
            return `
              <li>
                <span>来自「${result.sourceEventTitle}」中的“${result.sourceChoiceText}”</span>
                <strong>${exactEffectText(result.changes)}</strong>
                ${tagChanges.length ? `<small>${tagChanges.join("；")}</small>` : ""}
              </li>
            `;
          })
          .join("")}
      </ul>
    </section>
  `;
}

function renderExtraFeedback() {
  const feedback = state.extraFeedback;
  return `
    <section class="panel inline-feedback" aria-labelledby="extra-result-title">
      <p class="eyebrow">额外事件反馈</p>
      <h3 id="extra-result-title">后来发生了什么</h3>
      <p>${feedback.resultText}</p>
      <p class="muted">${exactEffectText(feedback.changes)}</p>
      <button class="button primary" type="button" data-action="continue-extra">进入本章主要选择</button>
    </section>
  `;
}

function renderGame() {
  const chapter = chapters[state.chapterIndex];
  const event = state.currentEvent;
  const progress = ((state.chapterIndex + 1) / chapters.length) * 100;
  const kindLabel = state.phase === "extra" ? "额外事件" : "本章主要选择";

  app.innerHTML = `
    <section class="screen" data-screen="game" aria-labelledby="game-title">
      <div class="page-head">
        <div>
          <p class="eyebrow">${chapter.time} · ${kindLabel}</p>
          <h2 id="game-title">${chapter.title}</h2>
        </div>
        <div class="progress-wrap" aria-label="游戏进度：第 ${state.chapterIndex + 1} 章，共 8 章">
          <div class="progress-label">
            <span>第 ${state.history.length + 1} 次决策 · seed ${state.seed}</span>
            <strong>${state.chapterIndex + 1}/8</strong>
          </div>
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>
      ${renderArrivalChanges()}
      <div class="game-layout">
        <article class="panel">
          <p class="eyebrow">${kindLabel}</p>
          <h3>${event.title}</h3>
          <p class="event-body">${event.body}</p>
          ${state.extraFeedback ? renderExtraFeedback() : `
            <div class="choices" aria-label="可选行动">
              ${event.choices
                .map(
                  (choice, index) => `
                    <button class="choice" type="button" data-choice="${index}">
                      ${choice.text}
                      <span>
                        趋势：${effectTrend(choice.immediateEffects)}
                        ${choice.delayedEffects?.length ? `<br />后续：${delayedPreview(choice.delayedEffects)}` : ""}
                      </span>
                    </button>
                  `,
                )
                .join("")}
            </div>
          `}
        </article>
        <aside class="panel" aria-label="当前属性">
          <h3>${state.character.name}的状态</h3>
          ${state.stats.energy <= 25 ? '<p class="risk-note">精力偏低：系统会提高恢复型事件权重。</p>' : ""}
          <div class="stats">${statMarkup()}</div>
        </aside>
      </div>
    </section>
  `;
}

function renderSettlement() {
  const chapter = chapters[state.chapterIndex];
  const delayed = state.latest.delayedEffects;
  const nextLabel = state.chapterIndex === 7 ? "查看最终结局" : "进入下一章";

  app.innerHTML = `
    <section class="screen" data-screen="settlement" aria-labelledby="settlement-title">
      <div>
          <p class="eyebrow">第 ${state.chapterIndex + 1} 章结果</p>
          <h2 id="settlement-title">${chapter.time}：你的取舍</h2>
          <p class="lede">${state.latest.resultText}</p>
      </div>
      <div class="result-grid">
        <section class="panel">
          <h3>精确属性变化</h3>
          <ul class="change-list">
            ${state.latest.changes
              .map(
                (change) => `
                  <li class="${change.delta >= 0 ? "positive" : "negative"}">
                    <strong>${STAT_LABELS[change.stat]} ${change.delta >= 0 ? "+" : ""}${change.delta}</strong>
                    <span class="muted">（${change.before} → ${change.after}）</span>
                  </li>
                `,
              )
              .join("")}
          </ul>
        </section>
        <section class="panel">
          <h3>后续影响</h3>
          ${
            delayed.length
              ? `<p class="delayed-note">${delayedPreview(delayed)}。具体数值将在生效时展示。</p>`
              : "<p>这项主要选择没有跨章节延迟效果。</p>"
          }
        </section>
        <section class="panel">
          <h3>本章记录</h3>
          <p>本局已完成 ${state.history.length} 次决策，事件不会在同一局重复出现。</p>
          <button class="button primary" type="button" data-action="continue">${nextLabel}</button>
        </section>
      </div>
    </section>
  `;
}

function scoreRows(result) {
  const resumeGap = Math.max(0, BALANCE.resumePass - result.resumeScore);
  const interviewGap =
    result.interviewScore === null
      ? null
      : Math.max(0, BALANCE.interviewPass - result.interviewScore);
  const sourceText = result.offerSources.length
    ? result.offerSources.map((source) => OFFER_SOURCE_LABELS[source] ?? source).join("、")
    : "暂无实际 Offer 来源";
  const progress = offerProgress(result);
  return `
    <section class="panel" aria-labelledby="weighted-score-title">
      <h3 id="weighted-score-title">加权竞争力分（非百分制考试分）</h3>
      <div class="score-grid">
        <article class="score-card">
          <span>简历筛选</span>
          <strong>${formatScore(result.resumeScore)}</strong>
          <p>基础 ${formatScore(result.resumeBase)} · 波动 ${result.resumeVariance >= 0 ? "+" : ""}${result.resumeVariance}</p>
          <p class="${result.resumePassed ? "pass-text" : "fail-text"}">
            ${result.resumePassed
              ? `已达到 ${BALANCE.resumePass} 分门槛`
              : `距离 ${BALANCE.resumePass} 分还差 ${resumeGap.toFixed(2)}`}
          </p>
        </article>
        <article class="score-card">
          <span>面试判定</span>
          <strong>${formatScore(result.interviewScore)}</strong>
          <p>${result.interviewScore === null ? "简历未通过，未进入面试" : `基础 ${formatScore(result.interviewBase)} · 波动 ${result.interviewVariance >= 0 ? "+" : ""}${result.interviewVariance}`}</p>
          <p class="${result.interviewPassed ? "pass-text" : "fail-text"}">
            ${
              result.interviewScore === null
                ? "未进入面试判定"
                : result.interviewPassed
                  ? `已达到 ${BALANCE.interviewPass} 分门槛`
                  : `距离 ${BALANCE.interviewPass} 分还差 ${interviewGap.toFixed(2)}`
            }
          </p>
        </article>
        <article class="score-card">
          <span>Offer 等级</span>
          <strong>${result.bestOfferLevel}</strong>
          <p>${result.offerScore === null ? "未进入 Offer 等级判定" : `Offer 加权竞争力分 ${formatScore(result.offerScore)}`}</p>
          <p>${progress.range}</p>
          <p class="${progress.nextText === "已达最高等级" ? "pass-text" : ""}">${progress.nextText}</p>
          <p>${result.offerCount} 个 Offer · 岗位匹配 ${result.jobMatch}</p>
          <p>来源：${sourceText}</p>
        </article>
      </div>
      <p class="muted">等级区间：C 40–42.99 · B 43–47.79 · A 47.8–54.99 · S 55 及以上</p>
    </section>
  `;
}

function renderResult() {
  ensureRecruitment();
  const result = state.recruitment;
  const ending = matchEnding();
  const insights = recruitmentInsights(result);
  const totals = aggregateChanges();
  const strengths = totals.filter(([, value]) => value > 0).slice(0, 2);
  const best = state.history
    .flatMap((entry) => entry.changes.map((change) => ({ ...change, choiceText: entry.choiceText })))
    .sort((left, right) => right.delta - left.delta)[0];
  const costliest = state.history
    .flatMap((entry) => entry.changes.map((change) => ({ ...change, choiceText: entry.choiceText })))
    .sort((left, right) => left.delta - right.delta)[0];

  app.innerHTML = `
    <section class="screen" data-screen="result" aria-labelledby="result-title">
      <div>
        <p class="eyebrow">本局结束 · ${state.character.name} · seed ${state.seed}</p>
        <span class="result-badge">Offer 等级：${result.bestOfferLevel}</span>
        <h2 id="result-title">${ending.title}</h2>
        <p class="lede">${ending.description}</p>
        <p class="notice"><strong>命中原因：</strong>${ending.reason}</p>
      </div>
      ${scoreRows(result)}
      <div class="result-grid">
        <section class="panel">
          <h3>这一路发生了什么</h3>
          <p>你完成了 ${state.history.length} 次决策，经历了 ${state.history.filter((entry) => entry.eventKind !== "main").length} 个额外事件。</p>
        </section>
        <section class="panel">
          <h3>收获最明显的一次</h3>
          <p>“${best.choiceText}”带来最大单项增长：${STAT_LABELS[best.stat]} +${best.delta}。</p>
        </section>
        <section class="panel">
          <h3>代价最大的一次</h3>
          <p>“${costliest.choiceText}”产生最大单项属性成本：${STAT_LABELS[costliest.stat]} ${costliest.delta}。</p>
        </section>
      </div>
      <section class="panel">
        <h3>公式贡献与招聘评分风险</h3>
        <div class="factor-list">
          <p><strong>主要增长：</strong>${strengths.length ? strengths.map(([stat, value]) => `${STAT_LABELS[stat]} +${value}`).join("、") : "本局暂无明显增长项"}</p>
          <p><strong>简历贡献最高：</strong>${insights.resumeTop.map((item) => `${item.label} ${formatScore(item.value)}`).join("、")}</p>
          <p><strong>面试贡献最高：</strong>${insights.interviewTop.map((item) => `${item.label} ${formatScore(item.value)}`).join("、")}</p>
          <p><strong>${insights.riskStage}：</strong>${insights.scoreRisks.map((item) => `${item.label}（加权缺口 ${formatScore(item.deficit)}）`).join("、")}</p>
        </div>
      </section>
      <section class="panel">
        <h3>资源状态（不等同于招聘评分）</h3>
        <div class="factor-list">
          <p><strong>精力：</strong>${state.stats.energy} / 100${state.stats.energy < 30 ? "，缓冲偏低" : "，仍有行动缓冲"}</p>
          <p><strong>金钱：</strong>${state.stats.money} / 100${state.stats.money < 30 ? "，异地与空窗承受力偏低" : "，资源缓冲尚可"}</p>
        </div>
      </section>
      <section class="panel">
        <h3>如果再走一次</h3>
        <ol class="review-list">
          <li>先看自己停在哪一轮，只补那一轮真正缺的东西。</li>
          <li>留下能打开、能追问的项目，别让投递数量代替进展。</li>
          <li>钱和精力也会决定选项，别在前半程一次花完。</li>
        </ol>
      </section>
      <div class="result-grid">
        <section class="share-card" aria-label="结局分享卡预览">
          <p class="share-title">MORETHAN求职 · 《活到秋招》</p>
          <strong>${ending.title}</strong>
          <p>${state.character.name} · Offer ${result.bestOfferLevel}</p>
          <div class="share-stats">
            ${Object.entries(state.stats)
              .sort((left, right) => right[1] - left[1])
              .slice(0, 3)
              .map(([stat, value]) => `<span>${STAT_LABELS[stat]} ${value}</span>`)
              .join("")}
          </div>
        </section>
        <section class="panel">
          <h3>再走一条故事线</h3>
          <div class="actions">
            <button class="button secondary" type="button" data-action="copy">复制本局摘要</button>
            <button class="button primary" type="button" data-action="new-seed">同角色换种子重玩</button>
            <button class="button secondary" type="button" data-action="restart">重新选择角色</button>
            <button class="button secondary" type="button" disabled>获取我的求职能力诊断</button>
          </div>
          <p class="muted">诊断服务暂未开放；原型不会跳转到临时或虚构地址。</p>
        </section>
      </div>
    </section>
  `;
}

function render() {
  if (state.screen === "home") renderHome();
  if (state.screen === "character") renderCharacters();
  if (state.screen === "game") renderGame();
  if (state.screen === "settlement") renderSettlement();
  if (state.screen === "result") renderResult();
}

async function copySummary() {
  const ending = matchEnding();
  const text = `我在《活到秋招》的结局是“${ending.title}”，本局完成 ${state.history.length} 次决策，种子 ${state.seed}。`;
  try {
    await navigator.clipboard.writeText(text);
    announce("本局摘要已复制。");
  } catch {
    window.prompt("复制下面的本局摘要：", text);
  }
}

app.addEventListener("click", (event) => {
  const characterButton = event.target.closest("[data-character]");
  if (characterButton) {
    initializeGame(characterButton.dataset.character);
    return;
  }

  const choiceButton = event.target.closest("[data-choice]");
  if (choiceButton) {
    choose(Number(choiceButton.dataset.choice), choiceButton);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "start") setScreen("character");
  if (action === "home" || action === "restart") resetGame();
  if (action === "continue-extra") continueAfterExtra();
  if (action === "continue") continueAfterSettlement();
  if (action === "new-seed") initializeGame(state.character.id);
  if (action === "copy") copySummary();
});

render();
