// aircraft-art.js — the Petrel herself, drawn twice: as the chase-view
// aeroplane the camera follows (fuselage, high wing, spinning prop, livery
// stripe, shadow on the ground below) and as the cockpit the pilot sits in
// (coaming, glareshield, panel frame the instruments mount into).

import { PALETTE } from './config.js';
import { groundHeight } from './terrain-archipelago.js';

// The ground shadow: an ellipse projected where the sun throws her, the
// oldest altitude cue in flying games and still the most honest.
export function drawAircraftShadow(ctx, project, plane) {
  const g = groundHeight(plane.x, plane.z);
  if (plane.y - g > 700) return;
  const p = project(plane.x, g + 0.6, plane.z);
  if (!p) return;
  const fade = Math.max(0.06, 0.34 - (plane.y - g) / 2600);
  ctx.fillStyle = `rgba(10,30,40,${fade})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, Math.max(3, p.scale * 15), Math.max(1.4, p.scale * 4.6), 0, 0, Math.PI * 2);
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

  // Tailplane at the near end (the camera flies behind her), and the fin
  // rising from the tail cone toward the fuselage — never amidships.
  ctx.fillStyle = '#c8432b';
  poly(ctx, [[-S * 1.5, S * 0.72], [S * 1.5, S * 0.72], [S * 1.06, S * 1.06], [-S * 1.06, S * 1.06]]);
  poly(ctx, [[-S * 0.13, S * 1.04], [S * 0.13, S * 1.04], [S * 0.1, S * 0.34], [-S * 0.1, S * 0.34]]);

  // Main wing: a long tapered plank across the fuselage, tips drooping
  // a touch under load, navigation lamps at the ends.
  const wingGrad = ctx.createLinearGradient(-S * 3.4, 0, S * 3.4, 0);
  wingGrad.addColorStop(0, '#d8502f');
  wingGrad.addColorStop(0.5, '#f0703c');
  wingGrad.addColorStop(1, '#d8502f');
  ctx.fillStyle = wingGrad;
  poly(ctx, [[-S * 3.4, -S * 0.06], [S * 3.4, -S * 0.06], [S * 3.1, S * 0.34], [-S * 3.1, S * 0.34]]);
  ctx.fillStyle = PALETTE.lampRed;
  ctx.beginPath(); ctx.arc(-S * 3.36, S * 0.12, S * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.lampGreen;
  ctx.beginPath(); ctx.arc(S * 3.36, S * 0.12, S * 0.09, 0, Math.PI * 2); ctx.fill();

  // Fuselage: cream body, burnt-orange cheatline, a cabin full of glass.
  const bodyGrad = ctx.createLinearGradient(0, -S * 0.9, 0, S * 1.1);
  bodyGrad.addColorStop(0, '#f6ead2');
  bodyGrad.addColorStop(0.55, '#ecd9b8');
  bodyGrad.addColorStop(1, '#cdb287');
  ctx.fillStyle = bodyGrad;
  poly(ctx, [[-S * 0.52, -S * 0.95], [S * 0.52, -S * 0.95], [S * 0.78, S * 0.5], [S * 0.6, S * 1.05], [-S * 0.6, S * 1.05], [-S * 0.78, S * 0.5]]);
  ctx.fillStyle = '#e05a30';
  poly(ctx, [[-S * 0.74, S * 0.28], [S * 0.74, S * 0.28], [S * 0.66, S * 0.52], [-S * 0.66, S * 0.52]]);
  // From behind, the cabin reads as a cream roof with one small rear
  // window — the big glass faces forward, away from the chase camera.
  ctx.fillStyle = '#20303e';
  poly(ctx, [[-S * 0.3, -S * 0.86], [S * 0.3, -S * 0.86], [S * 0.34, -S * 0.52], [-S * 0.34, -S * 0.52]]);
  ctx.fillStyle = 'rgba(160,210,240,0.45)';
  poly(ctx, [[-S * 0.26, -S * 0.82], [S * 0.02, -S * 0.82], [-S * 0.04, -S * 0.56], [-S * 0.3, -S * 0.56]]);
  // The tail cone cap and the beacon that blinks on it.
  ctx.fillStyle = '#33383e';
  ctx.beginPath(); ctx.ellipse(0, S * 1.04, S * 0.3, S * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.lampRed;
  ctx.beginPath(); ctx.arc(0, S * 0.9, S * 0.07, 0, Math.PI * 2); ctx.fill();

  // Gear: legs drop from the cabin floor amidships, wheels below them.
  if (plane.gearDown) {
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = S * 0.09;
    ctx.beginPath();
    ctx.moveTo(-S * 0.38, S * 0.1); ctx.lineTo(-S * 0.6, S * 0.62);
    ctx.moveTo(S * 0.38, S * 0.1); ctx.lineTo(S * 0.6, S * 0.62);
    ctx.stroke();
    ctx.fillStyle = '#14171a';
    ctx.beginPath(); ctx.arc(-S * 0.62, S * 0.68, S * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(S * 0.62, S * 0.68, S * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // The propeller, seen edge-on from behind, still shimmers when the
  // engine works: two faint arcs above the wing root.
  if (plane.throttle > 0.03 || plane.speed > 4) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.roll * 0.9);
    ctx.strokeStyle = 'rgba(240,244,246,0.35)';
    ctx.lineWidth = 2;
    const wob = Math.sin(t * 40) * 0.04;
    ctx.beginPath();
    ctx.ellipse(0, -S * 0.2, S * 0.62, S * (1.5 + wob), 0, Math.PI * 1.15, Math.PI * 1.85);
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
// dark panel this draws across the lower third.
export function drawCockpitFrame(ctx, width, height) {
  const panelTop = height * 0.68;
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, panelTop + 26);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 34, width, panelTop + 26);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 26);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 34, width, panelTop + 26);
  ctx.stroke();
  // Windscreen posts, left and right.
  ctx.fillStyle = PALETTE.panel;
  ctx.save();
  ctx.translate(width * 0.06, 0);
  ctx.rotate(0.1);
  ctx.fillRect(-13, 0, 26, panelTop + 30);
  ctx.restore();
  ctx.save();
  ctx.translate(width * 0.94, 0);
  ctx.rotate(-0.1);
  ctx.fillRect(-13, 0, 26, panelTop + 30);
  ctx.restore();
  // The compass sits on the coaming, lit, where a pilot expects it.
  ctx.fillStyle = '#1d2733';
  ctx.beginPath();
  ctx.arc(width / 2, panelTop - 8, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.lampAmber;
  ctx.lineWidth = 2;
  ctx.stroke();
}
