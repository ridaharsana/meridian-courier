// terrain-archipelago.js — the archipelago heightfield.

import { ISLANDS, RUNWAYS } from './config.js';

export function chartNoise(x, z) {
  const s = Math.sin(x * 0.0011 + z * 0.0017) * 0.5
    + Math.sin(x * 0.0043 - z * 0.0029) * 0.3
    + Math.sin((x + z) * 0.011) * 0.2;
  return s; // -1..1
}

export function islandHeight(island, x, z) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d2 = (dx * dx + dz * dz) / (island.radius * island.radius);
  if (d2 >= 1.6) return -14; // open sea floor, below the waterline
  const dome = Math.exp(-d2 * 2.1);
  const ridge = 1 + chartNoise(x, z) * 0.16;
  return -14 + (island.peak + 14) * dome * ridge;
}

export function runwayFrame(runway, x, z) {
  const rad = (runway.heading * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fz = -Math.cos(rad);
  const dx = x - runway.x;
  const dz = z - runway.z;
  return { along: dx * fx + dz * fz, across: dx * fz - dz * fx, fx, fz };
}

function plateauBlend(runway, x, z) {
  const f = runwayFrame(runway, x, z);
  const halfLen = runway.length / 2 + 90;
  const halfWid = runway.width / 2 + 70;
  const ax = Math.max(0, Math.abs(f.along) - halfLen);
  const az = Math.max(0, Math.abs(f.across) - halfWid);
  const d = Math.hypot(ax, az);
  const t = Math.min(1, d / 130);
  return t * t * (3 - 2 * t); // 0 on the plateau, 1 in wild terrain
}

export function groundHeight(x, z) {
  let h = -14;
  for (const island of ISLANDS) {
    const ih = islandHeight(island, x, z);
    if (ih > h) h = ih;
  }
  for (const runway of RUNWAYS) {
    const blend = plateauBlend(runway, x, z);
    if (blend < 1) h = h * blend + runway.altitude * (1 - blend);
  }
  return h;
}

export function surfaceKind(x, z, h) {
  for (const runway of RUNWAYS) {
    const f = runwayFrame(runway, x, z);
    if (Math.abs(f.along) <= runway.length / 2 && Math.abs(f.across) <= runway.width / 2) return 'runway';
  }
  if (h < 1.5) return 'sea';
  if (h < 6) return 'sand';
  if (h < 130) return 'grass';
  if (h < 300) return 'rock';
  return 'snow';
}

export const TOWN_BLOCKS = buildTownBlocks();

function buildTownBlocks() {
  const lume = ISLANDS.find((i) => i.town);
  const blocks = [];
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = 0; gz <= 3; gz++) {
      if (next() < 0.22) continue; // a gap: the plaza, the church green
      const x = lume.x + gx * 86 + (next() - 0.5) * 22;
      const z = lume.z + 250 + gz * 80 + (next() - 0.5) * 18;
      const typeRoll = next();
      const type = gz === 0 && typeRoll < 0.3 ? 'warehouse'
        : typeRoll < 0.52 ? 'cottage' : 'house';
      blocks.push({
        x, z,
        w: type === 'warehouse' ? 46 + next() * 20 : 28 + next() * 20,
        d: type === 'warehouse' ? 24 + next() * 8 : 24 + next() * 16,
        h: type === 'cottage' ? 9 + next() * 5
          : type === 'warehouse' ? 11 + next() * 4 : 14 + next() * 8,
        rot: (next() - 0.5) * 0.24,
        type,
        wall: Math.floor(next() * 4),
        roof: Math.floor(next() * 3),
        chimney: type !== 'warehouse' && next() < 0.55,
        garden: next() < 0.42,
        door: Math.floor(next() * 4),
      });
    }
  }
  return blocks;
}

export const LANDMARKS = [
  { name: 'GULL ROCK LIGHT', x: -1700, z: -1900, height: 46 },
  { name: 'PORTO LUME BEACON', x: 2980, z: 2680, height: 34 },
];
