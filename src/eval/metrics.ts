import type {
  Answers,
  ChoiceAnswer,
  NoulAnswer,
  ScoreAnswer,
} from '../typesafe/client.js';
import { probabilitiesSumTo1 } from '../typesafe/client.js';
import type { ProviderName } from '../typesafe/index.js';
import type { CheckoutRunRecord, RunRecord, TriageRunRecord } from './run-record.js';
import type { Expectations } from './expectations.js';

/**
 * Post-hoc metrics over persisted run records. Every function here reads only
 * RunRecords + expectations — never live provider state — so a report can be
 * regenerated from results/<date>/ alone.
 *
 * Calibration semantics: a record's `confidence` is treated as the provider's
 * predicted probability that its own decision is correct; the binary outcome
 * comes from scoring against fixtures/expectations.json. Brier and ECE are
 * computed over scored records only (records whose scenario has no expectation
 * — e.g. calibration-probe synthetic states — are 'unscored' and excluded).
 */

// ── cost ──────────────────────────────────────────────────────────────────────

/**
 * USD per million tokens, keyed by model id. Placeholders until access day:
 * the jev-latest prices are verified from docs.typesafe.ai that morning
 * (Phase 3 step 4); 0/0 keeps mock runs free and makes unverified real cost
 * loudly zero rather than silently wrong.
 */
export const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  // docs.typesafe.ai/models (verified 2026-09-18): $42 per Btok input,
  // output tokens free. Per Mtok: 42 / 1e6 * 1e6 = $0.042.
  'jev-latest': { input: 0.042, output: 0 },
  mock: { input: 0, output: 0 },
};

/** null when the model has no table entry — the report renders that as n/a. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = PRICING_USD_PER_MTOK[model];
  if (!price) return null;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

// ── scoring vs expectations ───────────────────────────────────────────────────

export type Outcome = 'pass' | 'fail' | 'unscored';

export interface ScoredRecord {
  record: RunRecord;
  outcome: Outcome;
  /** checkout only: stage1Route vs expectation. */
  routeMatch: boolean | null;
  /** triage: action vs expectation; checkout: finalAction vs expectation. */
  actionMatch: boolean | null;
  /** Human-readable mismatch summary; null on pass or unscored. */
  mismatch: string | null;
}

const UNSCORED: Omit<ScoredRecord, 'record'> = {
  outcome: 'unscored',
  routeMatch: null,
  actionMatch: null,
  mismatch: null,
};

export function scoreRecord(record: RunRecord, expectations: Expectations): ScoredRecord {
  if (record.domain === 'triage') {
    const exp = expectations.triage[record.scenario];
    if (!exp) return { record, ...UNSCORED };
    const actionMatch = record.action === exp.action;
    return {
      record,
      outcome: actionMatch ? 'pass' : 'fail',
      routeMatch: null,
      actionMatch,
      mismatch: actionMatch ? null : `action ${record.action} ≠ ${exp.action}`,
    };
  }

  const exp = expectations.checkout[record.scenario];
  if (!exp) return { record, ...UNSCORED };
  const routeMatch = record.stage1Route === exp.stage1Route;
  const actionMatch = record.finalAction === exp.finalAction;
  const mismatches: string[] = [];
  if (!routeMatch) mismatches.push(`route ${record.stage1Route} ≠ ${exp.stage1Route}`);
  if (!actionMatch) mismatches.push(`action ${String(record.finalAction)} ≠ ${exp.finalAction}`);
  return {
    record,
    outcome: routeMatch && actionMatch ? 'pass' : 'fail',
    routeMatch,
    actionMatch,
    mismatch: mismatches.length > 0 ? mismatches.join('; ') : null,
  };
}

// ── calibration primitives (shared with the calibration probe) ────────────────

export interface CalibrationPair {
  /** Provider-stated confidence, clamped to [0,1] by the caller. */
  predicted: number;
  correct: 0 | 1;
}

/** Mean (predicted − outcome)². null for empty input. */
export function brierScore(pairs: readonly CalibrationPair[]): number | null {
  if (pairs.length === 0) return null;
  return (
    pairs.reduce((acc, p) => acc + (p.predicted - p.correct) ** 2, 0) / pairs.length
  );
}

/**
 * Expected calibration error: Σ over non-empty equal-width bins of
 * (n_bin / N) · |accuracy_bin − mean confidence_bin|. Bins default to 10.
 */
export function expectedCalibrationError(
  pairs: readonly CalibrationPair[],
  bins = 10,
): number | null {
  if (pairs.length === 0) return null;
  const bucket = Array.from({ length: bins }, () => ({ n: 0, confSum: 0, correct: 0 }));
  for (const p of pairs) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p.predicted * bins)));
    const b = bucket[idx]!;
    b.n += 1;
    b.confSum += p.predicted;
    b.correct += p.correct;
  }
  return bucket.reduce((acc, b) => {
    if (b.n === 0) return acc;
    return acc + (b.n / pairs.length) * Math.abs(b.correct / b.n - b.confSum / b.n);
  }, 0);
}

// ── latency ───────────────────────────────────────────────────────────────────

export interface LatencyStats {
  p50: number;
  p95: number;
  mean: number;
  max: number;
}

/** Nearest-rank percentile of a numeric sample. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of empty sample');
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export function latencyStats(values: readonly number[]): LatencyStats {
  if (values.length === 0) return { p50: 0, p95: 0, mean: 0, max: 0 };
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    max: Math.max(...values),
  };
}

// ── schema violations ─────────────────────────────────────────────────────────

export interface SchemaViolations {
  count: number;
  details: string[];
}

function inUnitRange(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function checkAnswerSet(
  prefix: string,
  answers: Answers,
  violations: string[],
): void {
  for (const [id, answer] of Object.entries(answers)) {
    const label = `${prefix}${id}`;
    switch (answer.type) {
      case 'noul': {
        const a = answer as NoulAnswer;
        if (!inUnitRange(a.noul)) violations.push(`${label}: noul ${a.noul} outside [0,1]`);
        break;
      }
      case 'choice': {
        const a = answer as ChoiceAnswer;
        if (!probabilitiesSumTo1(a.probabilities)) {
          const sum = Object.values(a.probabilities).reduce((x, y) => x + y, 0);
          violations.push(`${label}: choice probabilities sum ${sum.toFixed(3)} ≠ 1`);
        }
        if (!(a.choice in a.probabilities)) {
          violations.push(`${label}: choice "${a.choice}" missing from probabilities`);
        }
        if (!inUnitRange(a.confidence)) {
          violations.push(`${label}: confidence ${a.confidence} outside [0,1]`);
        }
        break;
      }
      case 'score': {
        const a = answer as ScoreAnswer;
        if (!Number.isFinite(a.score)) violations.push(`${label}: score ${a.score} not finite`);
        if (!probabilitiesSumTo1(a.probabilities)) {
          const sum = Object.values(a.probabilities).reduce((x, y) => x + y, 0);
          violations.push(`${label}: score probabilities sum ${sum.toFixed(3)} ≠ 1`);
        }
        if (!inUnitRange(a.confidence)) {
          violations.push(`${label}: confidence ${a.confidence} outside [0,1]`);
        }
        break;
      }
      default:
        violations.push(`${label}: unknown answer type ${String((answer as { type?: unknown }).type)}`);
    }
  }
}

export function recordSchemaViolations(record: RunRecord): SchemaViolations {
  const violations: string[] = [];
  if (record.domain === 'triage') {
    checkAnswerSet('', record.answers, violations);
  } else {
    checkAnswerSet('stage1/', record.stage1Answers, violations);
    if (record.stage3Answers !== null) {
      checkAnswerSet('stage3/', record.stage3Answers, violations);
    }
  }
  return { count: violations.length, details: violations };
}

// ── per provider/domain summaries ─────────────────────────────────────────────

export interface DomainSummary {
  provider: ProviderName;
  domain: TriageRunRecord['domain'] | CheckoutRunRecord['domain'];
  total: number;
  scored: number;
  passed: number;
  failed: number;
  /** null when nothing was scored. */
  passRate: number | null;
  brier: number | null;
  ece: number | null;
  latency: LatencyStats;
  tokens: { input: number; output: number; calls: number };
  /** null when any record's model is missing from the pricing table. */
  costUsd: number | null;
  schemaViolations: SchemaViolations;
  /** One entry per failed record: "scenario (mismatch)". */
  disagreements: string[];
}

export function summarizeRecords(
  records: readonly RunRecord[],
  expectations: Expectations,
): DomainSummary[] {
  const groups = new Map<string, { provider: ProviderName; domain: 'triage' | 'checkout'; records: RunRecord[] }>();
  for (const record of records) {
    const key = `${record.provider}/${record.domain}`;
    const group = groups.get(key) ?? {
      provider: record.provider,
      domain: record.domain,
      records: [],
    };
    group.records.push(record);
    groups.set(key, group);
  }

  const summaries: DomainSummary[] = [];
  for (const group of [...groups.values()].sort((a, b) =>
    `${a.provider}/${a.domain}`.localeCompare(`${b.provider}/${b.domain}`),
  )) {
    const scoredRecords = group.records
      .map((record) => scoreRecord(record, expectations))
      .filter((s) => s.outcome !== 'unscored');
    const passed = scoredRecords.filter((s) => s.outcome === 'pass').length;
    const calibrationPairs = scoredRecords.map((s) => ({
      predicted: s.record.confidence,
      correct: (s.outcome === 'pass' ? 1 : 0) as 0 | 1,
    }));
    const tokens = group.records.reduce(
      (acc, r) => ({
        input: acc.input + r.usage.inputTokens,
        output: acc.output + r.usage.outputTokens,
        calls: acc.calls + r.usage.calls,
      }),
      { input: 0, output: 0, calls: 0 },
    );

    const costs = group.records.map((r) => costUsd(r.model.model, r.usage.inputTokens, r.usage.outputTokens));
    const cost = costs.some((c) => c === null)
      ? null
      : costs.reduce<number>((a, b) => a + (b ?? 0), 0);

    const violations = group.records.map((r) => recordSchemaViolations(r));
    const violationDetails = violations.flatMap((v) => v.details);

    summaries.push({
      provider: group.provider,
      domain: group.domain,
      total: group.records.length,
      scored: scoredRecords.length,
      passed,
      failed: scoredRecords.length - passed,
      passRate: scoredRecords.length > 0 ? passed / scoredRecords.length : null,
      brier: brierScore(calibrationPairs),
      ece: expectedCalibrationError(calibrationPairs),
      latency: latencyStats(group.records.map((r) => r.usage.elapsedMs)),
      tokens,
      costUsd: cost,
      schemaViolations: {
        count: violationDetails.length,
        details: violationDetails,
      },
      disagreements: scoredRecords
        .filter((s) => s.mismatch !== null)
        .map((s) => `${s.record.scenario} (${s.mismatch})`),
    });
  }
  return summaries;
}