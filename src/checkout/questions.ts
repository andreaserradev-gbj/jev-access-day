import type { Questions } from '../typesafe/client.js';

/**
 * Stage 1: pre-bureau fan-out. All questions speculative — asked before we
 * know whether they matter, because they are cheap and parallel.
 */
export const PRE_BUREAU_QUESTIONS: Questions = {
  fraud_signal_strength: {
    type: 'score',
    instructions:
      'How strong are the fraud signals across `session`, `order`, and `customer`? Judge signals, not outcomes: newness alone is mild, mismatch plus pressure is strong.',
    criteria: [
      'no signals: coherent profile, normal basket, expected geography',
      'mild signals: one soft inconsistency (new account, first order, minor mismatch)',
      'elevated: several soft signals or a notable mismatch',
      'strong: multiple hard signals (geo mismatch, card entry pattern, velocity)',
      'overwhelming: classic stolen-card fingerprint, act on it',
    ],
  },
  profile_consistency: {
    type: 'noul',
    instructions:
      'Do `customer.name`, `customer.address_city`, `customer.email_domain`, and `session.device` read as one coherent person rather than an assembled identity?',
    criteria: {
      true: 'Identity details cohere with the device and session story',
      false: 'Details look stitched together or contradictory',
    },
  },
  basket_anomaly: {
    type: 'noul',
    instructions:
      'Is `order` anomalous versus `customer.lifetime_orders`, `customer.lifetime_spend_usd`, and `order.fulfilment` — e.g. far larger baskets, resellable goods, rush patterns?',
  },
  risk_band: {
    type: 'choice',
    instructions:
      'Overall risk band for this checkout, weighing all signals and history holistically?',
    criteria: {
      clear: 'Approve without bureau: signals and history align',
      ambiguous: 'Not clear either way: needs external evidence (bureau) before acting',
      suspicious: 'Fraud indicators dominate: bureau adds little, act on this',
    },
  },
} as const;

/**
 * Stage 3: post-bureau synthesis. Asked only when stage 1 was ambiguous
 * and the bureau was called.
 */
export const SYNTHESIS_QUESTIONS: Questions = {
  bureau_consistent_with_history: {
    type: 'noul',
    instructions:
      'Is `bureau` consistent with the customer history and the stage-1 judgments in `stage1_judgments`? Contradictions (good score but distressed profile) are themselves a signal.',
  },
  affordability_signal: {
    type: 'score',
    instructions:
      'Judging `bureau`, `order.total_usd`, and `customer` history, how does affordability look for this purchase?',
    criteria: [
      'strong affordability: routine spend for this customer',
      'adequate: affordable, nothing unusual',
      'stretched: near the top of what this profile supports',
      'distressed: beyond it, or bureau shows distress signals',
    ],
  },
  final_action: {
    type: 'choice',
    instructions:
      'Given `bureau`, `order`, `customer`, and `stage1_judgments`, which action is most probable?',
    criteria: {
      approve: 'Risk and affordability are acceptable: complete the order',
      step_up: 'Plausible but unproven: require 3DS/OTP verification',
      review: 'Conflicting evidence: route to fraud analyst with the evidence table',
      decline: 'Evidence says block: refund path and log',
    },
  },
} as const;