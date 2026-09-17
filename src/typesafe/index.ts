import type { SystemOneClient } from './client.js';
import { MockSystemOneClient } from './mock.js';
import { llmConfigFromEnv, LlmSystemOneClient } from './llm.js';
import { realConfigFromEnv, RealSystemOneClient } from './real.js';

export type ProviderName = 'mock' | 'llm' | 'real';

export function createClient(
  provider?: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
): SystemOneClient {
  const selected = provider ?? (env['TYPESAFE_PROVIDER'] as ProviderName | undefined) ?? 'mock';
  switch (selected) {
    case 'mock':
      return new MockSystemOneClient();
    case 'llm':
      return new LlmSystemOneClient(llmConfigFromEnv(env));
    case 'real':
      return new RealSystemOneClient(realConfigFromEnv(env));
    default:
      throw new Error(
        `Unknown provider "${String(selected)}". Valid: mock, llm, real.`,
      );
  }
}