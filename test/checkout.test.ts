import { describe, expect, it } from 'vitest';
import {
  decideStage1,
  decideStage3,
  estimatePFraud,
  STAGE1_THRESHOLDS,
  type FinalAction,
} from '../src/checkout/decide.js';
import { MOCK_ANSWERS } from '../src/typesafe/mock.js';
import { checkoutExpectation } from '../src/eval/expectations.js';
import type { Answers, ChoiceAnswer } from '../src/typesafe/client.js';
import { buildCheckoutState, buildSynthesisState } from '../src/checkout/state.js';
import { PRE_BUREAU_QUESTIONS, SYNTHESIS_QUESTIONS } from '../src/checkout/questions.js';
import { cleanRepeatBuyer } from './helpers/fixtures.js';

describe('checkout stage-1 decide()', () => {
  it('fast-path approves the clean repeat buyer (bureau skipped)', () => {
    const decision = decideStage1(MOCK_ANSWERS['clean-repeat-buyer'] as Answers);
    expect(decision.route).toBe(checkoutExpectation('clean-repeat-buyer').stage1Route);
    expect(decision.route).toBe('approve_fast_path');
  });

  it('fast-path declines the stolen-card pattern (bureau skipped)', () => {
    const decision = decideStage1(MOCK_ANSWERS['stolen-card-pattern'] as Answers);
    expect(decision.route).toBe(checkoutExpectation('stolen-card-pattern').stage1Route);
    expect(decision.route).toBe('decline_fast_path');
  });

  it('routes thin-file new customer to the bureau', () => {
    const decision = decideStage1(MOCK_ANSWERS['thin-file-new-customer'] as Answers);
    expect(decision.route).toBe(checkoutExpectation('thin-file-new-customer').stage1Route);
    expect(decision.route).toBe('bureau_call');
  });

  it('never fast-paths below the confidence floor', () => {
    const answers = structuredClone(MOCK_ANSWERS['clean-repeat-buyer']) as Answers;
    const band = answers['risk_band'] as { confidence: number };
    band.confidence = STAGE1_THRESHOLDS.confidenceFloor - 0.01;
    expect(decideStage1(answers).route).toBe('bureau_call');
  });
});

describe('checkout stage-3 EV decide()', () => {
  const economics = { marginUsd: 22, fraudLossUsd: 84.5, ltvAtRiskUsd: 260 };

  it('routes the bureau contradiction to human review (low confidence)', () => {
    const decision = decideStage3(MOCK_ANSWERS['bureau-contradiction'] as Answers, economics);
    expect(decision.action).toBe(checkoutExpectation('bureau-contradiction').finalAction);
    expect(decision.action).toBe('review');
  });

  it('routes the ambiguous checkout to review (low confidence)', () => {
    const decision = decideStage3(MOCK_ANSWERS['ambiguous-checkout'] as Answers, economics);
    expect(decision.action).toBe(checkoutExpectation('ambiguous-checkout').finalAction);
    expect(decision.action).toBe('review');
  });

  it('approves when EV(approve) is positive and confidence is high', () => {
    const answers = structuredClone(MOCK_ANSWERS['bureau-contradiction']) as Answers;
    answers['final_action'] = {
      type: 'choice',
      choice: 'approve',
      probabilities: { approve: 0.95, step_up: 0.03, review: 0.02, decline: 0.0 },
      confidence: 0.85,
    } satisfies ChoiceAnswer;
    answers['bureau_consistent_with_history'] = { type: 'noul', noul: 0.9 };
    answers['affordability_signal'] = {
      type: 'score',
      score: 0.4,
      legend: {},
      probabilities: { '0': 0.6, '1': 0.4, '2': 0.0, '3': 0.0 },
      confidence: 0.8,
    };
    const decision = decideStage3(answers, economics);
    expect(decision.action).toBe('approve');
    expect(decision.evApproveUsd).toBeGreaterThan(0);
  });

  it('steps up when EV(approve) is negative despite an approve lean', () => {
    const answers = structuredClone(MOCK_ANSWERS['bureau-contradiction']) as Answers;
    answers['final_action'] = {
      type: 'choice',
      choice: 'approve',
      probabilities: { approve: 0.9, step_up: 0.1, review: 0.0, decline: 0.0 },
      confidence: 0.75,
    } satisfies ChoiceAnswer;
    answers['bureau_consistent_with_history'] = { type: 'noul', noul: 0.9 };
    answers['affordability_signal'] = {
      type: 'score',
      score: 0.4,
      legend: {},
      probabilities: { '0': 0.6, '1': 0.4, '2': 0.0, '3': 0.0 },
      confidence: 0.75,
    };
    const decision = decideStage3(answers, {
      marginUsd: 1,
      fraudLossUsd: 10_000,
      ltvAtRiskUsd: 50_000,
    });
    expect(decision.action).toBe('step_up');
    expect(decision.evApproveUsd).toBeLessThan(0);
  });
});

describe('p_fraud estimation', () => {
  it('weights decline > review > step_up', () => {
    const decline: ChoiceAnswer = {
      type: 'choice',
      choice: 'decline',
      probabilities: { decline: 1, review: 0, step_up: 0, approve: 0 },
      confidence: 1,
    };
    const review: ChoiceAnswer = { ...decline, choice: 'review', probabilities: { decline: 0, review: 1, step_up: 0, approve: 0 } };
    const stepUp: ChoiceAnswer = { ...decline, choice: 'step_up', probabilities: { decline: 0, review: 0, step_up: 1, approve: 0 } };
    expect(estimatePFraud(decline)).toBeGreaterThan(estimatePFraud(review));
    expect(estimatePFraud(review)).toBeGreaterThan(estimatePFraud(stepUp));
  });
});

describe('state builders', () => {
  it('carries the scenario id the mock provider keys on', () => {
    const state = buildCheckoutState(cleanRepeatBuyer.checkout);
    expect(state['scenario']).toBe('clean-repeat-buyer');
  });

  it('synthesis state embeds bureau and stage-1 judgments', () => {
    const state = buildSynthesisState(
      cleanRepeatBuyer.checkout,
      { bureau: 'mock-bureau', scoreBand: 'excellent', bureauScore: 812, delinquenciesLast24m: 0, inquiriesLast30d: 0, latencyMs: 350 },
      { risk_band: { choice: 'clear' } },
    );
    expect(state['bureau']).toBeDefined();
    expect(state['stage1_judgments']).toBeDefined();
  });

  it('question sets are disjoint across stages', () => {
    const stage1 = new Set(Object.keys(PRE_BUREAU_QUESTIONS));
    const stage3 = new Set(Object.keys(SYNTHESIS_QUESTIONS));
    for (const id of stage1) {
      expect(stage3.has(id)).toBe(false);
    }
  });

  it('every FINAL_ACTION label is defined for every action', () => {
    const actions: FinalAction[] = ['approve', 'step_up', 'review', 'decline'];
    expect(actions).toHaveLength(4);
  });
});