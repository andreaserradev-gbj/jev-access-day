import { describe, expect, it } from 'vitest';
import { decideTriage, TRIAGE_THRESHOLDS, type TriageAction } from '../src/triage/decide.js';
import { MOCK_ANSWERS } from '../src/typesafe/mock.js';
import { triageExpectation } from '../src/eval/expectations.js';
import type { Answers } from '../src/typesafe/client.js';

const triageScenarios = [
  'known-flake',
  'error-contract-regression',
  'infra-outage',
  'bad-test',
  'environment-drift',
  'ambiguous-failure',
] as const;

/** Ground truth shared with the eval harness (fixtures/expectations.json). */
const expected: Record<(typeof triageScenarios)[number], TriageAction> = {
  'known-flake': triageExpectation('known-flake').action,
  'error-contract-regression': triageExpectation('error-contract-regression').action,
  'infra-outage': triageExpectation('infra-outage').action,
  'bad-test': triageExpectation('bad-test').action,
  'environment-drift': triageExpectation('environment-drift').action,
  'ambiguous-failure': triageExpectation('ambiguous-failure').action,
};

describe('triage decide()', () => {
  for (const scenario of triageScenarios) {
    it(`routes ${scenario} to ${expected[scenario]}`, () => {
      const answers = MOCK_ANSWERS[scenario] as Answers;
      const decision = decideTriage(answers);
      expect(decision.action).toBe(expected[scenario]);
    });
  }

  it('never acts below the confidence floor', () => {
    const low = structuredClone(MOCK_ANSWERS['ambiguous-failure']) as Answers;
    const choice = low['failure_category'] as { confidence: number };
    choice.confidence = 0.1;
    expect(decideTriage(low).action).toBe('needs_human');
  });

  it('files P1 only above the severity gate', () => {
    const answers = structuredClone(MOCK_ANSWERS['error-contract-regression']) as Answers;
    const severity = answers['regression_severity'] as { score: number };
    severity.score = TRIAGE_THRESHOLDS.p1Severity - 0.1;
    const decision = decideTriage(answers);
    expect(decision.action).toBe('file_regression_p2');
  });

  it('routes unknown category to a human', () => {
    const answers = structuredClone(MOCK_ANSWERS['known-flake']) as Answers;
    const category = answers['failure_category'] as { choice: string };
    category.choice = 'alien_invasion';
    expect(decideTriage(answers).action).toBe('needs_human');
  });
});