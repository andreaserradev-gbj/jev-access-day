/**
 * DOMAIN 1: CI test-failure triage.
 *
 * Input: one Jest failure record (the shape CI systems emit).
 * State: a compact JSON digest the questions can point at by path.
 *
 * Fixtures are modeled on the scalapay-products-service e2e suites
 * (error-contract tests pinning 4xx bodies, Kafka/MySQL infra, outbox),
 * but they are DATA here — copied shapes, no imports.
 */

export interface JestFailure {
  scenario: string;
  suite: string;
  testName: string;
  expected: {
    status?: number;
    errorName?: string;
    body?: unknown;
  };
  received: {
    status?: number;
    errorName?: string;
    body?: unknown;
    stackExcerpt?: string;
  };
  ciRetryCount: number;
  lastCommits: string[];
  /** CI environment notes: node version, db healthy, broker healthy... */
  environment?: Record<string, string | boolean>;
}

export function buildTriageState(failure: JestFailure): Record<string, unknown> {
  return {
    scenario: failure.scenario,
    test: {
      suite: failure.suite,
      name: failure.testName,
    },
    expected: failure.expected,
    received: failure.received,
    ci: {
      retry_count: failure.ciRetryCount,
    },
    recent_commits: failure.lastCommits,
    ...(failure.environment ? { environment: failure.environment } : {}),
  };
}