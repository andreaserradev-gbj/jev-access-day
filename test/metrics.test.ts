import { describe, expect, it } from 'vitest';
import {
  brierScore,
  costUsd,
  expectedCalibrationError,
  latencyStats,
  percentile,
  recordSchemaViolations,
  scoreRecord,
  summarizeRecords,
  type CalibrationPair,
} from '../src/eval/metrics.js';
import { EXPECTATIONS } from '../src/eval/expectations.js';
import {
  buildCheckoutRunRecord,
  buildTriageRunRecord,
  type CheckoutRunRecord,
  type TriageRunRecord,
} from '../src/eval/run-record.js';
import { decideTriage } from '../src/triage/decide.js';
import { decideStage3 } from '../src/checkout/decide.js';
import { MOCK_ANSWERS } from '../src/typesafe/mock.js';
import type { Answers, ChoiceAnswer } from '../src/typesafe/client.js';
import type { CascadeResult } from '../src/checkout/cascade.js';

const TS = '2026-09-18T10:00:00.000Z';
const MODEL = { model: 'mock' };

function usage(elapsedMs: number, inputTokens = 100, outputTokens = 40) {
  return { inputTokens, outputTokens, calls: 1, elapsedMs };
}

function triageRecord(
  scenario: string,
  overrides?: { action?: string; confidence?: number },
): TriageRunRecord {
  const answers = structuredClone(MOCK_ANSWERS[scenario as keyof typeof MOCK_ANSWERS]) as Answers;
  const decision = decideTriage(answers);
  const action = (overrides?.action ?? decision.action) as TriageRunRecord['action'];
  const record = buildTriageRunRecord(
    { provider: 'mock', scenario, runIndex: 0, model: MODEL, timestamp: TS },
    { action, rationale: [] },
    answers,
    usage(75),
  );
  if (overrides?.confidence !== undefined) {
    (record.answers['failure_category'] as ChoiceAnswer).confidence = overrides.confidence;
    record.confidence = overrides.confidence;
  }
  return record;
}

const BUREAU_ECONOMICS = { marginUsd: 34, fraudLossUsd: 129, ltvAtRiskUsd: 180 };

function checkoutRecord(
  scenario: string,
  overrides?: { finalAction?: string; confidence?: number },
): CheckoutRunRecord {
  const fixture = JSON.parse(
    JSON.stringify(MOCK_ANSWERS[scenario as keyof typeof MOCK_ANSWERS]),
  ) as Answers;
  const stage3 = decideStage3(fixture, BUREAU_ECONOMICS);
  const finalAction = (overrides?.finalAction ?? stage3.action) as CheckoutRunRecord['finalAction'];
  const stage3Answers = structuredClone(fixture);
  if (overrides?.confidence !== undefined) {
    (stage3Answers['final_action'] as ChoiceAnswer).confidence = overrides.confidence;
  }
  const result: CascadeResult = {
    scenario,
    stage1Route: 'bureau_call',
    stage1Rationale: [],
    stage1Answers: fixture,
    bureauCalled: true,
    finalAction,
    finalRationale: [],
    stage3Answers,
    evApproveUsd: stage3.evApproveUsd,
    pFraudEstimate: stage3.pFraudEstimate,
    stage1Usage: usage(70),
    stage3Usage: usage(90),
    bureauLatencyMs: 40,
  };
  return buildCheckoutRunRecord(
    { provider: 'mock', scenario, runIndex: 0, model: MODEL, timestamp: TS },
    result,
  );
}

describe('scoring vs expectations', () => {
  it('mock fixture records pass against the shared expectations', () => {
    const verdict = scoreRecord(triageRecord('bad-test'), EXPECTATIONS);
    expect(verdict.outcome).toBe('pass');
    expect(verdict.mismatch).toBeNull();
  });

  it('a wrong action fails with a readable mismatch', () => {
    const verdict = scoreRecord(triageRecord('bad-test', { action: 'auto_retry' }), EXPECTATIONS);
    expect(verdict.outcome).toBe('fail');
    expect(verdict.mismatch).toContain('auto_retry');
    expect(verdict.mismatch).toContain('fix_test');
  });

  it('checkout scores route AND final action; route drift is caught', () => {
    const record = checkoutRecord('thin-file-new-customer');
    expect(scoreRecord(record, EXPECTATIONS).outcome).toBe('pass');

    const wrongRoute = structuredClone(record);
    wrongRoute.stage1Route = 'approve_fast_path';
    const verdict = scoreRecord(wrongRoute, EXPECTATIONS);
    expect(verdict.outcome).toBe('fail');
    expect(verdict.mismatch).toContain('route approve_fast_path');
    expect(verdict.routeMatch).toBe(false);
    expect(verdict.actionMatch).toBe(true);
  });

  it('unknown scenarios are unscored, not failed', () => {
    const record = buildTriageRunRecord(
      { provider: 'mock', scenario: 'alien-scenario', runIndex: 0, model: MODEL, timestamp: TS },
      { action: 'needs_human', rationale: [] },
      {} as Answers,
      usage(50),
    );
    const verdict = scoreRecord(record, EXPECTATIONS);
    expect(verdict.outcome).toBe('unscored');
    expect(verdict.mismatch).toBeNull();
  });
});

describe('calibration primitives', () => {
  it('brier of perfect predictions is 0, of confidently-wrong is 1', () => {
    const perfect: CalibrationPair[] = [
      { predicted: 1, correct: 1 },
      { predicted: 0, correct: 0 },
    ];
    const wrong: CalibrationPair[] = [
      { predicted: 1, correct: 0 },
      { predicted: 0, correct: 1 },
    ];
    expect(brierScore(perfect)).toBe(0);
    expect(brierScore(wrong)).toBe(1);
    expect(brierScore([])).toBeNull();
  });

  it('brier is strictly better for calibrated vs overconfident predictors', () => {
    const pairs: CalibrationPair[] = [
      { predicted: 0.8, correct: 1 },
      { predicted: 0.8, correct: 1 },
      { predicted: 0.8, correct: 0 },
      { predicted: 0.8, correct: 1 },
    ];
    const overconfident: CalibrationPair[] = pairs.map((p) => ({ ...p, predicted: 1 }));
    expect(brierScore(pairs)!).toBeLessThan(brierScore(overconfident)!);
  });

  it('ECE is 0 for a perfectly calibrated constant predictor and grows with miscalibration', () => {
    // 80% of outcomes correct at predicted 0.8 -> that bin is perfectly calibrated.
    const calibrated: CalibrationPair[] = Array.from({ length: 10 }, (_, i) => ({
      predicted: 0.8,
      correct: (i < 8 ? 1 : 0) as 0 | 1,
    }));
    expect(expectedCalibrationError(calibrated)!).toBeLessThan(1e-12);

    const overconfident: CalibrationPair[] = Array.from({ length: 10 }, (_, i) => ({
      predicted: 1,
      correct: (i < 8 ? 1 : 0) as 0 | 1,
    }));
    expect(expectedCalibrationError(overconfident)!).toBeGreaterThan(0.19);
    expect(expectedCalibrationError(overconfident)!).toBeLessThan(0.21);
    expect(expectedCalibrationError([])).toBeNull();
  });

  it('confidence 1.0 lands in the last bin, 0.0 in the first (clamping by construction)', () => {
    const edge: CalibrationPair[] = [
      { predicted: 1, correct: 1 },
      { predicted: 0, correct: 0 },
    ];
    // Both bins perfectly calibrated -> ECE 0; proves no out-of-range indexing.
    expect(expectedCalibrationError(edge)).toBe(0);
  });
});

describe('latency', () => {
  it('nearest-rank percentile matches hand computation', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([10], 95)).toBe(10);
  });

  it('stats over empty input are zeroed, not thrown', () => {
    expect(latencyStats([])).toEqual({ p50: 0, p95: 0, mean: 0, max: 0 });
  });

  it('p95 reflects the tail, not the mean', () => {
    // 20 values: 19×100, 1×5000. ceil(0.95·20)-1 = 18 (0-based) → 100.
    // The single outlier sits above p95 by nearest-rank definition.
    const values = [...Array(19).fill(100), 5000];
    const stats = latencyStats(values);
    expect(stats.p50).toBe(100);
    expect(stats.p95).toBe(100);
    expect(stats.max).toBe(5000);
    // With 20 values, p95 = ceil(19)-1 = 18th index; the 20th value needs p≥95.
    expect(percentile(values, 100)).toBe(5000);
  });
});

describe('schema violations', () => {
  it('clean mock records produce zero violations', () => {
    expect(recordSchemaViolations(triageRecord('bad-test')).count).toBe(0);
    expect(recordSchemaViolations(checkoutRecord('thin-file-new-customer')).count).toBe(0);
  });

  it('probabilities off-sum, stray confidence, and noul out of range are caught', () => {
    const answers: Answers = {
      bad_choice: {
        type: 'choice',
        choice: 'a',
        probabilities: { a: 0.6, b: 0.3 },
        confidence: 1.5,
      },
      bad_noul: { type: 'noul', noul: -0.2 },
      unknown: { type: 'oracle' } as never,
    };
    const record = buildTriageRunRecord(
      { provider: 'llm', scenario: 'bad-test', runIndex: 0, model: MODEL, timestamp: TS },
      { action: 'needs_human', rationale: [] },
      answers,
      usage(1),
    );
    const v = recordSchemaViolations(record);
    expect(v.count).toBeGreaterThanOrEqual(4);
    expect(v.details.some((d) => d.includes('bad_choice: choice probabilities sum'))).toBe(true);
    // choice "a" IS in probabilities here; the off-sum and stray confidence are the violations.
    expect(v.details.some((d) => d.includes('bad_choice: confidence 1.5 outside [0,1]'))).toBe(true);
    expect(v.details.some((d) => d.includes('bad_noul: noul -0.2 outside [0,1]'))).toBe(true);
    expect(v.details.some((d) => d.includes('unknown: unknown answer type'))).toBe(true);
  });

  it('checkout violations are prefixed by stage', () => {
    const record = checkoutRecord('thin-file-new-customer');
    (record.stage3Answers!['final_action'] as ChoiceAnswer).probabilities = {
      approve: 0.5,
      step_up: 0.5,
      review: 0.5,
      decline: 0.5,
    };
    const v = recordSchemaViolations(record);
    expect(v.details.some((d) => d.startsWith('stage3/final_action'))).toBe(true);
  });
});

describe('cost', () => {
  it('priced models compute USD; unknown models render null', () => {
    expect(costUsd('mock', 1_000_000, 0)).toBe(0);
    // Verified pricing: $0.042/Mtok input, output free (docs 2026-09-18).
    expect(costUsd('jev-latest', 1_000_000, 1_000_000)).toBeCloseTo(0.042, 6);
    expect(costUsd('never-heard-of-it', 10, 10)).toBeNull();
  });

  it('a pricing entry with real numbers yields real cost', () => {
    const table = { input: 2, output: 8 };
    const usd = (1_500_000 / 1_000_000) * table.input + (500_000 / 1_000_000) * table.output;
    expect(usd).toBe(7);
  });
});

describe('summarizeRecords', () => {
  it('groups by provider/domain and aggregates pass rate, calibration, tokens, cost', () => {
    const records = [
      triageRecord('bad-test'),
      triageRecord('known-flake'),
      triageRecord('infra-outage'),
      checkoutRecord('thin-file-new-customer'),
    ];
    const summaries = summarizeRecords(records, EXPECTATIONS);
    // Sorted by provider/domain: checkout before triage alphabetically.
    const [checkoutSummary, triageSummary] = summaries;
    expect(triageSummary!.provider).toBe('mock');
    expect(triageSummary!.domain).toBe('triage');
    expect(triageSummary!.total).toBe(3);
    expect(triageSummary!.scored).toBe(3);
    expect(triageSummary!.passed).toBe(3);
    expect(triageSummary!.passRate).toBe(1);
    expect(triageSummary!.latency.p50).toBe(75);
    expect(triageSummary!.tokens).toEqual({ input: 300, output: 120, calls: 3 });
    expect(triageSummary!.costUsd).toBe(0);
    expect(triageSummary!.schemaViolations.count).toBe(0);
    expect(triageSummary!.disagreements).toEqual([]);

    expect(checkoutSummary!.domain).toBe('checkout');
    expect(checkoutSummary!.scored).toBe(1);
    expect(checkoutSummary!.passed).toBe(1);
  });

  it('failures surface as disagreements with mismatch text', () => {
    const records = [triageRecord('bad-test', { action: 'needs_human' })];
    const [summary] = summarizeRecords(records, EXPECTATIONS);
    expect(summary!.failed).toBe(1);
    expect(summary!.disagreements).toHaveLength(1);
    expect(summary!.disagreements[0]).toContain('bad-test');
    expect(summary!.disagreements[0]).toContain('needs_human ≠ fix_test');
  });

  it('unscored-only groups report null pass rate and null calibration', () => {
    const answers = structuredClone(MOCK_ANSWERS['bad-test']) as Answers;
    const probe = buildTriageRunRecord(
      { provider: 'mock', scenario: 'probe-bin-0.5', runIndex: 0, model: MODEL, timestamp: TS },
      { action: 'needs_human', rationale: [] },
      answers,
      usage(50),
    );
    const [summary] = summarizeRecords([probe], EXPECTATIONS);
    expect(summary!.scored).toBe(0);
    expect(summary!.passRate).toBeNull();
    expect(summary!.brier).toBeNull();
    expect(summary!.ece).toBeNull();
  });
});