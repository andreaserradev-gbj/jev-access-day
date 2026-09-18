import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type ProviderName } from '../typesafe/index.js';
import { llmConfigFromEnv, llmLocalConfigFromEnv } from '../typesafe/llm.js';
import type {
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
} from '../typesafe/client.js';
import { buildTriageState, type JestFailure } from '../triage/state.js';
import { TRIAGE_QUESTIONS } from '../triage/questions.js';
import { decideTriage } from '../triage/decide.js';
import { runCascade } from '../checkout/cascade.js';
import type { CheckoutFixture } from '../checkout/state.js';
import {
  buildDunningState,
  dunningTemporalFromFixture,
  type DunningFixture,
} from '../dunning/state.js';
import { DUNNING_QUESTIONS } from '../dunning/questions.js';
import { decideDunning } from '../dunning/decide.js';
import {
  buildPrState,
  StubReviewerLlm,
  type PrFixture,
} from '../prreview/state.js';
import { PR_REVIEW_QUESTIONS } from '../prreview/questions.js';
import { decidePr, resolvePrEscalation } from '../prreview/decide.js';
import {
  buildCheckoutRunRecord,
  buildDunningRunRecord,
  buildPrReviewRunRecord,
  buildTriageRunRecord,
  ensureResultsDir,
  resultsDirFor,
  RUN_RECORD_SCHEMA_VERSION,
  writeCsvFile,
  writeRunFile,
  type EvalDomain,
  type ModelMetadata,
  type RunFilePayload,
  type RunRecord,
} from './run-record.js';
import { summarizeRecords, type DomainSummary } from './metrics.js';
import { EXPECTATIONS } from './expectations.js';

/**
 * The eval runner: drives providers over fixtures and persists everything to
 * results/<date>/. Kept separate from the CLI so the rehearsal (`mock`) and
 * access-day runs (`llm`, `real`) go through identical code paths, and so the
 * unit tests can drive runEval directly with a temp baseDir.
 */

export class SpendCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpendCapError';
  }
}

const FIXTURE_ROOT = new URL('../../fixtures', import.meta.url).pathname;

export function loadFixtures<T>(dir: string): Map<string, T> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const out = new Map<string, T>();
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as T & {
      scenario?: string;
      checkout?: { scenario?: string };
    };
    const key = parsed.scenario ?? parsed.checkout?.scenario ?? file.replace(/\.json$/, '');
    out.set(key, parsed);
  }
  return out;
}

/** Per-provider model identity, persisted in every record for time-series diffing. */
export function modelMetadataFor(provider: ProviderName, env: NodeJS.ProcessEnv): ModelMetadata {
  switch (provider) {
    case 'mock':
      return { model: 'mock' };
    case 'llm': {
      const config = llmConfigFromEnv(env);
      return { model: config.model, baseUrl: config.baseUrl, samples: config.samples };
    }
    case 'llm-local': {
      const config = llmLocalConfigFromEnv(env);
      return { model: config.model, baseUrl: config.baseUrl, samples: config.samples };
    }
    case 'real': {
      const metadata: ModelMetadata = { model: env['TYPESAFE_DEFAULT_MODEL'] ?? 'jev-latest' };
      const baseURL = env['TYPESAFE_BASE_URL'];
      if (baseURL !== undefined && baseURL.trim() !== '') metadata.baseUrl = baseURL.trim();
      return metadata;
    }
  }
}

/**
 * Overlay the provider-reported model id onto the metadata: `jev-latest`
 * resolves to its versioned id (jev-1.13.0) server-side, and run records
 * persist the resolved id so time-series attribution is honest.
 */
export function resolvedModelFromRecord(
  record: RunRecord,
  fallback: ModelMetadata,
): ModelMetadata {
  const resolved = record.responseModel;
  return resolved === undefined || resolved === fallback.model
    ? fallback
    : { ...fallback, resolvedModel: resolved };
}

/**
 * Spend cap: wraps any SystemOneClient and counts ask() calls across the whole
 * eval invocation. Bureau calls are mocked and never counted. When the cap is
 * reached the error propagates and the run aborts — run files already written
 * stay on disk, but results.csv and report.md are not produced.
 */
class CountingClient implements SystemOneClient {
  get name(): string {
    return this.inner.name;
  }
  constructor(
    private readonly inner: SystemOneClient,
    private readonly counter: { count: number; max: number },
  ) {}

  async ask(request: SystemOneRequest): Promise<SystemOneResponse> {
    if (this.counter.count >= this.counter.max) {
      throw new SpendCapError(
        `EVAL_MAX_REQUESTS=${this.counter.max} reached after ${this.counter.count} request(s); aborting eval. ` +
          'Run files written so far are kept; results.csv/report.md were not generated.',
      );
    }
    this.counter.count += 1;
    return this.inner.ask(request);
  }
}

export function resolveMaxRequests(env: NodeJS.ProcessEnv, override?: number): number {
  if (override !== undefined && override > 0) return override;
  const raw = env['EVAL_MAX_REQUESTS'];
  if (raw === undefined || raw.trim() === '') return Number.POSITIVE_INFINITY;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`EVAL_MAX_REQUESTS="${raw}" is not a positive number`);
  }
  return parsed;
}

export interface RunEvalOptions {
  providers: ProviderName[];
  runs: number;
  domains: EvalDomain[];
  env: NodeJS.ProcessEnv;
  /** Defaults to 'results'; tests pass a temp dir. */
  baseDir?: string;
  /** Optional tag suffix on the dated results dir, e.g. 'postfix'. */
  tag?: string;
  /** Overrides EVAL_MAX_REQUESTS when set. */
  maxRequests?: number;
  date?: Date;
}

export interface RunEvalResult {
  dir: string;
  runFiles: string[];
  csvFile: string;
  reportFile: string;
  records: RunRecord[];
  summaries: DomainSummary[];
  requestsMade: number;
}

export async function runEval(options: RunEvalOptions): Promise<RunEvalResult> {
  const date = options.date ?? new Date();
  const baseDir = options.baseDir ?? 'results';
  const dir = ensureResultsDir(date, baseDir, options.tag);
  const counter = { count: 0, max: resolveMaxRequests(options.env, options.maxRequests) };

  const records: RunRecord[] = [];
  const runFiles: string[] = [];

  for (const provider of options.providers) {
    for (const domain of options.domains) {
      for (let runIndex = 0; runIndex < options.runs; runIndex++) {
        const client = new CountingClient(createClient(provider, options.env), counter);
        const model = modelMetadataFor(provider, options.env);
        const domainRecords: RunRecord[] =
          domain === 'triage'
            ? await runTriageDomain(client, provider, runIndex, model)
            : domain === 'checkout'
              ? await runCheckoutDomain(client, runIndex, model)
              : domain === 'dunning'
                ? await runDunningDomain(client, provider, runIndex, model)
                : await runPrReviewDomain(client, provider, runIndex, model);
        records.push(...domainRecords);
        const resolved = domainRecords[0]
          ? resolvedModelFromRecord(domainRecords[0], model)
          : model;
        const payload: RunFilePayload = {
          schemaVersion: RUN_RECORD_SCHEMA_VERSION,
          provider,
          domain,
          runIndex,
          model: resolved,
          records: domainRecords,
        };
        runFiles.push(writeRunFile(dir, payload));
      }
    }
  }

  const csvFile = writeCsvFile(dir, records);
  const summaries = summarizeRecords(records, EXPECTATIONS);
  const reportFile = join(dir, 'report.md');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    reportFile,
    buildReportMarkdown(summaries, {
      providers: options.providers,
      runs: options.runs,
      domains: options.domains,
      date,
      totalRecords: records.length,
    }),
    'utf8',
  );

  return { dir, runFiles, csvFile, reportFile, records, summaries, requestsMade: counter.count };
}

async function runTriageDomain(
  client: SystemOneClient,
  provider: ProviderName,
  runIndex: number,
  model: ModelMetadata,
): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  for (const [scenario, failure] of loadFixtures<JestFailure>(join(FIXTURE_ROOT, 'failures'))) {
    if (client.name !== 'mock') {
      console.error(`  [${client.name}/triage] asking ${scenario}...`);
    }
    const response = await client.ask({
      state: buildTriageState(failure),
      questions: TRIAGE_QUESTIONS,
    });
    const decision = decideTriage(response.answers);
    records.push(
      buildTriageRunRecord(
        { provider, scenario, runIndex, model },
        decision,
        response.answers,
        response.usage,
        response.model,
      ),
    );
  }
  return records;
}

async function runCheckoutDomain(
  client: SystemOneClient,
  runIndex: number,
  model: ModelMetadata,
): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  for (const [scenario, fixture] of loadFixtures<CheckoutFixture>(join(FIXTURE_ROOT, 'checkouts'))) {
    if (client.name !== 'mock') {
      console.error(`  [${client.name}/checkout] running cascade ${scenario}...`);
    }
    const result = await runCascade(client, fixture);
    records.push(
      buildCheckoutRunRecord(
        { provider: client.name as ProviderName, scenario, runIndex, model },
        result,
      ),
    );
  }
  return records;
}

async function runDunningDomain(
  client: SystemOneClient,
  provider: ProviderName,
  runIndex: number,
  model: ModelMetadata,
): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  for (const [scenario, fixture] of loadFixtures<DunningFixture>(join(FIXTURE_ROOT, 'dunning'))) {
    if (client.name !== 'mock') {
      console.error(`  [${client.name}/dunning] asking ${scenario}...`);
    }
    const response = await client.ask({
      state: buildDunningState(fixture),
      questions: DUNNING_QUESTIONS,
    });
    const decision = decideDunning(response.answers, dunningTemporalFromFixture(fixture));
    records.push(
      buildDunningRunRecord(
        { provider, scenario, runIndex, model },
        decision,
        response.answers,
        response.usage,
        response.model,
      ),
    );
  }
  return records;
}

async function runPrReviewDomain(
  client: SystemOneClient,
  provider: ProviderName,
  runIndex: number,
  model: ModelMetadata,
): Promise<RunRecord[]> {
  const reviewer = new StubReviewerLlm();
  const records: RunRecord[] = [];
  for (const [scenario, fixture] of loadFixtures<PrFixture>(join(FIXTURE_ROOT, 'security-pr'))) {
    if (client.name !== 'mock') {
      console.error(`  [${client.name}/prreview] reviewing ${scenario}...`);
    }
    const response = await client.ask({
      state: buildPrState(fixture),
      questions: PR_REVIEW_QUESTIONS,
    });
    const decision = decidePr(response.answers);
    if (decision.action === 'needs_llm_review') {
      if (fixture.reviewerVerdict === undefined) {
        // No reviewer wired for this fixture: degrade loudly to a human
        // rather than letting an escalation hang.
        decision.reviewer = null;
        decision.finalAction = 'needs_human';
        decision.rationale.push('no reviewer verdict available: degrading to needs_human');
      } else {
        const verdict = await resolvePrEscalation(fixture, reviewer);
        decision.reviewer = {
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          rationale: verdict.rationale,
        };
        decision.finalAction = verdict.finalAction;
        decision.rationale.push(
          `reviewer LLM: ${verdict.verdict} at ${verdict.confidence} ` +
            `${verdict.confidence >= 0.6 ? '≥' : '<'} 0.6 gate → ${verdict.finalAction}`,
        );
      }
    }
    records.push(
      buildPrReviewRunRecord(
        { provider, scenario, runIndex, model },
        decision,
        response.answers,
        response.usage,
        response.model,
      ),
    );
  }
  return records;
}

// ── report ────────────────────────────────────────────────────────────────────

export interface ReportMeta {
  providers: ProviderName[];
  runs: number;
  domains: EvalDomain[];
  date: Date;
  totalRecords: number;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function n3(n: number): string {
  return n.toFixed(3);
}

export function buildReportMarkdown(summaries: readonly DomainSummary[], meta: ReportMeta): string {
  const lines: string[] = [];
  lines.push(`# Eval report — ${meta.date.toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`- Providers: ${meta.providers.join(', ')}`);
  lines.push(`- Runs per fixture: ${meta.runs}`);
  lines.push(`- Domains: ${meta.domains.join(', ')}`);
  lines.push(`- Records: ${meta.totalRecords} (schema v${RUN_RECORD_SCHEMA_VERSION})`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push(
    '| provider | domain | scored | pass | fail | pass rate | Brier | ECE | p50 ms | p95 ms | tok in | tok out | calls | cost USD | violations |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of summaries) {
    lines.push(
      [
        s.provider,
        s.domain,
        String(s.scored),
        String(s.passed),
        String(s.failed),
        s.passRate === null ? 'n/a' : pct(s.passRate),
        s.brier === null ? 'n/a' : n3(s.brier),
        s.ece === null ? 'n/a' : n3(s.ece),
        String(s.latency.p50),
        String(s.latency.p95),
        String(s.tokens.input),
        String(s.tokens.output),
        String(s.tokens.calls),
        s.costUsd === null ? 'n/a' : `$${s.costUsd.toFixed(6)}`,
        String(s.schemaViolations.count),
      ].join(' | '),
    );
  }
  lines.push('');
  lines.push('## Disagreements vs expectations.json');
  lines.push('');
  const anyDisagreements = summaries.some((s) => s.disagreements.length > 0);
  if (!anyDisagreements) {
    lines.push('None. Every scored record matched the expectation.');
  } else {
    for (const s of summaries) {
      if (s.disagreements.length === 0) continue;
      lines.push(`### ${s.provider}/${s.domain}`);
      lines.push('');
      for (const d of s.disagreements) lines.push(`- ${d}`);
      lines.push('');
    }
  }
  lines.push('## Notes');
  lines.push('');
  lines.push(
    '- Cost for `jev-latest` priced at $0.042/Mtok input, output free (docs.typesafe.ai/models, verified 2026-09-18).',
  );
  lines.push(
    '- Calibration columns (Brier/ECE) score stated confidence against fixture outcomes; interpret per the plan: fixture scoring is agreement, the synthetic probe battery carries the calibration claim.',
  );
  return `${lines.join('\n')}\n`;
}

export { resultsDirFor };