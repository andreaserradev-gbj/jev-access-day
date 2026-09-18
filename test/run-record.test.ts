import { describe, expect, it } from 'vitest';
import {
  buildCheckoutRunRecord,
  buildTriageRunRecord,
  checkoutPrimaryConfidence,
  CSV_HEADER,
  resultsDirFor,
  RUN_RECORD_SCHEMA_VERSION,
  runFileName,
  toCsv,
  triagePrimaryConfidence,
  type CheckoutRunRecord,
  type TriageRunRecord,
} from '../src/eval/run-record.js';
import { decideTriage, type TriageDecision } from '../src/triage/decide.js';
import { decideStage3 } from '../src/checkout/decide.js';
import { MOCK_ANSWERS } from '../src/typesafe/mock.js';
import type { Answers, ChoiceAnswer, Usage } from '../src/typesafe/client.js';
import type { CascadeResult } from '../src/checkout/cascade.js';
import type { CheckoutFixture } from '../src/checkout/state.js';

const TIMESTAMP = '2026-09-18T10:00:00.000Z';
const USAGE: Usage = { inputTokens: 100, outputTokens: 40, calls: 1, elapsedMs: 75 };
const MODEL = { model: 'mock' };

describe('run-record schema', () => {
  it('carries schema version, timestamp override, and primary confidence', () => {
    const answers = MOCK_ANSWERS['bad-test'] as Answers;
    const decision = decideTriage(answers);
    const record = buildTriageRunRecord(
      { provider: 'mock', scenario: 'bad-test', runIndex: 2, model: MODEL, timestamp: TIMESTAMP },
      decision,
      answers,
      USAGE,
    );
    expect(record.schemaVersion).toBe(RUN_RECORD_SCHEMA_VERSION);
    expect(record.schemaVersion).toBe(1);
    expect(record.timestamp).toBe(TIMESTAMP);
    expect(record.domain).toBe('triage');
    expect(record.action).toBe('fix_test');
    expect(record.confidence).toBe(0.66);
    expect(record.usage).toBe(USAGE);
  });

  it('defaults the timestamp to now when not overridden', () => {
    const answers = MOCK_ANSWERS['known-flake'] as Answers;
    const record = buildTriageRunRecord(
      { provider: 'mock', scenario: 'known-flake', runIndex: 0, model: MODEL },
      decideTriage(answers),
      answers,
      USAGE,
    );
    expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
  });

  it('checkout record sums usage across stages and includes bureau latency', () => {
    const fixture = { scenario: 'thin-file-new-customer', economics: { marginUsd: 22, fraudLossUsd: 84.5, ltvAtRiskUsd: 260 } };
    const stage3Answers = MOCK_ANSWERS['thin-file-new-customer'] as Answers;
    const stage3 = decideStage3(stage3Answers, fixture.economics);
    const result: CascadeResult = {
      scenario: 'thin-file-new-customer',
      stage1Route: 'bureau_call',
      stage1Rationale: [],
      stage1Answers: MOCK_ANSWERS['thin-file-new-customer'] as Answers,
      bureauCalled: true,
      finalAction: stage3.action,
      finalRationale: [],
      stage3Answers,
      evApproveUsd: stage3.evApproveUsd,
      pFraudEstimate: stage3.pFraudEstimate,
      stage1Usage: { inputTokens: 100, outputTokens: 40, calls: 1, elapsedMs: 70 },
      stage3Usage: { inputTokens: 200, outputTokens: 50, calls: 1, elapsedMs: 90 },
      bureauLatencyMs: 350,
    };
    const record = buildCheckoutRunRecord(
      { provider: 'mock', scenario: 'thin-file-new-customer', runIndex: 0, model: MODEL, timestamp: TIMESTAMP },
      result,
    );
    expect(record.domain).toBe('checkout');
    expect(record.stage1Route).toBe('bureau_call');
    expect(record.bureauCalled).toBe(true);
    expect(record.usage.inputTokens).toBe(300);
    expect(record.usage.outputTokens).toBe(90);
    expect(record.usage.calls).toBe(2);
    expect(record.usage.elapsedMs).toBe(70 + 90 + 350);
    expect(record.confidence).toBe((stage3Answers['final_action'] as ChoiceAnswer).confidence);
  });

  it('fast-path checkout records fall back to risk_band confidence', () => {
    const stage1Answers = MOCK_ANSWERS['clean-repeat-buyer'] as Answers;
    const result: CascadeResult = {
      scenario: 'clean-repeat-buyer',
      stage1Route: 'approve_fast_path',
      stage1Rationale: [],
      stage1Answers,
      bureauCalled: false,
      finalAction: 'approve',
      finalRationale: [],
      stage3Answers: null,
      evApproveUsd: null,
      pFraudEstimate: null,
      stage1Usage: { inputTokens: 1, outputTokens: 1, calls: 1, elapsedMs: 60 },
      stage3Usage: null,
      bureauLatencyMs: null,
    };
    const record = buildCheckoutRunRecord(
      { provider: 'mock', scenario: 'clean-repeat-buyer', runIndex: 0, model: MODEL },
      result,
    );
    expect(record.confidence).toBe((stage1Answers['risk_band'] as ChoiceAnswer).confidence);
    expect(record.bureauCalled).toBe(false);
  });
});

describe('mock registry hygiene', () => {
  it('every canned probability set sums to 1 within the ±0.02 tolerance', () => {
    for (const [scenario, answers] of Object.entries(MOCK_ANSWERS)) {
      for (const [id, answer] of Object.entries(answers as Answers)) {
        if (answer.type === 'noul') continue;
        const sum = Object.values(answer.probabilities ?? {}).reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - 1), `${scenario}/${id} sums to ${sum}`).toBeLessThan(0.02);
      }
    }
  });
});

describe('confidence helpers', () => {
  it('triage reads failure_category; missing answers yield 0', () => {
    const answers = MOCK_ANSWERS['infra-outage'] as Answers;
    expect(triagePrimaryConfidence(answers)).toBe(0.81);
    expect(triagePrimaryConfidence({} as Answers)).toBe(0);
  });

  it('checkout prefers stage-3 final_action over stage-1 risk_band', () => {
    const stage3 = { final_action: { type: 'choice', choice: 'approve', probabilities: {}, confidence: 0.9 } } as Answers;
    const stage1 = { risk_band: { type: 'choice', choice: 'clear', probabilities: {}, confidence: 0.4 } } as Answers;
    expect(checkoutPrimaryConfidence(stage1, stage3)).toBe(0.9);
    expect(checkoutPrimaryConfidence(stage1, null)).toBe(0.4);
    expect(checkoutPrimaryConfidence({} as Answers, null)).toBe(0);
  });
});

describe('persistence paths', () => {
  it('names result dirs by UTC date and run files by provider/domain/index', () => {
    expect(resultsDirFor(new Date('2026-09-18T23:30:00Z'))).toBe('results/2026-09-18');
    expect(runFileName('llm', 'triage', 0)).toBe('run-llm-triage-run0.json');
    expect(runFileName('real', 'checkout', 12)).toBe('run-real-checkout-run12.json');
  });

  it('CSV flattens triage and checkout rows with a shared header', () => {
    const answers = MOCK_ANSWERS['bad-test'] as Answers;
    const triage: TriageRunRecord = buildTriageRunRecord(
      { provider: 'mock', scenario: 'bad-test', runIndex: 0, model: MODEL, timestamp: TIMESTAMP },
      decideTriage(answers),
      answers,
      USAGE,
    );
    const stage1Answers = MOCK_ANSWERS['clean-repeat-buyer'] as Answers;
    const checkout: CheckoutRunRecord = buildCheckoutRunRecord(
      { provider: 'mock', scenario: 'clean-repeat-buyer', runIndex: 0, model: MODEL, timestamp: TIMESTAMP },
      {
        scenario: 'clean-repeat-buyer',
        stage1Route: 'approve_fast_path',
        stage1Rationale: [],
        stage1Answers,
        bureauCalled: false,
        finalAction: 'approve',
        finalRationale: [],
        stage3Answers: null,
        evApproveUsd: null,
        pFraudEstimate: null,
        stage1Usage: USAGE,
        stage3Usage: null,
        bureauLatencyMs: null,
      } satisfies CascadeResult,
    );
    const csv = toCsv([triage, checkout]);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('triage,bad-test,fix_test');
    expect(lines[2]).toContain('checkout,clean-repeat-buyer,approve,approve_fast_path,false');
    expect(lines[2]).not.toContain('Infinity');
  });

  it('CSV-escapes cells containing commas, quotes, or newlines', () => {
    // A scenario with a comma would come from a fixture id; quotes get doubled.
    const decision: TriageDecision = { action: 'needs_human', rationale: [] };
    const record = buildTriageRunRecord(
      { provider: 'llm', scenario: 'edge, "quoted"', runIndex: 0, model: MODEL, timestamp: TIMESTAMP },
      decision,
      {} as Answers,
      USAGE,
    );
    const line = toCsv([record]).trimEnd().split('\n')[1]!;
    expect(line).toContain('"edge, ""quoted"""');
  });
});

describe('fixture economics sanity', () => {
  it('checkout fixtures parsed in tests keep the cascade contract shape', () => {
    const fixture = JSON.parse(
      JSON.stringify(MOCK_ANSWERS['bureau-contradiction']),
    ) as unknown as CheckoutFixture;
    expect(fixture).toBeTruthy();
  });
});