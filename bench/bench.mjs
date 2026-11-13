#!/usr/bin/env node
// Timing + end-to-end summary. Cold start is measured separately; the warm
// measurement is >=5 samples with warmup, reporting min/median/p95/stddev.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareScene, buildPath, planNaive, planBudget, planAdaptive, minUniformFrames
} from '../src/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '..', 'data', 'scenes.json'), 'utf8'));
const prepared = data.scenes.map((s) => {
  const scene = prepareScene(s.triangles);
  return { s, scene, path: buildPath(s.path) };
});

function planAllBudget() {
  for (const p of prepared) planBudget(p.scene, p.path, p.s.radius, p.s.naiveFrames);
}
function planAllNaive() {
  for (const p of prepared) planNaive(p.scene, p.path, p.s.radius, p.s.naiveFrames);
}

const now = () => Number(process.hrtime.bigint()) / 1e6;

// single measurement pass -> the numbers quoted in README
const summary = {
  scenes: 0, triangles: 0, budgetFrames: 0, budgetViolations: 0,
  budgetMinClearance: Infinity, naiveViolations: 0, naiveIntersections: 0,
  minFrames: 0, uniformSafeFrames: 0
};
for (const p of prepared) {
  const { s, scene, path } = p;
  const naive = planNaive(scene, path, s.radius, s.naiveFrames);
  const budget = planBudget(scene, path, s.radius, s.naiveFrames);
  const minPlan = planAdaptive(scene, path, s.radius, { alpha: 3 });
  const uni = minUniformFrames(scene, path, s.radius, s.naiveFrames, 4000, 1);
  summary.scenes++;
  summary.triangles += s.triangles.length;
  summary.budgetFrames += budget.frameCount;
  summary.budgetViolations += budget.violations;
  summary.budgetMinClearance = Math.min(summary.budgetMinClearance, budget.minClearance);
  summary.naiveViolations += naive.violations;
  summary.naiveIntersections += naive.intersections;
  summary.minFrames += minPlan.frameCount;
  summary.uniformSafeFrames += uni.frameCount;
}
summary.frameReductionVsUniformPct = 100 * (1 - summary.minFrames / summary.uniformSafeFrames);
summary.uniformOverBudget = summary.uniformSafeFrames / summary.budgetFrames;

// cold start: first-ever planning pass
const coldStart = now();
planAllBudget();
const coldMs = now() - coldStart;

// warmup
planAllBudget();
planAllBudget();

const SAMPLES = 11, REPS = 8;
const samples = [];
for (let i = 0; i < SAMPLES; i++) {
  const t0 = now();
  for (let r = 0; r < REPS; r++) planAllBudget();
  samples.push((now() - t0) / REPS);
}
const sorted = [...samples].sort((a, b) => a - b);
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
const stddev = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
const timing = {
  samples: SAMPLES, repsPerSample: REPS, coldMs,
  min: sorted[0], median: (sorted[5] + sorted[6]) / 2, p95, stddev,
  relStddevPct: (100 * stddev) / mean
};

const out = {
  generatedBy: 'bench/bench.mjs',
  generatedAt: new Date().toISOString(),
  node: process.version,
  timingMsPerAllScenes: timing,
  samplesMs: samples,
  summary,
  provenance: {
    data: 'data/scenes.json',
    core: 'src/core.mjs (pure ES module, no three.js/DOM)',
    note: 'all values measured in this run; README quotes these fields'
  }
};
writeFileSync(join(here, 'result.json'), JSON.stringify(out, null, 2) + '\n');
console.log('== timing (planBudget over all 6 scenes) ==');
console.log(`cold start ${coldMs.toFixed(3)} ms | min ${timing.min.toFixed(3)} | median ${timing.median.toFixed(3)} | p95 ${timing.p95.toFixed(3)} | stddev ${timing.stddev.toFixed(3)} | rel ${timing.relStddevPct.toFixed(2)}%`);
console.log('== summary ==');
console.log(JSON.stringify(summary, null, 1));
console.log('wrote bench/result.json');
