import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChoiceAnswer, NoulAnswer, ScoreAnswer } from '../typesafe/client.js';
import { EXPECTATIONS } from './expectations.js';
import { TRIAGE_QUESTIONS } from '../triage/questions.js';
import { DUNNING_QUESTIONS } from '../dunning/questions.js';
import { PR_REVIEW_QUESTIONS } from '../prreview/questions.js';
import { PRE_BUREAU_QUESTIONS, SYNTHESIS_QUESTIONS } from '../checkout/questions.js';
import { RUN_RECORD_SCHEMA_VERSION, type EvalDomain, type RunFilePayload, type RunRecord } from './run-record.js';

/**
 * The adjudication view: per-scenario × per-question comparison of every
 * provider against the mock anchor (mock == expectations by construction),
 * built offline from persisted run files — zero provider calls.
 */

const PROVIDER_ORDER = ['mock', 'real', 'llm', 'llm-local'] as const;

const DOMAIN_QUESTIONS: Record<EvalDomain, string[]> = {
  triage: Object.keys(TRIAGE_QUESTIONS),
  dunning: Object.keys(DUNNING_QUESTIONS),
  prreview: Object.keys(PR_REVIEW_QUESTIONS),
  checkout: [...Object.keys(PRE_BUREAU_QUESTIONS), ...Object.keys(SYNTHESIS_QUESTIONS)],
};

interface ScenarioCell {
  text: string;
  matchesExpected: boolean;
}

function loadPayloads(dir: string): RunFilePayload[] {
  const files = readdirSync(dir).filter((f) => /^run-.+-run\d+\.json$/.test(f));
  return files
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RunFilePayload)
    .filter((p) => p.schemaVersion === RUN_RECORD_SCHEMA_VERSION);
}

function modal<T>(values: T[]): { value: T; n: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<string, { value: T; n: number }>();
  for (const v of values) {
    const key = JSON.stringify(v);
    const entry = counts.get(key) ?? { value: v, n: 0 };
    entry.n += 1;
    counts.set(key, entry);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0]!;
  return { value: best.value, n: best.n };
}

function answerSet(record: RunRecord): Record<string, unknown> {
  if (record.domain === 'checkout') {
    return record.stage3Answers !== null
      ? { ...record.stage1Answers, ...record.stage3Answers }
      : { ...record.stage1Answers };
  }
  return (record as { answers: Record<string, unknown> }).answers;
}

function questionCell(records: RunRecord[], id: string): string {
  const answers = records
    .map((r) => answerSet(r)[id] as ChoiceAnswer | NoulAnswer | ScoreAnswer | undefined)
    .filter((a) => a !== undefined);
  if (answers.length === 0) return '—';
  if (answers[0]!.type === 'noul') {
    const mean = (answers as NoulAnswer[]).reduce((s, a) => s + a.noul, 0) / answers.length;
    return mean.toFixed(2);
  }
  if (answers[0]!.type === 'score') {
    const scores = answers as ScoreAnswer[];
    const meanScore = scores.reduce((s, a) => s + a.score, 0) / scores.length;
    const meanConf = scores.reduce((s, a) => s + a.confidence, 0) / scores.length;
    return `${meanScore.toFixed(2)} c${meanConf.toFixed(2)}`;
  }
  const choices = answers as ChoiceAnswer[];
  const mod = modal(choices.map((a) => a.choice));
  if (!mod) return '—';
  const sameChoice = choices.filter((a) => a.choice === mod.value);
  const meanConf = sameChoice.reduce((s, a) => s + a.confidence, 0) / sameChoice.length;
  const agreement = sameChoice.length === choices.length ? '' : ` (${sameChoice.length}/${choices.length})`;
  return `${mod.value} ${meanConf.toFixed(2)}${agreement}`;
}

function actionCell(domain: EvalDomain, records: RunRecord[]): ScenarioCell {
  const first = records[0]!;
  const texts = records.map((r) => {
    if (domain === 'triage' || domain === 'dunning') {
      const rec = r as { action: string; waitDays?: number };
      return domain === 'dunning' ? `${rec.action} (${rec.waitDays}d)` : String(rec.action);
    }
    if (domain === 'prreview') {
      const rec = r as { action: string; finalAction: string; reviewerChain: { verdict: string; confidence: number } | null };
      const chain = rec.reviewerChain ? ` ⇡${rec.reviewerChain.verdict}@${rec.reviewerChain.confidence}` : '';
      return rec.finalAction === rec.action ? `${rec.action}${chain}` : `${rec.finalAction} [${rec.action}${chain}]`;
    }
    const rec = r as { stage1Route: string; finalAction: string | null };
    const route = rec.stage1Route;
    const action = rec.finalAction;
    return action === null || route === 'bureau_call'
      ? String(action ?? route)
      : `${action} [${route}]`;
  });
  const mod = modal(texts);
  if (!mod) return { text: '—', matchesExpected: false };
  const exp = EXPECTATIONS[domain][first.scenario];
  const expectedText = exp === undefined
    ? ''
    : 'stage1Route' in exp
      ? `${exp.finalAction} [${exp.stage1Route}]`
      : exp.action;
  const normal = (s: string): string => s.replace(/ \[.*\]/, '').replace(/ \(\d+d\)/, '').replace(/ ⇡.*/, '');
  return {
    text: `${mod.value}${mod.n < records.length ? ` (${mod.n}/${records.length})` : ''}`,
    matchesExpected: normal(mod.value) === normal(expectedText),
  };
}

function expectedCell(domain: EvalDomain, scenario: string): string {
  const exp = EXPECTATIONS[domain][scenario];
  if (!exp) return '—';
  return 'stage1Route' in exp ? `${exp.finalAction} [${exp.stage1Route}]` : exp.action;
}

export function buildComparison(dir: string): { markdown: string; domains: EvalDomain[] } {
  const payloads = loadPayloads(dir);
  if (payloads.length === 0) throw new Error(`no run-*.json files in ${dir}`);

  const byDomain = new Map<EvalDomain, Map<string, Map<string, RunRecord[]>>>();
  for (const payload of payloads) {
    const domain = byDomain.get(payload.domain) ?? new Map();
    byDomain.set(payload.domain, domain);
    for (const record of payload.records) {
      const byScenario = domain.get(record.scenario) ?? new Map();
      domain.set(record.scenario, byScenario);
      const byProvider = byScenario.get(payload.provider) ?? [];
      byProvider.push(record);
      byScenario.set(payload.provider, byProvider);
    }
  }

  const lines: string[] = [];
  lines.push(`# Provider comparison — ${dir}`);
  lines.push('');
  lines.push('Offline from persisted run-*.json (mock column = anchor: mock answers are engineered to pass every expectation).');
  lines.push('');
  const domains = [...byDomain.keys()].sort();
  for (const domain of domains) {
    const scenarios = byDomain.get(domain)!;
    const providers = [...new Set(payloads.filter((p) => p.domain === domain).map((p) => p.provider))]
      .sort((a, b) => PROVIDER_ORDER.indexOf(a) - PROVIDER_ORDER.indexOf(b));

    lines.push(`## ${domain} — decisions`);
    lines.push('');
    lines.push(`| scenario | expected | ${providers.join(' | ')} |`);
    lines.push(`|---|---|${providers.map(() => '---').join('|')}|`);
    for (const [scenario, byProvider] of [...scenarios.entries()]) {
      const cells = providers.map((provider) => {
        const records = byProvider.get(provider) ?? [];
        if (records.length === 0) return '—';
        const cell = actionCell(domain, records);
        return cell.matchesExpected ? cell.text : `**${cell.text}**`;
      });
      lines.push(`| ${scenario} | ${expectedCell(domain, scenario)} | ${cells.join(' | ')} |`);
    }
    lines.push('');
    lines.push(`Agreement vs expected — ${providers.map((p) => {
      const rows = [...scenarios.entries()].filter(([, byProvider]) => (byProvider.get(p) ?? []).length > 0);
      const hits = rows.filter(([, byProvider]) => actionCell(domain, byProvider.get(p)!).matchesExpected).length;
      return `${p} ${hits}/${rows.length}`;
    }).join(', ')}`);
    lines.push('');

    const questionIds = DOMAIN_QUESTIONS[domain];
    if (questionIds.length > 0) {
      lines.push(`## ${domain} — question-level answers`);
      lines.push('');
      lines.push(`| scenario | question | ${providers.join(' | ')} |`);
      lines.push(`|---|---|${providers.map(() => '---').join('|')}|`);
      for (const [scenario, byProvider] of [...scenarios.entries()]) {
        for (const id of questionIds) {
          const cells = providers.map((provider) =>
            questionCell(byProvider.get(provider) ?? [], id),
          );
          lines.push(`| ${scenario} | ${id} | ${cells.join(' | ')} |`);
        }
      }
      lines.push('');
    }
  }
  return { markdown: `${lines.join('\n')}\n`, domains };
}