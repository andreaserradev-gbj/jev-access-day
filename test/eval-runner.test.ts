import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildReportMarkdown,
  modelMetadataFor,
  resolveMaxRequests,
  resultsDirFor,
  runEval,
  SpendCapError,
} from '../src/eval/runner.js';
import { assertSafeTag, CSV_HEADER } from '../src/eval/run-record.js';
import type { ProviderName } from '../src/typesafe/index.js';

const MOCK_ENV: NodeJS.ProcessEnv = { TYPESAFE_PROVIDER: 'mock' };

function tempBase(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eval-test-'));
  return join(dir, 'results');
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

describe('resolveMaxRequests', () => {
  it('unset means no cap; override wins; malformed throws', () => {
    expect(resolveMaxRequests({})).toBe(Number.POSITIVE_INFINITY);
    expect(resolveMaxRequests({ EVAL_MAX_REQUESTS: '  ' })).toBe(Number.POSITIVE_INFINITY);
    expect(resolveMaxRequests({ EVAL_MAX_REQUESTS: '50' })).toBe(50);
    expect(resolveMaxRequests({ EVAL_MAX_REQUESTS: '50' }, 10)).toBe(10);
    expect(() => resolveMaxRequests({ EVAL_MAX_REQUESTS: '0' })).toThrow(/positive/);
    expect(() => resolveMaxRequests({ EVAL_MAX_REQUESTS: '-3' })).toThrow(/positive/);
    expect(() => resolveMaxRequests({ EVAL_MAX_REQUESTS: 'abc' })).toThrow(/positive/);
  });
});

describe('modelMetadataFor', () => {
  it('mock → mock; llm reads OLLAMA_MODEL; real reads TYPESAFE_DEFAULT_MODEL', () => {
    expect(modelMetadataFor('mock', {})).toEqual({ model: 'mock' });
    const llm = modelMetadataFor('llm', { OLLAMA_MODEL: 'test-model', OLLAMA_SAMPLES: '2' });
    expect(llm.model).toBe('test-model');
    expect(llm.samples).toBe(2);
    expect(modelMetadataFor('real', {}).model).toBe('jev-latest');
    expect(modelMetadataFor('real', { TYPESAFE_DEFAULT_MODEL: 'jev-beta' }).model).toBe('jev-beta');
  });
});

describe('assertSafeTag + resultsDirFor tag', () => {
  it('accepts lowercase/digit/dash tags, rejects path tricks', () => {
    expect(() => assertSafeTag('postfix')).not.toThrow();
    expect(() => assertSafeTag('wave-2')).not.toThrow();
    expect(() => assertSafeTag('')).toThrow(/invalid/);
    expect(() => assertSafeTag('../escape')).toThrow(/invalid/);
    expect(() => assertSafeTag('Post Fix')).toThrow(/invalid/);
  });

  it('tag suffix lands in a separate dated directory', () => {
    const date = new Date('2026-09-18T10:00:00Z');
    expect(resultsDirFor(date, 'results')).toBe(join('results', '2026-09-18'));
    expect(resultsDirFor(date, 'results', 'postfix')).toBe(join('results', '2026-09-18-postfix'));
  });
});

describe('runEval (mock provider, temp dir)', () => {
  it('produces run files + csv + report for 1 run over both domains', async () => {
    const base = tempBase();
    try {
      const result = await runEval({
        providers: ['mock' as ProviderName],
        runs: 1,
        domains: ['triage', 'checkout'],
        env: MOCK_ENV,
        baseDir: base,
        date: new Date('2026-09-18T10:00:00Z'),
      });

      expect(result.dir).toBe(join(base, '2026-09-18'));
      expect(result.runFiles).toHaveLength(2);
      expect(result.records).toHaveLength(12);
      const files = readdirSync(result.dir).sort();
      expect(files).toEqual([
        'report.md',
        'results.csv',
        'run-mock-checkout-run0.json',
        'run-mock-triage-run0.json',
      ]);

      const runFile = JSON.parse(readFileSync(result.runFiles[0]!, 'utf8')) as {
        schemaVersion: number;
        provider: string;
        domain: string;
        records: Array<{ scenario: string; answers?: unknown }>;
      };
      expect(runFile.schemaVersion).toBe(1);
      expect(runFile.provider).toBe('mock');

      const csv = readFileSync(result.csvFile, 'utf8');
      expect(csv.startsWith(`${CSV_HEADER.join(',')}\n`)).toBe(true);
      expect(csv.trimEnd().split('\n')).toHaveLength(13);

      const report = readFileSync(result.reportFile, 'utf8');
      expect(report).toContain('# Eval report — 2026-09-18');
      expect(report).toContain('mock | triage');
      expect(report).toContain('mock | checkout');
      expect(report).toContain('None. Every scored record matched the expectation.');

      // 6 triage + 4 bureau-path checkouts × 2 stage asks = 6 + 10 = 16 provider asks.
      expect(result.requestsMade).toBe(16);
    } finally {
      cleanup(base);
    }
  });

  it('writes into the tagged results dir when a tag is set', async () => {
    const base = tempBase();
    try {
      const result = await runEval({
        providers: ['mock' as ProviderName],
        runs: 1,
        domains: ['triage'],
        env: MOCK_ENV,
        baseDir: base,
        tag: 'postfix',
        date: new Date('2026-09-18T10:00:00Z'),
      });
      expect(result.dir).toBe(join(base, '2026-09-18-postfix'));
      expect(result.runFiles).toHaveLength(1);
    } finally {
      cleanup(base);
    }
  });

  it('respects --runs and domain filters', async () => {
    const base = tempBase();
    try {
      const result = await runEval({
        providers: ['mock' as ProviderName],
        runs: 2,
        domains: ['triage'],
        env: MOCK_ENV,
        baseDir: base,
        date: new Date('2026-09-18T10:00:00Z'),
      });
      expect(result.runFiles).toHaveLength(2);
      expect(result.records).toHaveLength(12);
      expect(result.requestsMade).toBe(12);
      const csvLines = readFileSync(result.csvFile, 'utf8').trimEnd().split('\n');
      expect(csvLines).toHaveLength(13);
    } finally {
      cleanup(base);
    }
  });

  it('the spend cap aborts before the cap is exceeded and reports requests made', async () => {
    const base = tempBase();
    try {
      // Cap of 14 aborts partway through the checkout domain (6 triage + 8 of 10 checkout asks).
      await expect(
        runEval({
          providers: ['mock' as ProviderName],
          runs: 1,
          domains: ['triage', 'checkout'],
          env: MOCK_ENV,
          baseDir: base,
          maxRequests: 14,
          date: new Date('2026-09-18T10:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(SpendCapError);
    } finally {
      cleanup(base);
    }
  });

  it('a cap exactly equal to the request count lets the run finish', async () => {
    const base = tempBase();
    try {
      const result = await runEval({
        providers: ['mock' as ProviderName],
        runs: 1,
        domains: ['triage'],
        env: MOCK_ENV,
        baseDir: base,
        maxRequests: 6,
        date: new Date('2026-09-18T10:00:00Z'),
      });
      expect(result.requestsMade).toBe(6);
      expect(result.records).toHaveLength(6);
    } finally {
      cleanup(base);
    }
  });
});

describe('buildReportMarkdown', () => {
  it('renders disagreements sections when expectations are violated', () => {
    const md = buildReportMarkdown(
      [
        {
          provider: 'llm',
          domain: 'triage',
          total: 2,
          scored: 2,
          passed: 1,
          failed: 1,
          passRate: 0.5,
          brier: 0.25,
          ece: 0.1,
          latency: { p50: 900, p95: 1200, mean: 1000, max: 1200 },
          tokens: { input: 10, output: 20, calls: 2 },
          costUsd: null,
          schemaViolations: { count: 1, details: ['x'] },
          disagreements: ['bad-test (action needs_human ≠ fix_test)'],
        },
      ],
      {
        providers: ['llm'],
        runs: 1,
        domains: ['triage'],
        date: new Date('2026-09-18T10:00:00Z'),
        totalRecords: 2,
      },
    );
    expect(md).toContain('### llm/triage');
    expect(md).toContain('- bad-test (action needs_human ≠ fix_test)');
    expect(md).not.toContain('None. Every scored record');
    expect(md).toContain('$0.042/Mtok input');
  });
});