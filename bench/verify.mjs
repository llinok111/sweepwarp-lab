#!/usr/bin/env node
// Assertions over data/scenes.json. Every printed number is measured here.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareScene, buildPath, planNaive, planBudget, planAdaptive, planUniform,
  minUniformFrames, segmentClearance, oracleChordMin, oraclePointTriDist,
  pathAt, pointClearance, scaleScene, segTriDistSq
} from '../src/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '..', 'data', 'scenes.json'), 'utf8'));

let failures = 0;
const ok = (cond, label, detail) => {
  if (!cond) { failures++; console.log(`  FAIL  ${label} :: ${detail}`); }
  else console.log(`  ok    ${label} :: ${detail}`);
};

console.log('== G4a  exact segment/triangle distance vs independent sampled oracle ==');
{
  // fixed pseudo-random chords, independent of scene layout
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let worstGap = 0, worstExcess = 0, n = 0;
  for (const s of data.scenes) {
    const scene = prepareScene(s.triangles);
    for (let i = 0; i < 40; i++) {
      const a = [rnd() * 40 - 8, rnd() * 6 - 2, rnd() * 2 - 1];
      const b = [a[0] + rnd() * 2 - 1, a[1] + rnd() * 2 - 1, a[2] + rnd() * 2 - 1];
      const exact = Math.sqrt(segmentClearance(scene, a, b).distSq);
      const orc = oracleChordMin(scene, a, b, 200).min;
      worstExcess = Math.max(worstExcess, exact - orc);
      worstGap = Math.max(worstGap, orc - exact);
      n++;
      if (!(exact <= orc + 1e-9)) { failures++; console.log('  FAIL  exact > oracle', exact, orc); }
    }
  }
  console.log(`  checked ${n} chords; max(oracle-exact)=${worstGap.toExponential(3)} max(exact-oracle)=${worstExcess.toExponential(3)}`);
  ok(worstGap < 0.05, 'sampled oracle never below exact by more than chord-sag bound', worstGap.toExponential(3));
}

console.log('== G4b  per-scene: naive fast dolly vs budget-matched warp vs uniform slowdown ==');
const summary = { naiveViolations: 0, naiveIntersections: 0, budgetViolations: 0, budgetMinClearance: Infinity, budgetFrames: 0, minFrames: 0, uniformSafeFrames: 0, scenes: 0 };
const rows = [];
for (const s of data.scenes) {
  const scene = prepareScene(s.triangles);
  const path = buildPath(s.path);
  const r = s.radius;
  const naive = planNaive(scene, path, r, s.naiveFrames);
  const budget = planBudget(scene, path, r, s.naiveFrames);
  const minPlan = planAdaptive(scene, path, r, { alpha: 3 });
  const uni = minUniformFrames(scene, path, r, s.naiveFrames, 4000, 1);
  summary.scenes++;
  summary.naiveViolations += naive.violations;
  summary.naiveIntersections += naive.intersections;
  summary.budgetViolations += budget.violations;
  summary.budgetMinClearance = Math.min(summary.budgetMinClearance, budget.minClearance);
  summary.budgetFrames += budget.frameCount;
  summary.minFrames += minPlan.frameCount;
  summary.uniformSafeFrames += uni.frameCount;
  rows.push({ name: s.name, B: s.naiveFrames, naive, budget, minPlan, uni });
  console.log(`  scene ${s.name}: budget=${s.naiveFrames} naive v=${naive.violations} holes=${naive.intersections} min=${naive.minClearance.toFixed(4)} | warp v=${budget.violations} min=${budget.minClearance.toFixed(4)} | minFrames=${minPlan.frameCount} | uniformSafe=${uni.frameCount}`);
  ok(naive.violations >= 1, `${s.name}: authored fast dolly violates near-clip radius`, `v=${naive.violations}`);
  ok(budget.violations === 0 && budget.minClearance >= r, `${s.name}: budget-matched warp is certified clear`, `v=${budget.violations} min=${budget.minClearance.toFixed(4)} r=${r}`);
  ok(minPlan.violations === 0 && !minPlan.infeasible, `${s.name}: minimum-frame warp certified`, `frames=${minPlan.frameCount} min=${minPlan.minClearance.toFixed(4)}`);
  ok(minPlan.frameCount < uni.frameCount, `${s.name}: warp beats uniform slowdown on frames`, `${minPlan.frameCount} < ${uni.frameCount}`);
}
ok(summary.naiveViolations > 0 && summary.naiveIntersections > 0, 'naive playback tunnels somewhere', `viol=${summary.naiveViolations} holes=${summary.naiveIntersections}`);
ok(summary.budgetViolations === 0, 'all budget-matched warps clear', `viol=${summary.budgetViolations} minClearance=${summary.budgetMinClearance.toFixed(4)}`);
ok(summary.minFrames < summary.budgetFrames, 'minimum-frame warps use fewer frames than the authored budget', `${summary.minFrames} < ${summary.budgetFrames}`);
ok(summary.uniformSafeFrames > summary.budgetFrames, 'uniform safe playback needs more frames than the budget', `${summary.uniformSafeFrames} > ${summary.budgetFrames}`);
console.log(`  totals: naive viol=${summary.naiveViolations} holes=${summary.naiveIntersections}; warp frames=${summary.budgetFrames} (0 viol); minFrames=${summary.minFrames}; uniformSafe=${summary.uniformSafeFrames}`);
console.log(`  frame reduction vs uniform: ${(100 * (1 - summary.minFrames / summary.uniformSafeFrames)).toFixed(2)}%; uniform/budget = ${(summary.uniformSafeFrames / summary.budgetFrames).toFixed(3)}x`);

console.log('== G4c  independent oracle re-checks the tightest budget chords ==');
{
  let checked = 0, minOracle = Infinity, minExact = Infinity;
  for (const row of rows) {
    const s = data.scenes.find((x) => x.name === row.name);
    const scene = prepareScene(s.triangles);
    const idx = row.budget.chords.map((c, i) => [c.clearance, i]).sort((a, b) => a[0] - b[0]).slice(0, 6);
    for (const [, i] of idx) {
      const a = row.budget.frames[i], b = row.budget.frames[i + 1];
      const orc = oracleChordMin(scene, a, b, 64).min;
      minOracle = Math.min(minOracle, orc);
      minExact = Math.min(minExact, row.budget.chords[i].clearance);
      checked++;
      if (!(orc >= s.radius - 1e-9)) { failures++; console.log('  FAIL  oracle sample below radius', s.name, i, orc); }
    }
  }
  console.log(`  oracle re-sampled ${checked} tightest chords (64 points each); min oracle=${minOracle.toFixed(5)} vs min exact=${minExact.toFixed(5)}`);
  ok(minOracle >= 0.08 - 1e-9, 'oracle never sees a point below the near-clip radius on certified chords', minOracle.toFixed(5));
}

console.log('== G4d  scale invariance 1e-6 .. 1e6 ==');
{
  const scales = [1e-6, 1e-3, 1, 1e3, 1e6];
  let drift = 0, mismatches = 0, decisions = 0;
  for (const s of data.scenes) {
    const baseScene = prepareScene(s.triangles);
    const basePath = buildPath(s.path);
    const baseBudget = planBudget(baseScene, basePath, s.radius, s.naiveFrames, { grid: 200 });
    const baseNaive = planNaive(baseScene, basePath, s.radius, s.naiveFrames);
    for (const k of scales) {
      const sc = scaleScene({ radius: s.radius, triangles: s.triangles, path: s.path, naiveFrames: s.naiveFrames }, k);
      const scene = prepareScene(sc.triangles);
      const path = buildPath(sc.path);
      const budget = planBudget(scene, path, sc.radius, sc.naiveFrames, { grid: 200 });
      const naive = planNaive(scene, path, sc.radius, sc.naiveFrames);
      const rel = Math.abs(budget.minClearance / sc.radius - baseBudget.minClearance / s.radius);
      drift = Math.max(drift, rel / (baseBudget.minClearance / s.radius));
      if (budget.frameCount !== baseBudget.frameCount) mismatches++;
      if ((naive.violations > 0) !== (baseNaive.violations > 0)) mismatches++;
      decisions++;
    }
  }
  console.log(`  ${decisions} scaled replays, decision mismatches=${mismatches}, max relative clearance drift=${drift.toExponential(3)}`);
  ok(mismatches === 0, 'frame counts and violation decisions unchanged at every scale', `mismatches=${mismatches}`);
  ok(drift < 1e-9, 'certified min clearance scales exactly', drift.toExponential(3));
}

console.log('== G4e  determinism ==');
{
  const s = data.scenes[0];
  const scene = prepareScene(s.triangles);
  const path = buildPath(s.path);
  const a = planBudget(scene, path, s.radius, s.naiveFrames);
  const b = planBudget(scene, path, s.radius, s.naiveFrames);
  let same = a.frameCount === b.frameCount && a.minClearance === b.minClearance;
  for (let i = 0; same && i < a.frames.length; i++) {
    for (let j = 0; j < 3; j++) if (a.frames[i][j] !== b.frames[i][j]) same = false;
  }
  ok(same, 'two runs produce bit-identical plans', `frames=${a.frameCount} min=${a.minClearance}`);
}

console.log(failures === 0 ? `\nRESULT PASS failures=0` : `\nRESULT FAIL failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);