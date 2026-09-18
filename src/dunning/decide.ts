import type { Answers, ChoiceAnswer, NoulAnswer } from '../typesafe/client.js';
import type { DunningTemporal } from './state.js';

/**
 * The temporal kernel: pure, provider-blind, synchronous — like triage's
 * decideTriage, but the decision dimension is WHEN, not just WHAT. All
 * judgment about thresholds lives HERE, in code. The model never sees a
 * threshold; it only judges cause, standing, plausibility, and risk.
 *
 * Temporal inputs (attempts, days-to-next-due, alternative-method
 * availability, due-date clustering) are fixture data — DunningTemporal —
 * never model output.
 */

export type DunningAction =
  | 'retry_in_3d'
  | 'switch_method_then_retry'
  | 'retry_next_schedule'
  | 'pause_spending'
  | 'needs_human';

export interface DunningDecision {
  action: DunningAction;
  rationale: string[];
  /** Days to wait before the action fires; 0 = immediately. Temporal kernel output. */
  waitDays: number;
}

export const DUNNING_THRESHOLDS = {
  confidenceFloor: 0.5,
  retryNoul: 0.7,
  cascadeModerate: 0.65,
  maxAutoRetries: 2,
} as const;

export function decideDunning(answers: Answers, temporal: DunningTemporal): DunningDecision {
  const rationale: string[] = [];

  const cause = answers['bounce_cause'] as ChoiceAnswer | undefined;
  const standing = answers['customer_standing'] as ChoiceAnswer | undefined;
  const retry = answers['retry_worthwhile'] as NoulAnswer | undefined;
  const cascade = answers['schedule_cascade_risk'] as ChoiceAnswer | undefined;

  if (!cause || !standing || !retry || !cascade) {
    return { action: 'needs_human', rationale: ['missing answers — refusing to guess'], waitDays: 0 };
  }

  if (cause.confidence < DUNNING_THRESHOLDS.confidenceFloor) {
    rationale.push(`cause confidence ${cause.confidence} < ${DUNNING_THRESHOLDS.confidenceFloor} floor`);
    return { action: 'needs_human', rationale, waitDays: 0 };
  }

  rationale.push(`cause=${cause.choice} (confidence ${cause.confidence})`);
  rationale.push(`standing=${standing.choice}, retry_worthwhile=${retry.noul}, cascade=${cascade.choice}`);

  // Structural causes never retry on the same mandate: switch or escalate.
  if (cause.choice === 'mandate_revoked' || cause.choice === 'account_closed') {
    if (temporal.hasValidAlternativeMethod && standing.choice === 'good') {
      rationale.push('structural cause with a valid alternative on file: switch method immediately');
      return { action: 'switch_method_then_retry', rationale, waitDays: 0 };
    }
    rationale.push('structural cause without a trustworthy alternative: human handles the mandate');
    return { action: 'needs_human', rationale, waitDays: 0 };
  }

  // Technical bounces are not the customer's fault: retry on the next schedule.
  if (cause.choice === 'technical') {
    rationale.push('processor-side failure: retry aligned to the next schedule date');
    return { action: 'retry_next_schedule', rationale, waitDays: temporal.nextDueInDays };
  }

  // Transient funds: the retry-vs-schedule-vs-pause split.
  if (cause.choice === 'transient_funds') {
    // Hard retry cap: two failed attempts mean a third blind retry is fee bait.
    if (temporal.attemptsIncludingThis >= DUNNING_THRESHOLDS.maxAutoRetries) {
      if (temporal.hasValidAlternativeMethod && standing.choice !== 'strained') {
        rationale.push(
          `${temporal.attemptsIncludingThis} attempts already: no third same-mandate retry`,
        );
        rationale.push('valid alternative on file: switch method now');
        return { action: 'switch_method_then_retry', rationale, waitDays: 0 };
      }
      rationale.push(`${temporal.attemptsIncludingThis} attempts already: pause and reassess with the customer`);
      return { action: 'pause_spending', rationale, waitDays: 0 };
    }

    if (retry.noul >= DUNNING_THRESHOLDS.retryNoul) {
      rationale.push(`retry noul ${retry.noul} >= ${DUNNING_THRESHOLDS.retryNoul}: retry in 3 days`);
      return { action: 'retry_in_3d', rationale, waitDays: 3 };
    }

    // Weak retry case: let the next scheduled date do the work — but if
    // installments cluster, waiting stacks fees; a human should look.
    if (temporal.installmentsDueWithin14d > 1) {
      rationale.push(
        `retry noul ${retry.noul} < ${DUNNING_THRESHOLDS.retryNoul} with ${temporal.installmentsDueWithin14d} installments due within 14d: fee-cascade risk needs a human plan`,
      );
      return { action: 'needs_human', rationale, waitDays: 0 };
    }
    rationale.push(
      `retry noul ${retry.noul} < ${DUNNING_THRESHOLDS.retryNoul}: ride the next schedule date (${temporal.nextDueInDays}d out)`,
    );
    return { action: 'retry_next_schedule', rationale, waitDays: temporal.nextDueInDays };
  }

  rationale.push(`unknown cause "${String(cause.choice)}"`);
  return { action: 'needs_human', rationale, waitDays: 0 };
}

/** Human-readable label for CLI tables and stubbed downstream consumers. */
export function actionLabelDunning(action: DunningAction): string {
  const labels: Record<DunningAction, string> = {
    retry_in_3d: 'RETRY same mandate in 3 days',
    switch_method_then_retry: 'SWITCH to alternative method, retry now',
    retry_next_schedule: 'RETRY on the next schedule date',
    pause_spending: 'PAUSE further auto-spends pending customer contact',
    needs_human: 'ROUTE TO HUMAN (temporal plan attached)',
  };
  return labels[action];
}