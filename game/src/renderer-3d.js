// renderer-3d.js — a hand-rolled perspective projector that paints the
// archipelago on a 2D canvas: sky, sun and cloud shadows first, then the
// heightfield as a subdivided, vertex-lit mesh over a continuous colour
// ramp sorted far to near, then runways, the harbour town, landmarks and
// the mission rings. One job: turn world coordinates into a picture a
// pilot can read at a glance.

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

// --- The de-boxed ground: one continuous colour ramp, vertex-lit ---
// v1–v3 coloured each 130 m cell with a single flat fill picked from
// hard biome classes, so beaches came out as squares, the sea shelf
// as flat rectangles and the mountain as plain facets. The ground is
// now coloured by a ramp that never steps: every vertex of a fine
// 65 m grid takes its colour from its own height, slope and chart
// noise, lit by its own surface normal, and each drawn quad averages
// its corners — slopes shade continuously and biome edges wander
// with the contours instead of snapping to the grid.

const RGB_CACHE = new Map();

export function hexRgb(hex) {
  let rgb = RGB_CACHE.get(hex);
  if (!rgb) {
    const n = parseInt(hex.slice(1), 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB_CACHE.set(hex, rgb);
  }
  return rgb;
}

function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

// Smoothstep between two edges: the only way colours change here.
function sstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// The ramp itself: sea floor → shelf → shallows → wet sand → dry
// sand → mottled grass → strata rock → noise-broken snow, every
// boundary a blend band several metres wide.
export function terrainBaseRgb(h, slope, x, z) {
  if (h < 0.4) {
    // Underwater: the shelf falls away in one gradient, deep
    // blue-green under the keel to pale turquoise at the lip, then
    // darkens into wet sand exactly where the water lets go.
    let c = mixRgb(hexRgb(PALETTE.seaDeep), hexRgb(PALETTE.seaFloor), sstep(-11, -4, h));
    c = mixRgb(c, hexRgb(PALETTE.seaShelf), sstep(-4.5, -1.2, h));
    c = mixRgb(c, hexRgb(PALETTE.seaShallow), sstep(-1.4, 0.1, h));
    return mixRgb(c, hexRgb(PALETTE.sandWet), sstep(-0.1, 0.45, h));
  }
  // Sand: wet at the waterline, dry and pale a few metres up. Over
  // the very lip lies the foam's soft edge — a pale band whose
  // strength the fine chart noise keeps breaking up, so the waterline
  // reads as surf, not as a drawn line.
  let c = mixRgb(hexRgb(PALETTE.sandWet), hexRgb(PALETTE.sandDry), sstep(0.4, 3.4, h));
  const foamN = 0.5 + 0.5 * chartNoise(x * 2.6, z * 2.6);
  const foam = (1 - Math.abs(h - 0.65) / 0.95) * (0.3 + 0.55 * foamN);
  if (foam > 0) c = mixRgb(c, hexRgb(PALETTE.foam), Math.min(0.55, foam));
  // Grass: two tones married by height, then mottled toward scrub
  // by the chart noise so no meadow is one flat sheet of green.
  const g = mixRgb(hexRgb(PALETTE.grassLow), hexRgb(PALETTE.grassHigh), sstep(8, 120, h));
  const mottle = 0.5 + 0.5 * chartNoise(x * 2.3, z * 2.3);
  const grass = mixRgb(g, hexRgb(PALETTE.scrub), mottle * 0.45);
  c = mixRgb(c, grass, sstep(3.8, 8.5, h));
  // Rock: strata bands that follow the contour lines, their edges
  // broken by noise, with darker scree flecked through them. Steep
  // ground gives up its grass and shows rock at any height, and high
  // ground turns rocky even where it lies gentle.
  const strata = 0.5 + 0.5 * Math.sin(h * 0.115 + chartNoise(x, z) * 2.4);
  let rock = mixRgb(hexRgb(PALETTE.rockDark), hexRgb(PALETTE.rock), 0.25 + strata * 0.65);
  const scree = 0.5 + 0.5 * chartNoise(x * 5.1, z * 5.1);
  rock = mixRgb(rock, hexRgb(PALETTE.rockDark), scree * 0.22);
  const rockAmt = Math.max(sstep(0.52, 0.9, slope), sstep(125, 185, h));
  c = mixRgb(c, rock, rockAmt * sstep(6, 26, h));
  // Snow: an irregular line the noise pushes up one gully and down
  // the next, lying deep only where the slope is gentle enough to
  // hold it, and streaked with blue shadow runs.
  const snowLine = 272 + chartNoise(x * 1.35, z * 1.35) * 42;
  const snowAmt = sstep(snowLine - 20, snowLine + 22, h) * (1 - sstep(0.75, 1.25, slope) * 0.7);
  if (snowAmt > 0) {
    const streak = 0.5 + 0.5 * chartNoise(x * 3.1, z * 3.1);
    const snow = mixRgb(hexRgb(PALETTE.snow), hexRgb(PALETTE.snowShade), streak * 0.55);
    c = mixRgb(c, snow, snowAmt);
  }
  // Fine organic mottling, the last word: a noise pass at tens of
  // metres' wavelength, so flat meadows and beaches carry tonal
  // patches that wander like real ground — never polished flat, and
  // never repeating with the grid that draws them.
  const fine = 0.5 + 0.5 * chartNoise(x * 13.7, z * 13.7);
  const tone = 0.965 + fine * 0.07;
  return [c[0] * tone, c[1] * tone, c[2] * tone];
}

// The fine shading grid: vertices every 65 m (half a terrain cell),
// their heights and lit colours cached for the length of one frame
// so neighbouring cells share the very same corner — the mesh has
// no seams and the colour field has no steps.
const FINE = WORLD.terrainStep / 2;
let heightCache = new Map();
let vertexCache = new Map();

function cacheKey(ix, iz) {
  return (ix + 512) * 2048 + (iz + 512);
}

function heightAt(ix, iz) {
  const k = cacheKey(ix, iz);
  let h = heightCache.get(k);
  if (h === undefined) {
    h = groundHeight(ix * FINE, iz * FINE);
    heightCache.set(k, h);
  }
  return h;
}

// One grid vertex, fully lit: its normal comes from the heightfield
// itself (forward differences over the fine step), its colour from
// the ramp, and a whisper of per-vertex grain — planted by the grid
// hash — so sand and grass carry speckle instead of polish.
export function vertexAt(ix, iz) {
  const k = cacheKey(ix, iz);
  let v = vertexCache.get(k);
  if (v) return v;
  const x = ix * FINE;
  const z = iz * FINE;
  const h = heightAt(ix, iz);
  const dhx = (heightAt(ix + 1, iz) - h) / FINE;
  const dhz = (heightAt(ix, iz + 1) - h) / FINE;
  const inv = 1 / Math.hypot(dhx, 1, dhz);
  const dot = (-dhx * SUN_DIR.x + SUN_DIR.y - dhz * SUN_DIR.z) * inv;
  const light = 0.62 + 0.55 * Math.max(0, dot);
  const slope = Math.hypot(dhx, dhz);
  const base = surfaceKind(x, z, h) === 'runway'
    ? hexRgb(PALETTE.runway)
    : terrainBaseRgb(h, slope, x, z);
  const grain = 0.985 + cellHash(ix * 3 + 11, iz * 3 - 7) * 0.03;
  const f = light * grain;
  v = {
    h,
    r: Math.min(255, base[0] * f),
    g: Math.min(255, base[1] * f),
    b: Math.min(255, base[2] * f),
  };
  vertexCache.set(k, v);
  return v;
}

// A sample anywhere on the ground: an exact grid vertex when the
// point lands on the fine grid, otherwise a bilinear blend of the
// four vertices around it — height and lit colour alike, so a
// subdivided quad curves with the hill instead of faceting.
export function samplePoint(wx, wz) {
  const gx = wx / FINE;
  const gz = wz / FINE;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  if (fx < 0.002 && fz < 0.002) return vertexAt(ix, iz);
  const a = vertexAt(ix, iz);
  const b = vertexAt(ix + 1, iz);
  const c = vertexAt(ix, iz + 1);
  const d = vertexAt(ix + 1, iz + 1);
  const topH = a.h + (b.h - a.h) * fx;
  const botH = c.h + (d.h - c.h) * fx;
  const topR = a.r + (b.r - a.r) * fx;
  const botR = c.r + (d.r - c.r) * fx;
  const topG = a.g + (b.g - a.g) * fx;
  const botG = c.g + (d.g - c.g) * fx;
  const topB = a.b + (b.b - a.b) * fx;
  const botB = c.b + (d.b - c.b) * fx;
  return {
    h: topH + (botH - topH) * fz,
    r: topR + (botR - topR) * fz,
    g: topG + (botG - topG) * fz,
    b: topB + (botB - topB) * fz,
  };
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
  // Swell: long low bands of light rolling across the water, drawn
  // as dashed projected lines ahead of the camera so they lie on the
  // sea's own surface, foreshorten with distance and break up the
  // last of the flat open-water sheet.
  const fxw = Math.sin(camera.heading);
  const fzw = -Math.cos(camera.heading);
  const rxw = -fzw;
  const rzw = fxw;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([26, 34]);
  for (let k = 0; k < 9; k++) {
    const d = 300 + k * 330 + (k % 3) * 80;
    ctx.strokeStyle = `rgba(214,240,248,${0.085 - k * 0.006})`;
    ctx.beginPath();
    let pen = false;
    for (let sgm = -4; sgm <= 4; sgm++) {
      const off = sgm * d * 0.3;
      const p = project(
        camera.x + fxw * d + rxw * off, 0,
        camera.z + fzw * d + rzw * off);
      if (p && p.y > horizon) {
        if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
      } else pen = false;
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export function drawTerrain(ctx, project, plane) {
  // Fresh shading caches for this frame: the vertex grid is anchored
  // to the world, so a vertex keeps its colour as the camera moves.
  heightCache = new Map();
  vertexCache = new Map();
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
      if (h < -12.5) continue; // only the true abyss is the flat sea's job
      const dx = x + step / 2 - plane.x;
      const dz = z + step / 2 - plane.z;
      cells.push({ x, z, h, d2: dx * dx + dz * dz });
    }
  }
  cells.sort((a, b) => b.d2 - a.d2);
  for (const cell of cells) {
    // Haze: far ground fades toward the sky so the chart's edge dissolves
    // instead of ending in a confetti of grazing-angle slivers.
    ctx.globalAlpha = Math.max(0.42, Math.min(1, 1.18 - Math.sqrt(cell.d2) / 3600));
    // Adaptive subdivision: the ground under the aeroplane is cut
    // four ways, the mid-distance two, the far hills left whole —
    // the mesh is finest exactly where a pilot's eye can measure it,
    // and the frame rate never pays for detail nobody can see.
    const dist = Math.sqrt(cell.d2);
    const n = dist < 620 ? 4 : dist < 2400 ? 2 : 1;
    const pts = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const wx = cell.x + (step * i) / n;
        const wz = cell.z + (step * j) / n;
        const v = samplePoint(wx, wz);
        const p = project(wx, v.h, wz);
        pts.push(p ? { x: p.x, y: p.y, r: v.r, g: v.g, b: v.b } : null);
      }
    }
    // Each sub-quad takes the average of its four lit corners: with
    // corners shared between neighbours and colours drawn from the
    // continuous ramp, the eye reads one smooth hillside — no facet
    // lines on the mountain, no squares on the beach.
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = pts[j * (n + 1) + i];
        const b = pts[j * (n + 1) + i + 1];
        const c = pts[(j + 1) * (n + 1) + i + 1];
        const d = pts[(j + 1) * (n + 1) + i];
        if (!a || !b || !c || !d) continue;
        ctx.fillStyle = `rgb(${Math.round((a.r + b.r + c.r + d.r) / 4)},${Math.round((a.g + b.g + c.g + d.g) / 4)},${Math.round((a.b + b.b + c.b + d.b) / 4)})`;
        // Each corner pushed a hair outward from the quad's centre:
        // projected neighbours land on fractional pixels, and an
        // exact fit leaves hairline seams that print the mesh onto
        // flat ground like graph paper. The whisker of overlap is
        // invisible; the seams were not.
        const cx = (a.x + b.x + c.x + d.x) / 4;
        const cy = (a.y + b.y + c.y + d.y) / 4;
        const grow = (p) => {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const len = Math.hypot(dx, dy) || 1;
          return [p.x + (dx / len) * 0.7, p.y + (dy / len) * 0.7];
        };
        const [ax, ay] = grow(a);
        const [bx, by] = grow(b);
        const [qx, qy] = grow(c);
        const [dx2, dy2] = grow(d);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(qx, qy);
        ctx.lineTo(dx2, dy2);
        ctx.closePath();
        ctx.fill();
      }
    }
    const kind = surfaceKind(cell.x + step / 2, cell.z + step / 2, cell.h);
    // Slope for the tree planter, from the fine grid's own heights.
    const fi = Math.round(cell.x / FINE);
    const fj = Math.round(cell.z / FINE);
    const e = 2; // one coarse cell = two fine steps
    const dhx = ((heightAt(fi + e, fj) + heightAt(fi + e, fj + e)) - (heightAt(fi, fj) + heightAt(fi, fj + e))) / (2 * step);
    const dhz = ((heightAt(fi, fj + e) + heightAt(fi + e, fj + e)) - (heightAt(fi, fj) + heightAt(fi + e, fj))) / (2 * step);
    const steep = Math.hypot(dhx, dhz);
    drawCellTrees(ctx, project, cell, kind, steep);
  }
  ctx.globalAlpha = 1;
}

// Trees ride the terrain pass so painter's order keeps them behind
// nearer hills: a cell grows 0–3 trees by its hash, only on gentle
// grass. Two species by altitude, the way the real archipelago would
// grow them: broadleaf park trees on the lowlands and coasts, pines
// only up on Mount Vela's high slopes.
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
    const jitter = 0.85 + 0.35 * cellHash(gx + i * 13, gz + i * 17);
    if (th >= 100) drawPineTree(ctx, foot, w, hh);
    else drawBroadleafTree(ctx, foot, w, hh, jitter);
  }
}

// A pine: a dark cone with a sun-lit shoulder and a cast shadow fleck.
function drawPineTree(ctx, foot, w, hh) {
  ctx.fillStyle = 'rgba(16,40,20,0.35)';
  ctx.beginPath();
  ctx.ellipse(foot.x + w * 0.5, foot.y, w * 0.9, w * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.treeDark;
  ctx.beginPath();
  ctx.moveTo(foot.x, foot.y - hh);
  ctx.lineTo(foot.x + w, foot.y);
  ctx.lineTo(foot.x - w, foot.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.treeLight;
  ctx.beginPath();
  ctx.moveTo(foot.x, foot.y - hh);
  ctx.lineTo(foot.x + w, foot.y);
  ctx.lineTo(foot.x + w * 0.18, foot.y);
  ctx.closePath();
  ctx.fill();
}

// The leaf puffs of one broadleaf crown: [across, up, radius] in units
// of the canopy radius, up measured from the crown's centre. No two
// puffs share a radius and the rim puffs sit proud of the core, so the
// silhouette stays as irregular as a real tree's.
const CANOPY_PUFFS = [
  [0, 0.08, 0.6],
  [-0.52, -0.04, 0.44],
  [0.54, 0, 0.46],
  [-0.3, 0.32, 0.42],
  [0.32, 0.34, 0.44],
  [0.02, 0.46, 0.38],
  [-0.64, -0.3, 0.33],
  [0.66, -0.28, 0.35],
  [0.04, -0.32, 0.4],
];

// A broadleaf tree modelled on a real park tree: a tapered grey-brown
// trunk that splits into branches, carrying a big rounded crown of
// clustered leaf puffs in three greens laid down by the sun — a dark
// underside, a rich mid body, and a bright cap on the sunward top.
function drawBroadleafTree(ctx, foot, w, hh, jitter) {
  const crownR = w * 1.05 * jitter;
  const crownY = foot.y - hh * 0.72;
  // Soft ground shadow, thrown away from the sun.
  ctx.fillStyle = 'rgba(16,40,20,0.32)';
  ctx.beginPath();
  ctx.ellipse(foot.x - crownR * 0.18, foot.y, crownR * 0.95, crownR * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  // Trunk: a tapered post, its shaded side a step darker, splitting
  // into two branch strokes that reach into the crown's lower puffs.
  const trunkTop = foot.y - hh * 0.48;
  const baseHalf = Math.max(0.7, crownR * 0.075);
  const topHalf = Math.max(0.4, crownR * 0.04);
  ctx.fillStyle = PALETTE.trunk;
  ctx.beginPath();
  ctx.moveTo(foot.x - baseHalf, foot.y);
  ctx.lineTo(foot.x - topHalf, trunkTop);
  ctx.lineTo(foot.x + topHalf, trunkTop);
  ctx.lineTo(foot.x + baseHalf, foot.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.trunkShade;
  ctx.beginPath();
  ctx.moveTo(foot.x - baseHalf, foot.y);
  ctx.lineTo(foot.x - topHalf, trunkTop);
  ctx.lineTo(foot.x, trunkTop);
  ctx.lineTo(foot.x, foot.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.trunkShade;
  ctx.lineWidth = Math.max(0.6, crownR * 0.07);
  ctx.beginPath();
  ctx.moveTo(foot.x, trunkTop + crownR * 0.06);
  ctx.lineTo(foot.x - crownR * 0.34, crownY + crownR * 0.18);
  ctx.moveTo(foot.x, trunkTop + crownR * 0.06);
  ctx.lineTo(foot.x + crownR * 0.36, crownY + crownR * 0.14);
  ctx.stroke();
  if (hh < 7) {
    // Too far off for puff detail: one dark blob with a lit top reads
    // as a leafy crown at range and costs two arcs.
    ctx.fillStyle = PALETTE.leafDark;
    ctx.beginPath();
    ctx.arc(foot.x, crownY + crownR * 0.12, crownR * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.leafMid;
    ctx.beginPath();
    ctx.arc(foot.x, crownY, crownR * 0.88, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.leafLit;
    ctx.beginPath();
    ctx.arc(foot.x + crownR * 0.18, crownY - crownR * 0.3, crownR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Underside pass: every puff dropped a step and painted dark, so
  // the crown's belly sits in its own shade.
  ctx.fillStyle = PALETTE.leafDark;
  for (const [px, py, pr] of CANOPY_PUFFS) {
    if (pr < 0.38) continue; // the small rim puffs carry no underside
    ctx.beginPath();
    ctx.arc(foot.x + px * crownR, crownY - py * crownR + crownR * 0.13, pr * crownR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Body pass: the puffs themselves in the mid green.
  ctx.fillStyle = PALETTE.leafMid;
  for (const [px, py, pr] of CANOPY_PUFFS) {
    ctx.beginPath();
    ctx.arc(foot.x + px * crownR, crownY - py * crownR, pr * crownR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Texture pass: small dark flecks tucked into the lower puffs, so
  // the mid green reads as clusters of leaves instead of one flat fill.
  ctx.fillStyle = PALETTE.leafDark;
  for (const [px, py, pr] of CANOPY_PUFFS) {
    if (py > 0.1 || hh < 9) continue;
    ctx.beginPath();
    ctx.arc(foot.x + (px - 0.12) * crownR, crownY - (py - 0.1) * crownR, pr * crownR * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sun pass: smaller bright puffs riding the tops of the upper
  // puffs, stepped toward the sun, with a few flecks of the brightest
  // green on the very crown.
  ctx.fillStyle = PALETTE.leafLit;
  for (const [px, py, pr] of CANOPY_PUFFS) {
    if (py < 0.05) continue;
    ctx.beginPath();
    ctx.arc(foot.x + (px + 0.13) * crownR, crownY - (py + 0.13) * crownR, pr * crownR * 0.58, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.leafBright;
  for (const [px, py, pr] of CANOPY_PUFFS) {
    if (py < 0.3) continue;
    ctx.beginPath();
    ctx.arc(foot.x + (px + 0.2) * crownR, crownY - (py + 0.24) * crownR, pr * crownR * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
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
