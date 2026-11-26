// aircraft-art.js — the Petrel herself, drawn twice: as the chase-view
// aeroplane the camera follows and as the cockpit the pilot sits in.

import { PALETTE } from './config.js';
import { groundHeight } from './terrain-archipelago.js';
import { headingDegrees } from './flight-model.js';
import { SUN_DIR, hexRgb } from './renderer-3d.js';

// The sun as a unit vector, shared with the terrain: one light for
// the whole world, ground and aeroplane alike.
const SUN_LEN = Math.hypot(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);
const SUN = { x: SUN_DIR.x / SUN_LEN, y: SUN_DIR.y / SUN_LEN, z: SUN_DIR.z / SUN_LEN };

// The ground shadow: her silhouette thrown long to the west by the
// low sun — an honest altitude cue, and at golden hour a dramatic
export function drawAircraftShadow(ctx, project, plane) {
  const g = groundHeight(plane.x, plane.z);
  const alt = plane.y - g;
  if (alt > 700) return;
  const len = Math.min(alt * 1.35, 120);
  const sx = plane.x - 0.866 * len;
  const sz = plane.z + 0.499 * len;
  const p = project(sx, g + 0.6, sz);
  if (!p || p.depth < 8) return;
  const ahead = project(
    sx + Math.sin(plane.heading) * 10, g + 0.6,
    sz - Math.cos(plane.heading) * 10);
  const ang = ahead ? Math.atan2(ahead.y - p.y, ahead.x - p.x) : 0;
  const fade = Math.max(0.05, 0.4 - alt / 2200);
  // The radii are clamped in screen space: the ellipse is a flat
  // billboard standing in for a shadow that really lies on a
  const rx = Math.min(p.scale * 10.5, 175);
  const ry = Math.min(p.scale * 3.6, 62);
  ctx.fillStyle = `rgba(10,26,34,${fade * 0.5})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, ang, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(10,26,34,${fade})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx * 0.7, ry * 0.64, ang, 0, Math.PI * 2);
  ctx.ellipse(p.x, p.y, rx * 0.2, ry * 1.28, ang, 0, Math.PI * 2);
  ctx.fill();
}

// --- The airframe, in her own frame ---
// Local axes: x to starboard, y up, z toward the nose. The fuselage

const FUSELAGE_RINGS = [
  // [z, halfWidth, halfHeight, centreY]
  [3.95, 0.11, 0.11, 0.05],   // nose tip
  [3.45, 0.65, 0.63, 0.02],   // cowling front
  [2.45, 0.78, 0.78, 0.05],   // cowling rear
  [1.55, 0.87, 0.88, 0.08],   // cabin front
  [0.15, 0.91, 0.86, 0.06],   // cabin rear
  [-1.60, 0.67, 0.65, 0.10],  // tail cone mid
  [-3.20, 0.43, 0.45, 0.16],  // tail cone
  [-4.55, 0.18, 0.24, 0.22],  // tail tip
];

const CANOPY_SECTIONS = [
  // [z, halfWidth, baseY, topY]
  [2.30, 0.50, 0.52, 1.16],
  [1.20, 0.58, 0.55, 1.30],
  [0.35, 0.55, 0.55, 1.24],
];

function ringPoint(ring, k) {
  const a = (k * Math.PI) / 4;
  return [ring[1] * Math.sin(a), ring[3] + ring[2] * Math.cos(a), ring[0]];
}

// Chase view: build the face list in her frame, turn it by her
// attitude, light it, sort it, paint it.
export function drawChaseAircraft(ctx, plane, width, height, t, project, camera) {
  // Her attitude basis: heading first, then pitch about her lateral
  // axis, then roll about her longitudinal axis — the same order the
  const F = { x: Math.sin(plane.heading), y: 0, z: -Math.cos(plane.heading) };
  const R = { x: Math.cos(plane.heading), y: 0, z: Math.sin(plane.heading) };
  const U = { x: 0, y: 1, z: 0 };
  const cp = Math.cos(plane.pitch);
  const sp = Math.sin(plane.pitch);
  const F1 = {
    x: F.x * cp + U.x * sp, y: F.y * cp + U.y * sp, z: F.z * cp + U.z * sp,
  };
  const U1 = {
    x: U.x * cp - F.x * sp, y: U.y * cp - F.y * sp, z: U.z * cp - F.z * sp,
  };
  const cr = Math.cos(plane.roll);
  const sr = Math.sin(plane.roll);
  const R1 = {
    x: R.x * cr - U1.x * sr, y: R.y * cr - U1.y * sr, z: R.z * cr - U1.z * sr,
  };
  const U2 = {
    x: U1.x * cr + R.x * sr, y: U1.y * cr + R.y * sr, z: U1.z * cr + R.z * sr,
  };
  const toWorld = ([lx, ly, lz]) => ({
    x: plane.x + R1.x * lx + U2.x * ly + F1.x * lz,
    y: plane.y + R1.y * lx + U2.y * ly + F1.y * lz,
    z: plane.z + R1.z * lx + U2.z * ly + F1.z * lz,
  });

  const faces = [];   // opaque: {pts, base:[r,g,b]}
  const glass = [];   // translucent, painted last: {pts, style}
  const addFace = (pts, hex) => faces.push({ pts, base: hexRgb(hex) });

  // Fuselage tube: burnt orange over the cowling, a deep warm
  // apricot aft of it — v9 richened the old washed-out cream, whose
  for (let sgm = 0; sgm < FUSELAGE_RINGS.length - 1; sgm++) {
    const ringA = FUSELAGE_RINGS[sgm];
    const ringB = FUSELAGE_RINGS[sgm + 1];
    const base = sgm < 2 ? '#d84e2c' : '#eab96f';
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      addFace([
        ringPoint(ringA, k), ringPoint(ringA, k2),
        ringPoint(ringB, k2), ringPoint(ringB, k),
      ], base);
    }
  }
  // Nose and tail caps.
  addFace(FUSELAGE_RINGS[0].map((_, k) => ringPoint(FUSELAGE_RINGS[0], k)), '#b23a22');
  addFace(FUSELAGE_RINGS[FUSELAGE_RINGS.length - 1].map((_, k) => ringPoint(FUSELAGE_RINGS[FUSELAGE_RINGS.length - 1], k)), '#e0af62');

  // The livery cheatline: a burnt-orange band riding both flanks
  // from the cabin to the tail cone, built as its own thin strip of
  const bandPoint = (ring, side, angDeg) => {
    const a = (angDeg * Math.PI) / 180;
    return [
      side * (ring[1] * Math.sin(a) + 0.02),
      ring[3] + ring[2] * Math.cos(a),
      ring[0],
    ];
  };
  // v9: the band runs one ring further forward, stands taller on
  // the flank and wears a deeper burnt umber — against the richer
  for (let sgm = 1; sgm < FUSELAGE_RINGS.length - 1; sgm++) {
    const ringA = FUSELAGE_RINGS[sgm];
    const ringB = FUSELAGE_RINGS[sgm + 1];
    for (const side of [-1, 1]) {
      addFace([
        bandPoint(ringA, side, 55), bandPoint(ringA, side, 108),
        bandPoint(ringB, side, 108), bandPoint(ringB, side, 55),
      ], '#a83c1e');
    }
  }

  // The canopy: a glasshouse prism over the cabin, five points a
  // section, its own darker blue lit by the same sun. v9 deepened
  const canopyPt = (sec, i) => {
    const [z, w, baseY, topY] = sec;
    const shape = [
      [-w, baseY], [-w * 0.8, topY - 0.13], [0, topY], [w * 0.8, topY - 0.13], [w, baseY],
    ];
    return [shape[i][0], shape[i][1], z];
  };
  for (let sgm = 0; sgm < CANOPY_SECTIONS.length - 1; sgm++) {
    for (let i = 0; i < 4; i++) {
      addFace([
        canopyPt(CANOPY_SECTIONS[sgm], i), canopyPt(CANOPY_SECTIONS[sgm], i + 1),
        canopyPt(CANOPY_SECTIONS[sgm + 1], i + 1), canopyPt(CANOPY_SECTIONS[sgm + 1], i),
      ], '#1e3a4f');
    }
  }
  addFace(CANOPY_SECTIONS[0].map((_, i) => canopyPt(CANOPY_SECTIONS[0], i)), '#16293a');
  addFace(CANOPY_SECTIONS[CANOPY_SECTIONS.length - 1].map((_, i) => canopyPt(CANOPY_SECTIONS[CANOPY_SECTIONS.length - 1], i)), '#12222f');

  // Wings and tailplane: thin slabs with a dihedral rise, built per
  // side from span sections so the light breaks along the panel.
  const slab = (sections, base, flapBase) => {
    // sections: [x, y, zLead, zTrail, halfThick]
    for (let sgm = 0; sgm < sections.length - 1; sgm++) {
      const A = sections[sgm];
      const B = sections[sgm + 1];
      addFace([ // top
        [A[0], A[1] + A[4], A[2]], [B[0], B[1] + B[4], B[2]],
        [B[0], B[1] + B[4], B[3]], [A[0], A[1] + A[4], A[3]],
      ], base);
      if (flapBase) {
        // The flap's own panel on the top rear: a shade step along
        // the hinge line so the wing's rear third reads as a
        const fA = A[2] + (A[3] - A[2]) * 0.62;
        const fB = B[2] + (B[3] - B[2]) * 0.62;
        addFace([
          [A[0], A[1] + A[4] + 0.004, fA], [B[0], B[1] + B[4] + 0.004, fB],
          [B[0], B[1] + B[4] + 0.004, B[3]], [A[0], A[1] + A[4] + 0.004, A[3]],
        ], flapBase);
      }
      addFace([ // bottom
        [A[0], A[1] - A[4], A[2]], [B[0], B[1] - B[4], B[2]],
        [B[0], B[1] - B[4], B[3]], [A[0], A[1] - A[4], A[3]],
      ], base);
      addFace([ // leading edge
        [A[0], A[1] + A[4], A[2]], [B[0], B[1] + B[4], B[2]],
        [B[0], B[1] - B[4], B[2]], [A[0], A[1] - A[4], A[2]],
      ], base);
      addFace([ // trailing edge
        [A[0], A[1] + A[4], A[3]], [B[0], B[1] + B[4], B[3]],
        [B[0], B[1] - B[4], B[3]], [A[0], A[1] - A[4], A[3]],
      ], base);
    }
    const tip = sections[sections.length - 1];
    addFace([
      [tip[0], tip[1] + tip[4], tip[2]], [tip[0], tip[1] + tip[4], tip[3]],
      [tip[0], tip[1] - tip[4], tip[3]], [tip[0], tip[1] - tip[4], tip[2]],
    ], '#f3ddae');
  };
  for (const side of [-1, 1]) {
    slab([
      [side * 0.0, 0.80, 1.78, -0.18, 0.095],
      [side * 2.8, 0.97, 1.72, -0.22, 0.085],
      [side * 5.6, 1.14, 1.62, -0.30, 0.075],
    ], '#e05736', '#c24327');
    slab([ // tailplane, plainer and smaller
      [side * 0.0, 0.30, -3.55, -4.5, 0.06],
      [side * 1.95, 0.34, -3.62, -4.44, 0.05],
    ], '#e05736', '#c24327');
  }

  // The fin: a profile plate with two lit sides and a cream tip.
  const FIN = [
    [-4.75, 0.28], [-3.35, 0.40], [-3.60, 1.52], [-4.05, 1.58], [-4.55, 0.95],
  ];
  for (const sx of [-0.055, 0.055]) {
    addFace(FIN.map(([z, y]) => [sx, y, z]), '#d8502f');
  }
  for (let i = 0; i < FIN.length; i++) {
    const j = (i + 1) % FIN.length;
    addFace([
      [-0.055, FIN[i][1], FIN[i][0]], [0.055, FIN[i][1], FIN[i][0]],
      [0.055, FIN[j][1], FIN[j][0]], [-0.055, FIN[j][1], FIN[j][0]],
    ], '#c24327');
  }
  const FIN_TIP = [
    [-3.60, 1.52], [-4.05, 1.58], [-4.18, 1.27], [-3.72, 1.23],
  ];
  for (const sx of [-0.058, 0.058]) {
    addFace(FIN_TIP.map(([z, y]) => [sx, y, z]), '#f3ddae');
  }

  // Gear: faired legs and real wheels — an octagon tyre, a hub, and
  // the sun-side crescent the light leaves on the rubber.
  if (plane.gearDown) {
    for (const side of [-1, 1]) {
      addFace([
        [side * 0.70, -0.58, 0.44], [side * 0.70, -0.58, 0.66],
        [side * 1.02, -1.52, 0.66], [side * 1.02, -1.52, 0.44],
      ], '#8f96a0');
      const wheelC = [side * 1.06, -1.70, 0.55];
      const oct = (cx, r, y, z) => {
        const pts = [];
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          pts.push([cx, y + r * Math.cos(a), z + r * Math.sin(a)]);
        }
        return pts;
      };
      const outer = oct(wheelC[0] + side * 0.09, 0.34, wheelC[1], wheelC[2]);
      const inner = oct(wheelC[0] - side * 0.09, 0.34, wheelC[1], wheelC[2]);
      addFace(outer, '#17191c');
      addFace(inner, '#17191c');
      for (let k = 0; k < 8; k++) {
        const k2 = (k + 1) % 8;
        addFace([outer[k], outer[k2], inner[k2], inner[k]], '#23262a');
      }
      addFace(oct(wheelC[0] + side * 0.1, 0.15, wheelC[1], wheelC[2]), '#6a7480');
    }
  }

  // The propeller disc and its blade ghosts go down BEFORE the
  // opaque faces: the disc lives at the far end of the aeroplane,
  if (plane.throttle > 0.03 || plane.speed > 4) {
    const discPts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const w = toWorld([Math.sin(a) * 1.18, 0.05 + Math.cos(a) * 1.18, 4.02]);
      discPts.push(project(w.x, w.y, w.z));
    }
    if (!discPts.some((p) => !p)) {
      ctx.fillStyle = 'rgba(228,236,240,0.13)';
      ctx.beginPath();
      discPts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,170,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const spin = plane.propSpin || t * 30;
    ctx.fillStyle = 'rgba(35,38,42,0.5)';
    for (const off of [0, Math.PI]) {
      const a = spin + off;
      const dir = [Math.sin(a), Math.cos(a)];
      const perp = [Math.cos(a), -Math.sin(a)];
      const blade = [
        [dir[0] * 0.22 + perp[0] * 0.1, 0.05 + dir[1] * 0.22 + perp[1] * 0.1, 4.02],
        [dir[0] * 0.22 - perp[0] * 0.1, 0.05 + dir[1] * 0.22 - perp[1] * 0.1, 4.02],
        [dir[0] * 1.12 - perp[0] * 0.045, 0.05 + dir[1] * 1.12 - perp[1] * 0.045, 4.02],
        [dir[0] * 1.12 + perp[0] * 0.045, 0.05 + dir[1] * 1.12 + perp[1] * 0.045, 4.02],
      ].map((lp) => { const w = toWorld(lp); return project(w.x, w.y, w.z); });
      if (blade.some((p) => !p)) continue;
      ctx.beginPath();
      blade.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
  }

  // Paint the opaque faces far to near, each lit by its own normal.
  const painted = [];
  for (const face of faces) {
    const world = face.pts.map(toWorld);
    const proj = world.map((p) => project(p.x, p.y, p.z));
    if (proj.some((p) => !p)) continue;
    const [a, b, c] = world;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const dot = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
    // v9: a lower floor and a wider swing — the shaded flank falls
    // properly dark against the lit top, so the tube models round
    const light = 0.55 + 0.6 * dot;
    const depth = proj.reduce((sum, p) => sum + p.depth, 0) / proj.length;
    painted.push({
      proj,
      depth,
      fill: `rgb(${Math.min(255, Math.round(face.base[0] * light))},${Math.min(255, Math.round(face.base[1] * light))},${Math.min(255, Math.round(face.base[2] * light))})`,
    });
  }
  painted.sort((a, b) => b.depth - a.depth);
  for (const face of painted) {
    ctx.fillStyle = face.fill;
    ctx.beginPath();
    face.proj.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }

  // Panel lines: three ring seams around the tube — cabin front,
  // cabin rear, tail cone — stroked segment by segment, and only
  ctx.strokeStyle = 'rgba(90,70,45,0.45)';
  ctx.lineWidth = 1.2;
  for (const ringIdx of [3, 4, 6]) {
    const ring = FUSELAGE_RINGS[ringIdx];
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      const lA = ringPoint(ring, k);
      const lB = ringPoint(ring, k2);
      const wA = toWorld(lA);
      const wB = toWorld(lB);
      const mid = {
        x: (wA.x + wB.x) / 2, y: (wA.y + wB.y) / 2, z: (wA.z + wB.z) / 2,
      };
      const outLocal = [(lA[0] + lB[0]) / 2, (lA[1] + lB[1]) / 2 - ring[3], 0];
      const out = {
        x: R1.x * outLocal[0] + U2.x * outLocal[1],
        y: R1.y * outLocal[0] + U2.y * outLocal[1],
        z: R1.z * outLocal[0] + U2.z * outLocal[1],
      };
      const view = { x: camera.x - mid.x, y: camera.y - mid.y, z: camera.z - mid.z };
      if (out.x * view.x + out.y * view.y + out.z * view.z <= 0.05) continue;
      const pA = project(wA.x, wA.y, wA.z);
      const pB = project(wB.x, wB.y, wB.z);
      if (!pA || !pB) continue;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();
    }
  }
  // Her name on the tail cone, painted the way working aeroplanes
  // carry it: anchored to the cone's own projected centre and laid
  {
    const anchorW = toWorld([0, 0.18, -3.55]);
    const anchor = project(anchorW.x, anchorW.y, anchorW.z);
    const rightW = toWorld([1, 0.18, -3.55]);
    const right = project(rightW.x, rightW.y, rightW.z);
    if (anchor && right) {
      const ang = Math.atan2(right.y - anchor.y, right.x - anchor.x);
      ctx.save();
      ctx.translate(anchor.x, anchor.y);
      ctx.rotate(ang);
      ctx.fillStyle = '#6e4520';
      ctx.font = `700 ${Math.max(7, Math.min(13, anchor.scale * 0.34))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('PETREL', 0, 3);
      ctx.restore();
    }
  }

  // Navigation lamps on the wingtips, glowing against the evening.
  for (const side of [-1, 1]) {
    const tipW = toWorld([side * 5.6, 1.14, 0.65]);
    const tp = project(tipW.x, tipW.y, tipW.z);
    if (!tp) continue;
    ctx.fillStyle = side < 0 ? 'rgba(255,81,71,0.3)' : 'rgba(81,255,138,0.3)';
    ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(3, tp.scale * 0.55), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = side < 0 ? PALETTE.lampRed : PALETTE.lampGreen;
    ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(1.6, tp.scale * 0.28), 0, Math.PI * 2); ctx.fill();
  }

  // The spinner: eight triangles from the prop's base ring to a
  // point ahead of it, burnt orange like the cowling it caps. It is
  const noseView = F1.x * (camera.x - plane.x) + F1.y * (camera.y - plane.y) + F1.z * (camera.z - plane.z);
  const spinnerBase = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    spinnerBase.push([Math.sin(a) * 0.21, 0.05 + Math.cos(a) * 0.21, 3.98]);
  }
  const apexW = toWorld([0, 0.05, 4.45]);
  const apexP = project(apexW.x, apexW.y, apexW.z);
  if (apexP && noseView > 0) {
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      const wA = toWorld(spinnerBase[k]);
      const wB = toWorld(spinnerBase[k2]);
      const pA = project(wA.x, wA.y, wA.z);
      const pB = project(wB.x, wB.y, wB.z);
      if (!pA || !pB) continue;
      ctx.fillStyle = k % 2 ? '#c24327' : '#d8502f';
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.lineTo(apexP.x, apexP.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // The canopy's sun streak: the right-top glass faces painted once
  // more in warm translucent light — late sun striking the greenhouse.
  for (const [secA, secB, alpha] of [[2, 1, 0.5], [1, 0, 0.36]]) {
    const streak = [
      canopyLocal(secA, 2), canopyLocal(secA, 3), canopyLocal(secB, 3), canopyLocal(secB, 2),
    ].map((lp) => { const w = toWorld(lp); return project(w.x, w.y, w.z); });
    if (streak.some((p) => !p)) continue;
    ctx.fillStyle = `rgba(255,214,150,${alpha})`;
    ctx.beginPath();
    streak.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }

  function canopyLocal(secIdx, ptIdx) {
    const sec = CANOPY_SECTIONS[secIdx];
    const [z, w, baseY, topY] = sec;
    const shape = [
      [-w, baseY], [-w * 0.8, topY - 0.13], [0, topY], [w * 0.8, topY - 0.13], [w, baseY],
    ];
    return [shape[ptIdx][0], shape[ptIdx][1], z];
  }
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

// Cockpit view: the panel coaming and glareshield frame the windscreen;
// the instruments themselves are instruments.js' job, mounted into the
export function drawCockpitFrame(ctx, width, height, plane) {
  const panelTop = height * 0.68;
  const panelGrad = ctx.createLinearGradient(0, panelTop - 34, 0, height);
  panelGrad.addColorStop(0, '#2e2a26');
  panelGrad.addColorStop(0.24, PALETTE.panel);
  panelGrad.addColorStop(1, '#090d12');
  ctx.fillStyle = panelGrad;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, panelTop + 26);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 34, width, panelTop + 26);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  // The glareshield's padded lip: a warm rim where the low sun
  // catches the coaming's edge, with stitch dashes just below it.
  ctx.strokeStyle = '#8a6f4d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 26);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 34, width, panelTop + 26);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,205,220,0.4)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 40);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 20, width, panelTop + 40);
  ctx.stroke();
  ctx.setLineDash([]);
  // Bezel screws along the panel's shoulders: slotted heads, catching
  // the light — the smallest possible "this panel is a real object".
  for (const fx of [0.16, 0.84]) {
    const sx = width * fx;
    const sy = panelTop + (fx === 0.16 ? 30 : 30);
    ctx.fillStyle = '#5a6a7a';
    ctx.beginPath(); ctx.arc(sx, sy, 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141a21';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx - 3, sy + 1.4); ctx.lineTo(sx + 3, sy - 1.4);
    ctx.stroke();
  }
  // The maker's placard, riveted low on the right of the panel.
  ctx.fillStyle = 'rgba(214,222,230,0.75)';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('SKYFERRY SF-2 · PETREL · MERIDIAN WORKS', width - 26, height - 14);
  // Windscreen posts, left and right, with a lit inner edge.
  for (const side of [0.06, 0.94]) {
    ctx.save();
    ctx.translate(width * side, 0);
    ctx.rotate(side < 0.5 ? 0.1 : -0.1);
    const postGrad = ctx.createLinearGradient(-13, 0, 13, 0);
    postGrad.addColorStop(0, '#0b0f14');
    postGrad.addColorStop(0.55, '#26313f');
    postGrad.addColorStop(1, '#0b0f14');
    ctx.fillStyle = postGrad;
    ctx.fillRect(-13, 0, 26, panelTop + 30);
    ctx.restore();
  }
  // The compass sits on the coaming, lit, where a pilot expects it:
  // a glass ball whose card turns with the heading under a fixed mark.
  const ccx = width / 2;
  const ccy = panelTop - 8;
  ctx.fillStyle = '#1d2733';
  ctx.beginPath();
  ctx.arc(ccx, ccy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.lampAmber;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (plane) {
    const deg = headingDegrees(plane);
    ctx.save();
    ctx.beginPath(); ctx.arc(ccx, ccy, 15, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0d141c';
    ctx.fillRect(ccx - 15, ccy - 15, 30, 30);
    ctx.fillStyle = '#e8eef4';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      const a = ((i * 90 - deg) * Math.PI) / 180;
      const lx = ccx + Math.sin(a) * 10.5;
      const ly = ccy - Math.cos(a) * 10.5 + 3.5;
      ctx.fillStyle = i === 0 ? PALETTE.lampRed : '#e8eef4';
      ctx.fillText('NESW'[i], lx, ly);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(220,240,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(ccx - 5, ccy - 7, 6, 3.4, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.lampAmber;
    ctx.beginPath();
    ctx.moveTo(ccx - 4, ccy - 24); ctx.lineTo(ccx + 4, ccy - 24); ctx.lineTo(ccx, ccy - 18);
    ctx.closePath();
    ctx.fill();
  }
}
