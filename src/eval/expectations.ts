import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FinalAction, Stage1Route } from '../checkout/decide.js';
import type { TriageAction } from '../triage/decide.js';

/**
 * Ground truth for the eval: the expected decision per fixture, shared by the
 * unit tests (they assert mock answers route to these) and the eval harness
 * (it scores provider answers against these). One source of truth — edit the
 * JSON, both consumers follow.
 *
 * The `because` field is documentation: it states the threshold arithmetic
 * that pins the expectation, so a future threshold change in decide.ts shows
 * up as an eval failure with a readable explanation instead of a mystery.
 */

export interface TriageExpectation {
  action: TriageAction;
  because: string;
}

export interface CheckoutExpectation {
  stage1Route: Stage1Route;
  finalAction: FinalAction;
  because: string;
}

export interface Expectations {
  triage: Record<string, TriageExpectation>;
  checkout: Record<string, CheckoutExpectation>;
}

/**
 * Loaded relative to this module, so it works both from vitest (src) and from
 * compiled dist (dist/eval/expectations.js → ../../fixtures).
 */
function loadExpectations(): Expectations {
  const path = fileURLToPath(new URL('../../fixtures/expectations.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as Expectations;
}

export const EXPECTATIONS: Expectations = loadExpectations();

export function triageExpectation(scenario: string): TriageExpectation {
  const entry = EXPECTATIONS.triage[scenario];
  if (!entry) throw new Error(`no triage expectation for scenario "${scenario}"`);
  return entry;
}

export function checkoutExpectation(scenario: string): CheckoutExpectation {
  const entry = EXPECTATIONS.checkout[scenario];
  if (!entry) throw new Error(`no checkout expectation for scenario "${scenario}"`);
  return entry;
}