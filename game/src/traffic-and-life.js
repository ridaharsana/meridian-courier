// traffic-and-life.js — everything in the archipelago that moves
// but is not the player: a sister Petrel flying the strait circuit,
// a drifting hot-air balloon, bird flocks over the water, rotating
// lighthouse beams, bobbing channel buoys and the runway windsocks.
// The renderer builds it once and ticks it with the frame clock.

import * as THREE from 'three';
import { LANDMARKS } from './terrain-archipelago.js';
import { groundHeight } from './terrain-archipelago.js';
import { buildPetrelAircraft, updatePetrelAircraft } from './aircraft-art.js';

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ------------------------------------------------------------------
// AI traffic: the blue sister ship on her endless circuit of the
// strait, banked into the turn, gear up, minding her own mail run.
// The phase is tuned so she crosses the cover shot's sky early in
// a session, ahead of the player and a little above the ring line.

const CIRCUIT = { x: 1050, z: 450, radius: 430, y: 285, period: 150, phase: 1.79 };

export function buildTrafficPetrel() {
  const petrel = buildPetrelAircraft({ colour: 0x9fc6d8, deepColour: 0x64899e });
  petrel.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  const plane = {
    x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0,
    speed: 22, throttle: 0.66, gearDown: false, propSpin: 0, cargoPod: false,
  };
  return { petrel, plane };
}

export function updateTrafficPetrel(traffic, t) {
  const a = CIRCUIT.phase + (t / CIRCUIT.period) * Math.PI * 2;
  const p = traffic.plane;
  p.x = CIRCUIT.x + Math.cos(a) * CIRCUIT.radius;
  p.z = CIRCUIT.z + Math.sin(a) * CIRCUIT.radius;
  p.y = CIRCUIT.y + Math.sin(t * 0.11) * 6;
  // Tangent of the circle: the derivative is (-sin a, cos a), and a
  // heading h flies (sin h, -cos h) — solve for h directly.
  p.heading = Math.atan2(-Math.sin(a), -Math.cos(a));
  p.roll = 0.3; // banked into the turn, the way the flight model banks
  p.propSpin = t * 34;
  updatePetrelAircraft(traffic.petrel, p, t);
}

// ------------------------------------------------------------------
// The balloon: a striped lathe envelope over a wicker basket, the
// burner flaring as she drifts her slow crosswind wander. She is
// anchored over the strait so the cover shot finds her in its sky.

function balloonStripeTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const stripes = ['#c4502e', '#f6ead2', '#26457e', '#f6ead2', '#e8a33d', '#f6ead2'];
  const w = 256 / 12;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = stripes[i % stripes.length];
    g.fillRect(Math.floor(i * w), 0, Math.ceil(w) + 1, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildHotAirBalloon(glowTex) {
  const group = new THREE.Group();
  const profile = [
    [0.02, 0], [3.4, 0.7], [6.4, 2.6], [8.6, 5.6], [9.3, 9.0],
    [8.4, 12.4], [5.4, 15.0], [1.8, 16.2], [0.02, 16.4],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const envelope = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 24),
    new THREE.MeshStandardMaterial({ map: balloonStripeTexture(), roughness: 0.75 }),
  );
  envelope.position.y = 4.5;
  group.add(envelope);
  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.7, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x8a6849, roughness: 0.9 }),
  );
  basket.position.y = 1.4;
  group.add(basket);
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x3a3128 });
  for (const [sx, sz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 4), ropeMat);
    rope.position.set(sx * 0.8, 3.6, sz * 0.8);
    rope.rotation.z = sx * 0.18;
    rope.rotation.x = -sz * 0.18;
    group.add(rope);
  }
  const burner = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffa63e, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  burner.scale.setScalar(3.2);
  burner.position.y = 2.9;
  group.add(burner);
  group.scale.setScalar(1.55);
  return { group, burner, base: { x: 880, y: 318, z: 620 } };
}

export function updateHotAirBalloon(balloon, t) {
  balloon.group.position.set(
    balloon.base.x + Math.sin(t * 0.021) * 55,
    balloon.base.y + Math.sin(t * 0.05 + 1.3) * 7,
    balloon.base.z + Math.cos(t * 0.017) * 42,
  );
  balloon.group.rotation.y = t * 0.02;
  balloon.burner.material.opacity = 0.45 + 0.4 * Math.max(0, Math.sin(t * 0.9));
}

// ------------------------------------------------------------------
// Bird flocks: three skeins of dark birds, two wing planes apiece
// flapping on their own phases, wheeling over the strait in a V.

export function buildBirdFlocks() {
  const flocks = [];
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x22262c, side: THREE.DoubleSide });
  const centres = [
    { x: 500, z: 500, y: 205, r: 260, speed: 0.05, phase: 0.6 },
    { x: 1500, z: 1500, y: 165, r: 320, speed: -0.042, phase: 2.8 },
    { x: -600, z: -400, y: 235, r: 300, speed: 0.038, phase: 4.4 },
  ];
  for (const c of centres) {
    const group = new THREE.Group();
    const birds = [];
    for (let i = 0; i < 9; i++) {
      const bird = new THREE.Group();
      const wingGeoL = new THREE.PlaneGeometry(1.9, 0.55);
      wingGeoL.translate(0.95, 0, 0);
      wingGeoL.rotateX(-Math.PI / 2);
      const wingGeoR = new THREE.PlaneGeometry(1.9, 0.55);
      wingGeoR.translate(-0.95, 0, 0);
      wingGeoR.rotateX(-Math.PI / 2);
      const wl = new THREE.Mesh(wingGeoL, birdMat);
      const wr = new THREE.Mesh(wingGeoR, birdMat);
      bird.add(wl);
      bird.add(wr);
      const row = Math.ceil(i / 2);
      const sideSign = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1);
      const baseY = -row * 0.4;
      bird.position.set(sideSign * row * 3.4, baseY, row * 3.8);
      group.add(bird);
      birds.push({ bird, wl, wr, phase: i * 0.7, baseY });
    }
    flocks.push({ ...c, group, birds });
  }
  return flocks;
}

export function updateBirdFlocks(flocks, t) {
  for (const f of flocks) {
    const a = f.phase + t * f.speed;
    f.group.position.set(
      f.x + Math.cos(a) * f.r,
      f.y + Math.sin(t * 0.23 + f.phase) * 9,
      f.z + Math.sin(a) * f.r,
    );
    const dirSign = Math.sign(f.speed);
    const dx = -Math.sin(a) * dirSign;
    const dz = Math.cos(a) * dirSign;
    f.group.rotation.y = Math.atan2(-dx, -dz);
    for (const b of f.birds) {
      const flap = Math.sin(t * 9 + b.phase) * 0.6;
      b.wl.rotation.z = flap;
      b.wr.rotation.z = -flap;
      b.bird.position.y = b.baseY + Math.sin(t * 2 + b.phase) * 0.3;
    }
  }
}

// ------------------------------------------------------------------
// Lighthouse beams: a translucent cone of light on a pivot at each
// lamp, sweeping the dusk on its own slow rotation.

export function buildLighthouseBeams(group) {
  const beams = [];
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.13,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  LANDMARKS.forEach((lm, i) => {
    const base = groundHeight(lm.x, lm.z);
    const pivot = new THREE.Group();
    pivot.position.set(lm.x, base - 1 + lm.height + 2, lm.z);
    const geo = new THREE.CylinderGeometry(1.1, 15, 300, 14, 1, true);
    geo.translate(0, -150, 0);
    geo.rotateZ(Math.PI / 2); // the cone now reaches +X, widening as it goes
    const cone = new THREE.Mesh(geo, beamMat);
    pivot.add(cone);
    group.add(pivot);
    beams.push({ pivot, offset: i * 2.4 });
  });
  return beams;
}

export function updateLighthouseBeams(beams, t) {
  for (const b of beams) b.pivot.rotation.y = t * 0.45 + b.offset;
}

// ------------------------------------------------------------------
// Channel buoys: red and green marks bobbing down the shipping
// lane the cargo run crosses, port-hand and starboard-hand.

export function buildChannelBuoys() {
  const group = new THREE.Group();
  const buoys = [];
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xc23b2a, roughness: 0.6, emissive: 0x901f10, emissiveIntensity: 0.35 }),
    new THREE.MeshStandardMaterial({ color: 0x2a9d5c, roughness: 0.6, emissive: 0x0f6e38, emissiveIntensity: 0.35 }),
  ];
  const A = { x: 1450, z: 2150 };
  const B = { x: 2950, z: 1150 };
  for (let i = 0; i < 9; i++) {
    const f = i / 8;
    const mat = mats[i % 2];
    const buoy = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.15, 2.6, 10), mat);
    body.position.y = 0.9;
    buoy.add(body);
    const topmark = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), mat);
    topmark.position.y = 2.6;
    buoy.add(topmark);
    buoy.position.set(A.x + (B.x - A.x) * f, 0, A.z + (B.z - A.z) * f);
    group.add(buoy);
    buoys.push({ buoy, phase: i * 1.37 });
  }
  return { group, buoys };
}

export function updateChannelBuoys(life, t) {
  for (const b of life.buoys) {
    b.buoy.position.y = Math.sin(t * 1.25 + b.phase) * 0.45;
    b.buoy.rotation.x = Math.sin(t * 0.9 + b.phase) * 0.07;
    b.buoy.rotation.z = Math.cos(t * 0.8 + b.phase) * 0.07;
  }
}

// ------------------------------------------------------------------
// Windsocks: one beside each strip, an orange tapered tube on a
// pole, swung by the mission wind and worrying at its hem.

const WINDSOCK_SPOTS = [
  { x: -160, z: 1652 }, // Meridian Field 09, north side, ahead of the park
  { x: 2445, z: 2010 }, // Porto Lume Strip 36, by the south threshold
];

export function buildWindsocks() {
  const group = new THREE.Group();
  const socks = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.4, metalness: 0.6 });
  const sockMat = new THREE.MeshStandardMaterial({ color: 0xe8762a, roughness: 0.8, side: THREE.DoubleSide });
  for (const s of WINDSOCK_SPOTS) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), poleMat);
    pole.position.y = 3.75;
    pole.castShadow = true;
    g.add(pole);
    const sock = new THREE.Group();
    sock.position.y = 7.3;
    const tubeGeo = new THREE.CylinderGeometry(0.28, 0.62, 4.4, 10, 1, true);
    tubeGeo.rotateZ(-Math.PI / 2); // axis onto +X, wide mouth at the pole
    tubeGeo.translate(2.2, 0, 0);
    const tube = new THREE.Mesh(tubeGeo, sockMat);
    sock.add(tube);
    g.add(sock);
    g.position.set(s.x, groundHeight(s.x, s.z), s.z);
    group.add(g);
    socks.push({ sock, phase: s.x * 0.01 });
  }
  return { group, socks };
}

export function updateWindsocks(life, t, wind) {
  // rotation.y that lays the group's +X along the wind's vector.
  const theta = Math.atan2(-wind.z, wind.x);
  for (const s of life.socks) {
    s.sock.rotation.y = theta;
    s.sock.rotation.z = Math.sin(t * 2.2 + s.phase) * 0.06 - 0.04;
  }
}

// ------------------------------------------------------------------
// Assembly and the per-frame tick.

export function createLifeWorld(glowTex) {
  const group = new THREE.Group();
  const traffic = buildTrafficPetrel();
  group.add(traffic.petrel.group);
  const balloon = buildHotAirBalloon(glowTex);
  group.add(balloon.group);
  const flocks = buildBirdFlocks();
  for (const f of flocks) group.add(f.group);
  const beams = buildLighthouseBeams(group);
  const buoys = buildChannelBuoys();
  group.add(buoys.group);
  const windsocks = buildWindsocks();
  group.add(windsocks.group);
  return { group, traffic, balloon, flocks, beams, buoys, windsocks };
}

export function updateLifeWorld(life, t, wind) {
  updateTrafficPetrel(life.traffic, t);
  updateHotAirBalloon(life.balloon, t);
  updateBirdFlocks(life.flocks, t);
  updateLighthouseBeams(life.beams, t);
  updateChannelBuoys(life.buoys, t);
  updateWindsocks(life.windsocks, t, wind);
}
