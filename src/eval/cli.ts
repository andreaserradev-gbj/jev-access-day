#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderName } from '../typesafe/index.js';
import { runEval, resolveMaxRequests, SpendCapError, buildReportMarkdown } from './runner.js';
import { summarizeRecords } from './metrics.js';
import { EXPECTATIONS } from './expectations.js';
import { assertSafeTag, RUN_RECORD_SCHEMA_VERSION } from './run-record.js';
import type { EvalDomain, RunFilePayload, RunRecord } from './run-record.js';

/**
 * Eval CLI. Examples:
 *   npm run eval -- --providers=mock --runs=1
 *   npm run eval -- --providers=mock,llm --runs=5 --domains=triage
 *   npm run eval -- --providers=real --runs=3
 *
 * Offline report regeneration from persisted run files (no provider calls):
 *   npm run eval -- --report-from=results/2026-09-18
 *
 * Spend cap: EVAL_MAX_REQUESTS env (or --max-requests=N) aborts the run when
 * the client would exceed N provider requests. Unset = no cap.
 *
 * --tag=<name> writes into results/<date>-<name>/ instead of results/<date>/,
 * so a re-run on the same day never clobbers the earlier wave's run files.
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

/**
 * Regenerate report.md + results.csv from persisted run files only — zero
 * provider requests. Reads run-*.json in the given dir, re-scores against
 * expectations.json, rewrites report.md in place. Fixes the last-writer-wins
 * artifact when providers are evaluated in separate invocations.
 */
async function reportFrom(dir: string): Promise<void> {
  const files = readdirSync(dir).filter((f) => /^run-.+-run\d+\.json$/.test(f));
  if (files.length === 0) {
    throw new Error(`report-from: no run-*.json files found in ${dir}`);
  }
  const payloads: RunFilePayload[] = files
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RunFilePayload)
    .filter((p) => p.schemaVersion === RUN_RECORD_SCHEMA_VERSION);
  const records: RunRecord[] = payloads.flatMap((p) => p.records);
  if (records.length === 0) {
    throw new Error(`report-from: zero records parsed from ${files.length} file(s) in ${dir}`);
  }
  const providers = [...new Set(records.map((r) => r.provider))];
  const domains = [...new Set(records.map((r) => r.domain))] as EvalDomain[];
  const runs = Math.max(...records.map((r) => r.runIndex)) + 1;
  const date = new Date(records[0]!.timestamp);

  const summaries = summarizeRecords(records, EXPECTATIONS);
  const { writeFileSync } = await import('node:fs');
  const reportFile = join(dir, 'report.md');
  writeFileSync(
    reportFile,
    buildReportMarkdown(summaries, {
      providers,
      runs,
      domains,
      date,
      totalRecords: records.length,
    }),
    'utf8',
  );

  console.log(`report-from: ${records.length} records from ${payloads.length} run file(s) in ${dir}`);
  console.log(`  providers: ${providers.join(', ')}`);
  console.log(`  report    : ${reportFile}`);
  for (const s of summaries) {
    const pass = s.passRate === null ? 'n/a' : `${(s.passRate * 100).toFixed(0)}%`;
    console.log(
      `  ${s.provider}/${s.domain}: ${s.passed}/${s.scored} pass (${pass}) ` +
        `p50=${s.latency.p50}ms p95=${s.latency.p95}ms violations=${s.schemaViolations.count}`,
    );
  }
}

async function main(): Promise<void> {
  const env = loadEnvInto({ ...process.env });
  const args = process.argv.slice(2);
  const reportFromArg = args.find((a) => a.startsWith('--report-from='));
  if (reportFromArg) {
    await reportFrom(reportFromArg.split('=')[1]!);
    return;
  }

  const providersArg = args.find((a) => a.startsWith('--providers='));
  const runsArg = args.find((a) => a.startsWith('--runs='));
  const domainsArg = args.find((a) => a.startsWith('--domains='));
  const maxArg = args.find((a) => a.startsWith('--max-requests='));
  const tagArg = args.find((a) => a.startsWith('--tag='));

  let tag: string | undefined;
  if (tagArg !== undefined) {
    tag = tagArg.split('=')[1] ?? '';
    assertSafeTag(tag);
  }

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
    ? parseList<EvalDomain>(
        domainsArg.split('=')[1] ?? '',
        ['triage', 'checkout', 'dunning', 'prreview'],
        'domains',
      )
    : (['triage', 'checkout'] as EvalDomain[]);
  const maxRequests: number | undefined = maxArg ? Number(maxArg.split('=')[1]) : undefined;
  const options: Parameters<typeof runEval>[0] = {
    providers,
    runs,
    domains,
    env,
  };
  if (maxRequests !== undefined) options.maxRequests = maxRequests;
  if (tag !== undefined) options.tag = tag;

  // Fail fast on a malformed cap before any provider is constructed.
  resolveMaxRequests(env, maxRequests);

  console.error(
    `eval: providers=${providers.join(',')} runs=${runs} domains=${domains.join(',')} ` +
      `tag=${tag ?? 'none'} cap=${maxRequests ?? env['EVAL_MAX_REQUESTS'] ?? 'none'}`,
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