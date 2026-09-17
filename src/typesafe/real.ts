import type {
  Answer,
  Answers,
  NoulQuestion,
  Questions,
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
} from './client.js';

/**
 * Provider "real": the actual TypeSafe API through the official SDK
 * (@typesafe-ai/sdk, model jev-latest). Dormant until TYPESAFE_API_KEY is set —
 * on access day, flip TYPESAFE_PROVIDER=real and everything else is unchanged.
 *
 * The SDK's SystemOneRequest uses `systemOne(...)`/`ask(...)` shape with the
 * same question/answer primitives as our client.ts interface; the mapping below
 * is deliberately thin and explicit so any API drift on access day is a
 * one-file fix.
 */

export interface RealProviderConfig {
  apiKey: string;
}

/** Lazily import the real SDK so it is never loaded for mock/llm runs. */
type SdkModule = typeof import('@typesafe-ai/sdk');
type SdkClient = InstanceType<SdkModule['TypeSafeClient']>;

export class RealSystemOneClient implements SystemOneClient {
  readonly name = 'real';
  private readonly config: RealProviderConfig;
  private sdkClient: SdkClient | null = null;

  constructor(config: RealProviderConfig) {
    if (!config.apiKey) {
      throw new Error('real provider: TYPESAFE_API_KEY is not set');
    }
    this.config = config;
  }

  async ask(request: SystemOneRequest): Promise<SystemOneResponse> {
    const started = Date.now();
    const client = await this.ensureClient();

    const response = await client.systemOne({
      // SDK EntryType accepts JSON values; our state is JSON-serializable by contract.
      state: request.state as never,
      questions: mapQuestionsToSdk(request.questions),
    });

    const answers: Answers = {};
    for (const [id, sdkAnswer] of Object.entries(response.answers)) {
      answers[id] = mapAnswerFromSdk(sdkAnswer as never);
    }

    return {
      answers,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        calls: 1,
        elapsedMs: Date.now() - started,
      },
    };
  }

  private async ensureClient(): Promise<SdkClient> {
    if (this.sdkClient === null) {
      const sdk = (await import('@typesafe-ai/sdk')) as SdkModule;
      this.sdkClient = new sdk.TypeSafeClient({
        apiKey: this.config.apiKey,
      });
    }
    return this.sdkClient;
  }
}

// The SDK's question shapes are structurally compatible with ours; its
// ScoreCriteria is a fixed tuple, so scores pass through as readonly arrays.
// The mapping is explicit so any API drift on access day is a one-file fix.
type SdkEntry = string | { [k: string]: string | { [k: string]: string } | string[] | null };
type SdkQuestion =
  | NoulQuestion
  | {
      type: 'choice';
      instructions: string;
      criteria: Record<string, SdkEntry | null>;
    }
  | {
      type: 'score';
      instructions: string;
      criteria: [SdkEntry, SdkEntry, ...SdkEntry[]];
    };

function mapQuestionsToSdk(questions: Questions): Record<string, SdkQuestion> {
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      if (q.type === 'score') {
        const levels = q.criteria as SdkEntry[];
        return [
          id,
          {
            type: 'score',
            instructions: q.instructions,
            criteria: [levels[0]!, ...levels.slice(1)] as [SdkEntry, SdkEntry, ...SdkEntry[]],
          },
        ];
      }
      if (q.type === 'choice') {
        return [
          id,
          {
            type: 'choice',
            instructions: q.instructions,
            criteria: q.criteria as Record<string, SdkEntry>,
          },
        ];
      }
      return [id, q] as const;
    }),
  );
}

function mapAnswerFromSdk(sdkAnswer: {
  type: string;
  noul?: number;
  choice?: string;
  score?: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
  confidence?: number;
}): Answer {
  switch (sdkAnswer.type) {
    case 'noul':
      return { type: 'noul', noul: sdkAnswer.noul ?? 0 };
    case 'choice':
      return {
        type: 'choice',
        choice: sdkAnswer.choice ?? '',
        probabilities: sdkAnswer.probabilities ?? {},
        confidence: sdkAnswer.confidence ?? 0,
      };
    case 'score':
      return {
        type: 'score',
        score: sdkAnswer.score ?? 0,
        legend: sdkAnswer.legend ?? {},
        probabilities: sdkAnswer.probabilities ?? {},
        confidence: sdkAnswer.confidence ?? 0,
      };
    default:
      throw new Error(`real provider: unknown answer type ${String(sdkAnswer.type)}`);
  }
}

export function realConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RealProviderConfig {
  return { apiKey: env['TYPESAFE_API_KEY'] ?? '' };
}