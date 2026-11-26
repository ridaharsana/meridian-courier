// juice-particles.js — the feel layer: a batched, preallocated pool of
// world-space particles (three.quarks-style batching, hand-rolled). One
// fixed pool, zero allocation per frame: dead slots are recycled through
// a cursor. Motion follows the house motion-design rules — bursts expand
// with ease-out drag and fade with an ease-in tail, never linear.

export const PARTICLE_KINDS = { SPARK: 0, TRAIL: 1, DUST: 2, SMOKE: 3 };
const MAX_PARTICLES = 512;
const KIND_STYLE = [
  { colour: '255,205,92', size: 2.6, drag: 2.4, gravity: -1.2 },
  { colour: '244,248,252', size: 3.4, drag: 1.1, gravity: 0.35 },
  { colour: '219,186,138', size: 4.6, drag: 1.6, gravity: 0.9 },
  { colour: '248,250,252', size: 7.6, drag: 0.32, gravity: 0.3 },
];

export function createParticlePool() {
  const items = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    items.push({ alive: false, kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, seed: i * 0.618 });
  }
  return { items, cursor: 0, trailAcc: 0, smokeAcc: 0, rng: 1234567 };
}

function nextRandom(pool) {
  pool.rng = (pool.rng * 1103515245 + 12345) & 0x7fffffff;
  return pool.rng / 0x7fffffff;
}

function spawnOne(pool, kind, x, y, z, vx, vy, vz, life, age) {
  const p = pool.items[pool.cursor];
  pool.cursor = (pool.cursor + 1) % MAX_PARTICLES;
  p.alive = true; p.kind = kind;
  p.x = x + vx * age; p.y = y + vy * age; p.z = z + vz * age;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.age = age; p.life = life;
  return p;
}

// A ring just flown: golden sparks thrown off the hoop in every
// direction, fast out of the gate then easing as drag takes them.
export function spawnRingBurst(pool, x, y, z, spreadAge = 0) {
  for (let i = 0; i < 34; i++) {
    const a = nextRandom(pool) * Math.PI * 2;
    const b = (nextRandom(pool) - 0.5) * Math.PI;
    const speed = 5 + nextRandom(pool) * 12;
    const age = spreadAge ? (i / 34) * spreadAge : 0;
    spawnOne(pool, PARTICLE_KINDS.SPARK, x, y, z,
      Math.cos(a) * Math.cos(b) * speed, Math.sin(b) * speed, Math.sin(a) * Math.cos(b) * speed,
      1.1 + nextRandom(pool) * 0.7, age);
  }
}

// Soft white streaks shed from both wingtips while airborne: each tip
// lays a short-lived ribbon that drifts back and settles.
export function spawnWingtipTrail(pool, plane, dt) {
  pool.trailAcc += dt;
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const rx = -fz;
  const rz = fx;
  while (pool.trailAcc > 0.016) {
    pool.trailAcc -= 0.016;
    for (const sideSign of [-1, 1]) {
      spawnOne(pool, PARTICLE_KINDS.TRAIL,
        plane.x + rx * 3.4 * sideSign, plane.y - 0.2, plane.z + rz * 3.4 * sideSign,
        -fx * plane.speed * 0.32 + (nextRandom(pool) - 0.5) * 1.4,
        -0.5 - nextRandom(pool) * 0.7,
        -fz * plane.speed * 0.32 + (nextRandom(pool) - 0.5) * 1.4,
        0.85 + nextRandom(pool) * 0.4, 0);
    }
  }
}

// Aerobatic smoke, X-key toggled: thick white puffs poured from
// both wingtips while the system is on. They leave with most of the
// aeroplane's slipstream, then hang, swell and thin over seconds —
// the longest-lived kind in the pool, on the softest drag.
export function spawnSmokeTrail(pool, plane, dt) {
  pool.smokeAcc += dt;
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const rx = -fz;
  const rz = fx;
  while (pool.smokeAcc > 0.045) {
    pool.smokeAcc -= 0.045;
    for (const sideSign of [-1, 1]) {
      spawnOne(pool, PARTICLE_KINDS.SMOKE,
        plane.x + rx * 3.4 * sideSign, plane.y - 0.2, plane.z + rz * 3.4 * sideSign,
        -fx * plane.speed * 0.55 + (nextRandom(pool) - 0.5) * 0.8,
        0.25 + nextRandom(pool) * 0.3,
        -fz * plane.speed * 0.55 + (nextRandom(pool) - 0.5) * 0.8,
        3.1 + nextRandom(pool) * 1.3, 0);
    }
  }
}

// Warm dust kicked off the strip at touchdown (or posed behind a
// landing aeroplane): slow, heavy, hanging in the golden light.
export function spawnPropwashDust(pool, plane, spreadAge = 0) {
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  for (let i = 0; i < 24; i++) {
    const back = 2 + nextRandom(pool) * 13;
    const side = (nextRandom(pool) - 0.5) * 9;
    const age = spreadAge ? (i / 24) * spreadAge : 0;
    spawnOne(pool, PARTICLE_KINDS.DUST,
      plane.x - fx * back - fz * side, Math.max(1.2, plane.y - 3 - nextRandom(pool) * 4), plane.z - fz * back + fx * side,
      -fx * (3 + nextRandom(pool) * 5), 0.4 + nextRandom(pool) * 0.9, -fz * (3 + nextRandom(pool) * 5),
      1.3 + nextRandom(pool) * 0.8, age);
  }
}

// Deterministic seeding for the screenshot scenes: bursts and trails
// are laid out with their ages pre-spread, so a still frame catches the
// juice mid-motion instead of at the first explosive instant.
export function seedShotJuice(pool, name, plane, ring) {
  if (name === 'cover' && ring) {
    spawnRingBurst(pool, ring.x, ring.y, ring.z, 0.85);
    layTrailBehind(pool, plane, 26);
    laySmokeBehind(pool, plane, 46);
  } else if (name === 'cargo') {
    layTrailBehind(pool, plane, 22);
    const fx = Math.sin(plane.heading);
    const fz = -Math.cos(plane.heading);
    spawnRingBurst(pool, plane.x + fx * 55, plane.y + 3, plane.z + fz * 55, 1.15);
  } else if (name === 'finale') {
    spawnPropwashDust(pool, plane, 0.9);
    layTrailBehind(pool, plane, 10);
  }
}

// The cover still catches the smoke mid-display: a ribbon laid
// along a banking arc behind the aeroplane, ages pre-spread so the
// near puffs are young and dense and the far ones old and thin.
function laySmokeBehind(pool, plane, count) {
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const rx = -fz;
  const rz = fx;
  for (let i = 0; i < count; i++) {
    const back = 4 + i * 2.6;
    const curve = Math.sin(i * 0.16) * 6 + i * 0.4;
    for (const sideSign of [-1, 1]) {
      spawnOne(pool, PARTICLE_KINDS.SMOKE,
        plane.x - fx * back + rx * (3.4 * sideSign + curve),
        plane.y - 0.2 - i * 0.05,
        plane.z - fz * back + rz * (3.4 * sideSign + curve),
        -fx * plane.speed * 0.5, 0.3, -fz * plane.speed * 0.5,
        4.4, (i / count) * 2.7);
    }
  }
}

function layTrailBehind(pool, plane, count) {
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const rx = -fz;
  const rz = fx;
  for (let i = 0; i < count; i++) {
    const back = 3 + i * 2.1;
    for (const sideSign of [-1, 1]) {
      spawnOne(pool, PARTICLE_KINDS.TRAIL,
        plane.x - fx * back + rx * 3.4 * sideSign, plane.y - 0.2 - i * 0.06, plane.z - fz * back + rz * 3.4 * sideSign,
        -fx * plane.speed * 0.3, -0.6, -fz * plane.speed * 0.3,
        1.6 + (i / count) * 0.9, (i / count) * 1.15);
    }
  }
}

export function updateParticles(pool, dt) {
  for (const p of pool.items) {
    if (!p.alive) continue;
    p.age += dt;
    if (p.age >= p.life) { p.alive = false; continue; }
    const style = KIND_STYLE[p.kind];
    const drag = Math.exp(-style.drag * dt);
    p.vx *= drag; p.vz *= drag;
    p.vy = p.vy * drag + style.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
}

export function drawParticles(ctx, pool, project) {
  for (const p of pool.items) {
    if (!p.alive) continue;
    const s = project(p.x, p.y, p.z);
    if (!s || s.depth < 6) continue;
    const style = KIND_STYLE[p.kind];
    const f = p.age / p.life;
    // Fade is ease-in: the particle holds its presence, then leaves
    // quickly at the end of its life — exits accelerate.
    const alpha = (1 - f * f) * (p.kind === PARTICLE_KINDS.SPARK ? 0.95 : 0.55);
    const grow = p.kind === PARTICLE_KINDS.SPARK ? 1 - f * 0.5 : 1 + f * 1.6;
    // Radius is capped in screen space: a trail puff the camera sits
    // inside must stay a puff, never a bubble filling the frame.
    const r = Math.min(p.kind === PARTICLE_KINDS.SPARK ? 8 : 11,
      Math.max(0.7, s.scale * style.size * grow * (p.kind === PARTICLE_KINDS.SPARK ? 0.3 : 0.14)));
    ctx.fillStyle = `rgba(${style.colour},${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === PARTICLE_KINDS.SPARK && f < 0.45) {
      ctx.fillStyle = `rgba(255,246,220,${(0.8 * (1 - f)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
