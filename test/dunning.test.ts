import { describe, expect, it } from 'vitest';
import { decideDunning, DUNNING_THRESHOLDS } from '../src/dunning/decide.js';
import { dunningTemporalFromFixture, type DunningFixture, type DunningTemporal } from '../src/dunning/state.js';
import { MOCK_ANSWERS } from '../src/typesafe/mock.js';
import { dunningExpectation } from '../src/eval/expectations.js';
import type { Answers } from '../src/typesafe/client.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dunningScenarios = [
  'nsf-transient',
  'nsf-repeat',
  'mandate-revoked',
  'mandate-revoked-no-alt',
  'account-closed',
  'processor-outage',
] as const;

/** Fixture temporals, loaded from the same JSON files the eval reads. */
function temporalFor(scenario: string): DunningTemporal {
  const fixture = JSON.parse(
    readFileSync(join('fixtures', 'dunning', `${scenario}.json`), 'utf8'),
  ) as DunningFixture;
  return dunningTemporalFromFixture(fixture);
}

describe('dunning decide() — mock-anchored kernel routes', () => {
  for (const scenario of dunningScenarios) {
    it(`routes ${scenario} to ${dunningExpectation(scenario).action}`, () => {
      const answers = MOCK_ANSWERS[scenario] as Answers;
      const decision = decideDunning(answers, temporalFor(scenario));
      expect(decision.action).toBe(dunningExpectation(scenario).action);
    });
  }
});

describe('dunning temporal kernel — "when" semantics', () => {
  it('retry_in_3d waits exactly 3 days', () => {
    const decision = decideDunning(MOCK_ANSWERS['nsf-transient'] as Answers, temporalFor('nsf-transient'));
    expect(decision.action).toBe('retry_in_3d');
    expect(decision.waitDays).toBe(3);
  });

  it('retry_next_schedule inherits the schedule gap from the fixture (2d for processor-outage)', () => {
    const decision = decideDunning(
      MOCK_ANSWERS['processor-outage'] as Answers,
      temporalFor('processor-outage'),
    );
    expect(decision.action).toBe('retry_next_schedule');
    expect(decision.waitDays).toBe(2);
  });

  it('switch_method_then_retry fires immediately (waitDays 0)', () => {
    const decision = decideDunning(
      MOCK_ANSWERS['mandate-revoked'] as Answers,
      temporalFor('mandate-revoked'),
    );
    expect(decision.waitDays).toBe(0);
  });
});

describe('dunning kernel gates', () => {
  it('never acts below the confidence floor', () => {
    const low = structuredClone(MOCK_ANSWERS['nsf-transient']) as Answers;
    const cause = low['bounce_cause'] as { confidence: number };
    cause.confidence = 0.2;
    expect(decideDunning(low, temporalFor('nsf-transient')).action).toBe('needs_human');
  });

  it('third attempt never blind-retries the same mandate', () => {
    const answers = MOCK_ANSWERS['nsf-transient'] as Answers;
    const temporal: DunningTemporal = {
      attemptsIncludingThis: DUNNING_THRESHOLDS.maxAutoRetries,
      nextDueInDays: 30,
      hasValidAlternativeMethod: true,
      installmentsDueWithin14d: 0,
    };
    // standing=good → alternative-method switch fires; without one → pause.
    expect(decideDunning(answers, temporal).action).toBe('switch_method_then_retry');
    expect(
      decideDunning(answers, { ...temporal, hasValidAlternativeMethod: false }).action,
    ).toBe('pause_spending');
  });

  it('clustering installments + weak retry goes to a human instead of stacking fees', () => {
    const answers = structuredClone(MOCK_ANSWERS['nsf-repeat']) as Answers;
    const retry = answers['retry_worthwhile'] as { noul: number };
    retry.noul = DUNNING_THRESHOLDS.retryNoul - 0.05;
    const temporal: DunningTemporal = {
      attemptsIncludingThis: 1,
      nextDueInDays: 4,
      hasValidAlternativeMethod: false,
      installmentsDueWithin14d: 2,
    };
    expect(decideDunning(answers, temporal).action).toBe('needs_human');
  });

  it('structural cause with untrustworthy alternative escalates to a human', () => {
    const answers = MOCK_ANSWERS['mandate-revoked'] as Answers;
    const temporal: DunningTemporal = {
      attemptsIncludingThis: 1,
      nextDueInDays: 30,
      hasValidAlternativeMethod: false,
      installmentsDueWithin14d: 0,
    };
    expect(decideDunning(answers, temporal).action).toBe('needs_human');
  });

  it('missing answers refuse to guess', () => {
    expect(decideDunning({}, temporalFor('nsf-transient')).action).toBe('needs_human');
  });
});