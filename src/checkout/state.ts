/**
 * DOMAIN 2: fintech checkout-risk cascade.
 *
 * Stage 1: Jev pre-bureau triage on session/profile text.
 *   clear + confident  -> APPROVE  (bureau skipped — the money metric)
 *   suspicious + confident -> DECLINE path
 *   otherwise          -> bureau call
 * Stage 2: bureau (mocked, deterministic, latency-simulated).
 * Stage 3: Jev post-bureau synthesis -> final action via EV + confidence gates.
 */

export interface CheckoutRequest {
  scenario: string;
  order: {
    totalUsd: number;
    itemCount: number;
    items: string[];
    fulfilment: 'shipping' | 'bopis';
  };
  profile: {
    accountAgeDays: number;
    lifetimeOrders: number;
    lifetimeSpendUsd: number;
    name: string;
    addressCity: string;
    phoneVerified: boolean;
    emailDomain: string;
  };
  session: {
    device: string;
    ipCountry: string;
    shippedCountry: string;
    enteredCardManually: boolean;
    minutesOnSite: number;
  };
  context: {
    scheduledDeliveriesToday: string[];
    promoAbuseFlagsLast90d: number;
  };
}

export interface BureauResponse {
  bureau: string;
  scoreBand: 'thin_file' | 'poor' | 'fair' | 'good' | 'excellent';
  bureauScore: number;
  delinquenciesLast24m: number;
  inquiriesLast30d: number;
  latencyMs: number;
}

export interface CheckoutFixture {
  checkout: CheckoutRequest;
  bureau?: BureauResponse;
  /** Economics used by the EV decide, per fixture (would be per-SKU in prod). */
  economics: {
    marginUsd: number;
    fraudLossUsd: number;
    ltvAtRiskUsd: number;
  };
}

export function buildCheckoutState(checkout: CheckoutRequest): Record<string, unknown> {
  return {
    scenario: checkout.scenario,
    order: checkout.order,
    customer: {
      account_age_days: checkout.profile.accountAgeDays,
      lifetime_orders: checkout.profile.lifetimeOrders,
      lifetime_spend_usd: checkout.profile.lifetimeSpendUsd,
      name: checkout.profile.name,
      address_city: checkout.profile.addressCity,
      phone_verified: checkout.profile.phoneVerified,
      email_domain: checkout.profile.emailDomain,
    },
    session: checkout.session,
    context: checkout.context,
  };
}

export function buildSynthesisState(
  checkout: CheckoutRequest,
  bureau: BureauResponse,
  stage1: Record<string, unknown>,
): Record<string, unknown> {
  return {
    scenario: `${checkout.scenario}`,
    order: checkout.order,
    customer: {
      account_age_days: checkout.profile.accountAgeDays,
      lifetime_orders: checkout.profile.lifetimeOrders,
      lifetime_spend_usd: checkout.profile.lifetimeSpendUsd,
      name: checkout.profile.name,
      address_city: checkout.profile.addressCity,
      phone_verified: checkout.profile.phoneVerified,
      email_domain: checkout.profile.emailDomain,
    },
    bureau: {
      score_band: bureau.scoreBand,
      score: bureau.bureauScore,
      delinquencies_last_24m: bureau.delinquenciesLast24m,
      inquiries_last_30d: bureau.inquiriesLast30d,
    },
    stage1_judgments: stage1,
  };
}

/** Deterministic mock bureau: no network, latency simulated, keyed by scenario. */
export class MockBureau {
  async query(checkout: CheckoutRequest): Promise<BureauResponse> {
    const latencyMs = 300 + Math.floor(Math.random() * 500);
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    const table: Record<string, Omit<BureauResponse, 'latencyMs'>> = {
      'clean-repeat-buyer': {
        bureau: 'mock-bureau',
        scoreBand: 'excellent',
        bureauScore: 812,
        delinquenciesLast24m: 0,
        inquiriesLast30d: 0,
      },
      'thin-file-new-customer': {
        bureau: 'mock-bureau',
        scoreBand: 'thin_file',
        bureauScore: 0,
        delinquenciesLast24m: 0,
        inquiriesLast30d: 2,
      },
      'stolen-card-pattern': {
        bureau: 'mock-bureau',
        scoreBand: 'fair',
        bureauScore: 610,
        delinquenciesLast24m: 3,
        inquiriesLast30d: 7,
      },
      'bopis-edge': {
        bureau: 'mock-bureau',
        scoreBand: 'good',
        bureauScore: 724,
        delinquenciesLast24m: 1,
        inquiriesLast30d: 1,
      },
      'bureau-contradiction': {
        bureau: 'mock-bureau',
        scoreBand: 'poor',
        bureauScore: 480,
        delinquenciesLast24m: 4,
        inquiriesLast30d: 5,
      },
      'ambiguous-checkout': {
        bureau: 'mock-bureau',
        scoreBand: 'fair',
        bureauScore: 655,
        delinquenciesLast24m: 1,
        inquiriesLast30d: 3,
      },
    };

    const entry = table[checkout.scenario];
    if (!entry) {
      throw new Error(`mock bureau: no response for scenario "${checkout.scenario}"`);
    }
    return { ...entry, latencyMs };
  }
}