import type { Questions } from '../typesafe/client.js';

/**
 * The dunning question set. Four atomic judgments about cause, standing,
 * worth, and harm — all questions a dunning operator asks when reading a
 * bounce. WHEN to act is not a question for the model: the schedule is
 * fixture data and the kernel owns the timing arithmetic.
 */
export const DUNNING_QUESTIONS: Questions = {
  bounce_cause: {
    type: 'choice',
    instructions:
      'What is the most probable cause of this debit bounce, judging `bounce` (bank return code, mandate events), `customer` payment history, and `schedule`?',
    criteria: {
      transient_funds: 'Insufficient funds / timing slip on an otherwise healthy mandate',
      mandate_revoked: 'The customer or bank revoked or disputed the mandate itself',
      account_closed: 'The bank account behind the mandate no longer exists',
      technical: 'Processor/bank outage or schema-level rejection, not customer behavior',
    },
  },
  customer_standing: {
    type: 'choice',
    instructions:
      'Given `customer` (tenure, successful payments, prior bounces) and `history`, how is this customer standing overall?',
    criteria: {
      good: 'Established, paying reliably; this bounce is out of character',
      strained: 'Real distress signals: repeated bounces or short tenure with missed payments',
      unknown: 'Too little history to judge',
    },
  },
  retry_worthwhile: {
    type: 'noul',
    instructions:
      'If the same debit is retried on a later date, is success plausible — i.e. is the bounce plausibly transient given `bounce`, `customer`, and `history`?',
    criteria: {
      true: 'Cause reads transient or one-off; a later retry can succeed',
      false: 'Cause is structural (mandate revoked, account closed); retry would bounce again',
    },
  },
  schedule_cascade_risk: {
    type: 'choice',
    instructions:
      'Judging `schedule` (due dates clustering, remaining installments) and the bounce, what is the near-term risk that further failures cascade fees?',
    criteria: {
      low: 'Well-separated due dates, small amounts, healthy history',
      moderate: 'One more installment due soon, or mild history strain',
      high: 'Multiple installments due within days, large amounts, or prior bounces stacking',
    },
  },
} as const;

/** The question ids dunning's decide() consumes. */
export type DunningQuestionId = keyof typeof DUNNING_QUESTIONS;