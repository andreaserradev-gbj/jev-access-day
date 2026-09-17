#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type ProviderName } from './typesafe/index.js';
import type { SystemOneClient, Usage } from './typesafe/client.js';
import { buildTriageState, type JestFailure } from './triage/state.js';
import { TRIAGE_QUESTIONS } from './triage/questions.js';
import { actionLabel, decideTriage } from './triage/decide.js';
import { runCascade, type CascadeResult } from './checkout/cascade.js';
import type { CheckoutFixture } from './checkout/state.js';
import {
  actionLabelStage1,
  actionLabelStage3,
} from './checkout/decide.js';

const FIXTURE_ROOT = new URL('../fixtures', import.meta.url).pathname;

function loadFixtures<T>(dir: string): Map<string, T> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const out = new Map<string, T>();
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as T & {
      scenario?: string;
      checkout?: { scenario?: string };
    };
    // Triage fixtures carry `scenario` at the top level; checkout fixtures
    // nest it under `checkout`. Key by whichever exists, else by filename.
    const key = parsed.scenario ?? parsed.checkout?.scenario ?? file.replace(/\.json$/, '');
    out.set(key, parsed);
  }
  return out;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function usageLine(u: Usage): string {
  return `${u.elapsedMs}ms | ${u.calls} call(s) | ${u.inputTokens}+${u.outputTokens} tok`;
}

// ── Domain 1 ──────────────────────────────────────────────────────────────────

async function runTriage(client: SystemOneClient, failures: Map<string, JestFailure>): Promise<void> {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`DOMAIN 1 — CI test-failure triage  (provider: ${client.name})`);
  console.log('═'.repeat(78));

  for (const [scenario, failure] of failures) {
    if (client.name !== 'mock') {
      console.error(`  [${client.name}] asking ${scenario}... (LLM: expect 30-120s per fixture)`);
    }
    const response = await client.ask({
      state: buildTriageState(failure),
      questions: TRIAGE_QUESTIONS,
    });
    const decision = decideTriage(response.answers);

    console.log(`\n■ ${scenario}  [${failure.suite}] ${failure.testName}`);
    console.log(`  decision : ${decision.action}  →  ${actionLabel(decision.action)}`);
    console.log(`  usage    : ${usageLine(response.usage)}`);
    console.log('  answers  :');
    for (const [id, answer] of Object.entries(response.answers)) {
      console.log(`    ${id.padEnd(26)} ${renderAnswer(answer)}`);
    }
    for (const line of decision.rationale) {
      console.log(`    · ${line}`);
    }
  }
}

// ── Domain 2 ──────────────────────────────────────────────────────────────────

async function runCheckout(
  client: SystemOneClient,
  checkouts: Map<string, CheckoutFixture>,
): Promise<void> {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`DOMAIN 2 — checkout risk cascade  (provider: ${client.name})`);
  console.log('═'.repeat(78));

  const summary: Array<Pick<CascadeResult, 'scenario' | 'stage1Route' | 'bureauCalled' | 'finalAction' | 'evApproveUsd'>> = [];

  for (const [scenario, fixture] of checkouts) {
    if (client.name !== 'mock') {
      console.error(`  [${client.name}] running cascade ${scenario}... (LLM: expect 1-4 min per fixture)`);
    }
    const result = await runCascade(client, fixture);
    summary.push({
      scenario: result.scenario,
      stage1Route: result.stage1Route,
      bureauCalled: result.bureauCalled,
      finalAction: result.finalAction,
      evApproveUsd: result.evApproveUsd,
    });

    console.log(`\n■ ${scenario}`);
    console.log(
      `  stage 1  : ${result.stage1Route}  →  ${actionLabelStage1(result.stage1Route)}`,
    );
    console.log(`  usage    : ${usageLine({ ...result.stage1Usage, elapsedMs: result.stage1Usage.elapsedMs })}`);
    for (const line of result.stage1Rationale) {
      console.log(`    · ${line}`);
    }

    if (!result.bureauCalled) {
      console.log(`  final    : ${String(result.finalAction)}  (decided without bureau)`);
      continue;
    }

    console.log(`  bureau   : called, latency ${result.bureauLatencyMs}ms (mocked)`);
    console.log(
      `  stage 3  : ${String(result.finalAction)}  →  ${actionLabelStage3(result.finalAction!)}`,
    );
    console.log(`  usage    : ${usageLine(result.stage3Usage!)}`);
    console.log(
      `  EV       : p_fraud=${result.pFraudEstimate?.toFixed(3)}  EV(approve)=${fmtUsd(result.evApproveUsd ?? Number.NaN)}`,
    );
    for (const line of result.finalRationale.slice(result.stage1Rationale.length)) {
      console.log(`    · ${line}`);
    }
  }

  const called = summary.filter((s) => s.bureauCalled).length;
  console.log(`\n  bureau skip rate: ${summary.length - called}/${summary.length} checkouts skipped the bureau`);
}

function renderAnswer(answer: unknown): string {
  const a = answer as {
    type: string;
    noul?: number;
    choice?: string;
    score?: number;
    probabilities?: Record<string, number>;
    confidence?: number;
  };
  switch (a.type) {
    case 'noul':
      return `noul=${a.noul?.toFixed(2)}`;
    case 'choice': {
      const probs = Object.entries(a.probabilities ?? {})
        .sort((x, y) => y[1] - x[1])
        .map(([k, v]) => `${k}:${v.toFixed(2)}`)
        .join(' ');
      return `choice=${a.choice} conf=${a.confidence?.toFixed(2)} [${probs}]`;
    }
    case 'score': {
      const probs = Object.entries(a.probabilities ?? {})
        .map(([k, v]) => `${k}:${v.toFixed(2)}`)
        .join(' ');
      return `score=${a.score?.toFixed(2)} conf=${a.confidence?.toFixed(2)} [${probs}]`;
    }
    default:
      return JSON.stringify(a);
  }
}

// ── Comparison table ──────────────────────────────────────────────────────────

interface ComparisonRow {
  domain: string;
  scenario: string;
  provider: string;
  action: string;
  bureauCalled?: boolean;
  latencyMs: number;
  calls: number;
  tokens: number;
}

async function runDomain(
  provider: ProviderName,
  env: NodeJS.ProcessEnv,
  domain: 'triage' | 'checkout',
): Promise<ComparisonRow[]> {
  const client = createClient(provider, env);
  const rows: ComparisonRow[] = [];
  const progress = (msg: string): void => {
    if (client.name !== 'mock') console.error(`  [${client.name}/${domain}] ${msg}`);
  };

  if (domain === 'triage') {
    for (const [scenario, failure] of loadFixtures<JestFailure>(join(FIXTURE_ROOT, 'failures'))) {
      progress(`asking ${scenario}...`);
      const response = await client.ask({
        state: buildTriageState(failure),
        questions: TRIAGE_QUESTIONS,
      });
      const decision = decideTriage(response.answers);
      rows.push({
        domain: 'triage',
        scenario,
        provider: client.name,
        action: decision.action,
        latencyMs: response.usage.elapsedMs,
        calls: response.usage.calls,
        tokens: response.usage.inputTokens + response.usage.outputTokens,
      });
    }
  } else {
    const checkouts = loadFixtures<CheckoutFixture>(join(FIXTURE_ROOT, 'checkouts'));
    for (const [scenario, fixture] of checkouts) {
      progress(`running cascade ${scenario}...`);
      const result = await runCascade(client, fixture);
      const tokens =
        result.stage1Usage.inputTokens + result.stage1Usage.outputTokens +
        (result.stage3Usage ? result.stage3Usage.inputTokens + result.stage3Usage.outputTokens : 0);
      const latency =
        result.stage1Usage.elapsedMs +
        (result.stage3Usage?.elapsedMs ?? 0) +
        (result.bureauLatencyMs ?? 0);
      const calls = result.stage1Usage.calls + (result.stage3Usage?.calls ?? 0);
      rows.push({
        domain: 'checkout',
        scenario,
        provider: client.name,
        action: `${result.finalAction ?? '?'}${result.bureauCalled ? '' : ' (no bureau)'}`,
        bureauCalled: result.bureauCalled,
        latencyMs: latency,
        calls,
        tokens,
      });
    }
  }
  return rows;
}

async function runComparison(providers: ProviderName[], env: NodeJS.ProcessEnv): Promise<void> {
  const allRows: ComparisonRow[] = [];
  for (const domain of ['triage', 'checkout'] as const) {
    for (const provider of providers) {
      allRows.push(...(await runDomain(provider, env, domain)));
    }
  }

  console.log(`\n${'═'.repeat(78)}`);
  console.log('COMPARISON — same fixtures, same questions, same decide() code');
  console.log('═'.repeat(78));
  const header = ['scenario'.padEnd(26), 'provider'.padEnd(7), 'action'.padEnd(32), 'latency'.padEnd(9), 'calls'.padEnd(6), 'tokens'];
  console.log(header.join(' '));
  console.log('-'.repeat(90));
  for (const row of allRows) {
    const latencyLabel = row.bureauCalled === false ? `${row.latencyMs}ms*` : `${row.latencyMs}ms`;
    console.log(
      [
        `${row.domain}/${row.scenario}`.padEnd(26).slice(0, 26),
        row.provider.padEnd(7),
        row.action.padEnd(32),
        latencyLabel.padEnd(9),
        String(row.calls).padEnd(6),
        String(row.tokens),
      ].join(' '),
    );
  }
  console.log('\n* no-bureau fast paths include mocked provider latency only.');
}

// ── entry point ───────────────────────────────────────────────────────────────

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
    // .env optional for mock runs
  }
  return env;
}

async function main(): Promise<void> {
  const env = loadEnvInto({ ...process.env });
  const args = process.argv.slice(2);
  const providerArg = (args.find((a) => a.startsWith('--provider=')) ?? '').split('=')[1] as
    | ProviderName
    | undefined;
  const compare = args.includes('--compare');

  if (compare) {
    const providers: ProviderName[] = ['mock'];
    if (env['OLLAMA_API_KEY']) providers.push('llm');
    // The real provider joins only with a non-empty, non-placeholder key:
    // a 401 from a placeholder would abort the whole comparison.
    const realKey = (env['TYPESAFE_API_KEY'] ?? '').trim();
    if (realKey && !realKey.startsWith('your-')) providers.push('real');
    await runComparison(providers, env);
    return;
  }

  const provider = providerArg ?? ((env['TYPESAFE_PROVIDER'] as ProviderName) ?? 'mock');
  const client = createClient(provider, env);

  const failures = loadFixtures<JestFailure>(join(FIXTURE_ROOT, 'failures'));
  const checkouts = loadFixtures<CheckoutFixture>(join(FIXTURE_ROOT, 'checkouts'));

  await runTriage(client, failures);
  await runCheckout(client, checkouts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});