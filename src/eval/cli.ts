#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderName } from '../typesafe/index.js';
import { runEval, resolveMaxRequests, SpendCapError } from './runner.js';
import type { EvalDomain } from './run-record.js';

/**
 * Eval CLI. Examples:
 *   npm run eval -- --providers=mock --runs=1
 *   npm run eval -- --providers=mock,llm --runs=5 --domains=triage
 *   npm run eval -- --providers=real --runs=3
 *
 * Spend cap: EVAL_MAX_REQUESTS env (or --max-requests=N) aborts the run when
 * the client would exceed N provider requests. Unset = no cap.
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
    // .env optional for mock runs
  }
  return env;
}

function parseList<T extends string>(arg: string, valid: readonly T[], flag: string): T[] {
  const raw = arg.split(',').map((s) => s.trim());
  const invalid = raw.filter((s) => !valid.includes(s as T));
  if (raw.length === 0 || invalid.length > 0) {
    throw new Error(`--${flag}=... invalid values: ${invalid.join(', ')}. Valid: ${valid.join(',')}`);
  }
  return raw as T[];
}

async function main(): Promise<void> {
  const env = loadEnvInto({ ...process.env });
  const args = process.argv.slice(2);

  const providersArg = args.find((a) => a.startsWith('--providers='));
  const runsArg = args.find((a) => a.startsWith('--runs='));
  const domainsArg = args.find((a) => a.startsWith('--domains='));
  const maxArg = args.find((a) => a.startsWith('--max-requests='));

  const providers = parseList<ProviderName>(
    providersArg?.split('=')[1] ?? 'mock',
    ['mock', 'llm', 'llm-local', 'real'],
    'providers',
  );
  const runs = runsArg ? Number(runsArg.split('=')[1]) : 1;
  if (!Number.isInteger(runs) || runs < 1 || runs > 100) {
    throw new Error('--runs must be an integer in [1, 100]');
  }
  const domains = domainsArg
    ? parseList<EvalDomain>(domainsArg.split('=')[1] ?? '', ['triage', 'checkout'], 'domains')
    : (['triage', 'checkout'] as EvalDomain[]);
  const maxRequests: number | undefined = maxArg ? Number(maxArg.split('=')[1]) : undefined;
  const options: Parameters<typeof runEval>[0] = {
    providers,
    runs,
    domains,
    env,
  };
  if (maxRequests !== undefined) options.maxRequests = maxRequests;

  // Fail fast on a malformed cap before any provider is constructed.
  resolveMaxRequests(env, maxRequests);

  console.error(
    `eval: providers=${providers.join(',')} runs=${runs} domains=${domains.join(',')} ` +
      `cap=${maxRequests ?? env['EVAL_MAX_REQUESTS'] ?? 'none'}`,
  );
  const started = Date.now();
  const result = await runEval(options);

  console.log(`\nEval complete → ${result.dir}/`);
  console.log(`  run files : ${result.runFiles.length}`);
  console.log(`  records   : ${result.records.length}`);
  console.log(`  requests  : ${result.requestsMade}`);
  console.log(`  csv       : ${result.csvFile}`);
  console.log(`  report    : ${result.reportFile}`);
  for (const s of result.summaries) {
    const pass = s.passRate === null ? 'n/a' : `${(s.passRate * 100).toFixed(0)}%`;
    console.log(
      `  ${s.provider}/${s.domain}: ${s.passed}/${s.scored} pass (${pass}) ` +
        `p50=${s.latency.p50}ms p95=${s.latency.p95}ms violations=${s.schemaViolations.count}`,
    );
  }
  console.error(`eval: done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  if (error instanceof SpendCapError) {
    console.error(`\nSPEND CAP: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});