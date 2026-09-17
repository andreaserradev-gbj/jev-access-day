import type { Answers, ChoiceAnswer, NoulAnswer, ScoreAnswer } from '../typesafe/client.js';

/**
 * The composition layer: pure, provider-blind, synchronous.
 * Takes the typed answers, returns a routing decision. All judgment about
 * thresholds lives HERE, in code, not in the model — this is the
 * confidence-gated routing pattern.
 */

export type TriageAction =
  | 'auto_retry'
  | 'restart_infra'
  | 'requeue_environment'
  | 'file_regression_p1'
  | 'file_regression_p2'
  | 'fix_test'
  | 'needs_human';

export interface TriageDecision {
  action: TriageAction;
  rationale: string[];
}

/** Thresholds: tune here, never in the provider. */
export const TRIAGE_THRESHOLDS = {
  noulAct: 0.8,
  confidenceFloor: 0.5,
  highConfidence: 0.7,
  p1Severity: 1.5,
} as const;

export function decideTriage(answers: Answers): TriageDecision {
  const rationale: string[] = [];

  const category = answers['failure_category'] as ChoiceAnswer | undefined;
  const severity = answers['regression_severity'] as ScoreAnswer | undefined;
  const flake = answers['is_known_flake_pattern'] as NoulAnswer | undefined;
  const fromCommit = answers['plausibly_from_commit'] as NoulAnswer | undefined;

  if (!category || !severity || !flake || !fromCommit) {
    return { action: 'needs_human', rationale: ['missing answers — refusing to guess'] };
  }

  // Gate 1: if the model is genuinely unsure what category this is, do not act.
  if (category.confidence < TRIAGE_THRESHOLDS.confidenceFloor) {
    rationale.push(
      `category confidence ${category.confidence} < ${TRIAGE_THRESHOLDS.confidenceFloor} floor`,
    );
    return { action: 'needs_human', rationale };
  }

  rationale.push(
    `category=${category.choice} (confidence ${category.confidence})`,
  );

  switch (category.choice) {
    case 'infra': {
      rationale.push(
        `is_known_flake_pattern=${flake.noul} (act threshold ${TRIAGE_THRESHOLDS.noulAct})`,
      );
      if (flake.noul >= TRIAGE_THRESHOLDS.noulAct) {
        return { action: 'auto_retry', rationale };
      }
      return { action: 'restart_infra', rationale };
    }
    case 'environment': {
      rationale.push(`is_known_flake_pattern=${flake.noul}`);
      if (flake.noul >= TRIAGE_THRESHOLDS.noulAct) {
        return { action: 'auto_retry', rationale };
      }
      return { action: 'requeue_environment', rationale };
    }
    case 'bad_test': {
      rationale.push(`plausibly_from_commit=${fromCommit.noul}`);
      if (fromCommit.noul < TRIAGE_THRESHOLDS.confidenceFloor) {
        return { action: 'fix_test', rationale };
      }
      // A commit-related "bad test" is really a stale contract: human confirms.
      return { action: 'needs_human', rationale };
    }
    case 'real_regression': {
      const sev = severity.score;
      rationale.push(`regression_severity=${sev}`);
      if (severity.confidence < TRIAGE_THRESHOLDS.highConfidence) {
        rationale.push(`severity confidence ${severity.confidence} below gate`);
        return { action: 'needs_human', rationale };
      }
      if (sev >= TRIAGE_THRESHOLDS.p1Severity) {
        return { action: 'file_regression_p1', rationale };
      }
      return { action: 'file_regression_p2', rationale };
    }
    default: {
      rationale.push(`unknown category "${String(category.choice)}"`);
      return { action: 'needs_human', rationale };
    }
  }
}

/** Human-readable label for CLI tables and stubbed downstream consumers. */
export function actionLabel(action: TriageAction): string {
  const labels: Record<TriageAction, string> = {
    auto_retry: 'AUTO-RETRY CI job',
    restart_infra: 'RESTART infra, then requeue',
    requeue_environment: 'REQUEUE with environment reset',
    file_regression_p1: 'FILE P1 regression ticket',
    file_regression_p2: 'FILE P2 regression ticket',
    fix_test: 'FIX the test (stale/over-specified)',
    needs_human: 'ROUTE TO HUMAN (with probability table)',
  };
  return labels[action];
}