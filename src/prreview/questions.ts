import type { Questions } from '../typesafe/client.js';

/**
 * The PR-review question set. Four atomic judgments about exposure,
 * triviality, runtime blast radius, and mechanical soundness — all
 * questions a security reviewer asks when triaging an automated bump.
 * The final approve/reject/escalate taxonomy is the kernel's, not the model's.
 */
export const PR_REVIEW_QUESTIONS: Questions = {
  attack_path_exposure: {
    type: 'choice',
    instructions:
      'Judging `dependency.advisories` and `dependency.usage_notes`, how reachable is the vulnerable API in OUR usage — not in theory?',
    criteria: {
      none: 'Vulnerable code path never invoked in our usage, or the advisory does not apply',
      indirect: 'Reachable only through an uncommon path (rare input, admin-only flow, disabled feature)',
      direct: 'Vulnerable API sits on a routine request path handling untrusted input',
    },
  },
  semver_triviality: {
    type: 'choice',
    instructions:
      'Judging `dependency.bumpClass`, the version jump, and `pr.filesChanged`, how mechanically trivial is this bump?',
    criteria: {
      trivial: 'Patch/minor bump, no API surface touched, diff is lockfile + metadata',
      routine: 'Minor with small adapter changes; API surface stable',
      breaking: 'Major bump or wide-reaching API changes in the diff',
    },
  },
  runtime_code_touched: {
    type: 'noul',
    instructions:
      'Do `pr.filesChanged` include paths that execute at request runtime (handlers, middleware, query builders), rather than only docs, types, tests, or CI config?',
    criteria: {
      true: 'At least one changed path runs in the request path',
      false: 'Changes are confined to docs/types/tests/CI/lockfile',
    },
  },
  change_soundness: {
    type: 'choice',
    instructions:
      'Judging `repo` (lockfile state, CI status) and the diff, how mechanically sound is the change set as shipped?',
    criteria: {
      sound: 'Lockfile consistent, CI green, diff coherent',
      sloppy: 'Lockfile inconsistent, CI red or pending, or incoherent diff',
    },
  },
} as const;

/** The question ids decidePr() consumes. */
export type PrReviewQuestionId = keyof typeof PR_REVIEW_QUESTIONS;