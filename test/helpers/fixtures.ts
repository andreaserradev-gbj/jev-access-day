import type { CheckoutFixture } from '../../src/checkout/state.js';
import bureauContradictionJson from '../../fixtures/checkouts/bureau-contradiction.json' with { type: 'json' };
import cleanRepeatBuyerJson from '../../fixtures/checkouts/clean-repeat-buyer.json' with { type: 'json' };

export const cleanRepeatBuyer = cleanRepeatBuyerJson as unknown as CheckoutFixture;
export const bureauContradiction = bureauContradictionJson as unknown as CheckoutFixture;