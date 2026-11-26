// renderer-3d.js — a hand-rolled perspective projector that paints the
// archipelago on a 2D canvas: sky, sun and cloud shadows first, then the
// heightfield as flat-shaded facets sorted far to near, then runways, the
// harbour town, landmarks and the mission rings. One job: turn world
// coordinates into a picture a pilot can read at a glance.

import { WORLD, PALETTE, RUNWAYS } from './config.js';
import { groundHeight, surfaceKind, TOWN_BLOCKS, LANDMARKS } from './terrain-archipelago.js';

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
  g.addColorStop(0.72, PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, Math.max(0, horizon + 2));
  // The sun, high off the port bow, and a wash of light under it.
  ctx.fillStyle = PALETTE.sun;
  ctx.beginPath();
  ctx.arc(width * 0.82, height * 0.13, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,243,196,0.16)';
  ctx.beginPath();
  ctx.arc(width * 0.82, height * 0.13, 58, 0, Math.PI * 2);
  ctx.fill();
  return horizon;
}

export function drawSea(ctx, project, camera, width, height, horizon) {
  ctx.fillStyle = PALETTE.sea;
  ctx.fillRect(0, horizon, width, height - horizon);
  // Sun glitter: short bright dashes scattered on the water, denser near
  // the sun's side — cheap, and it sells the altitude instantly.
  ctx.fillStyle = 'rgba(220,245,255,0.2)';
  for (let i = 0; i < 30; i++) {
    const gx = ((i * 613) % 997) / 997;
    const gz = 300 + ((i * 389) % 2600);
    const p = project(camera.x + (gx - 0.5) * gz * 1.6, 0, camera.z + gz * 0.4 + (i % 7) * 90);
    if (p && p.x > -20 && p.x < width + 20 && p.y > horizon && p.y < height) {
      ctx.fillRect(p.x, p.y, Math.max(1.5, p.scale * 6), 1.4);
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
    ctx.fillStyle = shadeFor(kind, cell.h, cell.x, cell.z);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function shadeFor(kind, h, x, z) {
  if (kind === 'runway') return PALETTE.runway;
  if (h < 0.5) return '#2b8296'; // the shoreline shelf, pale over the sand
  if (KIND_FILL[kind]) return KIND_FILL[kind];
  // Grass takes two tones by height so slopes read as slopes.
  const tone = ((Math.floor(x / 130) + Math.floor(z / 130)) % 2 + 2) % 2;
  if (h < 60) return tone ? PALETTE.grassLow : '#84b166';
  return tone ? PALETTE.grassHigh : '#57884a';
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
    ctx.fillStyle = PALETTE.townWall;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      ctx.beginPath();
      ctx.moveTo(b[i].x, b[i].y);
      ctx.lineTo(b[j].x, b[j].y);
      ctx.lineTo(t[j].x, t[j].y);
      ctx.lineTo(t[i].x, t[i].y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.townRoof;
    ctx.beginPath();
    t.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
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
    ctx.strokeStyle = '#e8e4da';
    ctx.lineWidth = Math.max(1.4, foot.scale * 2.4);
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
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
  ctx.strokeStyle = isNext ? PALETTE.ringNext : PALETTE.ring;
  ctx.lineWidth = Math.max(2, pts[0].scale * (isNext ? 3.4 + pulse : 2.4));
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

export function drawClouds(ctx, project, plane, t) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 14; i++) {
    const cx = plane.x + ((i * 1733) % 5200) - 2600;
    const cz = plane.z + ((i * 1201) % 5200) - 2600;
    const cy = 430 + (i % 4) * 70;
    const p = project(cx, cy, cz);
    if (!p) continue;
    const r = Math.max(6, p.scale * 88);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + r * 0.5, p.y + r * 0.08, r * 0.62, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
