/**
 * DOMAIN 3: installment direct-debit dunning (the "when" domain).
 *
 * Input: one bounced installment debit record (the shape a payments ledger
 * emits). State: a compact JSON digest the questions can point at by path.
 *
 * The temporal inputs — attempts so far, days until the next scheduled
 * debit, whether a valid alternative method exists — are FIXTURE DATA,
 * never model judgment. The model judges cause/standing/worthwhile/harm;
 * the kernel decides what to do and WHEN to do it.
 */

export interface DunningFixture {
  scenario: string;
  installment: {
    installmentId: string;
    amountUsd: number;
    installmentIndex: number;
    totalInstallments: number;
  };
  bounce: {
    occurredAt: string;
    bankReturnCode: string;
    bankReturnMessage: string;
    /** Attempts including this bounce: 1 = first bounce, 2 = a retry already failed. */
    attemptsIncludingThis: number;
    /** Evidence a mandate itself is broken (revocation receipts, bank notices). */
    mandateEvents?: string[];
  };
  customer: {
    name: string;
    sinceDays: number;
    priorSuccessfulPayments: number;
    priorBouncesLast6m: number;
    /** Alternative instrument on file, e.g. "card_ending_4421"; null when none. */
    alternativeMethodOnFile: string | null;
    /** False when the alternative exists but is expired/unverifiable — evidence in the fixture. */
    alternativeMethodValid: boolean;
    contactNote?: string;
  };
  schedule: {
    nextDueDate: string;
    nextDueInDays: number;
    remainingInstallments: number;
    nextAmountUsd: number;
    /** Installments due in the next 14 days — cluster evidence for fee-cascade risk. */
    dueWithin14d: number;
  };
  /** Customer-history evidence block, same pattern as triage's history. */
  history?: Record<string, string | number>;
}

/** The temporal context the kernel consumes — fixture data, not model output. */
export interface DunningTemporal {
  attemptsIncludingThis: number;
  nextDueInDays: number;
  hasValidAlternativeMethod: boolean;
  installmentsDueWithin14d: number;
}

export function dunningTemporalFromFixture(fixture: DunningFixture): DunningTemporal {
  return {
    attemptsIncludingThis: fixture.bounce.attemptsIncludingThis,
    nextDueInDays: fixture.schedule.nextDueInDays,
    hasValidAlternativeMethod:
      fixture.customer.alternativeMethodOnFile !== null &&
      fixture.customer.alternativeMethodValid,
    installmentsDueWithin14d: fixture.schedule.dueWithin14d,
  };
}

export function buildDunningState(fixture: DunningFixture): Record<string, unknown> {
  return {
    scenario: fixture.scenario,
    installment: fixture.installment,
    bounce: fixture.bounce,
    customer: {
      name: fixture.customer.name,
      since_days: fixture.customer.sinceDays,
      prior_successful_payments: fixture.customer.priorSuccessfulPayments,
      prior_bounces_last_6m: fixture.customer.priorBouncesLast6m,
      alternative_method_on_file: fixture.customer.alternativeMethodOnFile,
      alternative_method_valid: fixture.customer.alternativeMethodValid,
      ...(fixture.customer.contactNote ? { contact_note: fixture.customer.contactNote } : {}),
    },
    schedule: fixture.schedule,
    ...(fixture.history ? { history: fixture.history } : {}),
  };
}