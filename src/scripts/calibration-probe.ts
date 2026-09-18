#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient, type ProviderName } from '../typesafe/index.js';
import type { SystemOneClient } from '../typesafe/client.js';
import { brierScore, expectedCalibrationError } from '../eval/metrics.js';
import {
  defaultProbeSpecs,
  probeCalibrationPairs,
  runNoulProbe,
} from '../eval/probe.js';
import { resultsDirFor } from '../eval/run-record.js';

/**
 * Calibration probe CLI. Measures whether a provider's stated noul
 * probabilities track constructed truth at bins near p≈0.2/0.5/0.8:
 *
 *   node dist/scripts/calibration-probe.js --provider=real
 *   node dist/scripts/calibration-probe.js --provider=llm --states=5
 *
 * --tag=<name> writes results/<date>-<name>/ so same-day re-runs never
 * clobber committed waves (same convention as the eval CLI).
 *
 * Writes results/<date>/calibration-<provider>.md. The claim under test:
 * "confidence 0.8 means about 80% correct" — rendered per bin as
 * stated-mean vs empirical-accuracy.
 */

function loadEnvInto(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  try {
    const content = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !(match[1]! in env)) {
        env[match[1]!] = match[2]!.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env optional for mock runs
  }
  return env;
}

function normalizeTag(tag: string | undefined): string | undefined {
  if (tag === undefined || tag === '') return undefined;
  if (!/^[a-z0-9-]+$/.test(tag)) {
    throw new Error(`--tag="${tag}" is invalid: use lowercase letters, digits and single dashes`);
  }
  return tag;
}

interface ProbeRow {
  specId: string;
  bin: string;
  states: number;
  meanStated: number;
  empiricalAccuracy: number;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length;
}

async function main(): Promise<void> {
  const env = loadEnvInto({ ...process.env });
  const args = process.argv.slice(2);
  const providerArg = args.find((a) => a.startsWith('--provider='));
  const statesArg = args.find((a) => a.startsWith('--states='));

  const provider = (providerArg?.split('=')[1] ?? 'mock') as ProviderName;
  if (!['mock', 'llm', 'real'].includes(provider)) {
    throw new Error(`--provider must be one of mock, llm, real (got ${provider})`);
  }
  const statesPerBin = statesArg ? Number(statesArg.split('=')[1]) : 5;
  if (!Number.isInteger(statesPerBin) || statesPerBin < 2 || statesPerBin > 50) {
    throw new Error('--states must be an integer in [2, 50]');
  }
  const tag = normalizeTag(args.find((a) => a.startsWith('--tag='))?.split('=')[1]);

  console.error(`calibration-probe: provider=${provider} statesPerBin=${statesPerBin}`);
  const client: SystemOneClient = createClient(provider, env);
  const specs = defaultProbeSpecs(statesPerBin);
  const outcomes = await runNoulProbe(client, specs, provider, client.name);

  // Per-bin stated vs empirical.
  const rows: ProbeRow[] = specs.map((spec) => {
    const binOutcomes = outcomes.filter((o) => o.spec.id === spec.id);
    return {
      specId: spec.id,
      bin: spec.bin,
      states: binOutcomes.length,
      meanStated: mean(binOutcomes.map((o) => o.noul)),
      empiricalAccuracy: binOutcomes.length === 0
        ? Number.NaN
        : binOutcomes.filter((o) => o.bit === 1).length / binOutcomes.length,
    };
  });

  const pairs = probeCalibrationPairs(outcomes);
  const brier = brierScore(pairs);
  const ece = expectedCalibrationError(pairs);

  const lines: string[] = [];
  lines.push(`# Calibration probe — ${provider} — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`Constructed truth at three bins; ${statesPerBin} synthetic states per bin.`);
  lines.push('');
  lines.push('| bin | states | mean stated P(yes) | empirical P(yes) | gap |');
  lines.push('|---|---|---|---|---|');
  for (const row of rows) {
    const gap = row.meanStated - row.empiricalAccuracy;
    lines.push(
      `| ${row.bin} | ${row.states} | ${row.meanStated.toFixed(3)} | ${row.empiricalAccuracy.toFixed(2)} | ${(gap >= 0 ? '+' : '') + gap.toFixed(3)} |`,
    );
  }
  lines.push('');
  lines.push(`- Brier: ${brier === null ? 'n/a' : brier.toFixed(4)}`);
  lines.push(`- ECE (10 bins): ${ece === null ? 'n/a' : ece.toFixed(4)}`);
  lines.push('');
  lines.push(
    'Interpretation: a calibrated engine tracks the empirical column with its stated column (small |gap|). ' +
      'For the mock provider the noul values are canned fiction — a large gap is the expected, instructive result. ' +
      'The claim under test for Jev (real provider): stated confidence ≈ empirical frequency.',
  );

  const dir = resultsDirFor(new Date(), 'results', tag);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `calibration-${provider}.md`);
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');

  console.log(`\nCalibration probe complete → ${file}`);
  for (const row of rows) {
    console.log(
      `  ${row.bin.padEnd(7)} stated=${row.meanStated.toFixed(3)} empirical=${row.empiricalAccuracy.toFixed(2)}`,
    );
  }
  console.log(`  Brier=${brier?.toFixed(4) ?? 'n/a'} ECE=${ece?.toFixed(4) ?? 'n/a'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});