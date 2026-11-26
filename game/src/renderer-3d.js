// renderer-3d.js — a hand-rolled perspective projector that paints the
// archipelago on a 2D canvas: sky, sun and cloud shadows first, then the
// heightfield as flat-shaded facets sorted far to near, then runways, the
// harbour town, landmarks and the mission rings. One job: turn world
// coordinates into a picture a pilot can read at a glance.

import { WORLD, PALETTE, RUNWAYS } from './config.js';
import { groundHeight, surfaceKind, chartNoise, TOWN_BLOCKS, LANDMARKS } from './terrain-archipelago.js';

// The sun's direction, one for the whole world: high, east and a little
// north — (0.55, 0.78, -0.3) unnormalised. Every slope shade, glitter
// path and lit wall in this file is computed against it, so the light
// agrees with itself from the sky down to the harbour rooftops.
const SUN_DIR = { x: 0.55, y: 0.78, z: -0.3 };

// Scale a #rrggbb colour by a light factor, clamped so shade never
// crushes to black or blows to white.
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `rgb(${r},${g},${b})`;
}

// A cell's deterministic 0..1 hash from its grid coordinates: trees,
// snow streaks and window lights are planted by it, so the chart is
// the same on every flight and every screenshot.
export function cellHash(gx, gz) {
  const s = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function createCamera() {
  return { x: 0, y: 60, z: 0, heading: 0, pitch: 0, roll: 0, fov: 1.05 };
}

// Chase camera: settles behind and above the tail, leaning into the bank so
// the horizon tilts with the aeroplane instead of fighting it.
export function chaseCamera(camera, plane, dt, snap = false) {
  const back = 17 + plane.speed * 0.05;
  const tx = plane.x - Math.sin(plane.heading) * back;
  const tz = plane.z + Math.cos(plane.heading) * back;
  const ty = plane.y + 5.2;
  const k = snap ? 1 : Math.min(1, dt * 7);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;
  camera.z += (tz - camera.z) * k;
  camera.heading = plane.heading;
  camera.pitch = plane.pitch * 0.55 - 0.03;
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

export function makeProjector(camera, width, height) {
  const fx = Math.sin(camera.heading);
  const fz = -Math.cos(camera.heading);
  const rx = -fz;
  const rz = fx;
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const focal = (height * 0.5) / Math.tan(camera.fov / 2);
  return function project(x, y, z) {
    let dx = x - camera.x;
    let dy = y - camera.y;
    let dz = z - camera.z;
    let cx = dx * rx + dz * rz;
    let cz = dx * fx + dz * fz;
    let cy = dy * cp - cz * sp;
    cz = dy * sp + cz * cp;
    if (cz < 2) return null;
    const s = focal / cz;
    // Roll the picture around its centre: the world leans, the panel doesn't.
    const px = cx * s;
    const py = -cy * s;
    const cr = Math.cos(-camera.roll);
    const sr = Math.sin(-camera.roll);
    return {
      x: width / 2 + px * cr - py * sr,
      y: height / 2 + px * sr + py * cr,
      depth: cz,
      scale: s,
    };
  };
}

export function drawSky(ctx, camera, width, height) {
  const horizon = height / 2 - Math.tan(camera.pitch) * height * 0.5;
  const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.45, PALETTE.skyMid);
  g.addColorStop(0.78, '#bcd9ee');
  g.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, Math.max(0, horizon + 2));
  // The sun, high off the port bow: a radial glow that falls off in
  // rings, a warm wash under it, and a near-white core.
  const sx = width * 0.82;
  const sy = height * 0.13;
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 120);
  glow.addColorStop(0, 'rgba(255,246,205,0.55)');
  glow.addColorStop(0.35, 'rgba(255,240,190,0.22)');
  glow.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 120, sy - 120, 240, 240);
  const core = ctx.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 27);
  core.addColorStop(0, PALETTE.sunCore);
  core.addColorStop(0.8, PALETTE.sun);
  core.addColorStop(1, 'rgba(255,243,196,0.85)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(sx, sy, 26, 0, Math.PI * 2);
  ctx.fill();
  return horizon;
}

export function drawSea(ctx, project, camera, width, height, horizon) {
  // Open water deepens away from the horizon line; the shallows near a
  // shore are the terrain shelf's own colour, drawn with the land.
  const g = ctx.createLinearGradient(0, horizon, 0, height);
  g.addColorStop(0, '#2b8296');
  g.addColorStop(0.3, PALETTE.sea);
  g.addColorStop(1, PALETTE.seaDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, width, height - horizon);
  // Sun glitter: a bright path on the water under the sun, dashes
  // clustered toward the sun's side of the frame and thinning outward,
  // plus a sparse scatter elsewhere — it sells the altitude instantly.
  for (let i = 0; i < 46; i++) {
    const onPath = i < 32;
    const gx = onPath ? 0.82 + (((i * 197) % 199) / 199 - 0.5) * 0.36 : ((i * 613) % 997) / 997;
    const gz = 300 + ((i * 389) % 2600);
    const p = project(camera.x + (gx - 0.5) * gz * 1.6, 0, camera.z + gz * 0.4 + (i % 7) * 90);
    if (p && p.x > -20 && p.x < width + 20 && p.y > horizon && p.y < height) {
      ctx.fillStyle = onPath ? 'rgba(255,246,205,0.4)' : 'rgba(220,245,255,0.18)';
      ctx.fillRect(p.x, p.y, Math.max(1.5, p.scale * (onPath ? 9 : 6)), 1.4);
    }
  }
}

const KIND_FILL = {
  sand: PALETTE.sand, grass: null, rock: PALETTE.rock, snow: PALETTE.snow,
};

export function drawTerrain(ctx, project, plane) {
  const step = WORLD.terrainStep;
  const R = WORLD.terrainRadius;
  const gx0 = Math.floor((plane.x - R) / step);
  const gx1 = Math.floor((plane.x + R) / step);
  const gz0 = Math.floor((plane.z - R) / step);
  const gz1 = Math.floor((plane.z + R) / step);
  const cells = [];
  for (let gz = gz0; gz < gz1; gz++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const x = gx * step;
      const z = gz * step;
      const h = groundHeight(x + step / 2, z + step / 2);
      if (h < -9) continue; // deep water is the sea's job; the shelf is ours
      const dx = x + step / 2 - plane.x;
      const dz = z + step / 2 - plane.z;
      cells.push({ x, z, h, d2: dx * dx + dz * dz });
    }
  }
  cells.sort((a, b) => b.d2 - a.d2);
  for (const cell of cells) {
    // Haze: far facets fade toward the sky so the chart's edge dissolves
    // instead of ending in a confetti of grazing-angle slivers.
    ctx.globalAlpha = Math.max(0.42, Math.min(1, 1.18 - Math.sqrt(cell.d2) / 3600));
    // Corner heights, not one flat height per cell: neighbouring cells
    // share the same corner samples, so the mesh is continuous — no
    // see-through gaps on steep slopes, no floating tiles.
    const s = step + 1;
    const h1 = groundHeight(cell.x, cell.z);
    const h2 = groundHeight(cell.x + s, cell.z);
    const h3 = groundHeight(cell.x + s, cell.z + s);
    const h4 = groundHeight(cell.x, cell.z + s);
    const p1 = project(cell.x, h1, cell.z);
    const p2 = project(cell.x + s, h2, cell.z);
    const p3 = project(cell.x + s, h3, cell.z + s);
    const p4 = project(cell.x, h4, cell.z + s);
    if (!p1 || !p2 || !p3 || !p4) continue;
    const kind = surfaceKind(cell.x + step / 2, cell.z + step / 2, cell.h);
    // Slope from the corner heights: the face normal against SUN_DIR
    // gives one light factor for the whole facet, so hillsides facing
    // the sun glow and the lee sides sit in honest shade.
    const dhx = ((h2 + h3) - (h1 + h4)) / (2 * step);
    const dhz = ((h3 + h4) - (h1 + h2)) / (2 * step);
    const inv = 1 / Math.hypot(dhx, 1, dhz);
    const dot = (-dhx * SUN_DIR.x + SUN_DIR.y - dhz * SUN_DIR.z) * inv;
    const light = 0.62 + 0.55 * Math.max(0, dot);
    const steep = Math.hypot(dhx, dhz);
    ctx.fillStyle = shadeFor(kind, cell.h, cell.x, cell.z, light, steep);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    drawCellTrees(ctx, project, cell, kind, steep);
  }
  ctx.globalAlpha = 1;
}

// Trees ride the terrain pass so painter's order keeps them behind
// nearer hills: a cell grows 0–3 pines by its hash, only on gentle
// grass — a dark cone with a sun-lit shoulder and a cast shadow fleck.
function drawCellTrees(ctx, project, cell, kind, steep) {
  if (kind !== 'grass' || cell.h < 9 || cell.h > 165 || steep > 0.55) return;
  const step = WORLD.terrainStep;
  const gx = Math.round(cell.x / step);
  const gz = Math.round(cell.z / step);
  const hash = cellHash(gx, gz);
  if (hash < 0.42) return;
  const count = hash > 0.86 ? 3 : hash > 0.64 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const tx = cell.x + step * (0.22 + 0.56 * cellHash(gx + i * 7, gz - i * 3));
    const tz = cell.z + step * (0.2 + 0.58 * cellHash(gx - i * 5, gz + i * 11));
    const th = groundHeight(tx, tz);
    if (th < 8) continue;
    const foot = project(tx, th, tz);
    const top = project(tx, th + 13, tz);
    if (!foot || !top) continue;
    const w = Math.max(1.6, foot.scale * 7.5);
    const hh = foot.y - top.y;
    if (hh < 3) continue;
    ctx.fillStyle = 'rgba(16,40,20,0.35)';
    ctx.beginPath();
    ctx.ellipse(foot.x + w * 0.5, foot.y, w * 0.9, w * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.treeDark;
    ctx.beginPath();
    ctx.moveTo(foot.x, top.y);
    ctx.lineTo(foot.x + w, foot.y);
    ctx.lineTo(foot.x - w, foot.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.treeLight;
    ctx.beginPath();
    ctx.moveTo(foot.x, top.y);
    ctx.lineTo(foot.x + w, foot.y);
    ctx.lineTo(foot.x + w * 0.18, foot.y);
    ctx.closePath();
    ctx.fill();
  }
}

function shadeFor(kind, h, x, z, light, steep) {
  if (kind === 'runway') return PALETTE.runway;
  if (h < 0.5) return shade(PALETTE.seaShallow, light); // the shoreline shelf
  if (kind === 'sand') return shade(h < 2.4 ? PALETTE.sandWet : PALETTE.sand, light);
  if (kind === 'snow') {
    // Snowfields break into streaks: the chart noise lays soft blue
    // shadow runs down the mountain instead of one white slab.
    const streak = chartNoise(x * 0.7, z * 0.7);
    return shade(streak > 0.28 ? PALETTE.snowShade : PALETTE.snow, light);
  }
  // Steep grass gives up and shows rock, the way real hillsides do.
  if (steep > 0.62 && h > 42) return shade(steep > 0.95 ? PALETTE.rockDark : PALETTE.rock, light);
  if (KIND_FILL[kind]) return shade(KIND_FILL[kind], light);
  // Grass takes two tones by height so slopes read as slopes.
  const tone = ((Math.floor(x / 130) + Math.floor(z / 130)) % 2 + 2) % 2;
  if (h < 60) return shade(tone ? PALETTE.grassLow : '#84b166', light);
  return shade(tone ? PALETTE.grassHigh : '#57884a', light);
}

export function drawRunways(ctx, project) {
  for (const runway of RUNWAYS) {
    const rad = (runway.heading * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fz = -Math.cos(rad);
    const px = fz;
    const pz = -fx;
    const hl = runway.length / 2;
    const hw = runway.width / 2;
    // The strip is drawn in segments along its length: on short final
    // the near end passes under the aeroplane, and a single all-or-
    // nothing quad would vanish exactly when it matters most.
    const SEGMENTS = 10;
    ctx.fillStyle = PALETTE.runway;
    for (let sgm = 0; sgm < SEGMENTS; sgm++) {
      const a0 = -hl + (runway.length / SEGMENTS) * sgm;
      const a1 = -hl + (runway.length / SEGMENTS) * (sgm + 1);
      const corners = [
        [runway.x + fx * a0 - px * hw, runway.z + fz * a0 - pz * hw],
        [runway.x + fx * a0 + px * hw, runway.z + fz * a0 + pz * hw],
        [runway.x + fx * a1 + px * hw, runway.z + fz * a1 + pz * hw],
        [runway.x + fx * a1 - px * hw, runway.z + fz * a1 - pz * hw],
      ].map(([x, z]) => project(x, runway.altitude + 0.4, z));
      if (corners.some((p) => !p)) continue;
      ctx.beginPath();
      corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    const corners = [
      project(runway.x - fx * hl - px * hw, runway.altitude + 0.4, runway.z - fz * hl - pz * hw),
      project(runway.x + fx * hl + px * hw, runway.altitude + 0.4, runway.z + fz * hl + pz * hw),
    ];
    // Centreline dashes and threshold bars: the markings a pilot lines up on.
    ctx.strokeStyle = PALETTE.runwayLine;
    ctx.lineWidth = Math.max(1, (corners[0] ? corners[0].scale : 0.4) * 1.1);
    ctx.setLineDash([14, 12]);
    const a = project(runway.x - fx * hl, runway.altitude + 0.5, runway.z - fz * hl);
    const b = project(runway.x + fx * hl, runway.altitude + 0.5, runway.z + fz * hl);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Edge lights, amber, both sides — visible long before the strip is.
    ctx.fillStyle = PALETTE.lampAmber;
    for (let t = -hl; t <= hl; t += 64) {
      for (const side of [-1, 1]) {
        const p = project(runway.x + fx * t + px * hw * side, runway.altitude + 1, runway.z + fz * t + pz * hw * side);
        if (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.2, p.scale * 1.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Solid edge lines, then the piano keys: four threshold bars at
    // each end, the first thing a pilot's eye hunts on final.
    ctx.strokeStyle = 'rgba(245,242,230,0.75)';
    for (const side of [-1, 1]) {
      const e0 = project(runway.x - fx * hl + px * hw * side, runway.altitude + 0.5, runway.z - fz * hl + pz * hw * side);
      const e1 = project(runway.x + fx * hl + px * hw * side, runway.altitude + 0.5, runway.z + fz * hl + pz * hw * side);
      if (e0 && e1) {
        ctx.lineWidth = Math.max(1, e0.scale * 0.8);
        ctx.beginPath();
        ctx.moveTo(e0.x, e0.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = PALETTE.runwayLine;
    for (const end of [-1, 1]) {
      for (let bar = 0; bar < 4; bar++) {
        const off = (bar - 1.5) * (runway.width / 5.2);
        const a0 = end * (hl - 6);
        const a1 = end * (hl - 40);
        const quad = [
          [runway.x + fx * a0 + px * (off - 2.6), runway.z + fz * a0 + pz * (off - 2.6)],
          [runway.x + fx * a0 + px * (off + 2.6), runway.z + fz * a0 + pz * (off + 2.6)],
          [runway.x + fx * a1 + px * (off + 2.6), runway.z + fz * a1 + pz * (off + 2.6)],
          [runway.x + fx * a1 + px * (off - 2.6), runway.z + fz * a1 + pz * (off - 2.6)],
        ].map(([x, z]) => project(x, runway.altitude + 0.5, z));
        if (quad.some((p) => !p)) continue;
        ctx.beginPath();
        quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
      }
    }
    // PAPI lights beside the near threshold: a row of four, white over
    // red on a true glide — here two and two, the on-slope picture.
    for (let i = 0; i < 4; i++) {
      const along = -hl + 52 + i * 9;
      const p = project(runway.x + fx * along - px * (hw + 7), runway.altitude + 1.2, runway.z + fz * along - pz * (hw + 7));
      if (!p) continue;
      ctx.fillStyle = i < 2 ? '#f5f2e6' : PALETTE.lampRed;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.4, p.scale * 1.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.4, p.scale * 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawTown(ctx, project, plane) {
  const sorted = [...TOWN_BLOCKS].sort((a, b) =>
    (dist2(b, plane) - dist2(a, plane)));
  for (const block of sorted) {
    const base = groundHeight(block.x, block.z);
    const top = base + block.h;
    const c = Math.cos(block.rot);
    const s = Math.sin(block.rot);
    const corner = (lx, lz, y) => project(
      block.x + lx * c - lz * s, y, block.z + lx * s + lz * c);
    const hw = block.w / 2;
    const hd = block.d / 2;
    const t = [corner(-hw, -hd, top), corner(hw, -hd, top), corner(hw, hd, top), corner(-hw, hd, top)];
    if (t.some((p) => !p)) continue;
    const b = [corner(-hw, -hd, base), corner(hw, -hd, base), corner(hw, hd, base), corner(-hw, hd, base)];
    if (b.some((p) => !p)) continue;
    // Walls shaded by their facing against SUN_DIR: the two sunward
    // faces glow cream, the lee faces sit a tone down — the town stops
    // reading as flat cut-outs and starts reading as streets of houses.
    const faceLight = [0.86, 1.04, 0.94, 1.12];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      ctx.fillStyle = shade(PALETTE.townWall, faceLight[i]);
      ctx.beginPath();
      ctx.moveTo(b[i].x, b[i].y);
      ctx.lineTo(b[j].x, b[j].y);
      ctx.lineTo(t[j].x, t[j].y);
      ctx.lineTo(t[i].x, t[i].y);
      ctx.closePath();
      ctx.fill();
      // Windows: two rows of lit panes on faces wide enough to carry
      // them, skipped the moment a house is too far to read.
      const faceW = Math.hypot(t[j].x - t[i].x, t[j].y - t[i].y);
      const faceH = Math.hypot(b[i].x - t[i].x, b[i].y - t[i].y);
      if (faceW > 26 && faceH > 9) {
        ctx.fillStyle = 'rgba(70,90,110,0.85)';
        for (const fy of [0.34, 0.68]) {
          for (const fxn of [0.26, 0.55, 0.8]) {
            const wx = t[i].x + (t[j].x - t[i].x) * fxn + (b[i].x - t[i].x) * fy;
            const wy = t[i].y + (t[j].y - t[i].y) * fxn + (b[i].y - t[i].y) * fy;
            ctx.fillRect(wx - 1.3, wy - 1.6, 2.6, 3.2);
          }
        }
      }
    }
    // The roof: a raised cap inset from the eaves, sun-lit on top,
    // with a ridge line running its long axis.
    const cxT = { x: (t[0].x + t[2].x) / 2, y: (t[0].y + t[2].y) / 2 };
    const cap = t.map((p) => ({
      x: cxT.x + (p.x - cxT.x) * 0.82,
      y: cxT.y + (p.y - cxT.y) * 0.82 - Math.max(1, p.scale * 2.2),
      scale: p.scale,
    }));
    ctx.fillStyle = shade(PALETTE.townRoof, 0.82);
    ctx.beginPath();
    t.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(PALETTE.townRoof, 1.12);
    ctx.beginPath();
    cap.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,40,20,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo((cap[0].x + cap[3].x) / 2, (cap[0].y + cap[3].y) / 2);
    ctx.lineTo((cap[1].x + cap[2].x) / 2, (cap[1].y + cap[2].y) / 2);
    ctx.stroke();
  }
}

function dist2(o, plane) {
  const dx = o.x - plane.x;
  const dz = o.z - plane.z;
  return dx * dx + dz * dz;
}

export function drawLandmarks(ctx, project) {
  for (const mark of LANDMARKS) {
    const base = groundHeight(mark.x, mark.z);
    const foot = project(mark.x, base, mark.z);
    const head = project(mark.x, base + mark.height, mark.z);
    if (!foot || !head) continue;
    // The tower wears its daymark: alternating white and red bands up
    // its height, so it reads as a lighthouse from across the map.
    for (let band = 0; band < 5; band++) {
      const f0 = band / 5;
      const f1 = (band + 1) / 5;
      ctx.strokeStyle = band % 2 ? '#c8432b' : '#e8e4da';
      ctx.lineWidth = Math.max(1.4, foot.scale * 2.4);
      ctx.beginPath();
      ctx.moveTo(foot.x + (head.x - foot.x) * f0, foot.y + (head.y - foot.y) * f0);
      ctx.lineTo(foot.x + (head.x - foot.x) * f1, foot.y + (head.y - foot.y) * f1);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.lampAmber;
    ctx.beginPath();
    ctx.arc(head.x, head.y, Math.max(1.8, foot.scale * 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

// A mission ring: a golden torus standing in the sky, drawn as two circles
// of projected points so it reads as a hoop from any angle.
export function drawRing(ctx, project, ring, isNext, pulse) {
  const pts = [];
  const SEG = 26;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const lx = Math.cos(a) * ring.radius;
    const ly = Math.sin(a) * ring.radius;
    // Rings stand vertical, facing along their course direction.
    const fx = Math.sin(ring.heading);
    const fz = -Math.cos(ring.heading);
    const wx = ring.x + lx * fz;
    const wz = ring.z - lx * fx;
    pts.push(project(wx, ring.y + ly, wz));
  }
  if (pts.some((p) => !p)) return;
  // A soft halo pass under the hoop, then the hoop itself with a pale
  // core line — the next gate glows green and reads from a mile out.
  ctx.strokeStyle = isNext ? 'rgba(61,255,122,0.25)' : 'rgba(255,182,46,0.18)';
  ctx.lineWidth = Math.max(5, pts[0].scale * 7);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.strokeStyle = isNext ? PALETTE.ringNext : PALETTE.ring;
  ctx.lineWidth = Math.max(2, pts[0].scale * (isNext ? 3.4 + pulse : 2.4));
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, pts[0].scale * 1.1);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

export function drawClouds(ctx, project, plane, t) {
  // Each cloud is a cluster of puffs: a soft blue-grey underbelly laid
  // first, three to five white lobes over it, and one small bright cap
  // where the sun strikes — volume instead of v1's flat white discs.
  for (let i = 0; i < 14; i++) {
    const cx = plane.x + ((i * 1733) % 5200) - 2600;
    const cz = plane.z + ((i * 1201) % 5200) - 2600;
    const cy = 430 + (i % 4) * 70;
    const p = project(cx, cy, cz);
    if (!p) continue;
    const r = Math.max(6, p.scale * 88);
    const lobes = 3 + (i % 3);
    ctx.fillStyle = 'rgba(148,172,198,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.16, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    for (let l = 0; l < lobes; l++) {
      const off = (l / (lobes - 1) - 0.5) * 1.5;
      const lr = r * (0.62 - Math.abs(off) * 0.22);
      ctx.beginPath();
      ctx.ellipse(p.x + off * r, p.y - Math.abs(off) * r * 0.05 + (l % 2) * r * 0.05, lr, lr * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,252,240,0.75)';
    ctx.beginPath();
    ctx.ellipse(p.x + r * 0.28, p.y - r * 0.16, r * 0.4, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
