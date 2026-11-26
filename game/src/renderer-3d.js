// renderer-3d.js — a hand-rolled perspective projector that paints the
// archipelago on a 2D canvas: sky, sun and cloud shadows first, then the
// heightfield as a subdivided, vertex-lit mesh over a continuous colour
// ramp sorted far to near, then runways, the harbour town, landmarks and
// the mission rings. One job: turn world coordinates into a picture a
// pilot can read at a glance.

import { WORLD, PALETTE, RUNWAYS, ISLANDS } from './config.js';
import { groundHeight, surfaceKind, chartNoise, TOWN_BLOCKS, LANDMARKS } from './terrain-archipelago.js';

// The sun's direction, one for the whole world — and, since v6,
// shared with aircraft-art.js so the aeroplane is lit by the same
// sun as the ground it flies over. Golden hour: low in the east and
// a little north — (0.66, 0.34, -0.38) unnormalised — so slopes rake,
// shadows lengthen and the sea can hold a glitter path. Every slope
// shade, glitter dash and lit wall in the game is computed against
// it, so the light agrees with itself from the sky to the rooftops.
export const SUN_DIR = { x: 0.66, y: 0.34, z: -0.38 };

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

// --- The worked lowlands: farmland that breaks the last grid ---
// v4's foreground still read as big flat squares: at grazing angles
// one flat-filled sub-quad covers hundreds of pixels, and on the
// flat lowlands nothing interrupted the mesh. The lowlands are now
// farmed. Plots lie on a grid turned ~18° off the world's axes and
// warped by chart noise, so no boundary ever runs with the drawing
// mesh; each plot takes a crop tone from its hash, carries plough
// rows along its own direction, and is fenced by a dark hedgerow.
// A sandy track rings each big island through its field band.

const CROP_TONES = ['cropWheat', 'cropYoung', 'cropDeep', 'cropPlough', 'cropFallow', 'grassHigh'];

// Inside Porto Lume's town rectangle the ground stays plain grass:
// the houses carry that quarter, and plots under a street grid
// would fight the town's own pattern.
function inTownGround(x, z) {
  const lume = ISLANDS.find((i) => i.town);
  return lume && x > lume.x - 400 && x < lume.x + 400 && z > lume.z + 150 && z < lume.z + 580;
}

// Distance to the nearest island ring track: a dirt road that
// circles each big island through its farmed band, so a pilot
// skimming the lowlands crosses a track, not a texture edge.
function trackDistance(x, z) {
  const home = Math.abs(Math.hypot(x - 0, z - 1700) - 760);
  const lume = Math.abs(Math.hypot(x - 2500, z - 2300) - 580);
  return Math.min(home, lume);
}

// The farmland itself, as a colour laid over the grass: returns the
// tinted colour for a point in the field band, or null outside it.
function fieldTint(c, h, slope, x, z) {
  const amt = sstep(5.5, 9.5, h) * (1 - sstep(52, 84, h)) * (1 - sstep(0.3, 0.48, slope));
  if (amt <= 0.01 || inTownGround(x, z)) return null;
  // The plot grid, turned and warped: boundaries wander with the
  // noise, never with the mesh that draws them.
  const ca = 0.951; // cos(18°)
  const sa = 0.309; // sin(18°)
  const ru = x * ca + z * sa + 115 * chartNoise(x * 6, z * 6);
  const rv = -x * sa + z * ca + 115 * chartNoise(z * 6 + 40, x * 6 - 25);
  const S = 235; // one plot, metres across
  const fu = ru / S;
  const fv = rv / S;
  const iu = Math.floor(fu);
  const iv = Math.floor(fv);
  const pu = fu - iu;
  const pv = fv - iv;
  const plotHash = cellHash(iu * 3 + 7, iv * 5 - 3);
  const crop = hexRgb(PALETTE[CROP_TONES[Math.min(5, Math.floor(plotHash * 6))]]);
  // Plough rows run along a direction the plot's own hash chooses,
  // a gentle light-dark breathing across the field. The rows are
  // wide and faint on purpose: sampled on the 65 m vertex grid, a
  // tight bright stripe would alias into per-vertex patchwork.
  const sta = plotHash * Math.PI;
  const su = ((pu - 0.5) * Math.cos(sta) + (pv - 0.5) * Math.sin(sta)) * S;
  const rows = 0.5 + 0.5 * Math.sin(su * ((Math.PI * 2) / 26) + plotHash * 30);
  const rf = 0.97 + rows * 0.05;
  let out = mixRgb(c, [crop[0] * rf, crop[1] * rf, crop[2] * rf], amt * 0.8);
  // Hedgerows: a dark fence line where one plot meets the next,
  // soft enough to read as a hedge, never as a drawn border.
  const edge = Math.min(Math.min(pu, 1 - pu), Math.min(pv, 1 - pv)) * S;
  const hedge = 1 - sstep(3.5, 10, edge);
  if (hedge > 0) out = mixRgb(out, hexRgb(PALETTE.hedge), hedge * amt * 0.75);
  // The ring track: bare sandy dirt where the road crosses, its
  // edges feathered into the fields it serves.
  const td = trackDistance(x, z);
  if (td < 10) {
    const dirt = 1 - sstep(4, 10, td);
    out = mixRgb(out, hexRgb(PALETTE.dirt), dirt * Math.max(amt, 0.3) * 0.85);
  }
  return out;
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
    c = mixRgb(c, hexRgb(PALETTE.seaShallow), sstep(-2.4, 0.3, h));
    return mixRgb(c, hexRgb(PALETTE.sandWet), sstep(-0.2, 0.9, h));
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
  // Farmland takes the flat lowlands over from the grass: warped
  // plots, crop tones, plough rows, hedgerows and the ring tracks.
  const tinted = fieldTint(c, h, slope, x, z);
  if (tinted) c = tinted;
  // Rock: broad tonal bands with edges the noise tears apart, and
  // darker scree flecked through them. Steep ground gives up its
  // grass and shows rock at any height, and high ground turns rocky
  // even where it lies gentle. (v4's strata ran at a tight vertical
  // period keyed to height alone, so on a smooth dome they printed
  // as contour lines — the bands are wider now, weaker, and their
  // phase is dragged sideways by noise until no line survives.)
  const strata = 0.5 + 0.5 * Math.sin(h * 0.05 + chartNoise(x * 2, z * 2) * 3.4);
  let rock = mixRgb(hexRgb(PALETTE.rockDark), hexRgb(PALETTE.rock), 0.42 + strata * 0.38);
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
  // Cloud shadow: broad soft patches of shade, hundreds of metres
  // across, laid over land and shelf alike — the still pools of
  // darker ground a pilot sees under a broken sky. Kept under a
  // tenth of the light, so they soften the world without ever
  // reading as terrain of their own.
  const cs = Math.sin(x * 0.0016 + 1.7) * Math.sin(z * 0.0013 - 0.6)
    + 0.5 * Math.sin(x * 0.0007 - 0.9) * Math.sin(z * 0.0021 + 2.0);
  const cloudShade = 1 - 0.09 * sstep(0.25, 0.95, cs);
  const f = light * grain * cloudShade;
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
// the horizon tilts with the aeroplane instead of fighting it. Since
// v6 it flies closer and lower — the Petrel is real 3D geometry now
// and fills near half the frame, the way a chase plane on a filming
// sortie actually frames her.
export function chaseCamera(camera, plane, dt, snap = false) {
  const back = 10.5 + plane.speed * 0.02;
  const tx = plane.x - Math.sin(plane.heading) * back;
  const tz = plane.z + Math.cos(plane.heading) * back;
  const ty = plane.y + 2.6;
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
  const cr = Math.cos(-camera.roll);
  const sr = Math.sin(-camera.roll);
  const toScreen = (cx, cy, cz) => {
    const s = focal / cz;
    // Roll the picture around its centre: the world leans, the panel doesn't.
    const px = cx * s;
    const py = -cy * s;
    return {
      x: width / 2 + px * cr - py * sr,
      y: height / 2 + px * sr + py * cr,
      depth: cz,
      scale: s,
    };
  };
  const basis = (x, y, z) => {
    const dx = x - camera.x;
    const dy = y - camera.y;
    const dz = z - camera.z;
    const cx = dx * rx + dz * rz;
    const cz0 = dx * fx + dz * fz;
    return { cx, cy: dy * cp - cz0 * sp, cz: dy * sp + cz0 * cp };
  };
  function project(x, y, z) {
    const { cx, cy, cz } = basis(x, y, z);
    if (cz < 0.5) return null;
    return toScreen(cx, cy, cz);
  }
  // Polygon clipping against the near plane, for ground quads: a
  // quad straddling the camera is cut at half a metre and the cut
  // polygon paints to the frame's edges, instead of the whole quad
  // vanishing and leaving the sea showing under the aeroplane on a
  // ground roll. (Sliding the lost corners along their own rays —
  // the obvious shortcut — images them across the centre and the
  // polygon still misses the ground it should cover; the cut has
  // to happen on the edges, in camera space.)
  project.clipPolygon = (worldPts) => {
    let poly = worldPts.map((p) => basis(p.x, p.y, p.z));
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const curIn = cur.cz >= 0.5;
      const prevIn = prev.cz >= 0.5;
      if (curIn !== prevIn) {
        const t = (0.5 - prev.cz) / (cur.cz - prev.cz);
        res.push({
          cx: prev.cx + (cur.cx - prev.cx) * t,
          cy: prev.cy + (cur.cy - prev.cy) * t,
          cz: 0.5,
        });
      }
      if (curIn) res.push(cur);
    }
    if (res.length < 3) return null;
    return res.map((p) => toScreen(p.cx, p.cy, p.cz));
  };
  return project;
}

export function drawSky(ctx, camera, width, height) {
  const horizon = height / 2 - Math.tan(camera.pitch) * height * 0.5;
  const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.45, PALETTE.skyMid);
  g.addColorStop(0.78, '#e9c493');
  g.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, Math.max(0, horizon + 2));
  // The sun, low off the port bow at golden hour: a wide radial glow
  // that falls off in rings, a warm wash under it, and a pale core.
  const sx = width * 0.84;
  const sy = height * 0.19;
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 190);
  glow.addColorStop(0, 'rgba(255,205,130,0.6)');
  glow.addColorStop(0.35, 'rgba(255,185,105,0.25)');
  glow.addColorStop(1, 'rgba(255,185,105,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 190, sy - 190, 380, 380);
  const core = ctx.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 25);
  core.addColorStop(0, PALETTE.sunCore);
  core.addColorStop(0.8, PALETTE.sun);
  core.addColorStop(1, 'rgba(255,217,163,0.85)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(sx, sy, 26, 0, Math.PI * 2);
  ctx.fill();
  return horizon;
}

export function drawSea(ctx, project, camera, width, height, horizon) {
  // Open water deepens away from the horizon line; the shallows near a
  // shore are the terrain shelf's own colour, drawn with the land.
  // The far water starts as haze-blue and only deepens as it nears,
  // so the sea climbs into the sky instead of meeting it at a cut.
  const g = ctx.createLinearGradient(0, horizon, 0, height);
  g.addColorStop(0, '#cfa878');
  g.addColorStop(0.22, '#2b8296');
  g.addColorStop(0.55, PALETTE.sea);
  g.addColorStop(1, PALETTE.seaDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, width, height - horizon);
  // A soft band of warm horizon haze straddling the waterline:
  // strongest exactly where sea meets sky, gone a few dozen pixels
  // either way.
  const band = ctx.createLinearGradient(0, horizon - 14, 0, horizon + 64);
  band.addColorStop(0, 'rgba(232,201,154,0)');
  band.addColorStop(0.18, 'rgba(232,201,154,0.5)');
  band.addColorStop(1, 'rgba(232,201,154,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, horizon - 14, width, 78);
  // Sun glitter: at golden hour the path on the water under the sun
  // runs broad and warm — dashes clustered toward the sun's side of
  // the frame and thinning outward, plus a sparse scatter elsewhere.
  // It sells the altitude, and the hour, instantly.
  for (let i = 0; i < 74; i++) {
    const onPath = i < 52;
    const gx = onPath ? 0.84 + (((i * 197) % 199) / 199 - 0.5) * 0.68 : ((i * 613) % 997) / 997;
    const gz = 300 + ((i * 389) % 2600);
    const p = project(camera.x + (gx - 0.5) * gz * 1.6, 0, camera.z + gz * 0.4 + (i % 7) * 90);
    if (p && p.x > -20 && p.x < width + 20 && p.y > horizon && p.y < height) {
      ctx.fillStyle = onPath ? 'rgba(255,205,130,0.5)' : 'rgba(220,245,255,0.16)';
      ctx.fillRect(p.x, p.y, Math.max(1.5, p.scale * (onPath ? 11 : 6)), 1.4);
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
  const hazeRgb = hexRgb(PALETTE.haze);
  for (const cell of cells) {
    // Adaptive subdivision: the ground under the aeroplane is cut
    // six ways, the mid-distance two, and the far hills two as well
    // — only the flat far shelf is left whole. The mesh is finest
    // exactly where a pilot's eye can measure it, and no hillside
    // anywhere is one flat quad deep.
    const dist = Math.sqrt(cell.d2);
    const n = dist < 520 ? 8 : dist < 2400 ? (cell.h > 45 ? 3 : 2) : cell.h > 45 ? 2 : 1;
    const pts = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const wx = cell.x + (step * i) / n;
        const wz = cell.z + (step * j) / n;
        const v = samplePoint(wx, wz);
        // The grid keeps its WORLD corners: the fill below clips
        // each sub-quad against the near plane in camera space, so
        // a corner behind the camera cuts the quad at the frame's
        // edge instead of deleting it — deleting it tore a
        // sea-coloured gash under the aeroplane on every ground
        // roll. Depth is only the haze's business; a corner behind
        // the camera is near by definition, so it takes none.
        const p = project(wx, v.h, wz);
        pts.push({
          wx, wz, wh: v.h, depth: p ? p.depth : 0,
          sx: p ? p.x : 0, sy: p ? p.y : 0, clip: !p,
          r: v.r, g: v.g, b: v.b,
        });
      }
    }
    // Each sub-quad takes the average of its four lit corners: with
    // corners shared between neighbours and colours drawn from the
    // continuous ramp, the eye reads one smooth hillside — no facet
    // lines on the mountain, no squares on the beach. Distance haze
    // is mixed into the colour of every corner by its own depth, so
    // far ground dissolves toward the horizon sky. (v4 faded far
    // cells with a translucent fill instead; the grown, overlapping
    // quads then double-painted their shared edges and printed a
    // wireframe of dark seams across every distant hill. Opaque
    // paint with the haze inside the colour has no seams to print.)
    const hazed = (p) => {
      const w = sstep(1500, 3500, p.depth) * 0.6;
      return [
        p.r + (hazeRgb[0] - p.r) * w,
        p.g + (hazeRgb[1] - p.g) * w,
        p.b + (hazeRgb[2] - p.b) * w,
      ];
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = pts[j * (n + 1) + i];
        const b = pts[j * (n + 1) + i + 1];
        const c = pts[(j + 1) * (n + 1) + i + 1];
        const d = pts[(j + 1) * (n + 1) + i];
        const ca = hazed(a);
        const cb = hazed(b);
        const cc = hazed(c);
        const cd = hazed(d);
        ctx.fillStyle = `rgb(${Math.round((ca[0] + cb[0] + cc[0] + cd[0]) / 4)},${Math.round((ca[1] + cb[1] + cc[1] + cd[1]) / 4)},${Math.round((ca[2] + cb[2] + cc[2] + cd[2]) / 4)})`;
        // Each corner pushed a hair outward from the quad's centre:
        // projected neighbours land on fractional pixels, and an
        // exact fit leaves hairline seams that print the mesh onto
        // flat ground like graph paper. The whisker of overlap is
        // invisible; the seams were not. The common case paints the
        // four projected corners directly, allocation-free; only a
        // quad straddling the camera plane — a handful per frame,
        // all of them under the aeroplane — pays for the
        // camera-space clip.
        if (a.clip || b.clip || c.clip || d.clip) {
          const poly = project.clipPolygon([
            { x: a.wx, y: a.wh, z: a.wz },
            { x: b.wx, y: b.wh, z: b.wz },
            { x: c.wx, y: c.wh, z: c.wz },
            { x: d.wx, y: d.wh, z: d.wz },
          ]);
          if (!poly) continue;
          const pcx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
          const pcy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
          ctx.beginPath();
          poly.forEach((p, idx) => {
            const dx = p.x - pcx;
            const dy = p.y - pcy;
            const len = Math.hypot(dx, dy) || 1;
            if (idx) ctx.lineTo(p.x + (dx / len) * 0.7, p.y + (dy / len) * 0.7);
            else ctx.moveTo(p.x + (dx / len) * 0.7, p.y + (dy / len) * 0.7);
          });
          ctx.closePath();
          ctx.fill();
          continue;
        }
        const cx = (a.sx + b.sx + c.sx + d.sx) / 4;
        const cy = (a.sy + b.sy + c.sy + d.sy) / 4;
        const grow = (sx, sy) => {
          const dx = sx - cx;
          const dy = sy - cy;
          const len = Math.hypot(dx, dy) || 1;
          return [sx + (dx / len) * 0.7, sy + (dy / len) * 0.7];
        };
        const [ax, ay] = grow(a.sx, a.sy);
        const [bx, by] = grow(b.sx, b.sy);
        const [qx, qy] = grow(c.sx, c.sy);
        const [dx2, dy2] = grow(d.sx, d.sy);
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

// A pine: a dark cone with a sun-lit shoulder and, at golden hour,
// a long shadow fleck thrown west of its trunk.
function drawPineTree(ctx, foot, w, hh) {
  ctx.fillStyle = 'rgba(16,40,20,0.35)';
  ctx.beginPath();
  ctx.ellipse(foot.x - w * 0.62, foot.y, w * 1.55, w * 0.3, 0, 0, Math.PI * 2);
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
  // Soft ground shadow, thrown long away from the low sun.
  ctx.fillStyle = 'rgba(16,40,20,0.32)';
  ctx.beginPath();
  ctx.ellipse(foot.x - crownR * 0.58, foot.y, crownR * 1.45, crownR * 0.27, 0, 0, Math.PI * 2);
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
      const poly = project.clipPolygon([
        { x: runway.x + fx * a0 - px * hw, y: runway.altitude + 0.4, z: runway.z + fz * a0 - pz * hw },
        { x: runway.x + fx * a0 + px * hw, y: runway.altitude + 0.4, z: runway.z + fz * a0 + pz * hw },
        { x: runway.x + fx * a1 + px * hw, y: runway.altitude + 0.4, z: runway.z + fz * a1 + pz * hw },
        { x: runway.x + fx * a1 - px * hw, y: runway.altitude + 0.4, z: runway.z + fz * a1 - pz * hw },
      ]);
      if (!poly) continue;
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
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
    // The golden-hour shadow: the whole footprint thrown west and a
    // step south by the low sun, longer than the house is tall — it
    // grounds every block on its street instead of floating it.
    const sh = [0, 1, 2, 3].map((i) => project(
      block.x + (i === 1 || i === 2 ? hw : -hw) * c - (i >= 2 ? hd : -hd) * s - block.h * 1.05,
      base + 0.3,
      block.z + (i === 1 || i === 2 ? hw : -hw) * s + (i >= 2 ? hd : -hd) * c + block.h * 0.6));
    if (!sh.some((p) => !p)) {
      ctx.fillStyle = 'rgba(24,30,26,0.26)';
      ctx.beginPath();
      sh.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
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
      // Windows: two rows of panes on faces wide enough to carry
      // them, skipped the moment a house is too far to read. At
      // golden hour half the town has its lamps on: panes alternate
      // warm-lit amber and dark glass by the house's own hash.
      const faceW = Math.hypot(t[j].x - t[i].x, t[j].y - t[i].y);
      const faceH = Math.hypot(b[i].x - t[i].x, b[i].y - t[i].y);
      if (faceW > 26 && faceH > 9) {
        for (const fy of [0.34, 0.68]) {
          for (const fxn of [0.26, 0.55, 0.8]) {
            const lit = cellHash(Math.round(block.x + fxn * 91 + i * 7), Math.round(block.z + fy * 57)) > 0.45;
            ctx.fillStyle = lit ? 'rgba(255,183,92,0.92)' : 'rgba(58,72,88,0.85)';
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
    // At golden hour the lamp is lit: a warm halo round the head and
    // a long translucent beam laid out over the water it guards —
    // Gull Rock's sweeps the strait south-east, Porto Lume's points
    // out to sea south of the harbour.
    const beamDir = mark.name.includes('GULL') ? [0.66, 0.75] : [0.1, 1];
    const bl = 420;
    const bx = mark.x + beamDir[0] * bl;
    const bz = mark.z + beamDir[1] * bl;
    const perp = [-beamDir[1], beamDir[0]];
    const beamPts = [
      head,
      project(bx + perp[0] * 46, base + mark.height * 0.82, bz + perp[1] * 46),
      project(bx - perp[0] * 46, base + mark.height * 0.82, bz - perp[1] * 46),
    ];
    if (!beamPts.some((p) => !p)) {
      ctx.fillStyle = 'rgba(255,205,120,0.10)';
      ctx.beginPath();
      beamPts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    const halo = ctx.createRadialGradient(head.x, head.y, 1, head.x, head.y, Math.max(7, foot.scale * 15));
    halo.addColorStop(0, 'rgba(255,205,120,0.5)');
    halo.addColorStop(1, 'rgba(255,205,120,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(head.x, head.y, Math.max(7, foot.scale * 15), 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = 'rgba(146,128,124,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.16, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,244,230,0.9)';
    for (let l = 0; l < lobes; l++) {
      const off = (l / (lobes - 1) - 0.5) * 1.5;
      const lr = r * (0.62 - Math.abs(off) * 0.22);
      ctx.beginPath();
      ctx.ellipse(p.x + off * r, p.y - Math.abs(off) * r * 0.05 + (l % 2) * r * 0.05, lr, lr * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The cap catches the low sun: a wide, flat amber wash laid
    // across the top — kept broad and soft, because a tight round
    // cap reads as a yolk on a fried egg, not as light.
    ctx.fillStyle = 'rgba(255,196,120,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x + r * 0.3, p.y - r * 0.15, r * 0.55, r * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // A skein of gulls working the strait off Home Isle: six birds in
  // a loose vee, wings beating slow — the smallest moving thing in
  // the sky, and the one that makes the air feel inhabited.
  const flockX = 700 + Math.sin(t * 0.05) * 30;
  const flockY = 235 + Math.sin(t * 0.4) * 4;
  const flockZ = 820;
  ctx.strokeStyle = 'rgba(28,38,48,0.8)';
  ctx.lineWidth = 1.4;
  for (let bIdx = 0; bIdx < 6; bIdx++) {
    const row = Math.ceil(bIdx / 2);
    const sideB = bIdx === 0 ? 0 : bIdx % 2 ? 1 : -1;
    const bp = project(
      flockX + sideB * row * 16,
      flockY - row * 2.5,
      flockZ + row * 13);
    if (!bp) continue;
    const wHalf = Math.max(1.8, bp.scale * 4.4);
    const flap = Math.sin(t * 6 + bIdx * 1.3) * wHalf * 0.55;
    ctx.beginPath();
    ctx.moveTo(bp.x - wHalf, bp.y - flap);
    ctx.lineTo(bp.x, bp.y + Math.abs(flap) * 0.25);
    ctx.lineTo(bp.x + wHalf, bp.y - flap);
    ctx.stroke();
  }
}

// --- The built world: bridge, boats, road and falls (v6) ---
// Landmarks a pilot navigates by and a screenshot remembers: the
// ferry bridge to Pilot Islet, working boats on the sea lanes, the
// harbour road at Porto Lume, and the falls on Mount Vela's face.

// One projected quad, the brick every feature below is built from.
// Corners are [x, y, z] world triples; a corner behind the camera
// kills the quad quietly.
function featureQuad(ctx, project, corners, fill) {
  const pts = corners.map(([x, y, z]) => project(x, y, z));
  if (pts.some((p) => !p)) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
}

// The Pilot Islet bridge: a suspension span across the strait
// from Home Isle's north-east shore to the islet — two towers, a
// sagging main cable each side, hangers, and a lamp-lit deck. The
// towers and cables carry the read: a suspension silhouette says
// "bridge" at any range and any angle, where a bare deck seen
// end-on collapses into a pole.
export function drawBridge(ctx, project) {
  const A = { x: 628, z: 921 };   // Home Isle shore
  const B = { x: 1115, z: 317 };  // Pilot Islet shore
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz; // deck's left-right axis
  const pz = ux;
  const HW = 5.5; // half deck width
  const deckY = (t) => 13 + Math.sin(t * Math.PI) * 2.5;
  const SEG = 16;
  for (let sgm = 0; sgm < SEG; sgm++) {
    const t0 = sgm / SEG;
    const t1 = (sgm + 1) / SEG;
    const c0 = { x: A.x + dx * t0, z: A.z + dz * t0 };
    const c1 = { x: A.x + dx * t1, z: A.z + dz * t1 };
    // The skirt first (the deck's shadowed south face), then the deck.
    featureQuad(ctx, project, [
      [c0.x + px * HW, deckY(t0), c0.z + pz * HW],
      [c1.x + px * HW, deckY(t1), c1.z + pz * HW],
      [c1.x + px * HW, deckY(t1) - 1.6, c1.z + pz * HW],
      [c0.x + px * HW, deckY(t0) - 1.6, c0.z + pz * HW],
    ], '#5d4f40');
    featureQuad(ctx, project, [
      [c0.x - px * HW, deckY(t0), c0.z - pz * HW],
      [c0.x + px * HW, deckY(t0), c0.z + pz * HW],
      [c1.x + px * HW, deckY(t1), c1.z + pz * HW],
      [c1.x - px * HW, deckY(t1), c1.z - pz * HW],
    ], '#8a755c');
    // A pale centreline the deck wears like a road.
    featureQuad(ctx, project, [
      [c0.x - px * 0.5, deckY(t0) + 0.06, c0.z - pz * 0.5],
      [c0.x + px * 0.5, deckY(t0) + 0.06, c0.z + pz * 0.5],
      [c1.x + px * 0.5, deckY(t1) + 0.06, c1.z + pz * 0.5],
      [c1.x - px * 0.5, deckY(t1) + 0.06, c1.z - pz * 0.5],
    ], 'rgba(245,240,220,0.5)');
  }
  // Pylons: two concrete legs standing in the strait.
  for (const tp of [0.34, 0.67]) {
    const cxp = A.x + dx * tp;
    const czp = A.z + dz * tp;
    const topY = deckY(tp) - 1.2;
    featureQuad(ctx, project, [
      [cxp - px * 3.4, topY, czp - pz * 3.4],
      [cxp + px * 3.4, topY, czp + pz * 3.4],
      [cxp + px * 4.4, -6, czp + pz * 4.4],
      [cxp - px * 4.4, -6, czp - pz * 4.4],
    ], '#6d5f4d');
  }
  // The suspension work: twin towers at the third points rising
  // seventeen metres over the deck, a crossbar between each pair of
  // posts, the main cables sagging tower to tower, and hangers
  // dropping from cable to deck — the silhouette that reads as a
  // bridge from a mile out.
  const T1 = 0.24;
  const T2 = 0.74;
  const towerTop = (tp) => deckY(tp) + 21;
  const cableKeys = [
    [0, deckY(0) + 1.5], [T1, towerTop(T1)], [0.5, deckY(0.5) + 3.2],
    [T2, towerTop(T2)], [1, deckY(1) + 1.5],
  ];
  const cableY = (t) => {
    for (let k = 0; k < cableKeys.length - 1; k++) {
      const [tA, yA] = cableKeys[k];
      const [tB, yB] = cableKeys[k + 1];
      if (t >= tA && t <= tB) return yA + ((yB - yA) * (t - tA)) / (tB - tA);
    }
    return deckY(t) + 3;
  };
  for (const tp of [T1, T2]) {
    const cxp = A.x + dx * tp;
    const czp = A.z + dz * tp;
    for (const sideT of [-1, 1]) {
      featureQuad(ctx, project, [
        [cxp + px * HW * sideT - ux * 1.1, towerTop(tp), czp + pz * HW * sideT - uz * 1.1],
        [cxp + px * HW * sideT + ux * 1.1, towerTop(tp), czp + pz * HW * sideT + uz * 1.1],
        [cxp + px * HW * sideT + ux * 1.1, deckY(tp) - 2, czp + pz * HW * sideT + uz * 1.1],
        [cxp + px * HW * sideT - ux * 1.1, deckY(tp) - 2, czp + pz * HW * sideT - uz * 1.1],
      ], '#7d6c55');
    }
    featureQuad(ctx, project, [
      [cxp - px * HW - ux * 1.1, towerTop(tp) - 2.2, czp - pz * HW - uz * 1.1],
      [cxp + px * HW + ux * 1.1, towerTop(tp) - 2.2, czp + pz * HW + uz * 1.1],
      [cxp + px * HW + ux * 1.1, towerTop(tp) - 4.4, czp + pz * HW + uz * 1.1],
      [cxp - px * HW - ux * 1.1, towerTop(tp) - 4.4, czp - pz * HW - uz * 1.1],
    ], '#6d5f4d');
    // A second, lower crossbar: two bars make a portal frame, and a
    // portal frame reads as a bridge tower even seen dead end-on —
    // the view the Ring Run's chase camera actually gets.
    featureQuad(ctx, project, [
      [cxp - px * HW - ux * 1.1, deckY(tp) + 7.2, czp - pz * HW - uz * 1.1],
      [cxp + px * HW + ux * 1.1, deckY(tp) + 7.2, czp + pz * HW + uz * 1.1],
      [cxp + px * HW + ux * 1.1, deckY(tp) + 5.2, czp + pz * HW + uz * 1.1],
      [cxp - px * HW - ux * 1.1, deckY(tp) + 5.2, czp - pz * HW - uz * 1.1],
    ], '#6d5f4d');
  }
  for (const sideC of [-1, 1]) {
    const off = HW * 0.92 * sideC;
    ctx.strokeStyle = 'rgba(38,36,34,0.85)';
    let cablePts = null;
    let midScale = 1;
    for (let sgm = 0; sgm <= 20; sgm++) {
      const t = sgm / 20;
      const p = project(A.x + dx * t + px * off, cableY(t), A.z + dz * t + pz * off);
      if (!p) { cablePts = null; continue; }
      if (sgm === 10) midScale = p.scale;
      if (!cablePts) {
        cablePts = [];
        ctx.lineWidth = Math.max(1, p.scale * 0.5);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
      cablePts.push(p);
    }
    if (cablePts && cablePts.length > 1) ctx.stroke();
    // Hangers: a vertical thread every eighth of the span.
    ctx.lineWidth = Math.max(0.7, midScale * 0.22);
    for (let hIdx = 1; hIdx < 8; hIdx++) {
      const t = hIdx / 8;
      const pTop = project(A.x + dx * t + px * off, cableY(t), A.z + dz * t + pz * off);
      const pBot = project(A.x + dx * t + px * off, deckY(t), A.z + dz * t + pz * off);
      if (!pTop || !pBot) continue;
      ctx.beginPath();
      ctx.moveTo(pTop.x, pTop.y);
      ctx.lineTo(pBot.x, pBot.y);
      ctx.stroke();
    }
  }
  // Rail lamps: a warm bead every forty metres, lit for the evening.
  ctx.fillStyle = PALETTE.lampAmber;
  for (let sgm = 0; sgm <= SEG; sgm++) {
    const t = sgm / SEG;
    for (const sideLamp of [-1, 1]) {
      const p = project(
        A.x + dx * t + px * HW * sideLamp, deckY(t) + 1.6,
        A.z + dz * t + pz * HW * sideLamp);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.1, p.scale * 1.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Working boats: a ferry crossing for Porto Lume, a sailboat beating
// up the strait in the cover's view, and a fishing boat off the
// harbour mouth. Hull, cabin and a wake that fans out astern — at
// golden hour the sails and the wake do the talking.
const BOATS = [
  { x: 2050, z: 1650, heading: 55, len: 26, sail: false, name: 'lume ferry' },
  { x: 1050, z: 800, heading: 150, len: 13, sail: true, name: 'strait sailboat' },
  { x: 2620, z: 2820, heading: 205, len: 15, sail: false, name: 'harbour fishing boat' },
];

export function drawBoats(ctx, project) {
  for (const boat of BOATS) {
    const rad = (boat.heading * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fz = -Math.cos(rad);
    const px = fz;
    const pz = -fx;
    const L = boat.len;
    const Wd = L * 0.3;
    const at = (along, across, y) => [
      boat.x + fx * along + px * across, y, boat.z + fz * along + pz * across,
    ];
    // The wake first, under everything: a pale fan astern that
    // widens and fades as it trails.
    featureQuad(ctx, project, [
      at(-L * 0.5, -Wd * 0.32, 0.25), at(-L * 0.5, Wd * 0.32, 0.25),
      at(-L * 2.8, Wd * 1.5, 0.25), at(-L * 2.8, -Wd * 1.5, 0.25),
    ], 'rgba(238,248,250,0.2)');
    featureQuad(ctx, project, [
      at(-L * 0.5, -Wd * 0.1, 0.28), at(-L * 0.5, Wd * 0.1, 0.28),
      at(-L * 2.2, Wd * 0.42, 0.28), at(-L * 2.2, -Wd * 0.42, 0.28),
    ], 'rgba(250,253,255,0.32)');
    // Hull: a sun-side wall, a shade-side wall and the deck between.
    featureQuad(ctx, project, [
      at(-L * 0.5, -Wd / 2, 1.7), at(L * 0.32, -Wd / 2, 1.7),
      at(L * 0.52, 0, 1.15), at(-L * 0.5, -Wd * 0.2, 0.4),
    ], '#7a3b2a');
    featureQuad(ctx, project, [
      at(-L * 0.5, Wd / 2, 1.7), at(L * 0.32, Wd / 2, 1.7),
      at(L * 0.52, 0, 1.15), at(-L * 0.5, Wd * 0.2, 0.4),
    ], '#93502f');
    featureQuad(ctx, project, [
      at(-L * 0.5, -Wd / 2, 1.7), at(-L * 0.5, Wd / 2, 1.7),
      at(L * 0.32, Wd / 2, 1.7), at(L * 0.32, -Wd / 2, 1.7),
    ], '#e8e2d2');
    if (boat.sail) {
      // Mast and two sails, cream canvas lit warm — a triangle you
      // can read from across the strait.
      const mastTop = at(L * 0.05, 0, L * 1.15);
      const mastFoot = at(L * 0.05, 0, 1.7);
      const boomEnd = at(-L * 0.42, 0, 2.4);
      const jibFoot = at(L * 0.46, 0, 1.9);
      featureQuad(ctx, project, [mastTop, mastFoot, boomEnd, boomEnd], '#fdf6e0');
      featureQuad(ctx, project, [mastTop, mastFoot, jibFoot, jibFoot], '#f3e8cc');
      const mp = [mastFoot, mastTop].map(([x, y, z]) => project(x, y, z));
      if (!mp.some((p) => !p)) {
        ctx.strokeStyle = '#4c3d28';
        ctx.lineWidth = Math.max(1, mp[0].scale * 0.35);
        ctx.beginPath();
        ctx.moveTo(mp[0].x, mp[0].y);
        ctx.lineTo(mp[1].x, mp[1].y);
        ctx.stroke();
      }
    } else {
      // Wheelhouse: a white block with a dark window band and a
      // warm lamp on its roof.
      featureQuad(ctx, project, [
        at(-L * 0.28, -Wd * 0.3, 4.6), at(-L * 0.28, Wd * 0.3, 4.6),
        at(L * 0.08, Wd * 0.3, 4.6), at(L * 0.08, -Wd * 0.3, 4.6),
      ], '#eef0ea');
      featureQuad(ctx, project, [
        at(-L * 0.28, Wd * 0.3, 4.6), at(-L * 0.28, Wd * 0.3, 2.1),
        at(L * 0.08, Wd * 0.3, 2.1), at(L * 0.08, Wd * 0.3, 4.6),
      ], '#dfe3da');
      featureQuad(ctx, project, [
        at(-L * 0.28, -Wd * 0.3, 4.6), at(-L * 0.28, -Wd * 0.3, 2.1),
        at(L * 0.08, -Wd * 0.3, 2.1), at(L * 0.08, -Wd * 0.3, 4.6),
      ], '#c9cdc2');
      featureQuad(ctx, project, [
        at(-L * 0.26, Wd * 0.31, 4.1), at(-L * 0.26, Wd * 0.31, 3.3),
        at(L * 0.06, Wd * 0.31, 3.3), at(L * 0.06, Wd * 0.31, 4.1),
      ], 'rgba(38,52,66,0.9)');
    }
  }
}

// The harbour road: a dirt ribbon climbing from Porto Lume's streets
// to the strip's south threshold — the line every approach crosses
// on short final, tying the town to its aeroplanes.
export function drawHarbourRoad(ctx, project) {
  const X = 2578;
  const Z0 = 2620;
  const Z1 = 2935;
  const HW = 4.6;
  const SEG = 8;
  for (let sgm = 0; sgm < SEG; sgm++) {
    const zA = Z0 + ((Z1 - Z0) * sgm) / SEG;
    const zB = Z0 + ((Z1 - Z0) * (sgm + 1)) / SEG;
    featureQuad(ctx, project, [
      [X - HW, groundHeight(X - HW, zA) + 0.35, zA],
      [X + HW, groundHeight(X + HW, zA) + 0.35, zA],
      [X + HW, groundHeight(X + HW, zB) + 0.35, zB],
      [X - HW, groundHeight(X - HW, zB) + 0.35, zB],
    ], sgm % 2 ? '#b3986a' : '#bb9f70');
  }
}
