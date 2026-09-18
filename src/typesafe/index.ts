import type { SystemOneClient } from './client.js';
import { MockSystemOneClient } from './mock.js';
import {
  llmConfigFromEnv,
  llmLocalConfigFromEnv,
  LlmSystemOneClient,
} from './llm.js';
import { realConfigFromEnv, RealSystemOneClient } from './real.js';

export type ProviderName = 'mock' | 'llm' | 'llm-local' | 'real';

export function createClient(
  provider?: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
): SystemOneClient {
  const selected = provider ?? (env['TYPESAFE_PROVIDER'] as ProviderName | undefined) ?? 'mock';
  switch (selected) {
    case 'mock':
      return new MockSystemOneClient();
    case 'llm':
      return new LlmSystemOneClient(llmConfigFromEnv(env), 'llm');
    case 'llm-local':
      return new LlmSystemOneClient(llmLocalConfigFromEnv(env), 'llm-local');
    case 'real':
      return new RealSystemOneClient(realConfigFromEnv(env));
    default:
      throw new Error(
        `Unknown provider "${String(selected)}". Valid: mock, llm, llm-local, real.`,
      );
  }
}