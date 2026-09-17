import type { Questions } from '../typesafe/client.js';

/**
 * The triage question set. Five atomic questions, one batched call:
 * each is a gut-check a senior engineer could make in seconds given
 * the failure record. None of them asks "analyze and explain" — that
 * is System 2 reasoning and belongs downstream, where triage routes it.
 */
export const TRIAGE_QUESTIONS: Questions = {
  is_known_flake_pattern: {
    type: 'noul',
    instructions:
      'Does `received` look like a known flake pattern — timeout, ECONNRESET, race on a shared resource, or ordering-sensitive assertion — rather than a deterministic behavior mismatch?',
    criteria: {
      true: 'Error shape is transient (timeouts, connection resets, flaky ordering)',
      false: 'Error is a deterministic mismatch between expected and received',
    },
  },
  asserts_error_contract: {
    type: 'noul',
    instructions:
      'Does `expected` pin a service error contract — a 4xx status with a specific error name and message — rather than a business output like a product payload?',
  },
  plausibly_from_commit: {
    type: 'noul',
    instructions:
      'Could the failure plausibly be caused by `recent_commits`, judging by what those commits touch versus what the failing test exercises?',
  },
  failure_category: {
    type: 'choice',
    instructions: 'What is the most probable root category of this failure?',
    criteria: {
      infra: 'Database, broker, or network unavailable or misbehaving; code is fine',
      real_regression: 'A recent change broke behavior the test correctly pins',
      bad_test: 'The test itself is wrong, over-specified, or tests an outdated contract',
      environment: 'CI runner or configuration drift: env vars, versions, ports, data state',
    },
  },
  regression_severity: {
    type: 'score',
    instructions:
      'IF this is a real regression, how severe is it for a fintech product? Judge impact, not likelihood.',
    criteria: [
      'patch-level annoyance: cosmetic, log noise, nothing user-facing',
      'degraded feature: a user-visible endpoint misbehaves under some inputs',
      'data-loss or payment risk: money, stock, or stored data can be wrong or lost',
    ],
  },
} as const;

/** The question ids triage's decide() consumes. */
export type TriageQuestionId = keyof typeof TRIAGE_QUESTIONS;