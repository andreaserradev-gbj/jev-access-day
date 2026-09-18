import type { Answers, SystemOneClient } from '../typesafe/client.js';
import {
  buildCheckoutState,
  buildSynthesisState,
  MockBureau,
  type CheckoutFixture,
} from './state.js';
import { PRE_BUREAU_QUESTIONS, SYNTHESIS_QUESTIONS } from './questions.js';
import {
  decideStage1,
  decideStage3,
  type FinalAction,
  type Stage1Route,
} from './decide.js';

export interface CascadeResult {
  scenario: string;
  stage1Route: Stage1Route;
  stage1Rationale: string[];
  /** Full typed stage-1 answers, for eval run records. */
  stage1Answers: Answers;
  bureauCalled: boolean;
  finalAction: FinalAction | null;
  finalRationale: string[];
  /** Full typed stage-3 answers; null when stage 1 decided alone. */
  stage3Answers: Answers | null;
  evApproveUsd: number | null;
  pFraudEstimate: number | null;
  stage1Usage: { elapsedMs: number; calls: number; inputTokens: number; outputTokens: number };
  stage3Usage: { elapsedMs: number; calls: number; inputTokens: number; outputTokens: number } | null;
  bureauLatencyMs: number | null;
  /** Model id reported by the provider surface, verbatim (alias-resolved for real). */
  stage1ResponseModel?: string;
}

/**
 * The orchestration: code owns the control flow. Jev is invoked twice at most,
 * the bureau at most once — and never when stage 1 is decisive.
 */
export async function runCascade(
  client: SystemOneClient,
  fixture: CheckoutFixture,
): Promise<CascadeResult> {
  const bureau = new MockBureau();
  const checkout = fixture.checkout;

  const stage1Response = await client.ask({
    state: buildCheckoutState(checkout),
    questions: PRE_BUREAU_QUESTIONS,
  });
  const stage1 = decideStage1(stage1Response.answers);

  const stage1Usage = {
    elapsedMs: stage1Response.usage.elapsedMs,
    calls: stage1Response.usage.calls,
    inputTokens: stage1Response.usage.inputTokens,
    outputTokens: stage1Response.usage.outputTokens,
  };

  if (stage1.route === 'approve_fast_path' || stage1.route === 'decline_fast_path') {
    return {
      scenario: checkout.scenario,
      stage1Route: stage1.route,
      stage1Rationale: stage1.rationale,
      stage1Answers: stage1Response.answers,
      bureauCalled: false,
      finalAction: stage1.route === 'approve_fast_path' ? 'approve' : 'decline',
      finalRationale: [...stage1.rationale, 'decided at stage 1: synthesis not needed'],
      stage3Answers: null,
      evApproveUsd: null,
      pFraudEstimate: null,
      stage1Usage,
      stage3Usage: null,
      bureauLatencyMs: null,
      ...(stage1Response.model === undefined
        ? {}
        : { stage1ResponseModel: stage1Response.model }),
    };
  }

  const bureauResponse = await bureau.query(checkout);

  const stage3Response = await client.ask({
    state: buildSynthesisState(
      checkout,
      bureauResponse,
      stage1Response.answers as unknown as Record<string, unknown>,
    ),
    questions: SYNTHESIS_QUESTIONS,
  });
  const stage3 = decideStage3(stage3Response.answers, fixture.economics);

  return {
    scenario: checkout.scenario,
    stage1Route: stage1.route,
    stage1Rationale: stage1.rationale,
    stage1Answers: stage1Response.answers,
    bureauCalled: true,
    finalAction: stage3.action,
    finalRationale: [...stage1.rationale, ...stage3.rationale],
    stage3Answers: stage3Response.answers,
    evApproveUsd: stage3.evApproveUsd,
    pFraudEstimate: stage3.pFraudEstimate,
    stage1Usage,
    stage3Usage: {
      elapsedMs: stage3Response.usage.elapsedMs,
      calls: stage3Response.usage.calls,
      inputTokens: stage3Response.usage.inputTokens,
      outputTokens: stage3Response.usage.outputTokens,
    },
    bureauLatencyMs: bureauResponse.latencyMs,
    ...(stage1Response.model === undefined
      ? {}
      : { stage1ResponseModel: stage1Response.model }),
  };
}