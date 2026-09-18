/**
 * The SystemOne contract, mirroring the TypeSafe AI API shape
 * (POST /v1/systemone): a state is evaluated against typed questions,
 * every question independently and in parallel, and typed answers come
 * back under the ids the caller chose.
 *
 * Three providers implement this interface:
 *   mock  — deterministic fixture-backed probabilities (fiction, for wiring)
 *   llm   — a classic LLM forced into the same contract (self-consistency sampling)
 *   real  — the actual TypeSafe API via @typesafe-ai/sdk
 *
 * Downstream code (decide.ts in each domain) only ever sees this interface.
 */

export type QuestionType = 'noul' | 'choice' | 'score';

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: {
    true?: string;
    false?: string;
  };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type Questions = Record<string, Question>;

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type Answers = Record<string, Answer>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Number of underlying model calls (samples, retries). Jev: 1 per request. */
  calls: number;
  /** Wall-clock milliseconds for the whole request. */
  elapsedMs: number;
}

export interface SystemOneRequest {
  state: unknown;
  questions: Questions;
}

export interface SystemOneResponse {
  answers: Answers;
  usage: Usage;
  /**
   * The model that actually answered, as reported by the provider surface.
   * For `real` this is the SDK's resolved model id — the versioned id behind
   * an alias (jev-latest → jev-1.13.0), which is what run records must
   * persist for honest time-series attribution. Providers that cannot know
   * it omit the field (undefined = "not reported").
   */
  model?: string;
}

export interface SystemOneClient {
  readonly name: string;
  ask(request: SystemOneRequest): Promise<SystemOneResponse>;
}

/** Sum of probabilities; floating point makes exact 1 impossible, so compare loosely. */
export function probabilitiesSumTo1(probabilities: Record<string, number>): boolean {
  const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1) < 0.02;
}

export function normalizeProbabilities(
  probabilities: Record<string, number>,
): Record<string, number> {
  const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const keys = Object.keys(probabilities);
    const uniform = 1 / keys.length;
    return Object.fromEntries(keys.map((k) => [k, uniform]));
  }
  return Object.fromEntries(
    Object.entries(probabilities).map(([k, v]) => [k, v / sum]),
  );
}

/**
 * Confidence as TypeSafe defines it conceptually: how peaked the probability
 * distribution is, collapsed to 0..1. Implemented as 1 - normalized entropy.
 * Used by the llm provider (mock and real carry their own).
 */
export function confidenceFromDistribution(
  probabilities: Record<string, number>,
): number {
  const entries = Object.values(probabilities);
  const n = entries.length;
  if (n <= 1) return 1;
  const entropy = -entries.reduce((acc, p) => {
    if (p <= 0) return acc;
    return acc + p * Math.log2(p);
  }, 0);
  const maxEntropy = Math.log2(n);
  return Math.max(0, Math.min(1, 1 - entropy / maxEntropy));
}