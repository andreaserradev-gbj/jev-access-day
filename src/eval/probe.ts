import type { Questions } from '../typesafe/client.js';
import { buildTriageState } from '../triage/state.js';
import { decideTriage, TRIAGE_THRESHOLDS, type TriageAction } from '../triage/decide.js';
import type { RunRecord, TriageRunRecord } from './run-record.js';
import type { ProviderName } from '../typesafe/index.js';
import { buildTriageRunRecord } from './run-record.js';
import type { Usage } from '../typesafe/client.js';

/**
 * Calibration probe: synthetic states whose TRUE answer is constructed, not
 * fictional. For each probe the state pins a ground-truth probability p that
 * the correct noul answer is YES, and we measure whether the provider's
 * stated confidence actually tracks correctness at that level — the claim
 * "0.8 means ~80%" becomes a number instead of prose.
 *
 * Two bin families:
 *   noul   — one yes/no question asked many times over states constructed at
 *            true probability ≈ 0.2 / 0.5 / 0.8. The provider returns one
 *            noul per state; a noul answer IS a stated probability of the
 *            true outcome, so calibration is directly measurable.
 *   choice — the fixture's failure_category question over crafted category
 *            states, scored by whether the argmax lands on the intended
 *            category. Confidence is read off the ChoiceAnswer.
 *
 * The probe never touches the mock for calibration claims: mock noul values
 * are canned fiction. Providers with no genuine uncertainty (mock answers a
 * fixture-registered scenario id, not raw text) are measured but expected to
 * be degenerate — that is itself the demo.
 */

export interface ProbeSpec {
  id: string;
  bin: string;
  question: string;
  /** The constructed truth: probability that the correct noul answer is YES. */
  truePYes: number;
  instructions: string;
  criteria: { true: string; false: string };
  /** Synthetic states per spec. */
  states?: number;
}

/**
 * Deterministic binary-sequence generator: produces `count` bits whose
 * long-run frequency approaches p with an even, reproducible spread (no RNG
 * dependency), so probe states are stable across runs and providers.
 */
export function deterministicBits(pYes: number, count: number): number[] {
  const bits: number[] = [];
  for (let i = 0; i < count; i++) {
    // Even coverage: map the unit interval through the target probability.
    bits.push((i + 0.5) / count < pYes ? 1 : 0);
  }
  return bits;
}

export function buildNoulProbeQuestions(question: string, criteria: { true: string; false: string }): Questions {
  return {
    probe: {
      type: 'noul',
      instructions: question,
      criteria,
    },
  };
}

export function buildProbeState(bit: number, seed: string): Record<string, unknown> {
  return {
    scenario: `probe-${seed}-${bit}`,
    probe_id: `${seed}-${bit}`,
    observation: bit === 1
      ? 'The transient error signature is present in this synthetic observation.'
      : 'The deterministic mismatch is present in this synthetic observation.',
    // The rubric's true/false descriptions make the label semantic.
    truth: bit === 1 ? 'transient' : 'deterministic',
  };
}

export interface ProbeOutcome {
  spec: ProbeSpec;
  bit: number;
  noul: number;
  record: TriageRunRecord;
}

/**
 * Run one probe battery: for each spec, one provider ask per constructed
 * state. The state carries `scenario: 'probe-...'` (unregistered) so the mock
 * provider rejects it — the probe is FOR real/llm providers; a mock run
 * surfaces that loudly instead of silently "calibrating" canned fiction.
 * Records carry scenario `probe/<bin>-<i>` so they are unscored by
 * fixtures/expectations.json (calibration lives here, not in fixture scoring).
 */
export async function runNoulProbe(
  client: { ask(request: { state: unknown; questions: Questions }): Promise<{ answers: Record<string, { type: string; noul?: number }>; usage: Usage }> },
  specs: readonly ProbeSpec[],
  provider: ProviderName,
  model: string,
): Promise<ProbeOutcome[]> {
  const outcomes: ProbeOutcome[] = [];
  for (const spec of specs) {
    const bits = deterministicBits(spec.truePYes, spec.states ?? 0);
    for (let i = 0; i < (spec.states ?? 0); i++) {
      const bit = bits[i]!;
      const response = await client.ask({
        state: buildProbeState(bit, spec.id),
        questions: buildNoulProbeQuestions(spec.question, spec.criteria),
      });
      const answer = response.answers['probe'];
      if (!answer || answer.type !== 'noul' || typeof answer.noul !== 'number') {
        throw new Error(`probe ${spec.id}[${i}]: provider did not return a noul answer`);
      }
      const record = buildTriageRunRecord(
        {
          provider,
          scenario: `probe/${spec.id}-${i}`,
          runIndex: i,
          model: { model },
          timestamp: new Date().toISOString(),
        },
        { action: 'needs_human' as TriageAction, rationale: [] },
        { probe: { type: 'noul', noul: answer.noul } },
        response.usage,
      );
      outcomes.push({ spec, bit, noul: answer.noul, record });
    }
  }
  return outcomes;
}

/** The three canonical bins the plan calls for. */
export function defaultProbeSpecs(statesPerBin = 5): ProbeSpec[] {
  const mk = (id: string, bin: string, truePYes: number): ProbeSpec => ({
    id,
    bin,
    truePYes,
    states: statesPerBin,
    instructions: `Constructed probe state for bin ${bin}`,
    question: `This synthetic state was constructed so the transient pattern is present with probability about ${truePYes}. Given the observation, is the transient pattern present?`,
    criteria: {
      true: 'The observation contains a transient error pattern (timeout, connection reset, race)',
      false: 'The observation contains a deterministic behavior mismatch',
    },
  });
  return [mk('low', 'p≈0.2', 0.2), mk('mid', 'p≈0.5', 0.5), mk('high', 'p≈0.8', 0.8)];
}

/** Aggregate probe outcomes into CalibrationPairs for brierScore/ECE. */
export function probeCalibrationPairs(outcomes: readonly ProbeOutcome[]): Array<{ predicted: number; correct: 0 | 1 }> {
  return outcomes.map((o) => ({
    predicted: o.noul,
    // The correct outcome IS the constructed bit: 1 = transient present.
    correct: o.bit as 0 | 1,
  }));
}

/** Re-export so the CLI can summarize without importing metrics directly. */
export { buildTriageState, decideTriage, TRIAGE_THRESHOLDS, type RunRecord };