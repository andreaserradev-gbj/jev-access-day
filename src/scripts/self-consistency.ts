#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient, type ProviderName } from '../typesafe/index.js';
import type { SystemOneClient, Answers } from '../typesafe/client.js';
import { TRIAGE_QUESTIONS } from '../triage/questions.js';
import { buildTriageState, type JestFailure } from '../triage/state.js';
import { resultsDirFor } from '../eval/run-record.js';

/**
 * Claim test: self-consistency. Asks the same fixture N times and hashes the
 * full typed answer objects (sha256 over key-sorted JSON) to measure whether
 * a provider is deterministic:
 *
 *   node dist/scripts/self-consistency.js --provider=real
 *   node dist/scripts/self-consistency.js --provider=llm --reruns=3
 *
 * Claim under test: Jev is ~deterministic (identical hashes across re-runs);
 * the llm stand-in is not (its N=5 in-call self-consistency still varies
 * between asks). Writes results/<date>/self-consistency-<provider>.md.
 *
 * llm/llm-local are slow (~80s per ask): run detached, e.g.
 *   nohup node dist/scripts/self-consistency.js --provider=llm > /tmp/opencode/sc-llm.log 2>&1 &
 */

const FIXTURE_ROOT = fileURLToPath(new URL('../../fixtures/failures', import.meta.url));

const DEFAULT_FIXTURES = ['bad-test', 'error-contract-regression', 'known-flake'] as const;

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

function normalizeTag(tag: string | undefined): string | undefined {
  if (tag === undefined || tag === '') return undefined;
  if (!/^[a-z0-9-]+$/.test(tag)) {
    throw new Error(`--tag="${tag}" is invalid: use lowercase letters, digits and single dashes`);
  }
  return tag;
}

/** Deterministic JSON: object keys sorted recursively, so hashing is stable. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

function hashAnswers(answers: Answers): string {
  return createHash('sha256').update(stableStringify(answers)).digest('hex').slice(0, 12);
}

/** Short per-question rendering for the drift table. Choice includes confidence —
 * confidence wobble near decision gates (0.5 floor, 0.65 fast-path) is exactly
 * what matters for run-to-run action stability. */
function renderAnswer(answer: Answers[string]): string {
  const a = answer as {
    type: string;
    noul?: number;
    choice?: string;
    confidence?: number;
    score?: number;
  };
  if (a.type === 'noul') return a.noul!.toFixed(3);
  if (a.type === 'choice') return `${a.choice!}@${(a.confidence ?? 0).toFixed(2)}`;
  return a.score!.toFixed(2);
}

interface FixtureResult {
  fixture: string;
  hashes: string[];
  uniqueHashes: number;
  dominantCount: number;
  perQuestionDrift: { questionId: string; values: string[] }[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  p50ElapsedMs: number;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function main(): Promise<void> {
  const env = loadEnvInto({ ...process.env });
  const args = process.argv.slice(2);
  const providerArg = args.find((a) => a.startsWith('--provider='));
  const rerunsArg = args.find((a) => a.startsWith('--reruns='));
  const fixturesArg = args.find((a) => a.startsWith('--fixtures='));
  const tag = normalizeTag(args.find((a) => a.startsWith('--tag='))?.split('=')[1]);

  const provider = (providerArg?.split('=')[1] ?? 'real') as ProviderName;
  if (!['mock', 'llm', 'llm-local', 'real'].includes(provider)) {
    throw new Error(`--provider must be one of mock, llm, llm-local, real (got ${provider})`);
  }
  const reruns = Number(rerunsArg?.split('=')[1] ?? '5');
  if (!Number.isInteger(reruns) || reruns < 2 || reruns > 20) {
    throw new Error('--reruns must be an integer in [2, 20]');
  }
  const fixtures = (fixturesArg?.split('=')[1] ?? DEFAULT_FIXTURES.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  console.error(
    `self-consistency: provider=${provider} reruns=${reruns} fixtures=${fixtures.join(',')}`,
  );
  const client: SystemOneClient = createClient(provider, env);

  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    let failure: JestFailure;
    try {
      failure = JSON.parse(readFileSync(join(FIXTURE_ROOT, `${fixture}.json`), 'utf8')) as JestFailure;
    } catch {
      throw new Error(`self-consistency: fixture "${fixture}" not found under ${FIXTURE_ROOT}`);
    }
    const state = buildTriageState(failure);

    const hashes: string[] = [];
    const elapsed: number[] = [];
    const answerRuns: Answers[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCalls = 0;

    for (let run = 0; run < reruns; run++) {
      const response = await client.ask({ state, questions: TRIAGE_QUESTIONS });
      hashes.push(hashAnswers(response.answers));
      answerRuns.push(response.answers);
      elapsed.push(response.usage.elapsedMs);
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;
      totalCalls += response.usage.calls;
      console.error(
        `  [${provider}] ${fixture} run ${run}: hash=${hashes[run]} ${response.usage.elapsedMs}ms`,
      );
    }

    const counts = new Map<string, number>();
    for (const h of hashes) counts.set(h, (counts.get(h) ?? 0) + 1);
    const dominantCount = Math.max(...counts.values());

    const questionIds = Object.keys(TRIAGE_QUESTIONS);
    const perQuestionDrift = questionIds
      .map((questionId) => ({
        questionId,
        values: answerRuns.map((a) => renderAnswer(a[questionId]!)),
      }))
      .filter((q) => new Set(q.values).size > 1);

    results.push({
      fixture,
      hashes,
      uniqueHashes: counts.size,
      dominantCount,
      perQuestionDrift,
      totalInputTokens,
      totalOutputTokens,
      totalCalls,
      p50ElapsedMs: percentile([...elapsed].sort((a, b) => a - b), 50),
    });
  }

  // ── report ────────────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(`# Self-consistency — ${provider} — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(
    `${reruns} identical re-runs per fixture; full answer objects hashed (sha256 over key-sorted JSON).`,
  );
  lines.push('');
  lines.push('| fixture | runs | unique hashes | dominant hash | deterministic? |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    lines.push(
      `| ${r.fixture} | ${reruns} | ${r.uniqueHashes} | ${r.dominantCount}/${reruns} | ${r.uniqueHashes === 1 ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');

  const drifted = results.filter((r) => r.perQuestionDrift.length > 0);
  if (drifted.length > 0) {
    lines.push('## Per-question drift (fixtures with any disagreement)');
    lines.push('');
    for (const r of drifted) {
      lines.push(`### ${r.fixture}`);
      lines.push('');
      lines.push('| question | distinct values across runs |');
      lines.push('|---|---|');
      for (const q of r.perQuestionDrift) {
        lines.push(`| ${q.questionId} | ${q.values.join(', ')} |`);
      }
      lines.push('');
    }
  } else {
    lines.push('No per-question drift: every question returned identical values on every run.');
    lines.push('');
  }

  lines.push('## Cost of the probe');
  lines.push('');
  for (const r of results) {
    lines.push(
      `- ${r.fixture}: ${r.totalCalls} call(s), ${r.totalInputTokens}+${r.totalOutputTokens} tok, p50 ${r.p50ElapsedMs}ms`,
    );
  }
  lines.push('');
  lines.push(
    'Interpretation: unique hashes = 1 on every fixture means the provider is deterministic ' +
      '(Jev claim). Multiple hashes mean run-to-run drift; the per-question tables show where. ' +
      'The llm stand-in is expected to drift — its confidence comes from in-call N=5 agreement.',
  );

  const dir = resultsDirFor(new Date(), 'results', tag);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `self-consistency-${provider}.md`);
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');

  console.log(`\nSelf-consistency complete → ${file}`);
  for (const r of results) {
    console.log(
      `  ${r.fixture.padEnd(28)} unique=${r.uniqueHashes} dominant=${r.dominantCount}/${reruns} p50=${r.p50ElapsedMs}ms`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});