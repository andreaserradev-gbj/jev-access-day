import { readFileSync } from 'node:fs';
import { LlmSystemOneClient, llmConfigFromEnv } from '../dist/typesafe/llm.js';
import { TRIAGE_QUESTIONS } from '../dist/triage/questions.js';
import { buildTriageState } from '../dist/triage/state.js';

const auth = JSON.parse(
  readFileSync('/home/andrea/.local/share/opencode/auth.json', 'utf8'),
) as { 'ollama-cloud'?: { key?: string } };
const key = auth['ollama-cloud']?.key ?? '';
if (!key) throw new Error('no key');

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