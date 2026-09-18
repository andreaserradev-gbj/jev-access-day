import type { Answers, ChoiceAnswer, NoulAnswer } from '../typesafe/client.js';
import type { PrFixture, StubReviewerLlm } from './state.js';

/**
 * The AI→AI escalation kernel: pure, provider-blind, synchronous — like the
 * other three decide()s, plus one new move: needs_llm_review, a model-to-
 * model escalation where a stubbed reviewer LLM returns a typed verdict and
 * the kernel respects it only above its own confidence gate. The chain
 * (kernel decision → reviewer verdict → final) is persisted in the run record.
 */

export type PrAction = 'approve' | 'reject' | 'needs_human' | 'needs_llm_review';

export interface PrDecision {
  action: PrAction;
  rationale: string[];
  /** Non-null when the reviewer LLM was consulted (needs_llm_review chain). */
  reviewer: { verdict: 'approve' | 'reject'; confidence: number; rationale: string } | null;
  /**
   * 'needs_llm_review' until the chain resolves; then approve/reject/
   * needs_human. Persisted verbatim so the chain is auditable.
   */
  finalAction: PrAction;
}

export const PR_THRESHOLDS = {
  confidenceFloor: 0.5,
  reviewerConfidenceGate: 0.6,
  directExposureReject: 0.75,
} as const;

export function decidePr(answers: Answers): PrDecision {
  const rationale: string[] = [];

  const exposure = answers['attack_path_exposure'] as ChoiceAnswer | undefined;
  const triviality = answers['semver_triviality'] as ChoiceAnswer | undefined;
  const runtimeTouched = answers['runtime_code_touched'] as NoulAnswer | undefined;
  const soundness = answers['change_soundness'] as ChoiceAnswer | undefined;

  if (!exposure || !triviality || !runtimeTouched || !soundness) {
    return { action: 'needs_human', rationale: ['missing answers — refusing to guess'], reviewer: null, finalAction: 'needs_human' };
  }

  if (exposure.confidence < PR_THRESHOLDS.confidenceFloor) {
    rationale.push(`exposure confidence ${exposure.confidence} < ${PR_THRESHOLDS.confidenceFloor} floor`);
    return { action: 'needs_human', rationale, reviewer: null, finalAction: 'needs_human' };
  }

  rationale.push(`exposure=${exposure.choice} (confidence ${exposure.confidence})`);
  rationale.push(`triviality=${triviality.choice}, runtime_touched=${runtimeTouched.noul}, soundness=${soundness.choice}`);

  // Sloppy change sets are mechanically broken: reject regardless of exposure.
  if (soundness.choice === 'sloppy') {
    rationale.push('unsound change set (lockfile/CI/diff): reject');
    return { action: 'reject', rationale, reviewer: null, finalAction: 'reject' };
  }

  // Direct untrusted-input exposure: reject without ceremony.
  if (exposure.choice === 'direct' && exposure.confidence >= PR_THRESHOLDS.directExposureReject) {
    rationale.push(`direct exposure at ${exposure.confidence} >= ${PR_THRESHOLDS.directExposureReject}: reject`);
    return { action: 'reject', rationale, reviewer: null, finalAction: 'reject' };
  }

  // Trivial + unreachable + no runtime touch: auto-approve.
  if (
    exposure.choice === 'none' &&
    triviality.choice === 'trivial' &&
    runtimeTouched.noul < PR_THRESHOLDS.confidenceFloor
  ) {
    rationale.push('no exposure, trivial bump, no runtime paths: approve');
    return { action: 'approve', rationale, reviewer: null, finalAction: 'approve' };
  }

  // The gray zone: plausible exposure or non-trivial diff. Model-to-model
  // escalation — the reviewer LLM reads the same evidence and votes.
  rationale.push('gray zone: escalating to reviewer LLM');
  return {
    action: 'needs_llm_review',
    rationale,
    reviewer: null,
    finalAction: 'needs_llm_review',
  };
}

/**
 * Resolve a needs_llm_review chain: call the stub reviewer, apply the
 * confidence gate, and produce the final typed action. Kept separate from
 * decidePr so the kernel stays pure and the chain can be persisted.
 */
export async function resolvePrEscalation(
  fixture: PrFixture,
  reviewer: StubReviewerLlm,
): Promise<NonNullable<PrDecision['reviewer']> & { finalAction: PrDecision['finalAction'] }> {
  const verdict = await reviewer.review(fixture);
  if (verdict.confidence >= PR_THRESHOLDS.reviewerConfidenceGate) {
    return { ...verdict, finalAction: verdict.verdict as PrDecision['finalAction'] };
  }
  return { ...verdict, finalAction: 'needs_human' };
}

/** Human-readable label for CLI tables and stubbed downstream consumers. */
export function actionLabelPr(action: PrAction): string {
  const labels: Record<PrAction, string> = {
    approve: 'AUTO-APPROVE PR (merge)',
    reject: 'REJECT PR (close with advisory note)',
    needs_human: 'ROUTE TO HUMAN (security reviewer)',
    needs_llm_review: 'ESCALATE TO REVIEWER LLM (model-to-model)',
  };
  return labels[action];
}