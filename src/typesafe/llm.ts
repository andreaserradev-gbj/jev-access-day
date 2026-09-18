import type {
  Answer,
  Answers,
  Question,
  Questions,
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
  Usage,
} from './client.js';
import { confidenceFromDistribution, normalizeProbabilities } from './client.js';

/**
 * Provider "llm": a classic LLM forced into the SystemOne contract.
 *
 * This reproduces, at toy scale, the methodology TypeSafe themselves used in
 * their workflow evals (their system-one-adapter wrapper for frontier LLMs):
 *
 *   1. serialize state + typed questions into a single prompt
 *   2. constrain output with a JSON schema (no prose can survive validation)
 *   3. sample N times at temperature (self-consistency)
 *   4. aggregate the samples: mean = probabilities, agreement = confidence
 *
 * What this CANNOT replicate (the experiment on access day):
 *   - Jev computes distributions in one pass; here every digit is a
 *     generated token, so cost and latency scale with samples x questions.
 *   - Sample agreement is not calibration. LLMs are overconfident.
 */

export interface LlmProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  samples: number;
  temperature: number;
  /**
   * Thinking toggle for reasoning models (Ollama `think` field).
   * undefined = omit entirely (server default); false = suppress thinking so
   * every token goes to the JSON answer (local MoE/dense thinking models).
   */
  think?: boolean;
  /** Per-sample HTTP timeout ms. 0/unset → 120000 (cloud-appropriate default). */
  timeoutMs?: number;
  /**
   * Use Ollama's native /api/chat instead of the OpenAI-compatible endpoint.
   * Required for local models whose daemon build ignores `think` and `format`
   * on /v1/chat/completions (observed on Ollama 0.34 + qwen3.6 MoE).
   */
  native?: boolean;
}

const SYSTEM_PROMPT = `You are a calibration engine, not a chatbot. You receive a state and typed questions. For each noul question output exactly one decimal number between 0.0 and 1.0: the probability that the answer is YES. For choice and score questions output an object mapping every option or level index to its probability; the probabilities must sum to 1.0. Never output booleans. Never add keys beyond what each question requires. Never refuse and never explain. Calibrate honestly: if the state does not support an answer, output a number near 0.5 instead of guessing confidently.`;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Ollama native /api/chat response shape. */
interface NativeChatResponse {
  message?: { content?: string; thinking?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export class LlmSystemOneClient implements SystemOneClient {
  readonly name: string;
  private readonly config: LlmProviderConfig;

  constructor(config: LlmProviderConfig, name = 'llm') {
    if (!config.apiKey) {
      throw new Error(`[${name}] provider: API key is not set`);
    }
    if (config.samples < 1) {
      throw new Error(`[${name}] provider: samples must be >= 1`);
    }
    this.config = config;
    this.name = name;
  }

  async ask(request: SystemOneRequest): Promise<SystemOneResponse> {
    const started = Date.now();
    const schema = buildJsonSchema(request.questions);
    const userPrompt = buildUserPrompt(request.state, request.questions);

    // Self-consistency with per-sample retry: samples run CONCURRENTLY (the
    // aggregate is robust to losing one), each with bounded retries. A
    // malformed, incomplete, or throttled sample counts as a failure and is
    // retried, not fatal. Completeness is validated so a rationale-only or
    // partially-truncated sample gets another attempt.
    const requiredIds = Object.keys(request.questions);
    const attemptsPerSample = 3;
    const settled = await Promise.all(
      Array.from({ length: this.config.samples }, async (_, i): Promise<string | { raw: Record<string, unknown>; usage: Usage }> => {
        let lastError = 'unknown';
        for (let attempt = 0; attempt < attemptsPerSample; attempt++) {
          try {
            const sample = await this.sampleOnce(userPrompt, schema);
            const missing = requiredIds.filter((id) => !(id in sample.raw));
            if (missing.length > 0) {
              throw new Error(`incomplete sample, missing: ${missing.join(', ')}`);
            }
            return sample;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
        }
        return `sample ${i + 1}: ${lastError}`;
      }),
    );

    const samples = settled.filter((s): s is { raw: Record<string, unknown>; usage: Usage } =>
      typeof s === 'object',
    );
    const failures = settled.filter((s): s is string => typeof s === 'string');
    if (samples.length === 0) {
      throw new Error(`llm provider: all samples failed. ${failures[0] ?? 'unknown error'}`);
    }

    const answers = aggregateAnswers(request.questions, samples);
    const usage: Usage = samples.reduce(
      (acc, s) => {
        acc.inputTokens += s.usage.inputTokens;
        acc.outputTokens += s.usage.outputTokens;
        acc.calls += s.usage.calls;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, calls: 0, elapsedMs: Date.now() - started },
    );

    return { answers, model: this.config.model, usage };
  }

  private async sampleOnce(
    userPrompt: string,
    schema: object,
  ): Promise<{ raw: Record<string, unknown>; usage: Usage }> {
    if (this.config.native) {
      return this.sampleOnceNative(userPrompt, schema);
    }
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.config.temperature,
      format: schema,
      stream: false,
    };
    // Only sent when configured: cloud endpoints without thinking support
    // must not receive a stray `think` key.
    if (this.config.think !== undefined) body['think'] = this.config.think;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`llm provider: ${response.status} from ${url}: ${text.slice(0, 400)}`);
    }

    const completion = (await response.json()) as ChatCompletionResponse;
    const content = completion.choices?.[0]?.message?.content ?? '';
    return {
      raw: parseModelJson(stripCodeFences(content)),
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        calls: 1,
        elapsedMs: 0,
      },
    };
  }

  /**
   * Ollama native /api/chat: the ONLY path where this daemon version honors
   * both `think:false` (no reasoning burn) and `format` (hard schema) for the
   * local MoE — the OpenAI-compat endpoint ignores both for this model.
   */
  private async sampleOnceNative(
    userPrompt: string,
    schema: object,
  ): Promise<{ raw: Record<string, unknown>; usage: Usage }> {
    const url = `${this.config.baseUrl}/api/chat`;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.config.temperature,
      format: schema,
      stream: false,
    };
    if (this.config.think !== undefined) body['think'] = this.config.think;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && this.config.apiKey !== 'local'
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`llm provider: ${response.status} from ${url}: ${text.slice(0, 400)}`);
    }

    const native = (await response.json()) as NativeChatResponse;
    const content = native.message?.content ?? '';
    return {
      raw: parseModelJson(stripCodeFences(content)),
      usage: {
        inputTokens: native.prompt_eval_count ?? 0,
        outputTokens: native.eval_count ?? 0,
        calls: 1,
        elapsedMs: 0,
      },
    };
  }
}

/**
 * The cloud endpoint is OpenAI-compatible but not fully schema-tight: it may
 * wrap the JSON in markdown fences, append keys the schema forbids (observed:
 * a "rationale" string), or emit NDJSON-ish lines where each line is a JSON
 * object. All are tolerated here, but counted — a schema-faithful engine
 * (Jev's claim) would have rate 0 for all three.
 */
export function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const json = fenced ? fenced[1]! : trimmed;
  // Prefer the largest top-level {...} block: makes stray lines and
  // trailing prose after the main object recoverable.
  const start = json.indexOf('{');
  const end = json.lastIndexOf('}');
  return start >= 0 && end > start ? json.slice(start, end + 1) : json;
}

export function parseModelJson(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(stripCodeFences(content));
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    const repaired = parseKeyedLines(content);
    if (repaired !== null) return repaired;
    throw new Error(`llm provider: model returned non-JSON output: ${content.slice(0, 200)}`);
  }
}

/**
 * Repair the observed drift shape: one `id: value` entry per question, where
 * value is a bare number or a JSON object of probabilities that may span
 * multiple lines. Returns the reconstructed answers map, or null if nothing
 * is recoverable.
 */
function parseKeyedLines(content: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let recovered = 0;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:\s*(.+?)\s*,?\s*$/);
    if (!match) continue;
    const [, id, firstChunk] = match;

    // A value that is an object may continue on following lines until its
    // braces balance; accumulate raw lines (the regex already stripped a
    // trailing comma from the first line, so re-join with commas preserved).
    let rawValue = firstChunk!;
    if (!rawValue.startsWith('{') || !balancedObject(rawValue)) {
      let j = i + 1;
      let candidate = firstChunk!;
      while (j < lines.length && !balancedObject(candidate)) {
        candidate += '\n' + lines[j]!;
        j += 1;
        if (j - i > 20) break; // runaway guard
      }
      if (balancedObject(candidate)) {
        rawValue = candidate.trim();
        i = j - 1;
      }
    }

    try {
      out[id!] = JSON.parse(rawValue);
      recovered += 1;
      continue;
    } catch {
      // fall through to Number attempt
    }
    const n = Number(rawValue);
    if (!Number.isNaN(n)) {
      out[id!] = n;
      recovered += 1;
    }
  }
  return recovered > 0 ? out : null;
}

function balancedObject(s: string): boolean {
  if (!s.trim().startsWith('{')) return false;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (inString) {
      if (s[i - 1] !== '\\') {
        if (s[i] === '"') inString = false;
      }
      continue;
    }
    if (s[i] === '"') {
      inString = true;
      continue;
    }
    if (s[i] === '{') depth += 1;
    if (s[i] === '}') depth -= 1;
  }
  return depth === 0;
}

// ── prompt construction ───────────────────────────────────────────────────────

function buildUserPrompt(state: unknown, questions: Questions): string {
  const questionSpecs = Object.entries(questions).map(([id, q]) => {
    const lines: string[] = [`- id: ${id}`, `  type: ${q.type}`];
    lines.push(`  instructions: ${JSON.stringify(q.instructions)}`);
    if (q.type === 'choice') {
      lines.push(`  options: ${JSON.stringify(Object.keys(q.criteria))}`);
      lines.push(`  option descriptions: ${JSON.stringify(q.criteria)}`);
    } else if (q.type === 'score') {
      lines.push(`  levels (index: description): ${JSON.stringify(q.criteria)}`);
    } else if (q.type === 'noul' && q.criteria) {
      lines.push(`  yes means: ${JSON.stringify(q.criteria.true ?? null)}`);
      lines.push(`  no means: ${JSON.stringify(q.criteria.false ?? null)}`);
    }
    return lines.join('\n');
  });

  return [
    'STATE:',
    JSON.stringify(state, null, 2),
    '',
    'QUESTIONS (evaluate each independently against the state):',
    ...questionSpecs,
  ].join('\n');
}

// ── JSON schema for constrained decoding ──────────────────────────────────────

function buildJsonSchema(questions: Questions): object {
  const requiredIds = Object.keys(questions);
  const properties: Record<string, object> = {};

  for (const [id, q] of Object.entries(questions)) {
    properties[id] = questionSchema(q);
  }

  return {
    type: 'object',
    properties,
    required: requiredIds,
    additionalProperties: false,
  };
}

function questionSchema(q: Question): object {
  if (q.type === 'noul') {
    return { type: 'number', minimum: 0, maximum: 1 };
  }
  if (q.type === 'choice') {
    return {
      type: 'object',
      properties: {
        probabilities: probabilityMapSchema(Object.keys(q.criteria)),
      },
      required: ['probabilities'],
      additionalProperties: false,
    };
  }
  // score: distribution over level indices as string keys
  const levels = q.criteria.map((_, i) => String(i));
  return {
    type: 'object',
    properties: {
      probabilities: probabilityMapSchema(levels),
    },
    required: ['probabilities'],
    additionalProperties: false,
  };
}

function probabilityMapSchema(keys: string[]): object {
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map((k) => [k, { type: 'number', minimum: 0, maximum: 1 }])),
    required: keys,
    additionalProperties: false,
  };
}

// ── aggregation: the self-consistency core ────────────────────────────────────

export function aggregateAnswers(questions: Questions, samples: Array<{ raw: Record<string, unknown> }>): Answers {
  const answers: Answers = {};
  for (const [id, q] of Object.entries(questions)) {
    const perSample = samples.map((s) => extractDistribution(s.raw, id, q));
    answers[id] = aggregateOne(q, perSample);
  }
  return answers;
}

/** Pull the probability vector for one question from one sample, normalized. */
function extractDistribution(
  raw: Record<string, unknown>,
  id: string,
  q: Question,
): Record<string, number> {
  const value = raw[id];
  if (value == null) {
    throw new Error(`llm provider: sample missing question "${id}"`);
  }
  if (q.type === 'noul') {
    // The contract is a bare 0..1 number, but the model has been observed to
    // wrap it in an object ({yes/no}, {probability}, a bare boolean) — accept
    // the recoverable shapes, count the rest as drift by letting it throw.
    let n: number;
    if (typeof value === 'number') {
      n = value;
    } else if (typeof value === 'boolean') {
      n = value ? 1 : 0;
    } else if (typeof value === 'string') {
      n = Number(value);
    } else if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const yesCandidate = record['yes'] ?? record['probability'] ?? record['probability_yes'] ?? record['value'];
      n = Number(yesCandidate);
      if (Number.isNaN(n)) {
        // e.g. {"yes":0.03,"unknown":0.02,"no":0.95} — sum the yes-ish mass.
        const yes = Number(record['yes'] ?? 0);
        n = Math.max(0, Math.min(1, yes));
      }
    } else {
      n = Number(value);
    }
    if (Number.isNaN(n) || n < 0 || n > 1) {
      throw new Error(`llm provider: sample noul for "${id}" is not a 0..1 number: ${JSON.stringify(value).slice(0, 120)}`);
    }
    return { yes: n, no: 1 - n };
  }
  // choice/score: the model may return the distribution directly or nested
  // under "probabilities"; accept both shapes.
  let probabilities: unknown = value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'probabilities' in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>)['probabilities'] === 'object'
  ) {
    probabilities = (value as Record<string, unknown>)['probabilities'];
  }
  if (probabilities == null || typeof probabilities !== 'object') {
    throw new Error(`llm provider: sample for "${id}" has no probabilities object: ${JSON.stringify(value).slice(0, 120)}`);
  }
  const cleaned: Record<string, number> = {};
  for (const key of Object.keys(probabilities as Record<string, unknown>)) {
    const num = Number((probabilities as Record<string, unknown>)[key]);
    cleaned[key] = Number.isFinite(num) ? Math.max(0, num) : 0;
  }
  // Canonicalize the keys: the model drifts between option LABELS (infra,
  // bad_test...) and option INDICES (0, 1, 2, 3) for choice questions, and
  // between level indices and level text for score questions. Without this,
  // one sample's mass lands under a different key than another's and the
  // aggregate splinters.
  return canonicalizeKeys(cleaned, q);
}

/**
 * Map every distribution key onto the question's canonical vocabulary.
 * Choice: the criteria labels (indices map by position). Score: the level
 * indices (labels map by position). Unknown keys are kept — the aggregator
 * unions keys — but a warning-worthy shape.
 */
function canonicalizeKeys(
  distribution: Record<string, number>,
  q: Question,
): Record<string, number> {
  if (q.type === 'choice') {
    const labels = Object.keys(q.criteria);
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(distribution)) {
      const asIndex = Number(key);
      if (labels.includes(key)) {
        out[key] = value;
      } else if (Number.isInteger(asIndex) && asIndex >= 0 && asIndex < labels.length) {
        out[labels[asIndex]!] = value;
      } else {
        out[key] = value;
      }
    }
    return out;
  }
  if (q.type === 'score') {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(distribution)) {
      const asIndex = Number(key);
      if (Number.isInteger(asIndex) && asIndex >= 0 && asIndex < q.criteria.length) {
        out[String(asIndex)] = value;
      } else {
        const labelIndex = q.criteria.findIndex((level) => level.startsWith(key));
        out[labelIndex >= 0 ? String(labelIndex) : key] = value;
      }
    }
    return out;
  }
  return distribution;
}

function aggregateOne(q: Question, perSample: Array<Record<string, number>>): Answer {
  const keySet = new Set(perSample.flatMap((p) => Object.keys(p)));
  const keys = [...keySet].sort();

  const mean: Record<string, number> = {};
  for (const key of keys) {
    const values = perSample.map((p) => p[key] ?? 0);
    mean[key] = values.reduce((a, b) => a + b, 0) / perSample.length;
  }
  const normalized = normalizeProbabilities(mean);

  if (q.type === 'noul') {
    const yes = normalized['yes'] ?? 0.5;
    return { type: 'noul', noul: round3(yes) };
  }

  // Dispersion across samples, collapsed to one number: the stand-in's
  // confidence proxy. Tight sample spread -> high confidence.
  const agreement = keys.map((key) => {
    const values = perSample.map((p) => p[key] ?? 0);
    const mu = mean[key]!;
    const variance = values.reduce((acc, v) => acc + (v - mu) ** 2, 0) / perSample.length;
    return Math.sqrt(variance);
  });
  const meanStd = agreement.reduce((a, b) => a + b, 0) / agreement.length;
  const sampleAgreement = Math.max(0, Math.min(1, 1 - meanStd * 4));

  if (q.type === 'choice') {
    const choice = Object.entries(normalized).sort((a, b) => b[1] - a[1])[0]![0];
    return {
      type: 'choice',
      choice,
      probabilities: roundMap(normalized),
      confidence: round3(Math.min(sampleAgreement, confidenceFromDistribution(normalized))),
    };
  }

  // score: expected level across the normalized distribution
  let expected = 0;
  for (const [key, p] of Object.entries(normalized)) {
    expected += Number(key) * p;
  }
  return {
    type: 'score',
    score: round3(expected),
    legend: Object.fromEntries(q.criteria.map((level, i) => [String(i), level])),
    probabilities: roundMap(normalized),
    confidence: round3(Math.min(sampleAgreement, confidenceFromDistribution(normalized))),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundMap(m: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round3(v)]));
}

/** Build an LlmProviderConfig from environment variables. */
export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  return {
    apiKey: env['OLLAMA_API_KEY'] ?? '',
    model: env['OLLAMA_MODEL'] ?? 'glm-5.3-flash:cloud',
    baseUrl: env['OLLAMA_BASE_URL'] ?? 'https://ollama.com',
    samples: Number(env['OLLAMA_SAMPLES'] ?? '5'),
    temperature: Number(env['OLLAMA_TEMPERATURE'] ?? '0.7'),
    ...(env['OLLAMA_THINK'] !== undefined ? { think: env['OLLAMA_THINK'] === 'true' } : {}),
  };
}

/**
 * The local stand-in: same LlmSystemOneClient, different defaults. Points at
 * the local Ollama daemon and defaults to the fast MoE model with thinking
 * suppressed — the cloud glm config is untouched.
 */
export function llmLocalConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  return {
    apiKey: env['OLLAMA_LOCAL_API_KEY'] ?? 'local',
    model: env['OLLAMA_LOCAL_MODEL'] ?? 'qwen3.6:35b-a3b-coding-mtp-q4_K_M',
    baseUrl: env['OLLAMA_LOCAL_BASE_URL'] ?? 'http://localhost:11434',
    samples: Number(env['OLLAMA_LOCAL_SAMPLES'] ?? '5'),
    temperature: Number(env['OLLAMA_LOCAL_TEMPERATURE'] ?? env['OLLAMA_TEMPERATURE'] ?? '0.7'),
    think: env['OLLAMA_LOCAL_THINK'] !== undefined
      ? env['OLLAMA_LOCAL_THINK'] === 'true'
      : false,
    // First token on a local MoE includes model load from disk; give it room.
    timeoutMs: env['OLLAMA_LOCAL_TIMEOUT_MS'] !== undefined
      ? Number(env['OLLAMA_LOCAL_TIMEOUT_MS'])
      : 300_000,
    native: true,
  };
}