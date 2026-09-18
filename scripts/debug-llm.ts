import { readFileSync } from 'node:fs';
import { LlmSystemOneClient, llmConfigFromEnv } from '../dist/typesafe/llm.js';
import { TRIAGE_QUESTIONS } from '../dist/triage/questions.js';
import { buildTriageState } from '../dist/triage/state.js';

// Key resolution order: OLLAMA_API_KEY env, then the opencode auth store under
// $HOME (never a hardcoded user path). .env is gitignored and stays local.
function resolveApiKey(): string {
  if (process.env.OLLAMA_API_KEY) return process.env.OLLAMA_API_KEY;
  const home = process.env.HOME;
  if (!home) return '';
  try {
    const auth = JSON.parse(
      readFileSync(`${home}/.local/share/opencode/auth.json`, 'utf8'),
    ) as { 'ollama-cloud'?: { key?: string } };
    return auth['ollama-cloud']?.key ?? '';
  } catch {
    return '';
  }
}

const key = resolveApiKey();
if (!key) throw new Error('no key: set OLLAMA_API_KEY or log in via opencode');

const failure = JSON.parse(
  readFileSync(new URL('../fixtures/failures/bad-test.json', import.meta.url), 'utf8'),
);
const client = new LlmSystemOneClient({ ...llmConfigFromEnv(), apiKey: key, samples: 2 });

for (let run = 0; run < 3; run++) {
  try {
    const r = await client.ask({ state: buildTriageState(failure), questions: TRIAGE_QUESTIONS });
    console.log('run', run, 'OK', JSON.stringify(r.answers.failure_category).slice(0, 90));
  } catch (e) {
    console.log('run', run, 'ERROR:', (e as Error).message.slice(0, 300));
  }
}