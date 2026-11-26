// missions.js — three sorties, their rings and wind.

import { RUNWAYS } from './config.js';
import { angleDiff } from './flight-model.js';

function ring(x, y, z, heading) {
  return { x, y, z, heading, radius: 42, passed: false };
}

function ringCourse(x, z, y, headingDeg, count, gap) {
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fz = -Math.cos(rad);
  const rings = [];
  for (let i = 0; i < count; i++) {
    const d = gap * (i + 1);
    const sway = Math.sin(i * 1.35) * 130;
    rings.push(ring(
      x + fx * d + fz * sway,
      y + Math.sin(i * 0.9) * 26,
      z + fz * d - fx * sway,
      headingDeg,
    ));
  }
  return rings;
}

export const MISSIONS = [
  {
    id: 'ring-run',
    title: 'MISSION 1 — THE RING RUN',
    brief: 'Thread all 8 gates over the strait to Gull Rock. Clean gates pay; a wide, fast line pays best.',
    goal: 'rings',
    start: { x: -300, z: 1700, y: 24, headingDeg: 90, speed: 0, fuel: 100 },
    wind: { x: 1.6, z: 0.6 },
    rings: ringCourse(-100, 1700, 190, 55, 8, 430),
    targetRunway: null,
    par: 150,
  },
  {
    id: 'cargo-lume',
    title: 'MISSION 2 — CARGO FOR PORTO LUME',
    brief: 'Mail and medicine aboard. Cross the archipelago and land on Porto Lume Strip 36 — gently, the cargo is glass.',
    goal: 'land',
    start: { x: -300, z: 1700, y: 24, headingDeg: 90, speed: 0, fuel: 88 },
    wind: { x: -2.2, z: 1.2 },
    rings: ringCourse(300, 1500, 230, 38, 3, 620),
    targetRunway: 'LUME',
    par: 210,
  },
  {
    id: 'storm-return',
    title: 'MISSION 3 — THE STORM RETURN',
    brief: 'Weather closing in off Farrel Shoal and the tank is low. Ride the tailwind home and land Meridian Field 09 before the fuel — or the light — runs out.',
    goal: 'land',
    start: { x: 700, z: -2350, y: 260, headingDeg: 155, speed: 48, fuel: 34 },
    wind: { x: -3.4, z: -4.6 },
    rings: [],
    targetRunway: 'HOME',
    par: 190,
  },
];

export function createMissionState(mission) {
  return {
    mission,
    ringsPassed: 0,
    elapsed: 0,
    complete: false,
    failed: false,
    verdict: '',
    score: 0,
    cargoIntact: true,
  };
}

export function nextRing(state) {
  return state.mission.rings.find((r) => !r.passed) || null;
}

export function updateMission(state, plane, dt, events) {
  if (state.complete || state.failed) return;
  state.elapsed += dt;
  const target = nextRing(state);
  if (target && !plane.onGround) {
    const dx = plane.x - target.x;
    const dz = plane.z - target.z;
    const dy = plane.y - target.y;
    const fx = Math.sin(target.heading * Math.PI / 180);
    const fz = -Math.cos(target.heading * Math.PI / 180);
    const along = dx * fx + dz * fz;
    const across = Math.hypot(dx * fz - dz * fx, dy);
    if (Math.abs(along) < 16 && across < target.radius) {
      target.passed = true;
      state.ringsPassed += 1;
      events.push({ kind: 'ring', clean: across < target.radius * 0.55 });
    }
  }
  if (plane.hull <= 0) {
    state.failed = true;
    state.verdict = 'THE PETREL WILL NOT FLY AGAIN TODAY — HULL GONE';
    return;
  }
  if (plane.fuel <= 0 && plane.onGround && plane.speed < 1) {
    state.failed = true;
    state.verdict = 'OUT OF FUEL, SHORT OF HOME — THE FERRY WAITS FOR NO ONE';
    return;
  }
  if (events.some((e) => e.kind === 'splash')) {
    state.failed = true;
    state.verdict = 'DOWN IN THE STRAIT — THE MAIL IS WET, THE PILOT IS WETTER';
    return;
  }
  if (events.some((e) => e.kind === 'crash')) {
    state.failed = true;
    state.verdict = `ARRIVAL TOO HARD — ${plane.lastTouchdown ? plane.lastTouchdown.label : 'AIRFRAME DAMAGED'}`;
    return;
  }
  const landed = events.find((e) => e.kind === 'touchdown');
  if (landed && state.mission.goal === 'land') {
    const want = RUNWAYS.find((r) => r.id === state.mission.targetRunway);
    const dx = plane.x - want.x;
    const dz = plane.z - want.z;
    const onStrip = Math.hypot(dx, dz) < want.length; // touchdown was judged on a strip already
    if (landed.rating && onStrip && landed.rating.score >= 25) {
      finishSortie(state, plane, landed.rating);
    }
  }
  if (state.mission.goal === 'rings' && state.ringsPassed >= state.mission.rings.length && plane.onGround) {
    finishSortie(state, plane, plane.lastTouchdown || { score: 40, label: 'BACK ON THE GROUND' });
  }
}

function finishSortie(state, plane, rating) {
  state.complete = true;
  const timeBonus = Math.max(0, Math.round((state.mission.par - state.elapsed) * 2));
  const ringScore = state.ringsPassed * 120;
  state.score = ringScore + rating.score * 4 + timeBonus + Math.round(plane.fuel * 3) + Math.round(plane.hull);
  state.verdict = rating.label;
}

export function objectiveCue(state, plane) {
  const target = nextRing(state);
  if (target) return cueTo(plane, target.x, target.z, `GATE ${state.ringsPassed + 1}/${state.mission.rings.length}`);
  if (state.mission.goal === 'land') {
    const want = RUNWAYS.find((r) => r.id === state.mission.targetRunway);
    return cueTo(plane, want.x, want.z, want.name);
  }
  const home = RUNWAYS[0];
  return cueTo(plane, home.x, home.z, 'RETURN — MERIDIAN FIELD 09');
}

function cueTo(plane, x, z, label) {
  const dx = x - plane.x;
  const dz = z - plane.z;
  const dist = Math.hypot(dx, dz);
  const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const heading = ((plane.heading * 180) / Math.PI + 360) % 360;
  return { label, dist, bearing, turn: angleDiff(bearing, heading) };
}
