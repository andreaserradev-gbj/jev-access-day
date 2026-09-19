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
  /** Test-source snippet the CI record can attach, if the runner captures it. */
  testSourceExcerpt?: string;
  /** CI history: flake counts, rerun outcomes — evidence for flake judgments. */
  history?: Record<string, string | number>;
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
    ...(failure.testSourceExcerpt ? { test_source: failure.testSourceExcerpt } : {}),
    ...(failure.history ? { history: failure.history } : {}),
    ...(failure.environment ? { environment: failure.environment } : {}),
    // Open forwarding: any extra evidence block on the fixture (impact,
    // testPractice, flakeRegistry, ...) rides along verbatim. Evidence the
    // fixture carries must reach the model — a dropped block silently
    // invalidates every conclusion drawn from the run.
    ...Object.fromEntries(
      Object.entries(failure).filter(
        ([key]) =>
          ![
            'scenario',
            'suite',
            'testName',
            'expected',
            'received',
            'ciRetryCount',
            'lastCommits',
            'testSourceExcerpt',
            'history',
            'environment',
          ].includes(key),
      ),
    ),
  };
}