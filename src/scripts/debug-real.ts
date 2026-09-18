#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RealSystemOneClient, realConfigFromEnv } from '../typesafe/real.js';
import { TRIAGE_QUESTIONS } from '../triage/questions.js';
import { buildTriageState } from '../triage/state.js';
import { decideTriage, actionLabel } from '../triage/decide.js';
import type { Usage } from '../typesafe/client.js';

/**
 * Access-day smoke test for the real provider — the mirror of
 * scripts/debug-llm.ts. One fixture, one ask, then 3 re-runs; typed answers,
 * usage, latency, and the decision the routing kernel reaches. SDK errors are
 * caught BY CLASS so the diagnosis is immediate:
 *
 *   node dist/scripts/debug-real.js [fixture=bad-test] [reruns=3]
 *
 * Exit codes: 0 = all runs produced typed answers consumable by decideTriage.
 * Phase 1 gate: this must pass before TYPESAFE_PROVIDER=real is flipped.
 */

function loadEnvInto(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  try {
    const content = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !(match[1]! in env)) {
        env[match[1]!] = match[2]!.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env optional — the key can come from the environment instead
  }
  return env;
}

interface SdkErrorLike {
  name: string;
  status?: number;
  requestId?: string;
  retryAfterMs?: number;
}

/** Render a caught error with SDK-class awareness, redacting any key material. */
function describeError(error: unknown): string {
  const e = error as SdkErrorLike & { message?: string };
  const name = e?.name ?? 'Error';
  const message = (e?.message ?? String(error)).replace(
    /apikey_[A-Za-z0-9_]+/g,
    'apikey_<redacted>',
  );
  const parts = [name];
  if (typeof e?.status === 'number') parts.push(`status=${e.status}`);
  if (e?.requestId) parts.push(`requestId=${e.requestId}`);
  if (typeof e?.retryAfterMs === 'number') parts.push(`retryAfterMs=${e.retryAfterMs}`);
  return `${parts.join(' ')}: ${message.slice(0, 400)}`;
}

function usageLine(u: Usage): string {
  return `${u.elapsedMs}ms | ${u.calls} call(s) | ${u.inputTokens}+${u.outputTokens} tok`;
}

async function main(): Promise<void> {
  const env = loadEnvInto({ ...process.env });
  const args = process.argv.slice(2);
  const fixtureArg = args.find((a) => a.startsWith('--fixture='))?.split('=')[1] ?? 'bad-test';
  const reruns = Number(args.find((a) => a.startsWith('--reruns='))?.split('=')[1] ?? '3');

  const config = realConfigFromEnv(env);
  if (!config.apiKey) {
    console.error('debug-real: TYPESAFE_API_KEY is not set (export it or put it in .env)');
    process.exit(1);
  }
  const client = new RealSystemOneClient(config);

  const fixturePath = fileURLToPath(
    new URL(`../../fixtures/failures/${fixtureArg}.json`, import.meta.url),
  );
  let failure: unknown;
  try {
    failure = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch {
    console.error(`debug-real: fixture "${fixtureArg}" not found at ${fixturePath}`);
    process.exit(1);
  }

  const state = buildTriageState(failure as Parameters<typeof buildTriageState>[0]);
  let failures = 0;

  for (let run = 0; run < reruns; run++) {
    try {
      const response = await client.ask({ state, questions: TRIAGE_QUESTIONS });
      const decision = decideTriage(response.answers);
      console.log(`\n■ run ${run} OK  ${usageLine(response.usage)}`);
      console.log(`  decision : ${decision.action} → ${actionLabel(decision.action)}`);
      for (const [id, answer] of Object.entries(response.answers)) {
        const type = (answer as { type: string }).type;
        const detail =
          type === 'noul'
            ? String((answer as { noul: number }).noul)
            : type === 'choice'
              ? String((answer as { choice: string }).choice)
              : String((answer as { score: number }).score);
        console.log(`  ${id.padEnd(26)} ${type}=${detail}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`\n■ run ${run} ERROR — ${describeError(error)}`);
    }
  }

  console.log(`\ndebug-real: ${reruns - failures}/${reruns} clean run(s)`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`debug-real: fatal — ${describeError(error)}`);
  process.exit(1);
});