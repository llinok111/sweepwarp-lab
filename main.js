// main.js — rendering + interaction only. Every certified number is produced by
// src/core.mjs (the same pure module bench/verify.mjs asserts against), so what
// the panel shows is exactly what node recomputes.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  prepareScene, buildPath, pathAt, planNaive, planBudget
} from './src/core.mjs';

const app = document.getElementById('app');
const readout = document.getElementById('readout');
const sceneSel = document.getElementById('scene');
const speed = document.getElementById('speed');
const warp = document.getElementById('warp');
const speedVal = document.getElementById('speedVal');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const view = new THREE.Scene();
view.background = new THREE.Color(0x10131a);
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.08, 200);
cam.position.set(-14, 9, 14);
const controls = new OrbitControls(cam, renderer.domElement);
controls.target.set(15, 0, 0);
view.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 1.4);
dir.position.set(10, 20, 12);
view.add(dir);

const state = { data: null, scene: null, path: null, plan: null, group: null, frame: 0, acc: 0 };

function clearGroup() {
  if (!state.group) return;
  view.remove(state.group);
  state.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  state.group = null;
}

function buildSceneMeshes(s) {
  clearGroup();
  const g = new THREE.Group();
  const pos = [];
  for (const t of s.triangles) pos.push(...t);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6c7d99, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide })));

  const lineGeo = new THREE.BufferGeometry().setFromPoints(s.path.map((p) => new THREE.Vector3(...p)));
  g.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x3d5878 })));

  const marker = new THREE.Mesh(new THREE.SphereGeometry(s.radius, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffb454, emissive: 0x442200 }));
  marker.name = 'marker';
  g.add(marker);
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb454 }));
  trail.name = 'trail';
  g.add(trail);
  state.group = g;
  view.add(g);
}

function recompute() {
  const s = state.data;
  const scene = state.scene;
  const path = state.path;
  const mult = Number(speed.value);
  speedVal.textContent = mult.toFixed(2) + '×';
  const frames = Math.max(2, Math.round(s.naiveFrames / mult));
  state.plan = warp.checked
    ? planBudget(scene, path, s.radius, frames)
    : planNaive(scene, path, s.radius, frames);
  state.plan.frameCount = state.plan.frames.length;
  state.frame = 0;
  state.acc = 0;
  const p = state.plan;
  const trail = state.group && state.group.getObjectByName('trail');
  if (trail) trail.geometry.setFromPoints(p.frames.map((f) => new THREE.Vector3(...f)));
  const cls = p.violations === 0 ? 'good' : 'bad';
  readout.innerHTML =
    `frames <b>${p.frameCount}</b> @60 Hz (${(p.frameCount / 60).toFixed(3)} s)<br>` +
    `min swept clearance <b>${p.minClearance.toFixed(4)}</b> m (radius ${s.radius})<br>` +
    `<span class="${cls}">violations <b>${p.violations}</b></span>` +
    (p.violations ? ` · chords through geometry <b>${p.intersections}</b>` : ' · certified clear') +
    `<br>mode <b>${warp.checked ? 'clearance-density warp' : 'constant speed'}</b>`;
}

function loadScene(name) {
  const s = state.data.scenes ? state.data.scenes.find((x) => x.name === name) : state.data.find((x) => x.name === name);
  state.current = s;
  state.scene = prepareScene(s.triangles);
  state.path = buildPath(s.path);
  buildSceneMeshes(s);
  recompute();
}

fetch('./data/scenes.json')
  .then((r) => r.json())
  .then((json) => {
    state.data = json;
    for (const s of json.scenes) {
      const o = document.createElement('option');
      o.value = s.name; o.textContent = `${s.name} (${s.triangles.length} tris, budget ${s.naiveFrames} frames)`;
      sceneSel.appendChild(o);
    }
    loadScene(json.scenes[0].name);
    sceneSel.addEventListener('change', () => loadScene(sceneSel.value));
    speed.addEventListener('input', recompute);
    warp.addEventListener('change', recompute);
    animate();
  });

let last = performance.now();
function animate(t) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (state.plan) {
    state.acc += dt * 60;
    while (state.acc >= 1 && state.frame < state.plan.frames.length - 1) { state.frame++; state.acc -= 1; }
    if (state.frame >= state.plan.frames.length - 1) state.frame = 0; // loop at 60 Hz
    const p = state.plan.frames[state.frame];
    state.group.getObjectByName('marker').position.set(p[0], p[1], p[2]);
  }
  controls.update();
  renderer.render(view, cam);
}

addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});