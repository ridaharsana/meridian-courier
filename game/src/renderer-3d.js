// renderer-3d.js — the archipelago as a real three.js world: a
// heightfield terrain mesh with biome vertex colours under a golden
// directional sun with soft shadows, PMREM sky reflections in the
// water and the canopy glass, instanced forests, a built town, the
// Pilot Islet bridge, working boats and torus mission rings. The
// camera state stays the plain spring-settled object the game has
// always flown; this file turns it into a three.js camera each frame.

import * as THREE from 'three';
import { WORLD, PALETTE, RUNWAYS, ISLANDS } from './config.js';
import { groundHeight, visualHeight, surfaceKind, chartNoise, ridgeCrest, TOWN_BLOCKS, LANDMARKS } from './terrain-archipelago.js';
import { buildPetrelAircraft, updatePetrelAircraft } from './aircraft-art.js';
import { createLifeWorld, updateLifeWorld } from './traffic-and-life.js';
import { nextRing } from './missions.js';
import { PARTICLE_KINDS } from './juice-particles.js';

// v15: the sun sits lower than it did (about 17 degrees up, not 24),
// so the evening shadows stretch and the slopes model themselves.
export const SUN_DIR = { x: 0.68, y: 0.24, z: -0.39 };
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

// A cloud puff with its lighting baked in (v15): overlapping blobs
// drawn twice over — a warm-grey shaded belly low and wide, then
// bright sunlit crowns above it — so a flat sprite still reads as a
// lit volume instead of a white smear.
export function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const rng = makeRng(777);
  const blob = (x, y, r, inner, outer) => {
    const grad = g.createRadialGradient(x, y, r * 0.1, x, y, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (let i = 0; i < 9; i++) {
    const x = 52 + rng() * 152;
    const y = 66 + rng() * 22;
    const r = 30 + rng() * 30;
    blob(x, y, r, 'rgba(186,164,142,0.20)', 'rgba(186,164,142,0)');
  }
  for (let i = 0; i < 11; i++) {
    const x = 46 + rng() * 164;
    const y = 38 + rng() * 30;
    const r = 24 + rng() * 30;
    blob(x, y, r, 'rgba(255,250,238,0.30)', 'rgba(255,250,238,0)');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A smoke puff with a body (v15): several overlapping blobs build an
// opaque-ish core with an irregular rim, then a destination-out
// radial pass eats the square canvas edge away so no two puffs share
// the same silhouette. Replaces the plain radial glow, which read
// as bokeh dots.
export function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const rng = makeRng(31337);
  const blob = (x, y, r, a) => {
    const grad = g.createRadialGradient(x, y, r * 0.08, x, y, r);
    grad.addColorStop(0, `rgba(255,253,249,${a})`);
    grad.addColorStop(1, 'rgba(255,253,249,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * 26;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 17 + rng() * 15, 0.34);
  }
  blob(64, 64, 30, 0.5);
  blob(58, 58, 20, 0.45);
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createRadialGradient(64, 64, 40, 64, 64, 63);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
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

// The two ends of the v15 baked-light grade: slopes the low sun
// faces take a warm kiss, slopes turned away fall cool.
const SUN_WARM = new THREE.Color('#ffbe78');
const SHADE_COOL = new THREE.Color('#5f7ca6');
// v18: the ridge crests wear bare grey rock, so the new skyline
// reads as mountain, not lawn, where the ridge ring takes over.
const CREST_ROCK = new THREE.Color('#8a8d90');

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
    // v20: a gate around Mount Vela alone. Inside it the strait
    // flank — the shadow side the cargo camera reads — keeps
    // more of its colour and takes rock earlier, so it reads as
    // shaped ground instead of a dark blob. The gate dies to
    // zero well short of Porto Lume and the Meridian valley, so
    // the approach and finale frames keep their v19 light.
    const vg = Math.max(0, Math.min(1, (1250 - Math.hypot(x - 1900, z + 700)) / 300))
      * Math.max(0, Math.min(1, (0.10 - Math.atan2(x - 1900, z + 700)) / 0.12));
    const crest = ridgeCrest(x, z, h);
    if (crest > 0.3 - vg * 0.14) tmp.lerp(CREST_ROCK, Math.min(0.78 + vg * 0.07, (crest - 0.3 + vg * 0.14) * 1.15));
    // Baked light (v15). The directional sun alone leaves the smooth
    // island domes reading flat, so two cheap terms are folded into
    // the vertex colour: a fake ambient occlusion — ground whose
    // neighbours stand higher than it sits in a hollow and darkens —
    // and a sun-facing grade from the vertex normal, warm on the lit
    // side, cool on the turned side. Land only: the sea floor keeps
    // its chart colours, and the runway plateaus stay clean because
    // their relief (and so their AO term) is already zero.
    if (h > 0.4) {
      const around = (visualHeight(x + 34, z) + visualHeight(x - 34, z)
        + visualHeight(x, z + 34) + visualHeight(x, z - 34)) / 4;
      const hollow = Math.max(0, around - h);
      const ao = (1 - Math.min(0.32, hollow * 0.011)) * (0.95 + 0.05 * Math.min(1, h / 120));
      const sunFace = normals.getX(i) * SUN.x + normals.getY(i) * SUN.y + normals.getZ(i) * SUN.z;
      const lit = Math.max(0, sunFace);
      tmp.multiplyScalar((0.84 + 0.28 * lit + vg * 0.16 * (1 - lit)) * ao);
      tmp.lerp(SUN_WARM, lit * lit * 0.15);
      tmp.lerp(SHADE_COOL, (Math.max(0, -sunFace) * 0.10 + (1 - lit) * 0.03) * (1 - vg * 0.65));
    }
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
    color: hexColor(PALETTE.sea), roughness: 0.11, metalness: 0.05,
    bumpMap: bumpTex, bumpScale: 0.9, envMapIntensity: 1.45,
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

// ------------------------------------------------------------------
// v18 landmarks: the Vela waterfall and the strait guardian — the
// two silhouettes the thumbnail can remember the archipelago by.

// The fall drops down Mount Vela's strait-facing flank, on the
// azimuth the mail run looks at, from the high shoulder to a foam
// patch in the sea. The ribbon hugs the relieved mesh; its streak
// texture scrolls (syncWorld) so the water is always falling.
const FALL = { x: 1900, z: -700, dx: -0.635, dz: 0.774 };

function waterfallTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  // v19: the fall is strands, not a sheet — a pale base cut by
  // vertical alpha gaps, so the rock shows between the threads
  // and the eye reads falling water instead of a bright slide.
  g.fillStyle = 'rgba(178,220,244,0.82)';
  g.fillRect(0, 0, 64, 256);
  const rng = makeRng(9182);
  for (let i = 0; i < 46; i++) {
    const x = rng() * 64;
    g.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.55})`;
    g.fillRect(x, rng() * 40, 1.6 + rng() * 2.6, 90 + rng() * 150);
  }
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(90,150,190,${0.16 + rng() * 0.2})`;
    g.fillRect(rng() * 64, rng() * 60, 2.5 + rng() * 3, 120 + rng() * 120);
  }
  // The gaps: narrow columns erased to near-clear, wandering a
  // little as they drop, so the strands separate and rejoin.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    let x = 4 + rng() * 56;
    const w = 1.6 + rng() * 2.6;
    for (let y = 0; y < 256; y += 16) {
      g.fillStyle = `rgba(0,0,0,${0.55 + rng() * 0.4})`;
      g.fillRect(x, y, w, 16);
      x += (rng() - 0.5) * 1.6;
    }
  }
  g.globalCompositeOperation = 'source-over';
  // Bright cores down the surviving strands.
  for (let i = 0; i < 9; i++) {
    const x = rng() * 60;
    g.fillStyle = `rgba(255,255,255,${0.5 + rng() * 0.4})`;
    g.fillRect(x, rng() * 30, 1.2 + rng() * 1.4, 150 + rng() * 100);
  }
  // A shadowed rock edge down one side grounds the ribbon.
  const edge = g.createLinearGradient(0, 0, 9, 0);
  edge.addColorStop(0, 'rgba(38,52,66,0.55)');
  edge.addColorStop(1, 'rgba(38,52,66,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 9, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWaterfall(group, glowTex) {
  const tex = waterfallTexture();
  const SEGMENTS = 30;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const r = 300 + (795 * i) / SEGMENTS;
    const px = FALL.x + FALL.dx * r;
    const pz = FALL.z + FALL.dz * r;
    // v19: the ribbon pinches and swells as it drops — a real
    // fall necks over ledges and fans between them.
    const w = (4.5 + (r - 300) / 795 * 9) * (0.84 + 0.26 * (0.5 + 0.5 * Math.sin(i * 0.9 + 1.3)));
    const y = visualHeight(px, pz) + 1.5;
    positions.push(
      px - FALL.dz * w, y, pz + FALL.dx * w,
      px + FALL.dz * w, y, pz - FALL.dx * w,
    );
    uvs.push(0, i / SEGMENTS * 3, 1, i / SEGMENTS * 3);
    if (i < SEGMENTS) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const fall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.94, depthWrite: false, side: THREE.DoubleSide,
  }));
  fall.renderOrder = 3;
  group.add(fall);
  // The plunge pool: two foam discs and a breath of mist where
  // the fall meets the sea, just past the waterline.
  const bx = FALL.x + FALL.dx * 1115;
  const bz = FALL.z + FALL.dz * 1115;
  // v19: a third, small, near-opaque disc at the plunge point —
  // the churn where the water lands, bright enough to read as
  // impact foam rather than a pale patch.
  for (const [radius, opacity, y] of [[34, 0.5, 0.34], [19, 0.8, 0.44], [10, 0.95, 0.54]]) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 22),
      new THREE.MeshBasicMaterial({ color: hexColor(PALETTE.foam), transparent: true, opacity, depthWrite: false }),
    );
    disc.geometry.rotateX(-Math.PI / 2);
    disc.position.set(bx, y, bz);
    disc.renderOrder = 2;
    group.add(disc);
  }
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false,
  }));
  mist.scale.setScalar(96);
  mist.position.set(bx, 13, bz);
  group.add(mist);
  return tex;
}

// The Guardian of the Strait: a colossal weathered figure on the
// Pilot Islet summit, spear raised over the bridge reach, facing
// the incoming ring line. Built from plain stone blocks on a
// stepped plinth — a silhouette first, a statue second: at
// thumbnail size the raised spear and helm crest are the read.
export function buildGuardian(group) {
  // v20: paler stone, so the figure holds its own against the
  // dark flank behind it at thumbnail size.
  const stone = new THREE.MeshStandardMaterial({ color: 0xa9a69b, roughness: 0.95 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x8b887d, roughness: 0.97 });
  const moss = new THREE.MeshStandardMaterial({ color: 0x67754d, roughness: 1 });
  const g = new THREE.Group();
  const box = (mat, w, h, d, x, y, z, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    g.add(m);
    return m;
  };
  box(moss, 30, 5, 30, 0, 2.5, 0);
  box(stoneDark, 23, 5, 23, 0, 7.5, 0);
  box(stone, 17, 5, 17, 0, 12.5, 0);
  box(stoneDark, 3.4, 20, 3.6, -3.4, 25, 0);
  box(stoneDark, 3.4, 20, 3.6, 3.4, 25, 0);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 8.8, 24, 6), stone);
  robe.position.y = 47;
  g.add(robe);
  box(stone, 13.5, 9, 6.5, 0, 63.5, 0);
  box(stoneDark, 16, 3.5, 5, 0, 69.5, 0);
  box(stone, 3, 19, 3, -8.8, 57, 0, 0.1); // left arm, lowered
  box(stone, 3, 13, 3, 10.2, 73, 0, -0.85); // right arm, raised
  box(stone, 2.6, 11, 2.6, 15.2, 81, 0, -0.22);
  const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 58, 6), stoneDark);
  spear.position.set(17.2, 93, 0);
  g.add(spear);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.15, 5.5, 6), stone);
  tip.position.set(17.2, 124.5, 0);
  g.add(tip);
  box(stoneDark, 3, 3, 3, 0, 72.5, 0);
  box(stone, 6.4, 7.6, 6.2, 0, 78, 0);
  box(stoneDark, 6.9, 1.6, 1.3, 0, 79.6, -3.3); // the brow slab
  box(stone, 0.9, 4.6, 10.5, 0, 84.2, -0.3); // the helm crest
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // v20: a third again as tall — the plinth base sits on the
  // group origin, so the scale grows the figure upward from
  // its seat and the summit keeps it.
  g.scale.setScalar(1.3);
  // Face the strait gate: the ring line's second hoop.
  const fx = 530 - 1250;
  const fz = 1100 - 150;
  g.rotation.y = Math.atan2(-fx, -fz);
  g.position.set(1250, groundHeight(1250, 150) - 1.5, 150);
  group.add(g);
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

// The next-ring green, deepened for the grade (v15): the palette's
// mint at high emissive intensity blows out to near-white under
// ACES, so the hoop itself burns a richer green and stays a colour.
const NEXT_GREEN = '#17d95e';

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
    slot.mesh.material.emissive.set(isNext ? NEXT_GREEN : PALETTE.ring);
    // v15: driven harder, in the deeper green — saturation survives.
    slot.mesh.material.emissiveIntensity = isNext ? 2.1 + Math.sin(t * 5) * 0.35 : 0.7;
    if (isNext) slot.echo.material.color.set(NEXT_GREEN);
    slot.echo.visible = isNext;
    if (isNext) {
      slot.echo.position.copy(slot.mesh.position);
      slot.echo.rotation.copy(slot.mesh.rotation);
      const s = 1 + pulse * 0.4;
      slot.echo.scale.setScalar(s);
      slot.echo.material.opacity = (1 - pulse) * 0.72;
    }
  });
  for (let i = state.mission.rings.length; i < rings.length; i++) {
    rings[i].mesh.visible = false;
    rings[i].echo.visible = false;
  }
}

const MAX_POINTS = 512;

export function buildJuicePoints(group, glowTex, puffTex) {
  const makeSystem = (size, blending, opacity, map = glowTex) => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 3).fill(-9999);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: true, transparent: true, opacity,
      blending, depthWrite: false, color: 0xffffff, vertexColors: true,
      map, alphaTest: 0.01,
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
  // centimetres, and a point sprite's size is per-system. v15: it
  // wears the dense puff texture (not the radial glow) and runs a
  // touch larger and more opaque, so the ribbon reads as smoke.
  const smoke = makeSystem(4.1, THREE.NormalBlending, 0.52, puffTex);
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

export function buildClouds(group) {
  const rng = makeRng(1357);
  const clouds = [];
  // v15: the puffs wear the two-tone cloud texture — lit crowns over
  // a shaded warm belly — and fly a size larger and softer than the
  // old radial-glow smears.
  const mat = new THREE.SpriteMaterial({
    map: makeCloudTexture(), color: 0xfff4e0, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
  });
  for (let i = 0; i < 34; i++) {
    const cluster = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Sprite(mat);
      puff.position.set((rng() - 0.5) * 260, (rng() - 0.5) * 36, (rng() - 0.5) * 120);
      puff.scale.set(350 + rng() * 370, 105 + rng() * 95, 1);
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
  // v17: a small exposure lift on top of the saturated palette —
  // contrast the thumbnail can feel, highlights still held by ACES.
  renderer.toneMappingExposure = 1.16;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  // v15 fog: the haze is pulled toward the sky's horizon band and
  // the far plane pushed out, so the sea melts into the sky instead
  // of cutting against it at a hard line.
  const fogColour = HAZE.clone().lerp(new THREE.Color(PALETTE.skyLow), 0.38);
  scene.fog = new THREE.Fog(fogColour, 1050, 8600);

  const camera3 = new THREE.PerspectiveCamera(60, 1280 / 800, 0.5, 24000);

  const world = { renderer, scene, camera3, t: 0 };
  scene.userData.renderer = renderer;
  scene.environment = buildEnvironment(scene);
  scene.environmentIntensity = 0.62;

  const dome = buildSkyDome();
  scene.add(dome);
  world.dome = dome;

  // The sun as three nested glows (v15): a small hot core, an amber
  // mid halo and a wide faint outer wash. The old single sprite read
  // as a pale moon; layered, the disc has a centre that burns.
  const sunGroup = new THREE.Group();
  const sunLayer = (inner, outer, scale, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(inner, outer), color: 0xffffff, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    s.scale.setScalar(scale);
    sunGroup.add(s);
  };
  sunLayer('rgba(255,196,110,1)', 'rgba(255,170,80,0)', 2400, 0.26);
  sunLayer('rgba(255,202,118,1)', 'rgba(255,178,92,0)', 860, 0.62);
  sunLayer('rgba(255,240,203,1)', 'rgba(255,232,178,0)', 350, 0.98);
  scene.add(sunGroup);
  world.sunSprite = sunGroup;

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

  // v15: the grain runs at nearly double the old contrast, so the
  // ground's speckle survives the flight to the horizon.
  const detailTex = makeNoiseTexture(256, 244, 76);
  detailTex.repeat.set(210, 210);
  const terrain = buildTerrainMesh(detailTex);
  scene.add(terrain);
  const bumpTex = makeNoiseTexture(256, 200, 90);
  bumpTex.repeat.set(300, 300);
  const water = buildWaterMesh(bumpTex);
  scene.add(water);
  world.waterBump = bumpTex;

  const dressing = new THREE.Group();
  scene.add(dressing);
  buildRunways(dressing);
  buildTown(dressing);
  buildForest(dressing);
  buildRockOutcrops(dressing);
  buildFoamRings(dressing);
  buildBridge(dressing);
  world.fallTex = buildWaterfall(dressing, makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'));
  buildGuardian(dressing);
  world.life = createLifeWorld(makeGlowTexture('rgba(255,190,110,1)', 'rgba(255,150,60,0)'));
  dressing.add(world.life.group);
  buildLighthouses(dressing, makeGlowTexture('rgba(255,215,150,1)', 'rgba(255,190,110,0)'));
  world.boats = buildBoats(dressing);
  world.rings = buildRings(dressing);
  world.clouds = buildClouds(dressing);
  world.juice = buildJuicePoints(
    dressing,
    makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    makePuffTexture(),
  );

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

  // The water breathes (v15): the bump field crawls slowly across
  // the surface, so the glitter lane shimmers instead of sitting
  // printed on a still pond.
  if (world.waterBump) {
    world.waterBump.offset.set((t * 0.006) % 1, (t * 0.0041) % 1);
  }
  // The fall falls (v18): its streak texture scrolls down the
  // flank, one full repeat every couple of seconds.
  if (world.fallTex) world.fallTex.offset.y = -((t * 0.45) % 1);

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
