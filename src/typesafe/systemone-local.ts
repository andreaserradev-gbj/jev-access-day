import type {
  Answers,
  Questions,
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
  Usage,
} from './client.js';

/**
 * Provider "tev1" and "nimble": local SystemOne endpoint on Ollama.
 *
 * These are decision models that speak the SystemOne contract natively via
 * POST /v1/systemone — one shot, no sampling. The request body mirrors the
 * curl examples the users provided:
 *
 *   { model: "tev1", state: "Customer message: ...", questions: { ... } }
 *   { model: "nimble", state: { ticket: "..." }, questions: { ... } }
 *
 * Environment variables are per-model (TEV1_*, NIMBLE_*) so both can coexist.
 */

export interface SystemOneLocalConfig {
  /** E.g. "http://localhost:11434" (endpoint suffix /v1/systemone added internally). */
  baseUrl: string;
  /** The short model name sent in the request body. */
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export function systemoneLocalConfigFromEnv(
  prefix: string,
  env: NodeJS.ProcessEnv = process.env,
): SystemOneLocalConfig {
  const rawModel = env[`${prefix}_MODEL`] ?? '';
  const model = rawModel.replace(/\/v1\/systemone\/?$/, '');

  // Accept either per-model or shared base URL prefix.
  let baseUrl = env[`${prefix}_BASE_URL`] ?? '';
  if (!baseUrl) baseUrl = env['SYSTEMONE_LOCAL_BASE_URL'] ?? '';
  // rawModel is only a URL if it starts with a scheme; otherwise it's a model
  // name and must not become the baseUrl.
  if (!baseUrl && /^https?:\/\//i.test(rawModel)) {
    baseUrl = rawModel;
  }

  const timeout = env[`${prefix}_TIMEOUT_MS`] ?? env['SYSTEMONE_LOCAL_TIMEOUT_MS'];

  const defaultBaseUrl = 'http://localhost:11434';

  return {
    baseUrl: baseUrl || defaultBaseUrl,
    model: model || 'tev1:4b-q4_K_M',
    apiKey: env[`${prefix}_API_KEY`] ?? env['SYSTEMONE_LOCAL_API_KEY'] ?? '',
    timeoutMs: timeout !== undefined ? Number(timeout) : 60000,
  };
}

export class SystemOneLocalSystemOneClient implements SystemOneClient {
  readonly name: string;
  private readonly config: SystemOneLocalConfig;

  constructor(config: SystemOneLocalConfig, name = 'systemone-local') {
    this.config = config;
    this.name = name;
  }

  async ask(request: SystemOneRequest): Promise<SystemOneResponse> {
    const started = Date.now();
    const baseUrl = this.resolveBaseUrl();
    const url = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}v1/systemone`;
    const body = this.buildBody(request);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `[${this.name}] ${response.status} ${url}: ${text.slice(0, 400)}`,
      );
    }

    const raw = (await response.json()) as {
      questions?: Record<string, Record<string, unknown>>;
      answers?: Record<string, Record<string, unknown>>;
      model?: string;
      usage?: Record<string, unknown>;
    };

    const answersMap = raw.questions ?? raw.answers ?? {};
    const answers = reconstructAnswers(request.questions, answersMap);
    const rawUsage = raw.usage ?? {};

    const usage: Usage = {
      inputTokens: toInt(
        rawUsage['input_tokens'] ??
          rawUsage['inputTokens'] ??
          rawUsage['prompt_tokens'] ??
          0,
      ),
      outputTokens: toInt(
        rawUsage['output_tokens'] ??
          rawUsage['outputTokens'] ??
          rawUsage['completion_tokens'] ??
          0,
      ),
      calls: 1,
      elapsedMs: toInt(
        rawUsage['elapsed_ms'] ?? rawUsage['elapsedMs'] ?? Date.now() - started,
      ),
    };

    return {
      answers,
      model: raw.model ?? this.config.model,
      usage,
    };
  }

  private resolveBaseUrl(): string {
    const raw = this.config.baseUrl;
    // Strip trailing /v1/systemone or /v1 so we can re-add the suffix.
    return raw
      .replace(/\/v1\/systemone\/?$/, '')
      .replace(/\/v1\/?$/, '')
      .replace(/\/+$/, '');
  }

  private buildBody(req: SystemOneRequest): Record<string, unknown> {
    // tev1 uses string state; nimble uses object state — just pass through.
    const stateBody =
      typeof req.state === 'string' || req.state == null ? req.state : req.state;
    return {
      model: this.config.model,
      state: stateBody,
      questions: req.questions,
    };
  }
}

// ── answer reconstruction ─────────────────────────────────────────────────────

/**
 * Map raw endpoint answers onto our typed Answers. When the endpoint sends
 * the answer object verbatim we can also just pass it through, but we try to
 * reconstruct the canonical shape so downstream code (decide.ts) and the
 * eval harness share one interpretation.
 */
function reconstructAnswers(
  questions: Questions,
  raw: Record<string, unknown>,
): Answers {
  const out: Answers = {} as Answers;
  for (const [id, val] of Object.entries(raw)) {
    if (val == null || typeof val !== 'object') continue;
    const obj = val as Record<string, unknown>;
    const type = obj['type'] as string | undefined;
    if (!type) continue;

    out[id] = buildAnswer(type, obj) as Answers[stringofkeyof<Answers>];
  }
  return out;
}

function buildAnswer(type: string, obj: Record<string, unknown>): unknown {
  if (type === 'noul') {
    return {
      type: 'noul',
      noul: toNum(obj['noul'] ?? obj['yes'] ?? obj['probability'] ?? 0.5),
    };
  }
  if (type === 'choice') {
    const probs = (obj['probabilities'] ?? {}) as Record<string, number>;
    const choice =
      typeof obj['choice'] === 'string' ? obj['choice'] : (findMax(probs) ?? '');
    return {
      type: 'choice',
      choice,
      probabilities: probs,
      confidence: toNum(obj['confidence'] ?? 0),
    };
  }
  if (type === 'score') {
    const probs = (obj['probabilities'] ?? {}) as Record<string, number>;
    return {
      type: 'score',
      score: toNum(obj['score'] ?? obj['level'] ?? 0),
      legend: (obj['legend'] ?? {}) as Record<string, string>,
      probabilities: probs,
      confidence: toNum(obj['confidence'] ?? 0),
    };
  }
  // Unknown type — pass through untyped as-is.
  return obj;
}

function findMax(m: Record<string, number>): string | undefined {
  let best = '';
  let bestV = -Infinity;
  for (const [k, v] of Object.entries(m)) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return bestV > -Infinity ? best : undefined;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: unknown): number {
  return toNum(v) | 0;
}

type stringofkeyof<T> = string & keyof T;
