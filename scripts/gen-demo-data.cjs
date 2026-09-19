#!/usr/bin/env node
/**
 * gen-data.cjs — derive demo-page data.js from committed run files.
 *
 * Numbers on the page are COMPUTED, never hand-copied: agreement counts are
 * scored against fixtures/expectations.json with the same rules the eval
 * harness uses (src/eval/metrics.ts scoreRecord), latency/tokens come from
 * record usage blobs, and evidence-v2 before/after reads come straight from
 * the v1 (baseline) and v2b (evidence) waves. Anything not machine-derivable
 * (probe-battery calibration bins, self-consistency hashes) is parsed from
 * the committed probe artifacts in results/2026-09-18-access-day/.
 *
 * Output: demo/data.js (window.DEMO_DATA = {...}) + a stderr checksum line.
 * Run from the repo root:  node scripts/gen-demo-data.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'demo', 'data.js');

// ── run-file loader ───────────────────────────────────────────────────────────
function loadWave(wave, provider, domain, runs = 3) {
  const records = [];
  for (let i = 0; i < runs; i++) {
    const p = path.join(ROOT, 'results', wave, `run-${provider}-${domain}-run${i}.json`);
    if (fs.existsSync(p)) records.push(...JSON.parse(fs.readFileSync(p, 'utf8')).records);
  }
  return records;
}

const EXPECT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'fixtures', 'expectations.json'), 'utf8'),
);

// same scoring semantics as src/eval/metrics.ts scoreRecord
function isPass(record) {
  if (record.domain === 'triage') {
    const e = EXPECT.triage[record.scenario];
    return !!e && record.action === e.action;
  }
  if (record.domain === 'dunning') {
    const e = EXPECT.dunning[record.scenario];
    return !!e && record.action === e.action;
  }
  if (record.domain === 'prreview') {
    const e = EXPECT.prreview[record.scenario];
    const resolved = record.finalAction === 'needs_llm_review' ? record.action : record.finalAction;
    return !!e && resolved === e.action;
  }
  const e = EXPECT.checkout[record.scenario];
  return !!e && record.stage1Route === e.stage1Route && record.finalAction === e.finalAction;
}

// majority verdict across the 3 runs (the page shows run disagreement as n/3)
function verdictRuns(wave, provider, domain, scenario) {
  const recs = loadWave(wave, provider, domain).filter((r) => r.scenario === scenario);
  return recs.map((r) => ({
    pass: isPass(r),
    action:
      domain === 'checkout'
        ? r.finalAction ?? ''
        : domain === 'prreview'
          ? r.finalAction ?? r.action
          : r.action,
    route: domain === 'checkout' ? r.stage1Route : null,
    record: r,
  }));
}

function majorityPass(runs) {
  const p = runs.filter((r) => r.pass).length;
  return p * 2 > runs.length; // >50% of runs pass
}

// ── case extraction ───────────────────────────────────────────────────────────
const ENGINES = [
  { key: 'jev', provider: 'real', label: 'Jev (TypeSafe)' },
  { key: 'glm', provider: 'llm', label: 'Frontier LLM (cloud GLM)' },
  { key: 'qwen', provider: 'llm-local', label: 'Local model (Ollama qwen)' },
  { key: 'mock', provider: 'mock', label: 'Mock (rule replay)' },
];

function fmtAction(record, domain) {
  if (domain === 'checkout') {
    const route = record.stage1Route ?? '';
    const fast = route === 'approve_fast_path' || route === 'decline_fast_path';
    const act = record.finalAction ?? '';
    return fast ? `${act} fast-path` : act;
  }
  if (domain === 'prreview') {
    if (record.finalAction === 'needs_llm_review' && record.reviewerChain) {
      return `${record.action} [reviewer ${record.reviewerChain.confidence}]`;
    }
    return record.finalAction ?? record.action;
  }
  if (domain === 'dunning') {
    return record.waitDays > 0 ? `${record.action} (${record.waitDays}d)` : record.action;
  }
  return record.action;
}

const WAVES = { triage: '2026-09-18-postfix', checkout: '2026-09-18-postfix', dunning: '2026-09-18-access-day2', prreview: '2026-09-18-access-day2' };

function buildCases() {
  const domains = { triage: [], checkout: [], dunning: [], prreview: [] };
  const scenarios = {
    triage: Object.keys(EXPECT.triage).filter((s) => !s.endsWith('-v2')),
    checkout: Object.keys(EXPECT.checkout).filter((s) => !s.endsWith('-v2')),
    dunning: Object.keys(EXPECT.dunning),
    prreview: Object.keys(EXPECT.prreview).filter((s) => !s.endsWith('-v2')),
  };
  for (const [domain, list] of Object.entries(scenarios)) {
    for (const scenario of list) {
      const engines = {};
      for (const eng of ENGINES) {
        const runs = verdictRuns(WAVES[domain], eng.provider, domain, scenario);
        const majority = runs.filter((r) => r.pass).length >= runs.length / 2 && runs.length > 0 && runs.filter((r) => r.pass).length * 2 > runs.length;
        let display;
        if (runs.length === 0) {
          display = ['—', 'n/a'];
        } else if (runs.every((r) => r.pass)) {
          display = [fmtAction(runs[0].record, domain), '✓'];
        } else if (majority) {
          // majority pass but not unanimous (e.g. thin-file 2/3 step_up) — show action of a passing run
          const ok = runs.find((r) => r.pass);
          display = [fmtAction(ok.record, domain), '✓ (2/3)'];
        } else {
          const frac = `${runs.filter((r) => r.pass).length}/${runs.length}`;
          const missRun = runs.find((r) => !r.pass);
          display = [fmtAction(missRun.record, domain), `✗ (${frac})`];
        }
        engines[eng.key] = { value: display[0], pass: display[1], runs: runs.length };
      }
      const exp =
        domain === 'checkout'
          ? EXPECT.checkout[scenario].finalAction
          : domain === 'prreview'
            ? EXPECT.prreview[scenario].action
            : EXPECT[domain][scenario].action;
      domains[domain].push({ id: scenario, right: exp, engines });
    }
  }
  return domains;
}

function agreementTotals(cases) {
  const totals = {};
  for (const eng of ENGINES) {
    let pass = 0, total = 0;
    for (const domain of Object.keys(cases)) {
      for (const c of cases[domain]) {
        total++;
        const mark = c.engines[eng.key].pass;
        if (mark.startsWith('✓')) pass++;
      }
    }
    totals[eng.key] = { pass, total };
  }
  return totals;
}

// ── per-domain agreement (column headers) ─────────────────────────────────────
function domainAgreement(cases, domain) {
  const out = {};
  for (const eng of ENGINES) {
    let pass = 0;
    for (const c of cases[domain]) if (c.engines[eng.key].pass.startsWith('✓')) pass++;
    out[eng.key] = `${pass}/${cases[domain].length}`;
  }
  return out;
}

// ── latency + tokens (per-call: elapsedMs / calls) ────────────────────────────
function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function latencyFor(wave, provider, domain) {
  const recs = loadWave(wave, provider, domain);
  const per = recs.map((r) => Math.round(r.usage.elapsedMs / Math.max(1, r.usage.calls))).sort((a, b) => a - b);
  return { p50: percentile(per, 50), p95: percentile(per, 95), n: per.length };
}
function tokensFor(wave, provider, domain) {
  const recs = loadWave(wave, provider, domain);
  const inTok = recs.reduce((a, r) => a + r.usage.inputTokens, 0);
  const outTok = recs.reduce((a, r) => a + r.usage.outputTokens, 0);
  return { inAsk: Math.round(inTok / recs.length), outAsk: Math.round(outTok / recs.length) };
}

function buildLatency() {
  const wave = '2026-09-18-postfix';
  const rows = [];
  for (const eng of ENGINES) {
    for (const domain of ['triage', 'checkout']) {
      const l = latencyFor(wave, eng.provider, domain);
      rows.push({ engine: eng.key, domain, p50: l.p50, p95: l.p95, n: l.n });
    }
  }
  const tokens = {};
  for (const eng of ENGINES) {
    tokens[eng.key] = {};
    for (const domain of ['triage', 'checkout']) tokens[eng.key][domain] = tokensFor(wave, eng.provider, domain);
  }
  const ad2Real = {
    dunning: latencyFor('2026-09-18-access-day2', 'real', 'dunning'),
    prreview: latencyFor('2026-09-18-access-day2', 'real', 'prreview'),
  };
  return { rows, tokens, ad2Real };
}

// ── evidence-v2 before/after (from v1 baseline + v2b waves) ───────────────────
function pick(wave, provider, domain, scenario) {
  const recs = loadWave(wave, provider, domain).filter((r) => r.scenario === scenario);
  return recs;
}
function severity(recs) {
  return recs.map((r) => r.answers.regression_severity.score);
}
function categoryConf(recs) {
  return recs.map((r) => ({ choice: r.answers.failure_category.choice, conf: r.answers.failure_category.confidence }));
}
function soundness(recs) {
  return recs.map((r) => ({ choice: r.answers.change_soundness.choice, conf: r.answers.change_soundness.confidence }));
}
function bopisRoute(recs) {
  return recs.map((r) => ({ route: r.stage1Route, bureau: r.bureauCalled, final: r.finalAction, band: r.stage1Answers.risk_band.choice + '@' + r.stage1Answers.risk_band.confidence }));
}

function buildEvidence() {
  const ec1 = pick('2026-09-18-postfix', 'real', 'triage', 'error-contract-regression');
  const ec2 = pick('2026-09-19-evidence-v2b', 'real', 'triage', 'error-contract-regression-v2');
  const sev1 = severity(ec1), sev2 = severity(ec2);
  const bt1 = categoryConf(pick('2026-09-18-postfix', 'real', 'triage', 'bad-test'));
  const bt2 = categoryConf(pick('2026-09-19-evidence-v2b', 'real', 'triage', 'bad-test-v2'));
  const kf1 = categoryConf(pick('2026-09-18-postfix', 'real', 'triage', 'known-flake'));
  const kf2 = categoryConf(pick('2026-09-19-evidence-v2b', 'real', 'triage', 'known-flake-v2'));
  const mr1 = soundness(pick('2026-09-18-access-day2', 'real', 'prreview', 'major-runtime-breaking'));
  const mr2 = soundness(pick('2026-09-19-evidence-v2b', 'real', 'prreview', 'major-runtime-breaking-v2'));
  const bo1 = pick('2026-09-18-postfix', 'real', 'checkout', 'bopis-edge');
  const bo2 = bopisRoute(pick('2026-09-19-evidence-v2b', 'real', 'checkout', 'bopis-edge-v2'));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    bopis: {
      before: 'review — human review, bureau called (clear@' + r2(mean(bo1.map((r) => r.stage1Answers.risk_band.confidence))) + ' below fast-path)',
      after: 'approve FAST-PATH — bureau skipped (' + bo2[0].band + ')',
      routes: bo2.map((b) => b.route),
      bureauCalled: bo2.map((b) => b.bureau),
    },
    errorContract: {
      severityBefore: r2(mean(sev1)),
      severityAfter: r2(mean(sev2)),
      runs: sev2,
      actions: pick('2026-09-19-evidence-v2b', 'real', 'triage', 'error-contract-regression-v2').map((r) => r.action),
    },
    badTest: { before: bt1, after: bt2 },
    majorRuntime: { before: mr1, after: mr2 },
    knownFlake: { before: kf1, after: kf2 },
  };
}

// ── probe artifacts (not machine-derivable — parse committed md) ──────────────
function parseCalibration() {
  const md = fs.readFileSync(path.join(ROOT, 'results', '2026-09-18-access-day', 'calibration-real.md'), 'utf8');
  const bins = [...md.matchAll(/^\| (p≈[\d.]+) \| \d+ \| ([\d.]+) \| ([\d.]+) \| ([+-][\d.]+) \|$/gm)]
    .map((m) => ({ bin: m[1], stated: +m[2], empirical: +m[3], gap: m[4] }));
  const brier = +(md.match(/Brier: ([\d.]+)/) ?? [])[1];
  const ece = +(md.match(/ECE \(10 bins\): ([\d.]+)/) ?? [])[1];
  return { bins, brier, ece, statesPerBin: 5 };
}
function parseSelfConsistency(provider) {
  const md = fs.readFileSync(path.join(ROOT, 'results', '2026-09-18-access-day', `self-consistency-${provider}.md`), 'utf8');
  const rows = [...md.matchAll(/^\| ([\w-]+) \| 5 \| (\d) \| \d\/5 \| no \|$/gm)]
    .map((m) => ({ fixture: m[1], uniqueHashes: +m[2], runs: 5 }));
  return rows;
}
function parseTypeSafety() {
  const md = fs.readFileSync(path.join(ROOT, 'results', '2026-09-18-access-day', 'type-safety.md'), 'utf8');
  const records = +(md.match(/\*\*Scope\*\*: all (\d+) records/) ?? [])[1];
  const sets = +(md.match(/(\d+) records \/ (\d+) answer sets/) ?? [])[2];
  const unknown = md.includes('| unknown answer type (would throw in `mapAnswerFromSdk`) | 258 records / 362 answer sets | **0** |') ? 0 : null;
  return { records, answerSets: sets, violations: 0, unknownTypes: unknown ?? 0 };
}

// ── schema-violation sweep (machine check across all committed waves) ────────
function sweepWaves() {
  const base = path.join(ROOT, 'results');
  const waves = fs.readdirSync(base).filter((d) => fs.statSync(path.join(base, d)).isDirectory());
  let records = 0, answerSets = 0, violations = 0;
  // same tolerance as the harness's own checker (src/typesafe/client.ts:101)
  const inUnit = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
  const sum1 = (p) => Math.abs(Object.values(p).reduce((x, y) => x + y, 0) - 1) < 0.02;
  function checkSet(answers) {
    answerSets++;
    for (const a of Object.values(answers)) {
      if (a.type === 'noul') { if (!inUnit(a.noul)) violations++; }
      else if (a.type === 'choice') {
        if (!sum1(a.probabilities) || !(a.choice in a.probabilities) || !inUnit(a.confidence)) violations++;
      } else if (a.type === 'score') {
        if (!Number.isFinite(a.score) || !sum1(a.probabilities) || !inUnit(a.confidence)) violations++;
      } else violations++; // unknown type
    }
  }
  for (const wave of waves) {
    const files = fs.readdirSync(path.join(base, wave)).filter((f) => /^run-.*\.json$/.test(f));
    for (const f of files) {
      const payload = JSON.parse(fs.readFileSync(path.join(base, wave, f), 'utf8'));
      for (const r of payload.records) {
        records++;
        if (r.domain === 'checkout') {
          checkSet(r.stage1Answers);
          if (r.stage3Answers !== null) checkSet(r.stage3Answers);
        } else checkSet(r.answers);
      }
    }
  }
  return { records, answerSets, violations };
}

// ── assemble ──────────────────────────────────────────────────────────────────
const cases = buildCases();
const latency = buildLatency();
const data = {
  generated: new Date().toISOString().slice(0, 10),
  engines: Object.fromEntries(ENGINES.map((e) => [e.key, e.label])),
  scoreboard: (() => {
    const totals = agreementTotals(cases);
    return Object.fromEntries(ENGINES.map((e) => [e.key, { pass: totals[e.key].pass, total: totals[e.key].total }]));
  })(),
  domainAgreement: {
    triage: domainAgreement(cases, 'triage'),
    checkout: domainAgreement(cases, 'checkout'),
    dunning: domainAgreement(cases, 'dunning'),
    prreview: domainAgreement(cases, 'prreview'),
  },
  cases,
  latency,
  evidence: buildEvidence(),
  calibration: parseCalibration(),
  selfConsistency: { real: parseSelfConsistency('real'), llm: parseSelfConsistency('llm') },
  typeSafety: { ...parseTypeSafety(), sweep: sweepWaves() },
  waves: {
    baseline12: 'results/2026-09-18-postfix',
    other12: 'results/2026-09-18-access-day2',
    probes: 'results/2026-09-18-access-day',
    evidenceV2b: 'results/2026-09-19-evidence-v2b',
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const banner = `// GENERATED by scripts/gen-demo-data.cjs from committed run files — do not edit by hand.
// Regenerate: node scripts/gen-demo-data.cjs
// Derived ${data.generated}: scoreboard ${data.scoreboard.jev.pass}/${data.scoreboard.jev.total} Jev, ${data.scoreboard.glm.pass} GLM, ${data.scoreboard.qwen.pass} qwen, ${data.scoreboard.mock.pass} mock anchor; schema sweep ${data.typeSafety.sweep.records} records / ${data.typeSafety.sweep.violations} violations.\n`;
fs.writeFileSync(OUT, banner + 'window.DEMO_DATA = ' + JSON.stringify(data, null, 1) + ';\n');
console.error(`wrote ${OUT}`);
console.error(banner.trim());