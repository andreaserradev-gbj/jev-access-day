import type { Answers, ChoiceAnswer, ScoreAnswer } from '../typesafe/client.js';

/**
 * Stage-1 composition: confidence-gated skip/branch logic.
 * Returns the cascade routing decision for one checkout.
 */

export type Stage1Route = 'approve_fast_path' | 'bureau_call' | 'decline_fast_path';

export interface Stage1Decision {
  route: Stage1Route;
  rationale: string[];
}

export const STAGE1_THRESHOLDS = {
  confidenceFloor: 0.5,
  fastPathConfidence: 0.65,
  suspiciousNoul: 0.75,
} as const;

export function decideStage1(answers: Answers): Stage1Decision {
  const band = answers['risk_band'] as ChoiceAnswer | undefined;
  const consistency = answers['profile_consistency'] as { noul: number } | undefined;
  const anomaly = answers['basket_anomaly'] as { noul: number } | undefined;

  if (!band || !consistency || !anomaly) {
    return { route: 'bureau_call', rationale: ['missing stage-1 answers — default to bureau'] };
  }

  const rationale = [
    `risk_band=${band.choice} (confidence ${band.confidence})`,
    `profile_consistency=${consistency.noul}`,
    `basket_anomaly=${anomaly.noul}`,
  ];

  if (band.confidence < STAGE1_THRESHOLDS.confidenceFloor) {
    rationale.push('confidence below floor: bureau adds evidence');
    return { route: 'bureau_call', rationale };
  }

  if (band.choice === 'clear' && band.confidence >= STAGE1_THRESHOLDS.fastPathConfidence) {
    rationale.push('clear band above fast-path confidence: bureau skipped');
    return { route: 'approve_fast_path', rationale };
  }

  if (
    band.choice === 'suspicious' &&
    band.confidence >= STAGE1_THRESHOLDS.fastPathConfidence
  ) {
    rationale.push('suspicious band above fast-path confidence: bureau adds nothing');
    return { route: 'decline_fast_path', rationale };
  }

  rationale.push('band not decisive: bureau call');
  return { route: 'bureau_call', rationale };
}

/**
 * Stage-3 composition: expected-value thresholds + confidence gates.
 * This is where calibrated probabilities pay off: the approve boundary is
 * arithmetic on the economics, not a magic number.
 *
 * approve when:  (1 - p_fraud) * margin  >=  p_fraud * fraud_loss + p_decline_risk * ltv
 *  =>  p_fraud  <=  margin / (margin + fraud_loss + ltv_weight)
 */

export type FinalAction = 'approve' | 'step_up' | 'review' | 'decline';

export interface Stage3Decision {
  action: FinalAction;
  rationale: string[];
  evApproveUsd: number;
  pFraudEstimate: number;
}

export const STAGE3_THRESHOLDS = {
  confidenceFloor: 0.5,
  stepUpConfidence: 0.55,
  highConfidence: 0.7,
} as const;

/** Invert the final_action distribution into a p_fraud estimate. */
export function estimatePFraud(finalAction: ChoiceAnswer): number {
  const suspicious =
    (finalAction.probabilities['decline'] ?? 0) +
    0.6 * (finalAction.probabilities['review'] ?? 0) +
    0.3 * (finalAction.probabilities['step_up'] ?? 0);
  return Math.max(0, Math.min(1, suspicious));
}

export function decideStage3(
  answers: Answers,
  economics: { marginUsd: number; fraudLossUsd: number; ltvAtRiskUsd: number },
): Stage3Decision {
  const finalAction = answers['final_action'] as ChoiceAnswer | undefined;
  const consistency = answers['bureau_consistent_with_history'] as
    | { noul: number }
    | undefined;
  const affordability = answers['affordability_signal'] as ScoreAnswer | undefined;

  if (!finalAction || !consistency || !affordability) {
    return {
      action: 'review',
      rationale: ['missing stage-3 answers — human review by default'],
      evApproveUsd: Number.NaN,
      pFraudEstimate: Number.NaN,
    };
  }

  const pFraud = estimatePFraud(finalAction);
  const denom = economics.marginUsd + economics.fraudLossUsd + economics.ltvAtRiskUsd;
  const pFraudCutoff = economics.marginUsd / denom;
  const evApprove = (1 - pFraud) * economics.marginUsd - pFraud * (economics.fraudLossUsd + economics.ltvAtRiskUsd);

  const rationale = [
    `final_action=${finalAction.choice} (confidence ${finalAction.confidence})`,
    `p_fraud=${pFraud.toFixed(3)} vs EV cutoff ${pFraudCutoff.toFixed(3)}`,
    `EV(approve)=${evApprove.toFixed(2)} USD`,
    `bureau_consistent=${consistency.noul}, affordability=${affordability.score.toFixed(2)}`,
  ];

  // Confidence floor: uncertain synthesis always goes to a human.
  if (finalAction.confidence < STAGE3_THRESHOLDS.confidenceFloor) {
    rationale.push(`confidence ${finalAction.confidence} < floor: review`);
    return { action: 'review', rationale, evApproveUsd: evApprove, pFraudEstimate: pFraud };
  }

  // The EV test decides approve vs decline when confidence is high.
  if (finalAction.choice === 'approve' && finalAction.confidence >= STAGE3_THRESHOLDS.highConfidence) {
    if (evApprove > 0) {
      rationale.push('EV positive, high confidence: approve');
      return { action: 'approve', rationale, evApproveUsd: evApprove, pFraudEstimate: pFraud };
    }
    rationale.push('EV negative despite approve lean: step up');
    return { action: 'step_up', rationale, evApproveUsd: evApprove, pFraudEstimate: pFraud };
  }

  if (finalAction.choice === 'decline' && finalAction.confidence >= STAGE3_THRESHOLDS.highConfidence) {
    rationale.push('decline high confidence: block (human-auditable record kept)');
    return { action: 'decline', rationale, evApproveUsd: evApprove, pFraudEstimate: pFraud };
  }

  if (finalAction.choice === 'review') {
    return { action: 'review', rationale, evApproveUsd: evApprove, pFraudEstimate: pFraud };
  }

  // step_up choice, or mid-confidence on the others.
  if (finalAction.confidence >= STAGE3_THRESHOLDS.stepUpConfidence) {
    rationale.push('mid confidence: step-up verification');
    return { action: 'step_up', rationale, evApproveUsd: evApprove, pFraudEstimate: pFraud };
  }
  rationale.push('low confidence: review');
  return { action: 'review', rationale, evApproveUsd: evApprove, pFraudEstimate: pFraud };
}

export function actionLabelStage1(route: Stage1Route): string {
  const labels: Record<Stage1Route, string> = {
    approve_fast_path: 'FAST-PATH APPROVE (bureau skipped)',
    bureau_call: 'CALL BUREAU -> synthesis',
    decline_fast_path: 'FAST-PATH DECLINE (bureau skipped)',
  };
  return labels[route];
}

export function actionLabelStage3(action: FinalAction): string {
  const labels: Record<FinalAction, string> = {
    approve: 'APPROVE order',
    step_up: 'STEP-UP (3DS/OTP) verification',
    review: 'FRAUD ANALYST review (probability table attached)',
    decline: 'DECLINE + refund path (human-auditable)',
  };
  return labels[action];
}