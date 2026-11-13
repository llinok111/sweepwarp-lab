// core.mjs — pure geometry + camera-motion certification.
// No imports, no DOM, no three.js, no I/O. Runs identically in node and the browser.
//
// Everything here is exact segment/triangle distance (no sampling) plus a
// clearance-proportional time reparameterization of a camera polyline.

/* ------------------------------------------------------------------ */
/* vector helpers (plain arrays, no allocation tricks that break scale) */

export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlen = (a) => Math.sqrt(vdot(a, a));
export const vdist = (a, b) => vlen(vsub(a, b));

/* ------------------------------------------------------------------ */
/* point / triangle, scalars only (fast, allocation-free)              */

export function pointTriDistSq(px, py, pz,
  ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + v * abx, qy = ay + v * aby, qz = az + v * abz;
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + w * acx, qy = ay + w * acy, qz = az + w * acz;
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const qx = bx + w * (cx - bx), qy = by + w * (cy - by), qz = bz + w * (cz - bz);
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const denom = va + vb + vc;
  const v = vb / denom, w = vc / denom;
  const qx = ax + abx * v + acx * w;
  const qy = ay + aby * v + acy * w;
  const qz = az + abz * v + acz * w;
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/* segment / segment squared distance (Ericson, RTCD 5.1.9), scalar */
export function segSegDistSq(p1x, p1y, p1z, p2x, p2y, p2z,
  q1x, q1y, q1z, q2x, q2y, q2z) {
  const d1x = p2x - p1x, d1y = p2y - p1y, d1z = p2z - p1z;
  const d2x = q2x - q1x, d2y = q2y - q1y, d2z = q2z - q1z;
  const rx = p1x - q1x, ry = p1y - q1y, rz = p1z - q1z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a === 0 && e === 0) {
    return rx * rx + ry * ry + rz * rz;
  }
  if (a === 0) {
    s = 0;
    t = f / e;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e === 0) {
      t = 0;
      s = -c / a;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? (b * f - c * e) / denom : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = -c / a;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
      } else if (t > 1) {
        t = 1;
        s = (b - c) / a;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
      }
    }
  }
  const cx = p1x + d1x * s - (q1x + d2x * t);
  const cy = p1y + d1y * s - (q1y + d2y * t);
  const cz = p1z + d1z * s - (q1z + d2z * t);
  return cx * cx + cy * cy + cz * cz;
}

/* Moller-Trumbore on the *unit* direction, hit distance in world units.
 * Normalizing keeps the determinant dimensionless so the parallel guard and the
 * t-range test are scale invariant; a very short chord can no longer produce a
 * cancellation false-positive. Returns hit distance, or -1 for no hit. */
export function segHitsTri(p0, p1, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const rx = p1[0] - p0[0], ry = p1[1] - p0[1], rz = p1[2] - p0[2];
  const chord = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (chord === 0) {
    return pointTriDistSq(p0[0], p0[1], p0[2], ax, ay, az, bx, by, bz, cx, cy, cz) === 0 ? 0 : -1;
  }
  const dx = rx / chord, dy = ry / chord, dz = rz / chord;
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const fx = cx - ax, fy = cy - ay, fz = cz - az;
  const hx = dy * fz - dz * fy;
  const hy = dz * fx - dx * fz;
  const hz = dx * fy - dy * fx;
  const det = ex * hx + ey * hy + ez * hz;
  const eLen = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (Math.abs(det) <= 1e-12 * eLen * fLen) return -1; // relative, dimensionless
  const inv = 1 / det;
  const sx = p0[0] - ax, sy = p0[1] - ay, sz = p0[2] - az;
  const u = (sx * hx + sy * hy + sz * hz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * ez - sz * ey;
  const qy = sz * ex - sx * ez;
  const qz = sx * ey - sy * ex;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = (fx * qx + fy * qy + fz * qz) * inv;
  if (t < 0 || t > chord) return -1;
  return t;
}

/* ------------------------------------------------------------------ */
/* scene prep: precompute triangle AABBs                              */

export function prepareScene(triangles) {
  const aabb = new Float64Array(triangles.length * 6);
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    let mnx = t[0], mny = t[1], mnz = t[2];
    let mxx = t[0], mxy = t[1], mxz = t[2];
    for (let k = 1; k < 3; k++) {
      const x = t[k * 3], y = t[k * 3 + 1], z = t[k * 3 + 2];
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    aabb[i * 6] = mnx; aabb[i * 6 + 1] = mny; aabb[i * 6 + 2] = mnz;
    aabb[i * 6 + 3] = mxx; aabb[i * 6 + 4] = mxy; aabb[i * 6 + 5] = mxz;
  }
  return { triangles, aabb };
}

/* exact squared distance from a segment to one triangle */
export function segTriDistSq(p0, p1, t) {
  if (segHitsTri(p0, p1, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]) >= 0) return 0;
  const eps = pointTriDistSq(p0[0], p0[1], p0[2], t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
  const epe = pointTriDistSq(p1[0], p1[1], p1[2], t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
  let best = Math.min(eps, epe);
  if (best === 0) return 0;
  const ex = [t[3], t[4], t[5], t[6], t[7], t[8], t[0], t[1], t[2]];
  for (let k = 0; k < 3; k++) {
    const q1x = ex[k * 3], q1y = ex[k * 3 + 1], q1z = ex[k * 3 + 2];
    const k2 = (k + 1) % 3;
    const q2x = ex[k2 * 3], q2y = ex[k2 * 3 + 1], q2z = ex[k2 * 3 + 2];
    const d = segSegDistSq(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2],
      q1x, q1y, q1z, q2x, q2y, q2z);
    if (d < best) best = d;
  }
  return best;
}

/* exact clearance of a swept chord against the whole scene */
export function segmentClearance(scene, p0, p1) {
  const { triangles, aabb } = scene;
  const mnx = Math.min(p0[0], p1[0]), mxx = Math.max(p0[0], p1[0]);
  const mny = Math.min(p0[1], p1[1]), mxy = Math.max(p0[1], p1[1]);
  const mnz = Math.min(p0[2], p1[2]), mxz = Math.max(p0[2], p1[2]);
  let best = Infinity, bestTri = -1;
  for (let i = 0; i < triangles.length; i++) {
    const o = i * 6;
    // squared AABB gap lower bound; skip when it cannot beat `best`
    let g = 0;
    if (aabb[o] > mxx) { const d = aabb[o] - mxx; g += d * d; }
    else if (aabb[o + 3] < mnx) { const d = mnx - aabb[o + 3]; g += d * d; }
    if (aabb[o + 1] > mxy) { const d = aabb[o + 1] - mxy; g += d * d; }
    else if (aabb[o + 4] < mny) { const d = mny - aabb[o + 4]; g += d * d; }
    if (aabb[o + 2] > mxz) { const d = aabb[o + 2] - mxz; g += d * d; }
    else if (aabb[o + 5] < mnz) { const d = mnz - aabb[o + 5]; g += d * d; }
    if (g >= best) continue;
    const d = segTriDistSq(p0, p1, triangles[i]);
    if (d < best) { best = d; bestTri = i; }
    if (best === 0) break;
  }
  return { distSq: best, tri: bestTri };
}

export function pointClearance(scene, p) {
  return segmentClearance(scene, p, p);
}

/* ------------------------------------------------------------------ */
/* polyline path, arc-length parameterized                             */

export function buildPath(points) {
  const cum = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cum[i] = cum[i - 1] + vdist(a, b);
  }
  const total = cum[cum.length - 1];
  return { points, cum, total };
}

export function pathAt(path, s) {
  const { points, cum, total } = path;
  const target = s <= 0 ? 0 : s >= 1 ? total : s * total;
  let lo = 0, hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid; else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const u = segLen === 0 ? 0 : (target - cum[lo]) / segLen;
  const a = points[lo], b = points[hi];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/* ------------------------------------------------------------------ */
/* plans                                                               */

function finishPlan(kind, frames, radius, scene, extra = {}) {
  const chords = [];
  let minClearance = Infinity, violations = 0, intersections = 0;
  for (let i = 1; i < frames.length; i++) {
    const c = segmentClearance(scene, frames[i - 1], frames[i]);
    const clearance = Math.sqrt(c.distSq);
    chords.push({ clearance, tri: c.tri, length: vdist(frames[i - 1], frames[i]) });
    if (clearance < minClearance) minClearance = clearance;
    if (clearance < radius) violations++;
    if (clearance === 0) intersections++;
  }
  return { kind, radius, frames, chords, minClearance, violations, intersections, ...extra };
}

/* naive: constant parameter speed, authored frame count */
export function planNaive(scene, path, radius, frameCount) {
  const frames = [];
  for (let i = 0; i < frameCount; i++) frames.push(pathAt(path, i / (frameCount - 1)));
  return finishPlan('naive', frames, radius, scene, { frameCount });
}

/* uniform slowdown: constant parameter step, denser in time */
export function planUniform(scene, path, radius, frameCount) {
  const frames = [];
  for (let i = 0; i < frameCount; i++) frames.push(pathAt(path, i / (frameCount - 1)));
  return finishPlan('uniform', frames, radius, scene, { frameCount });
}

/* budget-matched time warp: same `frameCount` frames as the authored fast
 * dolly, but the parameter density is 1/max(clearance-radius, floor) so frames
 * bunch up where the camera is close to geometry and stretch out in the open.
 * Sample positions come from the inverse cumulative density. */
export function planBudget(scene, path, radius, frameCount, opts = {}) {
  const M = opts.grid ?? 800;
  const floor = opts.floor ?? radius * 0.02;
  const cum = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const s = (i - 1) / M;
    const d = Math.sqrt(pointClearance(scene, pathAt(path, s)).distSq);
    const dens = 1 / Math.max(d - radius, floor);
    cum[i] = cum[i - 1] + dens / M;
  }
  const total = cum[M];
  const frames = [pathAt(path, 0)];
  let j = 0;
  for (let k = 1; k < frameCount; k++) {
    const target = (total * k) / (frameCount - 1);
    while (j < M && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j];
    const u = seg === 0 ? 0 : (target - cum[j]) / seg;
    const s = (j + u) / M;
    frames.push(pathAt(path, s));
  }
  frames[frames.length - 1] = pathAt(path, 1);
  const out = finishPlan('budget', frames, radius, scene, { frameCount, grid: M, floor });
  out.frameCount = frames.length;
  out.infeasible = false;
  return out;
}

/* first frame count (scanning upward) whose every chord clears `radius` */
export function minUniformFrames(scene, path, radius, startFrames, maxFrames, step = 1) {
  for (let k = startFrames; k <= maxFrames; k += step) {
    const p = planUniform(scene, path, radius, k);
    if (p.violations === 0) return p;
  }
  return null;
}

/* clearance-proportional adaptive warp.
 * step target = alpha * (clearance - radius), clamped to [minStep, maxStep],
 * then exact chord check with bisection; the plan is only returned if every
 * chord clears `radius`. radius-relative constants keep scale invariance. */
export function planAdaptive(scene, path, radius, opts = {}) {
  const alpha = opts.alpha ?? 3.0;
  const minStep = opts.minStep ?? radius * 1e-4;
  const maxStep = opts.maxStep ?? radius * 20;
  const maxFrames = opts.maxFrames ?? 20000;
  const frames = [pathAt(path, 0)];
  let s = 0, guard = 0;
  while (s < 1) {
    if (++guard > maxFrames) return { kind: 'adaptive', infeasible: true, reason: 'max-frames', frameCount: frames.length, frames, chords: [], minClearance: 0, violations: 0, intersections: 0 };
    const p = frames[frames.length - 1];
    const d = Math.sqrt(pointClearance(scene, p).distSq);
    let ds = Math.min(alpha * (d - radius), maxStep);
    const remain = 1 - s;
    if (ds <= 0) ds = minStep;
    ds = Math.min(ds, remain);
    let ok = false, tries = 0;
    while (tries++ < 40) {
      const q = pathAt(path, s + ds);
      const c = segmentClearance(scene, p, q);
      if (Math.sqrt(c.distSq) >= radius && ds > 0) { ok = true; break; }
      ds *= 0.5;
      if (ds < minStep) break;
    }
    if (!ok) {
      // the point itself is already inside the near-clip radius: no time warp fixes that
      const c = pointClearance(scene, p);
      return {
        kind: 'adaptive', infeasible: true, reason: 'path-inside-radius',
        frameCount: frames.length, frames, chords: [], minClearance: Math.sqrt(c.distSq),
        violations: 0, intersections: 0, atS: s
      };
    }
    s = Math.min(1, s + ds);
    frames.push(pathAt(path, s));
  }
  const out = finishPlan('adaptive', frames, radius, scene, { alpha, maxStep });
  out.frameCount = frames.length;
  out.infeasible = false;
  return out;
}

export function scaleScene(sceneData, k) {
  return {
    radius: sceneData.radius * k,
    triangles: sceneData.triangles.map((t) => t.map((v) => v * k)),
    path: sceneData.path.map((p) => p.map((v) => v * k)),
    naiveFrames: sceneData.naiveFrames
  };
}

/* independent brute-force point/triangle distance (different algorithm:
 * plane projection + cross-product barycentric signs + edge clamping). Used
 * only by the oracle, never by core decisions. */
export function oraclePointTriDist(p, a, b, c) {
  const ab = vsub(b, a), ac = vsub(c, a), n = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const nn = vdot(n, n);
  if (nn !== 0) {
    const w = vsub(p, a);
    const t = vdot(w, n) / nn;
    const q = vadd(p, vmul(n, -t));
    const cr = (u, v) => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0]
    ];
    const s0 = vdot(cr(ab, vsub(q, a)), n);
    const s1 = vdot(cr(vsub(c, b), vsub(q, b)), n);
    const s2 = vdot(cr(vsub(a, c), vsub(q, c)), n);
    if (s0 >= 0 && s1 >= 0 && s2 >= 0) return Math.abs(t) * Math.sqrt(nn);
  }
  let best = Infinity;
  const edges = [[a, b], [b, c], [c, a]];
  for (const [u, v] of edges) {
    const uv = vsub(v, u), w = vsub(p, u);
    const l2 = vdot(uv, uv);
    let s = l2 === 0 ? 0 : vdot(w, uv) / l2;
    s = Math.max(0, Math.min(1, s));
    const d = vdist(p, vadd(u, vmul(uv, s)));
    if (d < best) best = d;
  }
  return best;
}

/* dense sampling oracle for one swept chord */
export function oracleChordMin(scene, p0, p1, samples = 64) {
  let min = Infinity, at = 0;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u];
    for (const t of scene.triangles) {
      const d = oraclePointTriDist(p, [t[0], t[1], t[2]], [t[3], t[4], t[5]], [t[6], t[7], t[8]]);
      if (d < min) { min = d; at = u; }
      if (min === 0) return { min: 0, at };
    }
  }
  return { min, at };
}