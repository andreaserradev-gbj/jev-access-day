import { describe, expect, it } from 'vitest';
import { decidePr, PR_THRESHOLDS, resolvePrEscalation } from '../src/prreview/decide.js';
import { StubReviewerLlm, type PrFixture } from '../src/prreview/state.js';
import { MOCK_ANSWERS } from '../src/typesafe/mock.js';
import { prReviewExpectation } from '../src/eval/expectations.js';
import type { Answers } from '../src/typesafe/client.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prScenarios = [
  'patch-lockfile-only',
  'minor-transitive-safe',
  'major-runtime-breaking',
  'direct-ssrf-untrusted',
  'gray-zone-reachable-admin',
  'unsound-lockfile-drift',
] as const;

function fixtureFor(scenario: string): PrFixture {
  return JSON.parse(
    readFileSync(join('fixtures', 'security-pr', `${scenario}.json`), 'utf8'),
  ) as PrFixture;
}

describe('prreview decide() — mock-anchored kernel routes', () => {
  for (const scenario of prScenarios) {
    it(`resolves ${scenario} to ${prReviewExpectation(scenario).action}`, async () => {
      const fixture = fixtureFor(scenario);
      const decision = decidePr(MOCK_ANSWERS[scenario] as Answers);
      // Grade the chain's terminal action the same way metrics.scoreRecord does:
      // needs_llm_review counts as met when the resolved final action matches.
      const resolved =
        decision.action === 'needs_llm_review' && fixture.reviewerVerdict !== undefined
          ? (await resolvePrEscalation(fixture, new StubReviewerLlm())).finalAction
          : decision.action;
      expect(resolved).toBe(prReviewExpectation(scenario).action);
    });
  }
});

describe('prreview escalation chain (model-to-model)', () => {
  it('gray-zone escalates and the reviewer verdict resolves to approve', async () => {
    const fixture = fixtureFor('gray-zone-reachable-admin');
    const decision = decidePr(
      MOCK_ANSWERS['gray-zone-reachable-admin'] as Answers,
    );
    expect(decision.action).toBe('needs_llm_review');
    const verdict = await resolvePrEscalation(fixture, new StubReviewerLlm());
    expect(verdict.verdict).toBe('approve');
    expect(verdict.confidence).toBeGreaterThanOrEqual(PR_THRESHOLDS.reviewerConfidenceGate);
    expect(verdict.finalAction).toBe('approve');
  });

  it('a low-confidence reviewer verdict degrades to needs_human, not approve', async () => {
    const fixture = fixtureFor('gray-zone-reachable-admin');
    const lowVerdict: PrFixture = {
      ...fixture,
      reviewerVerdict: { verdict: 'approve', confidence: 0.4, rationale: 'unsure' },
    };
    const verdict = await resolvePrEscalation(lowVerdict, new StubReviewerLlm());
    expect(verdict.finalAction).toBe('needs_human');
  });
});

describe('prreview kernel gates', () => {
  it('sloppy change sets reject before exposure is weighed', () => {
    const decision = decidePr(
      MOCK_ANSWERS['unsound-lockfile-drift'] as Answers,
    );
    expect(decision.rationale.join(' ')).toContain('unsound change set');
    expect(decision.reviewer).toBeNull();
  });

  it('direct untrusted-input exposure at the reject gate skips the reviewer', () => {
    const decision = decidePr(
      MOCK_ANSWERS['direct-ssrf-untrusted'] as Answers,
    );
    expect(decision.action).toBe('reject');
    expect(decision.reviewer).toBeNull();
  });

  it('never acts below the confidence floor', () => {
    const low = structuredClone(MOCK_ANSWERS['patch-lockfile-only']) as Answers;
    const exposure = low['attack_path_exposure'] as { confidence: number };
    exposure.confidence = 0.2;
    expect(
      decidePr(low).action,
    ).toBe('needs_human');
  });

  it('missing answers refuse to guess', () => {
    expect(
      decidePr({}).action,
    ).toBe('needs_human');
  });
});