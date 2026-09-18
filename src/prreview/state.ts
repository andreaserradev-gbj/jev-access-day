/**
 * DOMAIN 4: security PR review (the model-to-model escalation domain).
 *
 * Input: one Dependabot-style automated dependency-bump PR (the shape the
 * GitHub PR API emits). State: a compact JSON digest the questions can
 * point at by path.
 *
 * The escalation input — whether the bump touches runtime code paths, and
 * whether a lockfile is consistent — is FIXTURE DATA, never model judgment.
 * The model judges exposure/triviality/runtime-touch/consistency; the
 * kernel decides approve / reject / needs_human / needs_llm_review. When
 * it escalates, a stubbed reviewer LLM returns a typed verdict and the
 * chain is persisted in the run record.
 */

export interface PrFixture {
  scenario: string;
  pr: {
    number: number;
    title: string;
    author: string;
    /** Full diff summary the reviewer sees; paths + what changed. */
    filesChanged: Array<{
      path: string;
      change: string;
      /** False for docs/CI-only paths — evidence for runtime-touch judgment. */
      runtimeCode: boolean;
    }>;
    additions: number;
    deletions: number;
  };
  dependency: {
      name: string;
      fromVersion: string;
      toVersion: string;
      /** npm semver class of the bump — evidence, not judgment. */
      bumpClass: 'patch' | 'minor' | 'major';
      scope: 'prod' | 'dev';
      /** Direct dependency vs transitive (pulled in by another package). */
      transitive: boolean;
      advisories: Array<{
        id: string;
        severity: 'low' | 'moderate' | 'high' | 'critical';
        title: string;
        /** Attack path requires the vulnerable API to be reachable in our usage. */
        fixedIn: string;
      }>;
      /** Evidence lines for reachability: where/how we use the package. */
      usageNotes?: string[];
  };
  repo: {
    /** Lockfile state the bump leaves behind — evidence for consistency. */
    lockfileConsistent: boolean;
    ciStatus: 'green' | 'red' | 'pending';
    protectedBranch: boolean;
  };
  /** Reviewer-LLM stub table: verdicts keyed by scenario (no network). */
  reviewerVerdict?: {
    verdict: 'approve' | 'reject';
    confidence: number;
    rationale: string;
  };
}

/** Deterministic stub reviewer: typed verdict, no network, latency simulated. */
export class StubReviewerLlm {
  readonly name = 'stub-reviewer';
  async review(pr: PrFixture): Promise<{ verdict: 'approve' | 'reject'; confidence: number; rationale: string; latencyMs: number }> {
    const latencyMs = 200 + Math.floor(Math.random() * 300);
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
    const verdict = pr.reviewerVerdict;
    if (!verdict) {
      throw new Error(`stub reviewer: no reviewerVerdict for scenario "${pr.scenario}"`);
    }
    return { ...verdict, latencyMs };
  }
}

export function buildPrState(fixture: PrFixture): Record<string, unknown> {
  return {
    scenario: fixture.scenario,
    pr: fixture.pr,
    dependency: fixture.dependency,
    repo: fixture.repo,
  };
}