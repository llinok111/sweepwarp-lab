#!/usr/bin/env node
// Deterministic sample generator. Writes data/scenes.json (same bytes every run).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = 20261114;
const FPS = 60;
const CAM_Y = 1.2;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// vertical polygonal column, y in [-2, 2]; sides only (camera stays inside y range)
function column(cx, cz, rad, sides = 18) {
  const tris = [];
  const y0 = -2, y1 = 2;
  for (let i = 0; i < sides; i++) {
    const t0 = (2 * Math.PI * i) / sides, t1 = (2 * Math.PI * (i + 1)) / sides;
    const x0 = cx + rad * Math.cos(t0), z0 = cz + rad * Math.sin(t0);
    const x1 = cx + rad * Math.cos(t1), z1 = cz + rad * Math.sin(t1);
    tris.push([x0, y0, z0, x1, y0, z1, x1, y1, z1]);
    tris.push([x0, y0, z0, x1, y1, z1, x0, y1, z0]);
  }
  return tris;
}

function arc(cx, cz, r, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const th = Math.PI - (Math.PI * i) / steps;
    out.push([cx + r * Math.cos(th), CAM_Y, cz + r * Math.sin(th)]);
  }
  return out;
}

function buildScene(spec, rand) {
  const triangles = [];
  const path = [];
  const { pillars, spacing, lead } = spec;
  path.push([-lead, CAM_Y, 0]);
  let centers = [];
  for (let i = 0; i < pillars.length; i++) {
    const p = pillars[i];
    const cx = spec.originX + i * spacing + (rand() - 0.5) * 0.2;
    centers.push(cx);
    path.push([cx - p, CAM_Y, 0]);
    const a = arc(cx, 0, p, 24);
    for (const q of a) path.push(q);
    triangles.push(...column(cx, 0, spec.rad));
  }
  const last = centers[centers.length - 1];
  path.push([last + pillars[pillars.length - 1] + lead, CAM_Y, 0]);
  const clean = [];
  for (const q of path) {
    const prev = clean[clean.length - 1];
    if (!prev || Math.abs(prev[0] - q[0]) + Math.abs(prev[1] - q[1]) + Math.abs(prev[2] - q[2]) > 1e-12) clean.push(q);
  }
  return { triangles, path: clean };
}

const scenes = [];
const rand = mulberry32(SEED);
const specs = [
  { name: 's1-two-columns', rad: 0.2, pillars: [0.36, 0.36], spacing: 8.0, lead: 5.0, originX: 0, radius: 0.08 },
  { name: 's3-four-columns', rad: 0.2, pillars: [0.34, 0.40, 0.37, 0.42], spacing: 8.0, lead: 5.0, originX: 0, radius: 0.08 },
  { name: 's2-tight-clearance', rad: 0.2, pillars: [0.33, 0.33, 0.33], spacing: 9.0, lead: 5.0, originX: 0, radius: 0.08 },
  { name: 's2-wide-columns', rad: 0.3, pillars: [0.45, 0.45], spacing: 10.0, lead: 5.0, originX: 0, radius: 0.08 },
  { name: 's5-columns-dense', rad: 0.2, pillars: [0.34, 0.34, 0.34, 0.34, 0.34], spacing: 7.0, lead: 4.0, originX: 0, radius: 0.08 },
  { name: 's4-mixed-gap', rad: 0.2, pillars: [0.33, 0.46, 0.36, 0.40], spacing: 8.5, lead: 5.0, originX: 0, radius: 0.08 }
];
for (const spec of specs) {
  const geo = buildScene(spec, rand);
  // naive playback: constant speed tuned so the authored 60 Hz step is a fast dolly
  let L = 0;
  for (let i = 1; i < geo.path.length; i++) {
    const a = geo.path[i - 1], b = geo.path[i];
    L += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  const naiveFrames = Math.max(12, Math.round(L / 0.9));
  scenes.push({
    name: spec.name,
    radius: spec.radius,
    fps: FPS,
    naiveFrames,
    triangles: geo.triangles,
    path: geo.path
  });
}

const out = {
  meta: {
    generator: 'tools/gen-sample.mjs',
    seed: SEED,
    fps: FPS,
    note: 'Synthetic camera flythrough around box columns; all numbers recomputed by bench/verify.mjs.'
  },
  scenes
};

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'scenes.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote data/scenes.json scenes=${scenes.length} triangles=${scenes.reduce((a, s) => a + s.triangles.length, 0)} bytes=${JSON.stringify(out).length + 1}`);
