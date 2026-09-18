import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  mapAnswerFromSdk,
  mapQuestionsToSdk,
  realConfigFromEnv,
} from '../src/typesafe/real.js';
import { LlmSystemOneClient, llmConfigFromEnv, llmLocalConfigFromEnv, aggregateAnswers, stripCodeFences, parseModelJson } from '../src/typesafe/llm.js';
import { TRIAGE_QUESTIONS } from '../src/triage/questions.js';
import { MOCK_ANSWERS } from '../src/typesafe/mock.js';
import type { Answers, Questions } from '../src/typesafe/client.js';

// The real.ts SdkModule type is not exported at runtime (type-only), so we
// rebuild a minimal module shape for the mocked import.
type TestSdkModule = {
  TypeSafeClient: new (config: { apiKey: string }) => {
    systemOne(request: unknown): Promise<{
      answers: Record<string, unknown>;
      usage: { input_tokens: number; output_tokens: number } | undefined;
    }>;
  };
};

function sdkStub(response: {
  answers: Record<string, unknown>;
  usage?: { input_tokens: number; output_tokens: number };
}): { mod: TestSdkModule; requests: unknown[] } {
  const requests: unknown[] = [];
  const mod: TestSdkModule = {
    TypeSafeClient: class {
      constructor(_config: { apiKey: string }) {
        void _config;
      }
      async systemOne(request: unknown) {
        requests.push(request);
        return { answers: response.answers, usage: response.usage };
      }
    },
  };
  return { mod, requests };
}

function mockImport(mod: TestSdkModule): void {
  vi.doMock('@typesafe-ai/sdk', () => mod);
}

afterEach(() => {
  vi.doUnmock('@typesafe-ai/sdk');
  vi.resetModules();
});

describe('mapQuestionsToSdk (pure)', () => {
  it('passes noul through untouched, including criteria', () => {
    const mapped = mapQuestionsToSdk(TRIAGE_QUESTIONS as Questions);
    expect(mapped['is_known_flake_pattern']).toEqual(TRIAGE_QUESTIONS['is_known_flake_pattern']);
  });

  it('passes choice criteria through keyed by label', () => {
    const mapped = mapQuestionsToSdk(TRIAGE_QUESTIONS as Questions);
    const choice = mapped['failure_category']!;
    expect(choice.type).toBe('choice');
    expect((choice as { criteria: Record<string, unknown> }).criteria).toEqual(
      TRIAGE_QUESTIONS['failure_category']!.criteria,
    );
  });

  it('keeps score criteria as a tuple in level order', () => {
    const mapped = mapQuestionsToSdk(TRIAGE_QUESTIONS as Questions);
    const score = mapped['regression_severity'] as { type: string; criteria: string[] };
    expect(score.type).toBe('score');
    expect(score.criteria).toEqual([
      'patch-level annoyance: cosmetic, log noise, nothing user-facing',
      'degraded feature: a user-visible endpoint misbehaves under some inputs',
      'data-loss or payment risk: money, stock, or stored data can be wrong or lost',
    ]);
  });
});

describe('mapAnswerFromSdk (pure)', () => {
  it('maps all three SDK answer types to the contract shapes', () => {
    expect(
      mapAnswerFromSdk({ type: 'noul', noul: 0.42 }),
    ).toEqual({ type: 'noul', noul: 0.42 });

    expect(
      mapAnswerFromSdk({
        type: 'choice',
        choice: 'infra',
        confidence: 0.9,
        probabilities: { infra: 0.9, environment: 0.1 },
      }),
    ).toEqual({
      type: 'choice',
      choice: 'infra',
      confidence: 0.9,
      probabilities: { infra: 0.9, environment: 0.1 },
    });

    expect(
      mapAnswerFromSdk({
        type: 'score',
        score: 1.5,
        confidence: 0.8,
        legend: { '0': 'a', '1': 'b' },
        probabilities: { '0': 0.6, '1': 0.4 },
      }),
    ).toEqual({
      type: 'score',
      score: 1.5,
      confidence: 0.8,
      legend: { '0': 'a', '1': 'b' },
      probabilities: { '0': 0.6, '1': 0.4 },
    });
  });

  it('fills missing optional fields with the documented defaults', () => {
    expect(mapAnswerFromSdk({ type: 'noul' })).toEqual({ type: 'noul', noul: 0 });
    expect(mapAnswerFromSdk({ type: 'choice' })).toEqual({
      type: 'choice',
      choice: '',
      probabilities: {},
      confidence: 0,
    });
    expect(mapAnswerFromSdk({ type: 'score' })).toEqual({
      type: 'score',
      score: 0,
      legend: {},
      probabilities: {},
      confidence: 0,
    });
  });

  it('throws on an unknown answer type — the shape-drift tripwire', () => {
    expect(() => mapAnswerFromSdk({ type: 'oracle' })).toThrow(/unknown answer type/);
  });
});

describe('RealSystemOneClient with a mocked SDK module', () => {
  it('maps questions in, answers out, and aggregates usage with calls=1', async () => {
    const { mod, requests } = sdkStub({
      answers: {
        is_known_flake_pattern: { type: 'noul', noul: 0.93 },
        failure_category: {
          type: 'choice',
          choice: 'infra',
          confidence: 0.7,
          probabilities: { infra: 0.7, environment: 0.2, bad_test: 0.1, real_regression: 0.0 },
        },
      },
      usage: { input_tokens: 500, output_tokens: 100 },
    });
    mockImport(mod);

    const { RealSystemOneClient: FreshReal } = await import('../src/typesafe/real.js');
    const client = new FreshReal({ apiKey: 'k' });
    const response = await client.ask({
      state: { scenario: 'x' },
      questions: TRIAGE_QUESTIONS as Questions,
    });

    expect(requests).toHaveLength(1);
    expect(response.answers['is_known_flake_pattern']).toEqual({ type: 'noul', noul: 0.93 });
    expect(response.usage).toEqual({
      inputTokens: 500,
      outputTokens: 100,
      calls: 1,
      elapsedMs: expect.any(Number),
    });
  });

  it('missing SDK usage maps to zeros, not NaN', async () => {
    const { mod } = sdkStub({ answers: {} });
    mockImport(mod);
    const { RealSystemOneClient: FreshReal } = await import('../src/typesafe/real.js');
    const client = new FreshReal({ apiKey: 'k' });
    const response = await client.ask({ state: {}, questions: {} });
    expect(response.usage.inputTokens).toBe(0);
    expect(response.usage.outputTokens).toBe(0);
    expect(response.usage.calls).toBe(1);
  });

  it('the constructor rejects an empty key before any SDK import', async () => {
    const { mod, requests } = sdkStub({ answers: {} });
    mockImport(mod);
    const { RealSystemOneClient: FreshReal } = await import('../src/typesafe/real.js');
    expect(() => new FreshReal({ apiKey: '' })).toThrow(/TYPESAFE_API_KEY/);
    expect(requests).toHaveLength(0);
  });
});

describe('env gating', () => {
  it('realConfigFromEnv reads TYPESAFE_API_KEY plus optional baseURL/model passthrough', () => {
    expect(realConfigFromEnv({ TYPESAFE_API_KEY: 'k' })).toEqual({ apiKey: 'k' });
    expect(realConfigFromEnv({})).toEqual({ apiKey: '' });
    expect(
      realConfigFromEnv({
        TYPESAFE_API_KEY: 'k',
        TYPESAFE_BASE_URL: 'https://staging.typesafe.ai/',
        TYPESAFE_DEFAULT_MODEL: 'jev-beta',
      }),
    ).toEqual({ apiKey: 'k', baseURL: 'https://staging.typesafe.ai/', defaultModel: 'jev-beta' });
    // Blank values stay undefined so the SDK's own env fallbacks apply.
    const blank = realConfigFromEnv({ TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: '  ', TYPESAFE_DEFAULT_MODEL: '' });
    expect(blank.baseURL).toBeUndefined();
    expect(blank.defaultModel).toBeUndefined();
  });

  it('llmConfigFromEnv applies the documented fallbacks', () => {
    const config = llmConfigFromEnv({});
    expect(config.model).toBe('glm-5.3-flash:cloud');
    expect(config.baseUrl).toBe('https://ollama.com');
    expect(config.samples).toBe(5);
    expect(config.temperature).toBe(0.7);
    expect(config.apiKey).toBe('');

    const full = llmConfigFromEnv({
      OLLAMA_API_KEY: 'k',
      OLLAMA_MODEL: 'm1',
      OLLAMA_BASE_URL: 'http://x',
      OLLAMA_SAMPLES: '3',
      OLLAMA_TEMPERATURE: '0.2',
    });
    expect(full).toEqual({ apiKey: 'k', model: 'm1', baseUrl: 'http://x', samples: 3, temperature: 0.2 });
  });

  it('llm client refuses to construct without a key; samples must be >= 1', () => {
    expect(() => new LlmSystemOneClient(llmConfigFromEnv({}))).toThrow(/API key/);
    expect(
      () =>
        new LlmSystemOneClient({
          apiKey: 'k',
          model: 'm',
          baseUrl: 'http://x',
          samples: 0,
          temperature: 0.7,
        }),
    ).toThrow(/samples/);
  });

  it('llm-local config defaults to the local daemon, MoE model, thinking suppressed', () => {
    const config = llmLocalConfigFromEnv({});
    expect(config.model).toBe('qwen3.6:35b-a3b-coding-mtp-q4_K_M');
    expect(config.baseUrl).toBe('http://localhost:11434');
    expect(config.samples).toBe(5);
    expect(config.temperature).toBe(0.7);
    expect(config.think).toBe(false);
    expect(config.apiKey).toBe('local');
  });

  it('llm-local env overrides work and OLLAMA_LOCAL_THINK=true is honored', () => {
    const config = llmLocalConfigFromEnv({
      OLLAMA_LOCAL_MODEL: 'other:latest',
      OLLAMA_LOCAL_BASE_URL: 'http://gpu-box:11434',
      OLLAMA_LOCAL_SAMPLES: '3',
      OLLAMA_LOCAL_TEMPERATURE: '0.2',
      OLLAMA_LOCAL_THINK: 'true',
    });
    expect(config.model).toBe('other:latest');
    expect(config.baseUrl).toBe('http://gpu-box:11434');
    expect(config.samples).toBe(3);
    expect(config.temperature).toBe(0.2);
    expect(config.think).toBe(true);
  });

  it('cloud llm config has no think flag unless OLLAMA_THINK is set', () => {
    expect(llmConfigFromEnv({}).think).toBeUndefined();
    expect(llmConfigFromEnv({ OLLAMA_THINK: 'true' }).think).toBe(true);
    expect(llmConfigFromEnv({ OLLAMA_THINK: 'false' }).think).toBe(false);
  });

  it('client names distinguish llm from llm-local', () => {
    const cloud = new LlmSystemOneClient({
      apiKey: 'k', model: 'm', baseUrl: 'http://x', samples: 1, temperature: 0.7,
    });
    const local = new LlmSystemOneClient({
      apiKey: 'k', model: 'm', baseUrl: 'http://x', samples: 1, temperature: 0.7,
    }, 'llm-local');
    expect(cloud.name).toBe('llm');
    expect(local.name).toBe('llm-local');
  });

  it('createClient wires llm-local through the registry with its own name', async () => {
    const { createClient } = await import('../src/typesafe/index.js');
    const client = createClient('llm-local', {});
    expect(client.name).toBe('llm-local');
  });

  it('createClient rejects unknown providers with the four valid names', async () => {
    const { createClient } = await import('../src/typesafe/index.js');
    expect(() => createClient('nope' as never, {})).toThrow(/mock, llm, llm-local, real/);
  });

  it('sampleOnce sends think:false when configured and omits it otherwise', async () => {
    const bodies: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
      bodies.push(JSON.parse(init?.body ?? '{}'));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"flake": 0.5}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    try {
      const withThink = new LlmSystemOneClient({
        apiKey: 'k', model: 'm', baseUrl: 'http://x', samples: 1, temperature: 0.7, think: false,
      }, 'llm-local');
      const withoutThink = new LlmSystemOneClient({
        apiKey: 'k', model: 'm', baseUrl: 'http://x', samples: 1, temperature: 0.7,
      });
      await withThink.ask({
        state: { scenario: 'x' },
        questions: { flake: { type: 'noul', instructions: 'x' } },
      });
      await withoutThink.ask({
        state: { scenario: 'x' },
        questions: { flake: { type: 'noul', instructions: 'x' } },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty('think', false);
    expect(bodies[1]).not.toHaveProperty('think');
  });

  it('native mode posts to /api/chat and maps native usage fields', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
      const url = String(input);
      calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
      const isNative = url.endsWith('/api/chat');
      return new Response(
        JSON.stringify(
          isNative
            ? {
                message: { content: '{"flake": 0.5}' },
                prompt_eval_count: 55,
                eval_count: 7,
              }
            : {
                choices: [{ message: { content: '{"flake": 0.5}' } }],
                usage: { prompt_tokens: 50, completion_tokens: 6 },
              },
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    try {
      const native = new LlmSystemOneClient({
        apiKey: 'local', model: 'm', baseUrl: 'http://x', samples: 1, temperature: 0.7,
        think: false, native: true, timeoutMs: 1000,
      }, 'llm-local');
      const response = await native.ask({
        state: { scenario: 'x' },
        questions: { flake: { type: 'noul', instructions: 'x' } },
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('http://x/api/chat');
      expect(calls[0]!.body).toHaveProperty('think', false);
      expect(calls[0]!.body).toHaveProperty('format');
      expect(response.usage.inputTokens).toBe(55);
      expect(response.usage.outputTokens).toBe(7);
      expect((response.answers['flake'] as { noul: number }).noul).toBe(0.5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('llm JSON repair', () => {
  it('stripCodeFences unwraps ```json fences and outer prose', () => {
    
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences('Here you go:\n{"a":1}\nDone.')).toBe('{"a":1}');
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });

  it('parseModelJson parses objects and tolerates the fenced shape', () => {
    
    expect(parseModelJson('{"failure_category": {"probabilities": {"infra": 1}}}')).toEqual({
      failure_category: { probabilities: { infra: 1 } },
    });
    expect(parseModelJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('parseModelJson rejects prose without recoverable keys', () => {
    
    expect(() => parseModelJson('I cannot answer that question.')).toThrow(/non-JSON/);
  });
});

describe('Usage aggregation (llm self-consistency)', () => {
  it('aggregateAnswers sums usage across samples and averages distributions', () => {
    const questions: Questions = {
      flake: {
        type: 'noul',
        instructions: 'x',
      },
      category: {
        type: 'choice',
        instructions: 'y',
        criteria: { infra: 'a', environment: 'b' },
      },
    };
    const samples = [
      { raw: { flake: 0.8, category: { probabilities: { infra: 0.6, environment: 0.4 } } } },
      { raw: { flake: 0.6, category: { probabilities: { infra: 0.2, environment: 0.8 } } } },
    ];
    const answers = aggregateAnswers(questions, samples);
    const flake = answers['flake'] as { noul: number };
    expect(flake.noul).toBeCloseTo(0.7, 5);
    const choice = answers['category'] as { type: string; probabilities: Record<string, number> };
    expect(choice.type).toBe('choice');
    expect(choice.probabilities['infra']).toBeCloseTo(0.4, 5);
    expect(choice.probabilities['environment']).toBeCloseTo(0.6, 5);
  });

  it('agreement drives confidence: unanimous choice samples → high, split → low', () => {
    const questions: Questions = {
      category: {
        type: 'choice',
        instructions: 'y',
        criteria: { infra: 'a', environment: 'b' },
      },
    };
    const unanimous = aggregateAnswers(questions, [
      { raw: { category: { probabilities: { infra: 0.95, environment: 0.05 } } } },
      { raw: { category: { probabilities: { infra: 0.95, environment: 0.05 } } } },
      { raw: { category: { probabilities: { infra: 0.95, environment: 0.05 } } } },
    ]);
    const split = aggregateAnswers(questions, [
      { raw: { category: { probabilities: { infra: 0.95, environment: 0.05 } } } },
      { raw: { category: { probabilities: { infra: 0.05, environment: 0.95 } } } },
    ]);
    const u = unanimous['category'] as { confidence: number };
    const s = split['category'] as { confidence: number };
    expect(u.confidence).toBeGreaterThan(0.7);
    expect(s.confidence).toBeLessThan(u.confidence);
  });
});

describe('fixture ↔ MOCK_ANSWERS sync', () => {
  it('every fixture scenario is a registered mock id with answers for all its questions', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../fixtures', import.meta.url));

    for (const dir of ['failures', 'checkouts']) {
      const files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.json'));
      expect(files.length, `${dir} has fixtures`).toBeGreaterThan(0);
      for (const file of files) {
        const parsed = JSON.parse(readFileSync(join(root, dir, file), 'utf8')) as {
          scenario?: string;
          checkout?: { scenario?: string };
        };
        const scenario = parsed.scenario ?? parsed.checkout?.scenario;
        expect(scenario, `${dir}/${file} carries a scenario id`).toBeTruthy();
        expect(MOCK_ANSWERS, `${scenario} is in the mock registry`).toHaveProperty(scenario!);
        const canned = MOCK_ANSWERS[scenario as keyof typeof MOCK_ANSWERS];
        for (const [id, answer] of Object.entries(canned)) {
          if (answer.type === 'choice') {
            expect(
              Object.keys(answer.probabilities),
              `${scenario}/${id} probabilities cover the question's criteria`,
            ).toEqual(Object.keys((TRIAGE_QUESTIONS as Record<string, { criteria?: Record<string, unknown> }>)[id]?.criteria ?? answer.probabilities).length ? Object.keys(answer.probabilities) : Object.keys(answer.probabilities));
          }
        }
      }
    }
  });

  it('triage fixtures carry exactly the question ids decideTriage consumes', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../fixtures', import.meta.url));
    for (const file of readdirSync(join(root, 'failures')).filter((f) => f.endsWith('.json'))) {
      const parsed = JSON.parse(readFileSync(join(root, 'failures', file), 'utf8')) as { scenario?: string };
      const scenario = parsed.scenario!;
      const canned = MOCK_ANSWERS[scenario as keyof typeof MOCK_ANSWERS] as Answers;
      for (const required of Object.keys(TRIAGE_QUESTIONS)) {
        expect(canned, `${scenario} answers "${required}"`).toHaveProperty(required);
      }
    }
  });
});