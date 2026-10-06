import type { SystemOneClient } from './client.js';
import { MockSystemOneClient } from './mock.js';
import { llmConfigFromEnv, llmLocalConfigFromEnv, LlmSystemOneClient } from './llm.js';
import { realConfigFromEnv, RealSystemOneClient } from './real.js';

import {
  SystemOneLocalSystemOneClient,
  systemoneLocalConfigFromEnv,
} from './systemone-local.js';

export type ProviderName =
  | 'mock'
  | 'llm'
  | 'llm-local'
  | 'real'
  | 'tev1'
  | 'nimble'
  | 'clef-flash';

export function createClient(
  provider?: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
): SystemOneClient {
  const selected =
    provider ?? (env['TYPESAFE_PROVIDER'] as ProviderName | undefined) ?? 'mock';
  switch (selected) {
    case 'mock':
      return new MockSystemOneClient();
    case 'llm':
      return new LlmSystemOneClient(llmConfigFromEnv(env), 'llm');
    case 'llm-local':
      return new LlmSystemOneClient(llmLocalConfigFromEnv(env), 'llm-local');
    case 'real':
      return new RealSystemOneClient(realConfigFromEnv(env));
    case 'tev1':
      return new SystemOneLocalSystemOneClient(
        systemoneLocalConfigFromEnv('TEV1', env),
        'tev1',
      );
    case 'nimble':
      return new SystemOneLocalSystemOneClient(
        systemoneLocalConfigFromEnv('NIMBLE', env),
        'nimble',
      );
    case 'clef-flash':
      return new SystemOneLocalSystemOneClient(
        systemoneLocalConfigFromEnv('CLEF_FLASH', env),
        'clef-flash',
      );
    default:
      throw new Error(
        `Unknown provider "${String(selected)}". Valid: mock, llm, llm-local, real, tev1, nimble, clef-flash.`,
      );
  }
}
