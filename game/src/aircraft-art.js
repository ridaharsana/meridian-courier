// aircraft-art.js — the Petrel herself, drawn twice: as the chase-view
// aeroplane the camera follows (fuselage, high wing, spinning prop, livery
// stripe, shadow on the ground below) and as the cockpit the pilot sits in
// (coaming, glareshield, panel frame the instruments mount into).

import { PALETTE } from './config.js';
import { groundHeight } from './terrain-archipelago.js';
import { headingDegrees } from './flight-model.js';

// The ground shadow: her own silhouette thrown east of her track, where
// the high sun puts it — a soft wing-and-body blob in two passes (a wide
// faint wash, then the darker core), still the most honest altitude cue
// in flying games.
export function drawAircraftShadow(ctx, project, plane) {
  const g = groundHeight(plane.x, plane.z);
  if (plane.y - g > 700) return;
  const p = project(plane.x + 6, g + 0.6, plane.z - 3);
  if (!p) return;
  const fade = Math.max(0.05, 0.32 - (plane.y - g) / 2600);
  const w = Math.max(3, p.scale * 16);
  const h = Math.max(1.4, p.scale * 4.4);
  ctx.fillStyle = `rgba(10,30,40,${fade * 0.45})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w * 1.35, h * 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(10,30,40,${fade})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2);
  ctx.ellipse(p.x, p.y, w * 0.34, h * 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Chase view: the aeroplane from behind-above, built from shaded polygons.
// bank tilts her, pitch raises or drops the tail, the prop is a blurred
// disc with two blade ghosts whose speed follows the engine.
export function drawChaseAircraft(ctx, plane, width, height, t) {
  const cx = width / 2;
  const cy = height * 0.56;
  const S = Math.min(width, height) / 9.2; // fuselage half-width in px
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll * 0.9);
  ctx.translate(0, plane.pitch * S * 1.1);

  // Tailplane at the near end (the camera flies behind her): two halves
  // with an elevator hinge line and cream tips, and the fin rising from
  // the tail cone toward the fuselage — never amidships — carrying the
  // livery stripe and a cream cap.
  const tailGrad = ctx.createLinearGradient(0, S * 0.6, 0, S * 1.1);
  tailGrad.addColorStop(0, '#e05736');
  tailGrad.addColorStop(1, '#b23a22');
  ctx.fillStyle = tailGrad;
  poly(ctx, [[-S * 1.52, S * 0.7], [S * 1.52, S * 0.7], [S * 1.08, S * 1.08], [-S * 1.08, S * 1.08]]);
  ctx.strokeStyle = 'rgba(90,26,14,0.55)';
  ctx.lineWidth = Math.max(1, S * 0.03);
  ctx.beginPath();
  ctx.moveTo(-S * 1.34, S * 0.88); ctx.lineTo(S * 1.34, S * 0.88);
  ctx.stroke();
  ctx.fillStyle = '#f6ead2';
  poly(ctx, [[-S * 1.52, S * 0.7], [-S * 1.3, S * 0.7], [-S * 1.14, S * 1.08], [-S * 1.08, S * 1.08]]);
  poly(ctx, [[S * 1.52, S * 0.7], [S * 1.3, S * 0.7], [S * 1.14, S * 1.08], [S * 1.08, S * 1.08]]);
  const finGrad = ctx.createLinearGradient(0, S * 0.3, 0, S * 1.06);
  finGrad.addColorStop(0, '#f0703c');
  finGrad.addColorStop(0.55, '#d8502f');
  finGrad.addColorStop(1, '#b23a22');
  ctx.fillStyle = finGrad;
  poly(ctx, [[-S * 0.14, S * 1.05], [S * 0.14, S * 1.05], [S * 0.1, S * 0.32], [-S * 0.1, S * 0.32]]);
  ctx.fillStyle = '#f6ead2';
  poly(ctx, [[-S * 0.1, S * 0.4], [S * 0.1, S * 0.4], [S * 0.105, S * 0.32], [-S * 0.105, S * 0.32]]);

  // Main wing in two halves with true dihedral: each panel rises from
  // the root to its tip, lit from the sun side, with a darker trailing-
  // edge band, flap and aileron hinge lines, and navigation lamps.
  for (const side of [-1, 1]) {
    const wingGrad = ctx.createLinearGradient(0, -S * 0.14, 0, S * 0.4);
    wingGrad.addColorStop(0, '#f47a48');
    wingGrad.addColorStop(0.62, '#e05736');
    wingGrad.addColorStop(1, '#c24327');
    ctx.fillStyle = wingGrad;
    poly(ctx, [
      [side * S * 0.1, -S * 0.1], [side * S * 3.42, -S * 0.3],
      [side * S * 3.14, S * 0.08], [side * S * 0.1, S * 0.3],
    ]);
    ctx.fillStyle = 'rgba(120,32,16,0.5)';
    poly(ctx, [
      [side * S * 0.1, S * 0.17], [side * S * 3.2, -S * 0.03],
      [side * S * 3.14, S * 0.08], [side * S * 0.1, S * 0.3],
    ]);
    ctx.strokeStyle = 'rgba(90,26,14,0.6)';
    ctx.lineWidth = Math.max(1, S * 0.028);
    ctx.beginPath();
    ctx.moveTo(side * S * 1.15, -S * 0.16); ctx.lineTo(side * S * 1.12, S * 0.22);
    ctx.moveTo(side * S * 2.3, -S * 0.22); ctx.lineTo(side * S * 2.24, S * 0.14);
    ctx.stroke();
    ctx.fillStyle = '#f6ead2';
    poly(ctx, [
      [side * S * 3.42, -S * 0.3], [side * S * 3.2, -S * 0.28],
      [side * S * 3.02, S * 0.06], [side * S * 3.14, S * 0.08],
    ]);
  }
  ctx.fillStyle = PALETTE.lampRed;
  ctx.beginPath(); ctx.arc(-S * 3.38, -S * 0.12, S * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,81,71,0.3)';
  ctx.beginPath(); ctx.arc(-S * 3.38, -S * 0.12, S * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.lampGreen;
  ctx.beginPath(); ctx.arc(S * 3.38, -S * 0.12, S * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(81,255,138,0.3)';
  ctx.beginPath(); ctx.arc(S * 3.38, -S * 0.12, S * 0.2, 0, Math.PI * 2); ctx.fill();

  // Fuselage: a tapered body lit from the sun side (screen right) —
  // a horizontal light gradient across her beam, a shaded belly, the
  // burnt-orange cheatline following the taper, and panel seams where
  // the cabin ends and the tail cone begins.
  const bodyGrad = ctx.createLinearGradient(-S * 0.8, 0, S * 0.8, 0);
  bodyGrad.addColorStop(0, '#d3ba8d');
  bodyGrad.addColorStop(0.34, '#f8eed6');
  bodyGrad.addColorStop(0.72, '#efdcb4');
  bodyGrad.addColorStop(1, '#c9ab77');
  ctx.fillStyle = bodyGrad;
  poly(ctx, [[-S * 0.5, -S * 0.98], [S * 0.5, -S * 0.98], [S * 0.8, S * 0.42], [S * 0.62, S * 1.06], [-S * 0.62, S * 1.06], [-S * 0.8, S * 0.42]]);
  ctx.fillStyle = 'rgba(146,116,72,0.35)';
  poly(ctx, [[-S * 0.8, S * 0.42], [S * 0.8, S * 0.42], [S * 0.62, S * 1.06], [-S * 0.62, S * 1.06]]);
  ctx.fillStyle = '#e05a30';
  poly(ctx, [[-S * 0.77, S * 0.22], [S * 0.77, S * 0.22], [S * 0.7, S * 0.47], [-S * 0.7, S * 0.47]]);
  ctx.fillStyle = 'rgba(255,214,170,0.5)';
  poly(ctx, [[-S * 0.77, S * 0.22], [S * 0.77, S * 0.22], [S * 0.75, S * 0.29], [-S * 0.75, S * 0.29]]);
  ctx.strokeStyle = 'rgba(120,96,58,0.5)';
  ctx.lineWidth = Math.max(1, S * 0.025);
  ctx.beginPath();
  ctx.moveTo(-S * 0.56, -S * 0.44); ctx.lineTo(S * 0.56, -S * 0.44);
  ctx.moveTo(-S * 0.68, S * 0.58); ctx.lineTo(S * 0.68, S * 0.58);
  ctx.stroke();
  // Her name rides the rear fuselage, small and honest, the way
  // working aeroplanes carry it — kept well inside the fuselage's
  // width at that height, after a wider first draft spilled its end
  // letters onto the tailplane and lost them against the orange.
  ctx.fillStyle = '#6e4520';
  ctx.font = `700 ${Math.max(7, S * 0.15)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('PETREL', 0, S * 0.71);
  // Cabin side windows: two dark panes a side along the cabin walls.
  ctx.fillStyle = '#26394c';
  for (const side of [-1, 1]) {
    poly(ctx, [
      [side * S * 0.55, -S * 0.34], [side * S * 0.68, -S * 0.3],
      [side * S * 0.71, -S * 0.05], [side * S * 0.6, -S * 0.08],
    ]);
  }
  ctx.fillStyle = 'rgba(170,220,250,0.4)';
  for (const side of [-1, 1]) {
    poly(ctx, [
      [side * S * 0.57, -S * 0.32], [side * S * 0.63, -S * 0.3],
      [side * S * 0.65, -S * 0.14], [side * S * 0.6, -S * 0.12],
    ]);
  }
  // The canopy from behind: a glasshouse with a sky-lit gradient, a
  // bright sun streak down its right pane and a dark frame all round.
  const glassGrad = ctx.createLinearGradient(-S * 0.34, -S * 0.9, S * 0.34, -S * 0.5);
  glassGrad.addColorStop(0, '#1d2f42');
  glassGrad.addColorStop(0.55, '#33536e');
  glassGrad.addColorStop(1, '#7fb2d4');
  ctx.fillStyle = glassGrad;
  poly(ctx, [[-S * 0.31, -S * 0.88], [S * 0.31, -S * 0.88], [S * 0.36, -S * 0.48], [-S * 0.36, -S * 0.48]]);
  ctx.fillStyle = 'rgba(230,246,255,0.55)';
  poly(ctx, [[S * 0.08, -S * 0.86], [S * 0.24, -S * 0.86], [S * 0.12, -S * 0.5], [S * 0.02, -S * 0.5]]);
  ctx.strokeStyle = '#4c3d28';
  ctx.lineWidth = Math.max(1.2, S * 0.035);
  ctx.beginPath();
  ctx.moveTo(-S * 0.31, -S * 0.88); ctx.lineTo(S * 0.31, -S * 0.88);
  ctx.lineTo(S * 0.36, -S * 0.48); ctx.lineTo(-S * 0.36, -S * 0.48);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -S * 0.88); ctx.lineTo(0, -S * 0.48);
  ctx.stroke();
  // The tail cone cap and the beacon that blinks on it.
  ctx.fillStyle = '#33383e';
  ctx.beginPath(); ctx.ellipse(0, S * 1.05, S * 0.3, S * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(120,130,140,0.8)';
  ctx.beginPath(); ctx.ellipse(-S * 0.08, S * 1.02, S * 0.12, S * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.lampRed;
  ctx.beginPath(); ctx.arc(0, S * 0.94, S * 0.07, 0, Math.PI * 2); ctx.fill();

  // Gear: faired legs drop from the cabin floor amidships, wheels with
  // hub caps and a lit crescent on the tyre's sun side below them.
  if (plane.gearDown) {
    ctx.fillStyle = '#8f96a0';
    poly(ctx, [[-S * 0.44, S * 0.08], [-S * 0.3, S * 0.08], [-S * 0.52, S * 0.6], [-S * 0.68, S * 0.6]]);
    poly(ctx, [[S * 0.44, S * 0.08], [S * 0.3, S * 0.08], [S * 0.52, S * 0.6], [S * 0.68, S * 0.6]]);
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#14171a';
      ctx.beginPath(); ctx.arc(side * S * 0.62, S * 0.68, S * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#596270';
      ctx.beginPath(); ctx.arc(side * S * 0.62, S * 0.68, S * 0.085, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(230,240,248,0.75)';
      ctx.beginPath(); ctx.arc(side * S * 0.585, S * 0.645, S * 0.032, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();

  // The propeller, seen from behind through the cabin: a translucent
  // blur disc squashed by perspective, two blade ghosts sweeping round
  // it at the model's own propSpin, and a bright rim where the blade
  // tips catch the sun.
  if (plane.throttle > 0.03 || plane.speed > 4) {
    ctx.save();
    ctx.translate(cx, cy - S * 0.92);
    ctx.rotate(plane.roll * 0.9);
    ctx.fillStyle = 'rgba(235,242,246,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 0, S * 0.74, S * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const spin = plane.propSpin || t * 30;
    ctx.strokeStyle = 'rgba(240,244,246,0.55)';
    ctx.lineWidth = Math.max(1.6, S * 0.07);
    for (const off of [0, Math.PI]) {
      const a = spin + off;
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * S * 0.12, -Math.cos(a) * S * 0.1);
      ctx.lineTo(Math.sin(a) * S * 0.7, -Math.cos(a) * S * 0.56);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,250,225,0.5)';
    ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0, S * 0.74, S * 0.6, 0, Math.PI * 1.15, Math.PI * 1.6);
    ctx.stroke();
    ctx.restore();
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
// panel this draws across the lower third — now with a lit top edge, a
// stitched glareshield seam, bezel screws, the maker's placard and a
// compass ball that actually swings with the heading.
export function drawCockpitFrame(ctx, width, height, plane) {
  const panelTop = height * 0.68;
  const panelGrad = ctx.createLinearGradient(0, panelTop - 34, 0, height);
  panelGrad.addColorStop(0, '#232f3d');
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
  // The glareshield's padded lip: a lighter seam line riding the curve,
  // with stitch dashes just below it, the way a trimmed coaming reads.
  ctx.strokeStyle = '#46586a';
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
