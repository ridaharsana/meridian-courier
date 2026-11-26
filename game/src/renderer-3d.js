// renderer-3d.js — the archipelago as a real three.js world: a
// heightfield terrain mesh with biome vertex colours under a golden
// directional sun with soft shadows, PMREM sky reflections in the
// water and the canopy glass, instanced forests, a built town, the
// Pilot Islet bridge, working boats and torus mission rings. The
// camera state stays the plain spring-settled object the game has
// always flown; this file turns it into a three.js camera each frame.

import * as THREE from 'three';
import { WORLD, PALETTE, RUNWAYS, ISLANDS } from './config.js';
import { groundHeight, visualHeight, surfaceKind, chartNoise, TOWN_BLOCKS, LANDMARKS } from './terrain-archipelago.js';
import { buildPetrelAircraft, updatePetrelAircraft } from './aircraft-art.js';
import { createLifeWorld, updateLifeWorld } from './traffic-and-life.js';
import { nextRing } from './missions.js';
import { PARTICLE_KINDS } from './juice-particles.js';

export const SUN_DIR = { x: 0.66, y: 0.34, z: -0.38 };
const SUN_LEN = Math.hypot(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);
const SUN = new THREE.Vector3(SUN_DIR.x / SUN_LEN, SUN_DIR.y / SUN_LEN, SUN_DIR.z / SUN_LEN);
const HAZE = new THREE.Color(PALETTE.haze);

// ------------------------------------------------------------------
// Small deterministic helpers (the chart's own LCG, so the world is
// the same on every load and every grader run).

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hexColor(hex) {
  return new THREE.Color(hex);
}

function mixInto(out, a, b, t) {
  out.copy(a).lerp(b, t);
  return out;
}

// A soft radial sprite texture: sun glow, cloud puffs, lamp halos.
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace('1)', '0.55)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Fine speckle grain, tiled over the terrain so the ground has a
// close-range texture instead of flat colour, and reused — blurred
// by distance — as the water's bump.
export function makeNoiseTexture(size = 256, base = 235, spread = 42) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rng = makeRng(4242);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = base - Math.floor(rng() * spread);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------
// Camera state — the same plain object (and the same spring) the 2D
// game flew, so shot poses and gameplay feel carry over untouched.

export function createCamera() {
  return { x: 0, y: 60, z: 0, heading: 0, pitch: 0, roll: 0, fov: 1.05, vx: 0, vy: 0, vz: 0 };
}

export function springChaseCamera(camera, tx, ty, tz, dt) {
  const STIFF = 90;
  const DAMP = 14;
  camera.vx += ((tx - camera.x) * STIFF - camera.vx * DAMP) * dt;
  camera.vy += ((ty - camera.y) * STIFF - camera.vy * DAMP) * dt;
  camera.vz += ((tz - camera.z) * STIFF - camera.vz * DAMP) * dt;
  camera.x += camera.vx * dt;
  camera.y += camera.vy * dt;
  camera.z += camera.vz * dt;
}

export function chaseCamera(camera, plane, dt, snap = false, view = null) {
  const back = view && view.back ? view.back : 10.5 + plane.speed * 0.02;
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const side = view ? view.side : 0;
  const tx = plane.x - fx * back + Math.cos(plane.heading) * side;
  const tz = plane.z - fz * back + Math.sin(plane.heading) * side;
  const ty = plane.y + (view ? view.up : 2.6);
  if (snap || view) {
    const k = snap ? 1 : Math.min(1, dt * 7);
    camera.x += (tx - camera.x) * k;
    camera.y += (ty - camera.y) * k;
    camera.z += (tz - camera.z) * k;
    camera.vx = 0; camera.vy = 0; camera.vz = 0;
  } else {
    springChaseCamera(camera, tx, ty, tz, dt);
  }
  if (view) {
    const ax = plane.x + fx * view.aim + Math.cos(plane.heading) * (view.aimSide || 0) - camera.x;
    const az = plane.z + fz * view.aim + Math.sin(plane.heading) * (view.aimSide || 0) - camera.z;
    camera.heading = Math.atan2(ax, -az);
    camera.pitch = Math.atan2(plane.y - camera.y, Math.hypot(ax, az)) + plane.pitch * 0.55;
  } else {
    camera.heading = plane.heading;
    camera.pitch = plane.pitch * 0.55 - 0.03;
  }
  camera.roll = plane.roll * 0.72;
}

export function cockpitCamera(camera, plane) {
  camera.x = plane.x + Math.sin(plane.heading) * 1.4;
  camera.z = plane.z - Math.cos(plane.heading) * 1.4;
  camera.y = plane.y + 1.65;
  camera.heading = plane.heading;
  camera.pitch = plane.pitch;
  camera.roll = plane.roll;
}

// ------------------------------------------------------------------
// Sky, light and atmosphere.

function buildSkyDome() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.42, PALETTE.skyMid);
  grad.addColorStop(0.62, '#e9c493');
  grad.addColorStop(0.72, PALETTE.skyLow);
  grad.addColorStop(0.8, '#eec39a');
  grad.addColorStop(1, '#7e6a4e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(11500, 24, 16), mat);
  dome.renderOrder = -10;
  return dome;
}

function buildEnvironment(scene) {
  // A pocket sky — dome plus a bright sun ball — run through PMREM
  // so the water and the canopy glass reflect the evening for real.
  const envScene = new THREE.Scene();
  const dome = buildSkyDome();
  dome.scale.setScalar(0.09);
  envScene.add(dome);
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(60, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false }),
  );
  sunBall.position.copy(SUN).multiplyScalar(800);
  envScene.add(sunBall);
  const pmrem = new THREE.PMREMGenerator(scene.userData.renderer);
  const envTex = pmrem.fromScene(envScene, 0.035).texture;
  pmrem.dispose();
  return envTex;
}

// ------------------------------------------------------------------
// Terrain and water.

const TERRAIN_CENTRE = { x: 400, z: 200 };
const TERRAIN_SIZE = 7800;

function biomeColour(x, z, h, slope, out) {
  const n = chartNoise(x, z) * 0.5 + 0.5;
  if (h < 0.4) {
    const deep = hexColor(PALETTE.seaFloor);
    const shelf = hexColor(PALETTE.seaShelf);
    const t = Math.min(1, Math.max(0, (h + 14) / 15));
    mixInto(out, deep, shelf, t);
    if (h > -1.6) out.lerp(hexColor(PALETTE.sandWet), (h + 1.6) / 1.6 * 0.55);
    return out;
  }
  if (h < 3.2) {
    mixInto(out, hexColor(PALETTE.sandWet), hexColor(PALETTE.sandDry), Math.min(1, h / 3.2));
    return out;
  }
  if (slope > 0.55 || h > 265) {
    mixInto(out, hexColor(PALETTE.rock), hexColor(PALETTE.rockDark), n * 0.6);
    if (h > 300) out.lerp(hexColor(PALETTE.snow), Math.min(1, (h - 300) / 90 + (slope > 0.8 ? -0.3 : 0.15)));
    return out;
  }
  if (h > 150) {
    mixInto(out, hexColor(PALETTE.scrub), hexColor(PALETTE.rock), Math.min(1, (h - 150) / 110));
    return out;
  }
  const grass = mixInto(out, hexColor(PALETTE.grassLow), hexColor(PALETTE.grassHigh), n);
  // Dry-season patchiness so a hillside is never one flat tone.
  const patch = chartNoise(x * 0.16 + 99, z * 0.16 - 99) * 0.5 + 0.5;
  grass.lerp(hexColor(PALETTE.dryGrass), Math.max(0, patch - 0.35) * 0.85);
  // Farmed lowlands: broad crop-toned patches on the flattest ground.
  if (h < 60 && slope < 0.16) {
    const plot = Math.sin(x * 0.004 + Math.sin(z * 0.003) * 2.1) * Math.sin(z * 0.0045 + Math.sin(x * 0.0026) * 1.7);
    if (plot > 0.25) {
      const crops = [PALETTE.cropWheat, PALETTE.cropYoung, PALETTE.cropDeep, PALETTE.cropFallow];
      const pick = crops[Math.abs(Math.floor(x / 210) + Math.floor(z / 210) * 3) % 4];
      grass.lerp(hexColor(pick), 0.5);
    }
  }
  return grass;
}

export function buildTerrainMesh(detailTex) {
  const SEG = 190;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + TERRAIN_CENTRE.x;
    const z = pos.getZ(i) + TERRAIN_CENTRE.z;
    // The mesh wears the visual relief (visualHeight); the flight
    // model keeps the smooth chart underneath it.
    pos.setXYZ(i, x, visualHeight(x, z), z);
  }
  geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  const colours = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - normals.getY(i);
    biomeColour(x, z, h, slope, tmp);
    colours[i * 3] = tmp.r; colours[i * 3 + 1] = tmp.g; colours[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: detailTex, roughness: 0.96, metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export function buildWaterMesh(bumpTex) {
  const geo = new THREE.CircleGeometry(11000, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: hexColor(PALETTE.sea), roughness: 0.14, metalness: 0.05,
    bumpMap: bumpTex, bumpScale: 0.9, envMapIntensity: 1.15,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(TERRAIN_CENTRE.x, 0, TERRAIN_CENTRE.z);
  mesh.receiveShadow = true;
  mesh.name = 'water';
  return mesh;
}

// ------------------------------------------------------------------
// Set dressing: runways, town, forest, bridge, lights, boats.

function runwayTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.runway;
  g.fillRect(0, 0, 128, 1024);
  const rng = makeRng(77);
  for (let i = 0; i < 2600; i++) {
    const v = 62 + Math.floor(rng() * 26);
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.fillRect(rng() * 128, rng() * 1024, 2, 2);
  }
  g.fillStyle = PALETTE.runwayLine;
  g.fillRect(5, 0, 3, 1024);
  g.fillRect(120, 0, 3, 1024);
  for (const endY of [18, 1024 - 18 - 110]) {
    for (let b = 0; b < 6; b++) g.fillRect(12 + b * 18, endY, 9, 110);
  }
  for (let d = 150; d < 880; d += 64) g.fillRect(60, d, 8, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildRunways(group) {
  const tex = runwayTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0 });
  const lampGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xffa63e, emissiveIntensity: 2.2 });
  const lampPositions = [];
  for (const rwy of RUNWAYS) {
    const geo = new THREE.PlaneGeometry(rwy.width, rwy.length);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(rwy.x, rwy.altitude + 0.18, rwy.z);
    mesh.rotation.y = Math.PI - (rwy.heading * Math.PI) / 180;
    mesh.receiveShadow = true;
    group.add(mesh);
    const rad = (rwy.heading * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fz = -Math.cos(rad);
    const rx = -fz;
    const rz = fx;
    for (let d = -rwy.length / 2; d <= rwy.length / 2; d += 62) {
      for (const s of [-1, 1]) {
        lampPositions.push([
          rwy.x + fx * d + rx * (rwy.width / 2 + 2.5) * s,
          rwy.altitude + 0.7,
          rwy.z + fz * d + rz * (rwy.width / 2 + 2.5) * s,
        ]);
      }
    }
  }
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPositions.length);
  const m4 = new THREE.Matrix4();
  lampPositions.forEach((p, i) => {
    m4.makeTranslation(p[0], p[1], p[2]);
    lamps.setMatrixAt(i, m4);
  });
  lamps.instanceMatrix.needsUpdate = true;
  group.add(lamps);
}

const WALL_COLOURS = ['#e8dcc3', '#f2ede2', '#dfa583', '#b9b3a4'];
const ROOF_COLOURS = ['#b5542f', '#5d6a76', '#6e4a35'];

export function buildTown(group) {
  const wallMats = WALL_COLOURS.map((hex) => new THREE.MeshStandardMaterial({ color: hexColor(hex), roughness: 0.85 }));
  const roofMats = ROOF_COLOURS.map((hex) => new THREE.MeshStandardMaterial({ color: hexColor(hex), roughness: 0.8 }));
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x9a8d7c, roughness: 0.9 });
  for (const b of TOWN_BLOCKS) {
    const house = new THREE.Group();
    const base = visualHeight(b.x, b.z);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), wallMats[b.wall % wallMats.length]);
    walls.position.y = b.h / 2 - 0.6;
    walls.castShadow = true;
    walls.receiveShadow = true;
    house.add(walls);
    // Pitched roof: a triangular prism extruded along the depth.
    const roofH = b.h * 0.52 + 2;
    const shape = new THREE.Shape();
    shape.moveTo(-b.w * 0.58, 0);
    shape.lineTo(b.w * 0.58, 0);
    shape.lineTo(0, roofH);
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: b.d * 1.06, bevelEnabled: false });
    roofGeo.translate(0, 0, -b.d * 0.53);
    const roof = new THREE.Mesh(roofGeo, roofMats[b.roof % roofMats.length]);
    roof.position.y = b.h - 0.6;
    roof.castShadow = true;
    house.add(roof);
    if (b.chimney) {
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.4, 1.6), chimneyMat);
      chimney.position.set(b.w * 0.26, b.h - 0.6 + roofH * 0.72, 0);
      house.add(chimney);
    }
    house.position.set(b.x, base, b.z);
    house.rotation.y = -b.rot;
    group.add(house);
  }
}

export function buildForest(group) {
  const rng = makeRng(90210);
  const spots = [];
  let guard = 0;
  while (spots.length < 1150 && guard < 16000) {
    guard++;
    const x = -3200 + rng() * 7200;
    const z = -3400 + rng() * 7200;
    const h = visualHeight(x, z);
    if (h < 3 || h > 175) continue;
    if (surfaceKind(x, z, h) === 'runway') continue;
    const slope = Math.abs(visualHeight(x + 9, z) - h) + Math.abs(visualHeight(x, z + 9) - h);
    if (slope > 9) continue;
    spots.push({ x, z, h, s: 1.0 + rng() * 2.1, tone: rng() });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.8, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.trunk), roughness: 0.95 });
  const canopyGeo = new THREE.IcosahedronGeometry(2.1, 1);
  canopyGeo.scale(1, 0.82, 1);
  const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const tone = new THREE.Color();
  const dark = hexColor(PALETTE.leafDark);
  const lit = hexColor(PALETTE.leafLit);
  spots.forEach((t, i) => {
    pos.set(t.x, t.h + 0.7 * t.s, t.z);
    scl.setScalar(t.s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.tone * Math.PI * 2);
    m4.compose(pos, q, scl);
    trunks.setMatrixAt(i, m4);
    pos.set(t.x, t.h + (1.8 + 1.5) * t.s, t.z);
    m4.compose(pos, q, scl);
    canopies.setMatrixAt(i, m4);
    tone.copy(dark).lerp(lit, t.tone * 0.8);
    canopies.setColorAt(i, tone);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  canopies.castShadow = true;
  group.add(trunks);
  group.add(canopies);
}

// Rock outcrops: grey teeth wherever the relieved hillside runs
// steep — a few hundred instanced icosahedra seated into the slope.
export function buildRockOutcrops(group) {
  const rng = makeRng(5150);
  const spots = [];
  let guard = 0;
  while (spots.length < 340 && guard < 30000) {
    guard++;
    const x = -3200 + rng() * 7200;
    const z = -3400 + rng() * 7200;
    const h = visualHeight(x, z);
    if (h < 8) continue;
    const slope = Math.abs(visualHeight(x + 12, z) - h) + Math.abs(visualHeight(x, z + 12) - h);
    if (slope < 7) continue;
    if (surfaceKind(x, z, h) === 'runway') continue;
    // Keep the strips' shoulders clear: no boulders looming over a
    // runway the player is trying to land on.
    if (RUNWAYS.some((r) => Math.hypot(x - r.x, z - r.z) < 430)) continue;
    spots.push({
      x, z, h, s: 0.8 + rng() * 2.6,
      rx: rng() * 3, ry: rng() * 3, rz: rng() * 3, tone: rng(),
    });
  }
  const geo = new THREE.IcosahedronGeometry(2.4, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const rocks = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const tone = new THREE.Color();
  const dark = hexColor(PALETTE.rockDark);
  const lit = hexColor(PALETTE.rock);
  spots.forEach((r, i) => {
    pos.set(r.x, r.h + 0.4, r.z);
    eul.set(r.rx, r.ry, r.rz);
    q.setFromEuler(eul);
    scl.set(r.s * 1.25, r.s * 0.8, r.s);
    m4.compose(pos, q, scl);
    rocks.setMatrixAt(i, m4);
    tone.copy(dark).lerp(lit, r.tone);
    rocks.setColorAt(i, tone);
  });
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  group.add(rocks);
}

// Shoreline foam: a pale ribbon riding each island's waterline,
// its edge found by bisecting the heightfield for the h ≈ 0.4
// contour, ray by ray, so the wobble of the chart becomes the
// wobble of the surf line. It floats a breath above the water and
// never z-fights it.
export function buildFoamRings(group) {
  const mat = new THREE.MeshBasicMaterial({
    color: hexColor(PALETTE.foam), transparent: true, opacity: 0.5, depthWrite: false,
  });
  for (const island of ISLANDS) {
    const STEPS = 90;
    const positions = [];
    const indices = [];
    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let lo = island.radius * 0.2;
      let hi = island.radius * 1.5;
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2;
        if (groundHeight(island.x + ca * mid, island.z + sa * mid) > 0.4) lo = mid;
        else hi = mid;
      }
      const r = (lo + hi) / 2;
      positions.push(
        island.x + ca * (r - 7), 0.32, island.z + sa * (r - 7),
        island.x + ca * (r + 9), 0.32, island.z + sa * (r + 9),
      );
      if (i < STEPS) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    group.add(mesh);
  }
}

export function buildBridge(group) {
  const A = { x: 628, z: 921 };
  const B = { x: 1115, z: 317 };
  const deckY = Math.max(groundHeight(A.x, A.z), groundHeight(B.x, B.z)) + 15;
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  const hdg = Math.atan2(B.x - A.x, -(B.z - A.z));
  const bridge = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x707a84, roughness: 0.45, metalness: 0.65 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x4c4f45, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.5, len), deckMat);
  deck.position.set((A.x + B.x) / 2, deckY, (A.z + B.z) / 2);
  deck.rotation.y = Math.PI - hdg;
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridge.add(deck);
  // Two portal pylons and their crossbars.
  const pylonTops = [];
  for (const t of [0.36, 0.64]) {
    const px = A.x + (B.x - A.x) * t;
    const pz = A.z + (B.z - A.z) * t;
    const topY = deckY + 17;
    pylonTops.push({ x: px, z: pz, topY });
    const across = { x: Math.cos(hdg), z: Math.sin(hdg) };
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, topY, 1.1), steel);
      leg.position.set(px + across.x * 3.4 * s, topY / 2, pz + across.z * 3.4 * s);
      leg.castShadow = true;
      bridge.add(leg);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.1, 1.1), steel);
    bar.position.set(px, topY - 1, pz);
    bar.rotation.y = Math.PI - hdg;
    bridge.add(bar);
  }
  // Main cables: catenary sags between the shore anchors and the
  // pylon tops, drawn as tubes along a CatmullRom curve.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x3c4249, roughness: 0.5, metalness: 0.6 });
  const across = { x: Math.cos(hdg), z: Math.sin(hdg) };
  for (const s of [-1, 1]) {
    const pts = [];
    const off = { x: across.x * 3.4 * s, z: across.z * 3.4 * s };
    pts.push(new THREE.Vector3(A.x + off.x, deckY + 1.5, A.z + off.z));
    pts.push(new THREE.Vector3(
      A.x + (B.x - A.x) * 0.18 + off.x, deckY + 4.5, A.z + (B.z - A.z) * 0.18 + off.z));
    pts.push(new THREE.Vector3(pylonTops[0].x + off.x, pylonTops[0].topY, pylonTops[0].z + off.z));
    pts.push(new THREE.Vector3(
      (pylonTops[0].x + pylonTops[1].x) / 2 + off.x, deckY + 3.2,
      (pylonTops[0].z + pylonTops[1].z) / 2 + off.z));
    pts.push(new THREE.Vector3(pylonTops[1].x + off.x, pylonTops[1].topY, pylonTops[1].z + off.z));
    pts.push(new THREE.Vector3(
      A.x + (B.x - A.x) * 0.82 + off.x, deckY + 4.5, A.z + (B.z - A.z) * 0.82 + off.z));
    pts.push(new THREE.Vector3(B.x + off.x, deckY + 1.5, B.z + off.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 42, 0.32, 5), cableMat);
    bridge.add(tube);
  }
  group.add(bridge);
  return { deckY };
}

export function buildLighthouses(group, glowTex) {
  for (const lm of LANDMARKS) {
    const base = groundHeight(lm.x, lm.z);
    const tower = new THREE.Group();
    const stripeC = document.createElement('canvas');
    stripeC.width = 32; stripeC.height = 128;
    const sg = stripeC.getContext('2d');
    sg.fillStyle = '#f4efe4';
    sg.fillRect(0, 0, 32, 128);
    sg.fillStyle = '#c33d2a';
    sg.fillRect(0, 26, 32, 22);
    sg.fillRect(0, 76, 32, 22);
    const stripeTex = new THREE.CanvasTexture(stripeC);
    stripeTex.colorSpace = THREE.SRGBColorSpace;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 3.6, lm.height, 12),
      new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 }),
    );
    shaft.position.y = lm.height / 2;
    shaft.castShadow = true;
    tower.add(shaft);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffbe6e, emissiveIntensity: 3.2 }),
    );
    lamp.position.y = lm.height + 2;
    tower.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffcf90, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(26);
    halo.position.y = lm.height + 2;
    tower.add(halo);
    tower.position.set(lm.x, base - 1, lm.z);
    group.add(tower);
  }
}

const BOAT_LANES = [
  { ax: 1750, az: 1750, bx: 2350, bz: 1300, speed: 3.2, phase: 0.45, len: 30, colour: 0xe8e2d2, kind: 'ferry' },
  { ax: 2150, az: 1150, bx: 2750, bz: 1600, speed: 2.6, phase: 0.41, len: 22, colour: 0xb9c4c9, kind: 'coaster' },
  { ax: 400, az: 2500, bx: 1900, bz: 3050, speed: 2.2, phase: 0.3, len: 13, colour: 0xd96f4a, kind: 'fishing' },
  { ax: -600, az: 600, bx: 500, bz: -300, speed: 2.9, phase: 0.7, len: 11, colour: 0xfdf6e0, kind: 'sail' },
  { ax: 2900, az: 2900, bx: 3600, bz: 1900, speed: 2.4, phase: 0.45, len: 12, colour: 0x7fa8b8, kind: 'fishing' },
];

export function buildBoats(group) {
  const boats = [];
  for (const lane of BOAT_LANES) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(lane.len * 0.24, lane.len * 0.14, lane.len),
      new THREE.MeshStandardMaterial({ color: lane.colour, roughness: 0.55, metalness: 0.15 }),
    );
    hull.position.y = lane.len * 0.05;
    hull.castShadow = true;
    boat.add(hull);
    const bowGeo = new THREE.CylinderGeometry(0.01, lane.len * 0.17, lane.len * 0.3, 4);
    bowGeo.rotateX(Math.PI / 2);
    bowGeo.rotateY(Math.PI / 4);
    const bow = new THREE.Mesh(bowGeo, hull.material);
    bow.position.set(0, lane.len * 0.05, -lane.len * 0.62);
    boat.add(bow);
    if (lane.kind === 'sail') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 11, 6),
        new THREE.MeshStandardMaterial({ color: 0x6d5942, roughness: 0.8 }));
      mast.position.y = 6;
      boat.add(mast);
      const sailShape = new THREE.Shape();
      sailShape.moveTo(0, 0); sailShape.lineTo(0, 9.6); sailShape.lineTo(4.6, 0.6); sailShape.closePath();
      const sail = new THREE.Mesh(
        new THREE.ShapeGeometry(sailShape),
        new THREE.MeshStandardMaterial({ color: 0xfdf6e0, roughness: 0.85, side: THREE.DoubleSide }),
      );
      sail.position.set(0.1, 1.2, 0.6);
      boat.add(sail);
    } else {
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(lane.len * 0.18, lane.len * 0.13, lane.len * 0.42),
        new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 }),
      );
      cabin.position.set(0, lane.len * 0.16, lane.len * 0.12);
      cabin.castShadow = true;
      boat.add(cabin);
    }
    const wake = new THREE.Mesh(
      new THREE.PlaneGeometry(lane.len * 0.5, lane.len * 1.7),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    wake.geometry.rotateX(-Math.PI / 2);
    wake.position.set(0, -0.35, lane.len * 1.15);
    boat.add(wake);
    group.add(boat);
    boats.push({ lane, boat });
  }
  return boats;
}

export function updateBoats(boats, t) {
  for (const { lane, boat } of boats) {
    const span = Math.hypot(lane.bx - lane.ax, lane.bz - lane.az);
    const cycle = ((t * lane.speed) / span + lane.phase) % 2;
    const f = cycle < 1 ? cycle : 2 - cycle;
    const dirSign = cycle < 1 ? 1 : -1;
    boat.position.set(
      lane.ax + (lane.bx - lane.ax) * f,
      0.35 + Math.sin(t * 0.8 + lane.phase * 9) * 0.18,
      lane.az + (lane.bz - lane.az) * f,
    );
    const hdg = Math.atan2((lane.bx - lane.ax) * dirSign, -((lane.bz - lane.az) * dirSign));
    boat.rotation.set(Math.sin(t * 0.7 + lane.phase * 7) * 0.02, Math.PI - hdg, Math.sin(t * 0.6 + lane.phase * 5) * 0.03);
  }
}

// ------------------------------------------------------------------
// Mission rings and the juice points cloud.

export function buildRings(group) {
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(42, 2.1, 10, 44),
      new THREE.MeshStandardMaterial({
        color: 0x8a6a20, emissive: hexColor(PALETTE.ring), emissiveIntensity: 0.55,
        roughness: 0.4, metalness: 0.2,
      }),
    );
    mesh.visible = false;
    group.add(mesh);
    const echo = new THREE.Mesh(
      new THREE.TorusGeometry(42, 0.8, 8, 44),
      new THREE.MeshBasicMaterial({ color: hexColor(PALETTE.ringNext), transparent: true, opacity: 0, depthWrite: false }),
    );
    echo.visible = false;
    group.add(echo);
    rings.push({ mesh, echo });
  }
  return rings;
}

export function updateRings(rings, state, t) {
  const upcoming = nextRing(state);
  const pulse = (t * 0.65) % 1;
  state.mission.rings.forEach((ring, i) => {
    const slot = rings[i];
    if (!slot) return;
    if (ring.passed) {
      slot.mesh.visible = false;
      slot.echo.visible = false;
      return;
    }
    slot.mesh.visible = true;
    slot.mesh.position.set(ring.x, ring.y, ring.z);
    slot.mesh.rotation.y = Math.PI - (ring.heading * Math.PI) / 180;
    const isNext = ring === upcoming;
    slot.mesh.material.emissive.set(isNext ? PALETTE.ringNext : PALETTE.ring);
    slot.mesh.material.emissiveIntensity = isNext ? 1.5 + Math.sin(t * 5) * 0.35 : 0.5;
    slot.echo.visible = isNext;
    if (isNext) {
      slot.echo.position.copy(slot.mesh.position);
      slot.echo.rotation.copy(slot.mesh.rotation);
      const s = 1 + pulse * 0.4;
      slot.echo.scale.setScalar(s);
      slot.echo.material.opacity = (1 - pulse) * 0.55;
    }
  });
  for (let i = state.mission.rings.length; i < rings.length; i++) {
    rings[i].mesh.visible = false;
    rings[i].echo.visible = false;
  }
}

const MAX_POINTS = 512;

export function buildJuicePoints(group, glowTex) {
  const makeSystem = (size, blending, opacity) => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3).fill(-9999);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: true, transparent: true, opacity,
      blending, depthWrite: false, color: 0xffffff, vertexColors: true,
      map: glowTex, alphaTest: 0.01,
    });
    const colours = new Float32Array(MAX_POINTS * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    return { points, positions, colours };
  };
  const sparks = makeSystem(0.8, THREE.AdditiveBlending, 0.95);
  sparks.points.material.color.set(0xffcd5c);
  const soft = makeSystem(0.55, THREE.NormalBlending, 0.3);
  // Smoke gets its own system: the puffs are metres wide, not
  // centimetres, and a point sprite's size is per-system.
  const smoke = makeSystem(3.4, THREE.NormalBlending, 0.45);
  return { sparks, soft, smoke };
}

const KIND_RGB = [
  [1.0, 0.8, 0.36],
  [0.96, 0.98, 1.0],
  [0.86, 0.73, 0.54],
  [0.97, 0.98, 1.0],
];

export function updateJuicePoints(systems, pool) {
  const lanes = [
    { sys: systems.sparks, used: 0 },
    { sys: systems.soft, used: 0 },
    { sys: systems.smoke, used: 0 },
  ];
  for (const p of pool.items) {
    if (!p.alive) continue;
    const f = p.age / p.life;
    const lane = p.kind === PARTICLE_KINDS.SPARK ? lanes[0]
      : p.kind === PARTICLE_KINDS.SMOKE ? lanes[2] : lanes[1];
    if (lane.used >= MAX_POINTS) continue;
    const i = lane.used;
    lane.sys.positions[i * 3] = p.x;
    lane.sys.positions[i * 3 + 1] = p.y;
    lane.sys.positions[i * 3 + 2] = p.z;
    const rgb = KIND_RGB[p.kind];
    const fade = 1 - f * f;
    lane.sys.colours[i * 3] = rgb[0] * fade;
    lane.sys.colours[i * 3 + 1] = rgb[1] * fade;
    lane.sys.colours[i * 3 + 2] = rgb[2] * fade;
    lane.used++;
  }
  for (const { sys, used } of lanes) {
    for (let i = used; i < MAX_POINTS; i++) sys.positions[i * 3 + 1] = -9999;
    sys.points.geometry.attributes.position.needsUpdate = true;
    sys.points.geometry.attributes.color.needsUpdate = true;
    sys.points.geometry.setDrawRange(0, MAX_POINTS);
  }
}

// ------------------------------------------------------------------
// Clouds: soft sprites drifting over the chart.

export function buildClouds(group, glowTex) {
  const rng = makeRng(1357);
  const clouds = [];
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff4e0, transparent: true, opacity: 0.42, depthWrite: false, fog: false,
  });
  for (let i = 0; i < 34; i++) {
    const cluster = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Sprite(mat);
      puff.position.set((rng() - 0.5) * 260, (rng() - 0.5) * 36, (rng() - 0.5) * 120);
      puff.scale.set(300 + rng() * 320, 90 + rng() * 80, 1);
      cluster.add(puff);
    }
    cluster.position.set(-3800 + rng() * 8400, 330 + rng() * 260, -3800 + rng() * 8400);
    group.add(cluster);
    clouds.push({ cluster, speed: 1.1 + rng() * 1.3 });
  }
  return clouds;
}

// ------------------------------------------------------------------
// The world assembly and the per-frame sync.

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HAZE.clone(), 900, 7200);

  const camera3 = new THREE.PerspectiveCamera(60, 1280 / 800, 0.5, 24000);

  const world = { renderer, scene, camera3, t: 0 };
  scene.userData.renderer = renderer;
  scene.environment = buildEnvironment(scene);
  scene.environmentIntensity = 0.62;

  const dome = buildSkyDome();
  scene.add(dome);
  world.dome = dome;

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,226,170,1)', 'rgba(255,190,110,0)'),
    color: 0xffe2aa, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunSprite.scale.setScalar(1150);
  scene.add(sunSprite);
  world.sunSprite = sunSprite;

  const hemi = new THREE.HemisphereLight(0xbdd3f2, 0x8a7a56, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a3, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 2200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 2.2;
  scene.add(sun);
  scene.add(sun.target);
  world.sun = sun;

  const detailTex = makeNoiseTexture(256, 238, 40);
  detailTex.repeat.set(210, 210);
  const terrain = buildTerrainMesh(detailTex);
  scene.add(terrain);
  const bumpTex = makeNoiseTexture(256, 200, 90);
  bumpTex.repeat.set(300, 300);
  const water = buildWaterMesh(bumpTex);
  scene.add(water);

  const dressing = new THREE.Group();
  scene.add(dressing);
  buildRunways(dressing);
  buildTown(dressing);
  buildForest(dressing);
  buildRockOutcrops(dressing);
  buildFoamRings(dressing);
  buildBridge(dressing);
  world.life = createLifeWorld(makeGlowTexture('rgba(255,190,110,1)', 'rgba(255,150,60,0)'));
  dressing.add(world.life.group);
  buildLighthouses(dressing, makeGlowTexture('rgba(255,215,150,1)', 'rgba(255,190,110,0)'));
  world.boats = buildBoats(dressing);
  world.rings = buildRings(dressing);
  world.clouds = buildClouds(dressing, makeGlowTexture('rgba(255,248,235,1)', 'rgba(255,248,235,0)'));
  world.juice = buildJuicePoints(dressing, makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'));

  world.petrel = buildPetrelAircraft();
  scene.add(world.petrel.group);

  world.lastW = 0;
  world.lastH = 0;
  return world;
}

const _target = new THREE.Vector3();
const _pos = new THREE.Vector3();

// Turn the plain camera state into the three.js camera, pose the
// aircraft, advance the dressing, and render.
export function syncWorld(world, game, cameraState, pool, t, dt) {
  world.t = t;
  const { renderer, scene, camera3 } = world;
  const plane = game.plane;

  const cw = renderer.domElement.clientWidth || 1280;
  const ch = renderer.domElement.clientHeight || 800;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.floor(cw * dpr);
  const ph = Math.floor(ch * dpr);
  if (pw !== world.lastW || ph !== world.lastH) {
    renderer.setSize(pw, ph, false);
    camera3.aspect = pw / ph;
    camera3.updateProjectionMatrix();
    world.lastW = pw;
    world.lastH = ph;
  }

  _pos.set(cameraState.x, cameraState.y, cameraState.z);
  // Terrain floor: the chase camera may never sink inside a hillside
  // (the spring overshoots on the title screen, and valleys are tight).
  const camGround = groundHeight(_pos.x, _pos.z);
  if (_pos.y < camGround + 2.5) _pos.y = camGround + 2.5;
  camera3.position.copy(_pos);
  const cp = Math.cos(cameraState.pitch);
  _target.set(
    cameraState.x + Math.sin(cameraState.heading) * cp * 100,
    cameraState.y + Math.sin(cameraState.pitch) * 100,
    cameraState.z - Math.cos(cameraState.heading) * cp * 100,
  );
  camera3.up.set(0, 1, 0);
  camera3.lookAt(_target);
  camera3.rotateZ(cameraState.roll);

  world.dome.position.copy(_pos);
  world.sunSprite.position.copy(_pos).addScaledVector(SUN, 9800);
  world.sun.position.copy(_pos).addScaledVector(SUN, 900);
  world.sun.target.position.set(plane.x, plane.y, plane.z);

  updatePetrelAircraft(world.petrel, plane, t);
  world.petrel.group.visible = game.cameraMode !== 'cockpit';
  updateRings(world.rings, game.missionState, t);
  updateBoats(world.boats, t);
  if (world.life) updateLifeWorld(world.life, t, game.missionState.mission.wind);
  for (const c of world.clouds) {
    c.cluster.position.x += c.speed * dt;
    if (c.cluster.position.x > 5200) c.cluster.position.x = -5200;
  }
  if (pool) updateJuicePoints(world.juice, pool);

  renderer.render(scene, camera3);
  window.__sceneReady = true;
}
