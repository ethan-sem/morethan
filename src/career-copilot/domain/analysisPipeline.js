import { createActionPlan } from "./actionPlan.js";
import { analyzeCareerProfile } from "./careerProfileAnalysis.js";
import { createApplicationTierPlan } from "./applicationTierPlan.js";
import { createConclusionProvenance } from "./conclusionProvenance.js";
import { answerEvidenceDegradation, createEvidenceDegradationPlan } from "./evidenceDegradation.js";
import { extractJdProfile } from "./jdExtractor.js";
import { compareResumeToJd } from "./jdGapAnalysis.js";

/** @param {any} resumeFacts @param {string} targetDirection */
export function createInitialAnalysis(resumeFacts, targetDirection) {
  const careerAnalysis = analyzeCareerProfile(resumeFacts, { targetDirection });
  return { careerAnalysis, evidenceDegradation: createEvidenceDegradationPlan(careerAnalysis) };
}

/** @param {any} plan @param {string} itemId @param {string} answer */
export function answerAnalysisQuestion(plan, itemId, answer) {
  return answerEvidenceDegradation(plan, itemId, answer);
}

/** @param {{resumeFacts: any, targetDirection: string, jdText: string, jdAnalysisEnabled: boolean, careerStage: "internship" | "campus", previousDegradation: any}} input */
export function createCompleteAnalysis({ resumeFacts, targetDirection, jdText, jdAnalysisEnabled, careerStage, previousDegradation }) {
  const jdProfile = jdAnalysisEnabled && jdText.trim() ? extractJdProfile(jdText) : null;
  const careerAnalysis = analyzeCareerProfile(resumeFacts, { targetDirection });
  let evidenceDegradation = createEvidenceDegradationPlan(careerAnalysis);
  const savedAnswers = new Map((previousDegradation?.items ?? []).filter((/** @type {any} */ item) => item.answer).map((/** @type {any} */ item) => [item.ruleId, item.answer]));
  evidenceDegradation.items.filter((/** @type {any} */ item) => item.configuredAction === "ask_user" && savedAnswers.has(item.ruleId)).forEach((/** @type {any} */ item) => {
    evidenceDegradation = answerEvidenceDegradation(evidenceDegradation, item.id, savedAnswers.get(item.ruleId));
  });
  const jdGapAnalysis = jdProfile ? compareResumeToJd(resumeFacts, jdProfile) : null;
  const applicationTierPlan = createApplicationTierPlan(careerAnalysis, jdGapAnalysis, { recruitmentType: careerStage });
  const actionPlan = createActionPlan(careerAnalysis, jdGapAnalysis, applicationTierPlan, { degradationPlan: evidenceDegradation });
  const conclusionProvenance = createConclusionProvenance(careerAnalysis, jdGapAnalysis, applicationTierPlan, actionPlan);
  return { jdProfile, careerAnalysis, evidenceDegradation, jdGapAnalysis, applicationTierPlan, actionPlan, conclusionProvenance };
}
