import type {
  Answer,
  Answers,
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
} from './client.js';

/**
 * Provider "mock": deterministic, hand-written answers keyed by a scenario id
 * that the state carries. This is fiction with realistic texture — probabilities
 * are invented to exercise confidence gates, NOT to claim any model behavior.
 *
 * The state must include `scenario: '<id>'`. The registry keys below are the
 * only valid ids. If a question id is missing from the canned answer, the mock
 * throws — a fixture and its canned answers must always agree.
 */

export type MockScenarioId =
  | 'known-flake'
  | 'error-contract-regression'
  | 'infra-outage'
  | 'bad-test'
  | 'environment-drift'
  | 'ambiguous-failure'
  | 'clean-repeat-buyer'
  | 'thin-file-new-customer'
  | 'stolen-card-pattern'
  | 'bopis-edge'
  | 'bureau-contradiction'
  | 'ambiguous-checkout';

const MOCK_ANSWERS: Record<MockScenarioId, Answers> = {
  // ── Domain 1: CI test-failure triage ──────────────────────────────────────
  'known-flake': {
    is_known_flake_pattern: { type: 'noul', noul: 0.93 },
    asserts_error_contract: { type: 'noul', noul: 0.12 },
    plausibly_from_commit: { type: 'noul', noul: 0.08 },
    failure_category: {
      type: 'choice',
      choice: 'infra',
      probabilities: { infra: 0.71, environment: 0.19, bad_test: 0.08, real_regression: 0.02 },
      confidence: 0.62,
    },
    regression_severity: {
      type: 'score',
      score: 0.21,
      legend: { '0': 'patch-level annoyance', '1': 'degraded feature', '2': 'data-loss or payment risk' },
      probabilities: { '0': 0.79, '1': 0.19, '2': 0.02 },
      confidence: 0.77,
    },
  },
  'error-contract-regression': {
    is_known_flake_pattern: { type: 'noul', noul: 0.06 },
    asserts_error_contract: { type: 'noul', noul: 0.94 },
    plausibly_from_commit: { type: 'noul', noul: 0.87 },
    failure_category: {
      type: 'choice',
      choice: 'real_regression',
      probabilities: { real_regression: 0.82, bad_test: 0.11, environment: 0.06, infra: 0.01 },
      confidence: 0.78,
    },
    regression_severity: {
      type: 'score',
      score: 1.62,
      legend: { '0': 'patch-level annoyance', '1': 'degraded feature', '2': 'data-loss or payment risk' },
      probabilities: { '0': 0.05, '1': 0.33, '2': 0.62 },
      confidence: 0.71,
    },
  },
  'infra-outage': {
    is_known_flake_pattern: { type: 'noul', noul: 0.55 },
    asserts_error_contract: { type: 'noul', noul: 0.09 },
    plausibly_from_commit: { type: 'noul', noul: 0.04 },
    failure_category: {
      type: 'choice',
      choice: 'infra',
      probabilities: { infra: 0.88, environment: 0.09, bad_test: 0.02, real_regression: 0.01 },
      confidence: 0.81,
    },
    regression_severity: {
      type: 'score',
      score: 0.35,
      legend: { '0': 'patch-level annoyance', '1': 'degraded feature', '2': 'data-loss or payment risk' },
      probabilities: { '0': 0.66, '1': 0.31, '2': 0.03 },
      confidence: 0.69,
    },
  },
  'bad-test': {
    is_known_flake_pattern: { type: 'noul', noul: 0.18 },
    asserts_error_contract: { type: 'noul', noul: 0.31 },
    plausibly_from_commit: { type: 'noul', noul: 0.05 },
    failure_category: {
      type: 'choice',
      choice: 'bad_test',
      probabilities: { bad_test: 0.74, real_regression: 0.14, environment: 0.09, infra: 0.03 },
      confidence: 0.66,
    },
    regression_severity: {
      type: 'score',
      score: 0.44,
      legend: { '0': 'patch-level annoyance', '1': 'degraded feature', '2': 'data-loss or payment risk' },
      probabilities: { '0': 0.58, '1': 0.35, '2': 0.07 },
      confidence: 0.58,
    },
  },
  'environment-drift': {
    is_known_flake_pattern: { type: 'noul', noul: 0.41 },
    asserts_error_contract: { type: 'noul', noul: 0.22 },
    plausibly_from_commit: { type: 'noul', noul: 0.11 },
    failure_category: {
      type: 'choice',
      choice: 'environment',
      probabilities: { environment: 0.79, infra: 0.13, bad_test: 0.06, real_regression: 0.02 },
      confidence: 0.73,
    },
    regression_severity: {
      type: 'score',
      score: 0.28,
      legend: { '0': 'patch-level annoyance', '1': 'degraded feature', '2': 'data-loss or payment risk' },
      probabilities: { '0': 0.74, '1': 0.23, '2': 0.03 },
      confidence: 0.7,
    },
  },
  'ambiguous-failure': {
    is_known_flake_pattern: { type: 'noul', noul: 0.52 },
    asserts_error_contract: { type: 'noul', noul: 0.61 },
    plausibly_from_commit: { type: 'noul', noul: 0.44 },
    failure_category: {
      type: 'choice',
      choice: 'real_regression',
      probabilities: { real_regression: 0.42, bad_test: 0.31, environment: 0.19, infra: 0.08 },
      confidence: 0.24,
    },
    regression_severity: {
      type: 'score',
      score: 0.98,
      legend: { '0': 'patch-level annoyance', '1': 'degraded feature', '2': 'data-loss or payment risk' },
      probabilities: { '0': 0.36, '1': 0.34, '2': 0.3 },
      confidence: 0.11,
    },
  },

  // ── Domain 2: checkout risk cascade ───────────────────────────────────────
  'clean-repeat-buyer': {
    fraud_signal_strength: {
      type: 'score',
      score: 0.18,
      legend: { '0': 'no signals', '1': 'mild signals', '2': 'elevated', '3': 'strong', '4': 'overwhelming' },
      probabilities: { '0': 0.83, '1': 0.15, '2': 0.02, '3': 0.0, '4': 0.0 },
      confidence: 0.84,
    },
    profile_consistency: { type: 'noul', noul: 0.97 },
    basket_anomaly: { type: 'noul', noul: 0.09 },
    risk_band: {
      type: 'choice',
      choice: 'clear',
      probabilities: { clear: 0.88, ambiguous: 0.08, suspicious: 0.04 },
      confidence: 0.87,
    },
  },
  'thin-file-new-customer': {
    fraud_signal_strength: {
      type: 'score',
      score: 1.24,
      legend: { '0': 'no signals', '1': 'mild signals', '2': 'elevated', '3': 'strong', '4': 'overwhelming' },
      probabilities: { '0': 0.14, '1': 0.58, '2': 0.24, '3': 0.04, '4': 0.0 },
      confidence: 0.55,
    },
    profile_consistency: { type: 'noul', noul: 0.71 },
    basket_anomaly: { type: 'noul', noul: 0.38 },
    risk_band: {
      type: 'choice',
      choice: 'ambiguous',
      probabilities: { ambiguous: 0.56, clear: 0.33, suspicious: 0.11 },
      confidence: 0.41,
    },
    bureau_consistent_with_history: { type: 'noul', noul: 0.68 },
    affordability_signal: {
      type: 'score',
      score: 1.61,
      legend: { '0': 'strong affordability', '1': 'adequate', '2': 'stretched', '3': 'distressed' },
      probabilities: { '0': 0.08, '1': 0.3, '2': 0.54, '3': 0.08 },
      confidence: 0.52,
    },
    final_action: {
      type: 'choice',
      choice: 'step_up',
      probabilities: { step_up: 0.52, approve: 0.28, review: 0.15, decline: 0.05 },
      confidence: 0.55,
    },
  },
  'stolen-card-pattern': {
    fraud_signal_strength: {
      type: 'score',
      score: 3.31,
      legend: { '0': 'no signals', '1': 'mild signals', '2': 'elevated', '3': 'strong', '4': 'overwhelming' },
      probabilities: { '0': 0.0, '1': 0.02, '2': 0.13, '3': 0.61, '4': 0.24 },
      confidence: 0.72,
    },
    profile_consistency: { type: 'noul', noul: 0.11 },
    basket_anomaly: { type: 'noul', noul: 0.92 },
    risk_band: {
      type: 'choice',
      choice: 'suspicious',
      probabilities: { suspicious: 0.89, ambiguous: 0.09, clear: 0.02 },
      confidence: 0.79,
    },
  },
  'bopis-edge': {
    fraud_signal_strength: {
      type: 'score',
      score: 1.05,
      legend: { '0': 'no signals', '1': 'mild signals', '2': 'elevated', '3': 'strong', '4': 'overwhelming' },
      probabilities: { '0': 0.19, '1': 0.63, '2': 0.16, '3': 0.02, '4': 0.0 },
      confidence: 0.6,
    },
    profile_consistency: { type: 'noul', noul: 0.79 },
    basket_anomaly: { type: 'noul', noul: 0.27 },
    risk_band: {
      type: 'choice',
      choice: 'clear',
      probabilities: { clear: 0.52, ambiguous: 0.39, suspicious: 0.09 },
      confidence: 0.32,
    },
    bureau_consistent_with_history: { type: 'noul', noul: 0.77 },
    affordability_signal: {
      type: 'score',
      score: 1.18,
      legend: { '0': 'strong affordability', '1': 'adequate', '2': 'stretched', '3': 'distressed' },
      probabilities: { '0': 0.21, '1': 0.6, '2': 0.17, '3': 0.02 },
      confidence: 0.66,
    },
    final_action: {
      type: 'choice',
      choice: 'approve',
      probabilities: { approve: 0.8, step_up: 0.15, review: 0.04, decline: 0.01 },
      confidence: 0.72,
    },
  },
  'bureau-contradiction': {
    fraud_signal_strength: {
      type: 'score',
      score: 0.44,
      legend: { '0': 'no signals', '1': 'mild signals', '2': 'elevated', '3': 'strong', '4': 'overwhelming' },
      probabilities: { '0': 0.57, '1': 0.35, '2': 0.07, '3': 0.01, '4': 0.0 },
      confidence: 0.74,
    },
    profile_consistency: { type: 'noul', noul: 0.88 },
    basket_anomaly: { type: 'noul', noul: 0.62 },
    risk_band: {
      type: 'choice',
      choice: 'ambiguous',
      probabilities: { ambiguous: 0.54, clear: 0.35, suspicious: 0.11 },
      confidence: 0.38,
    },
    bureau_consistent_with_history: { type: 'noul', noul: 0.14 },
    affordability_signal: {
      type: 'score',
      score: 2.52,
      legend: { '0': 'strong affordability', '1': 'adequate', '2': 'stretched', '3': 'distressed' },
      probabilities: { '0': 0.08, '1': 0.16, '2': 0.52, '3': 0.24 },
      confidence: 0.56,
    },
    final_action: {
      type: 'choice',
      choice: 'review',
      probabilities: { approve: 0.08, step_up: 0.29, review: 0.51, decline: 0.12 },
      confidence: 0.35,
    },
  },
  'ambiguous-checkout': {
    fraud_signal_strength: {
      type: 'score',
      score: 1.36,
      legend: { '0': 'no signals', '1': 'mild signals', '2': 'elevated', '3': 'strong', '4': 'overwhelming' },
      probabilities: { '0': 0.15, '1': 0.56, '2': 0.23, '3': 0.05, '4': 0.01 },
      confidence: 0.58,
    },
    profile_consistency: { type: 'noul', noul: 0.64 },
    basket_anomaly: { type: 'noul', noul: 0.51 },
    risk_band: {
      type: 'choice',
      choice: 'ambiguous',
      probabilities: { ambiguous: 0.61, clear: 0.24, suspicious: 0.15 },
      confidence: 0.44,
    },
    bureau_consistent_with_history: { type: 'noul', noul: 0.57 },
    affordability_signal: {
      type: 'score',
      score: 1.48,
      legend: { '0': 'strong affordability', '1': 'adequate', '2': 'stretched', '3': 'distressed' },
      probabilities: { '0': 0.13, '1': 0.52, '2': 0.29, '3': 0.06 },
      confidence: 0.42,
    },
    final_action: {
      type: 'choice',
      choice: 'step_up',
      probabilities: { step_up: 0.42, approve: 0.31, review: 0.19, decline: 0.08 },
      confidence: 0.18,
    },
  },
};

/** Rough token estimate: ~4 chars per token. */
function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

export class MockSystemOneClient implements SystemOneClient {
  readonly name = 'mock';

  async ask(request: SystemOneRequest): Promise<SystemOneResponse> {
    const started = Date.now();
    const state = request.state as { scenario?: string } | null;
    const scenario = state?.scenario;
    if (typeof scenario !== 'string' || !(scenario in MOCK_ANSWERS)) {
      throw new Error(
        `mock provider: state.scenario "${String(scenario)}" is not in the registry. ` +
          `Valid ids: ${Object.keys(MOCK_ANSWERS).join(', ')}`,
      );
    }
    const canned = MOCK_ANSWERS[scenario as MockScenarioId];

    for (const id of Object.keys(request.questions)) {
      if (!(id in canned)) {
        throw new Error(
          `mock provider: scenario "${scenario}" has no canned answer for question "${id}". ` +
            `The fixture and the mock registry are out of sync.`,
        );
      }
    }

    for (const [id, answer] of Object.entries(canned)) {
      if (answer.type === 'choice' && answer.choice in answer.probabilities === false) {
        throw new Error(`mock provider: scenario "${scenario}" answer "${id}" has a choice outside its probabilities`);
      }
    }

    // Simulate a sub-100ms System One latency.
    const elapsedMs = 60 + Math.floor(Math.random() * 40);
    await sleep(elapsedMs);

    const answers: Record<string, Answer> = {};
    for (const id of Object.keys(request.questions)) {
      answers[id] = structuredClone(canned[id]!);
    }

    return {
      answers,
      usage: {
        inputTokens: estimateTokens({ state: request.state, questions: request.questions }),
        outputTokens: estimateTokens(answers),
        calls: 1,
        elapsedMs: Date.now() - started,
      },
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { MOCK_ANSWERS };