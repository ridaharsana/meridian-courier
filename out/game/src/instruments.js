// instruments.js — the lit panel: attitude indicator, altimeter, airspeed
// dial, compass ribbon, vertical speed and the throttle / fuel / hull
// gauges. One job: turn flight-model numbers into instruments that look
// flown — glass, needles, drums and warning lamps, in both camera views.

import { PALETTE } from './config.js';
import { headingDegrees } from './flight-model.js';

const COMPASS_POINTS = ['N', '03', '06', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];

export function drawInstrumentPanel(ctx, plane, width, height, mode) {
  const inCockpit = mode === 'cockpit';
  const u = inCockpit ? Math.min(width, height) / 5.4 : Math.min(width, height) / 8.6;
  const baseY = height - u * 0.62;
  const cy = baseY - u * 0.52;
  const leftX = inCockpit ? width * 0.30 : u * 0.95;
  const midX = inCockpit ? width * 0.5 : width / 2;
  const rightX = inCockpit ? width * 0.70 : width - u * 0.95;

  drawAttitudeIndicator(ctx, plane, leftX, cy, u * 0.52);
  drawAltimeter(ctx, plane, midX - u * 0.78, cy, u * 0.52);
  drawAirspeedDial(ctx, plane, midX + u * 0.78, cy, u * 0.52);
  drawCompassRibbon(ctx, plane, midX, inCockpit ? height * 0.665 : 196, u * 2.3);
  drawThrottleFuelHull(ctx, plane, rightX, cy, u);
  drawWarningLamps(ctx, plane, midX, baseY + u * 0.16, u);
}

function gaugeFace(ctx, x, y, r, label) {
  // The bezel first: a machined ring, darker outside, catching a rim of
  // light at its top-left, with four screw heads round its face.
  const bezel = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.3, x, y, r * 1.09);
  bezel.addColorStop(0, '#5d6f82');
  bezel.addColorStop(0.55, '#2c3947');
  bezel.addColorStop(1, '#12181f');
  ctx.fillStyle = bezel;
  ctx.beginPath(); ctx.arc(x, y, r * 1.07, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b0f14';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#48586a';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, r * 0.97, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#78879a';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(x + Math.sin(a) * r * 1.03, y - Math.cos(a) * r * 1.03, Math.max(1.3, r * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  // Glass: one soft reflection, high and left, over everything inside.
  ctx.fillStyle = 'rgba(190,225,255,0.10)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.44, r * 0.44, r * 0.2, -0.6, 0, Math.PI * 2); ctx.fill();
  if (label) {
    ctx.fillStyle = '#9fb6c6';
    ctx.font = `600 ${Math.max(8, r * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r * 0.74);
  }
}

function needle(ctx, x, y, angle, len, colour = '#f3f6f8') {
  // The needle's own shadow first, dropped down-right onto the dial,
  // then the needle itself with a proper tail and a brass hub.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 2 - Math.sin(angle) * len * 0.24, y + 2.5 + Math.cos(angle) * len * 0.24);
  ctx.lineTo(x + 2 + Math.sin(angle) * len, y + 2.5 - Math.cos(angle) * len);
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x - Math.sin(angle) * len * 0.24, y + Math.cos(angle) * len * 0.24);
  ctx.lineTo(x + Math.sin(angle) * len, y - Math.cos(angle) * len);
  ctx.stroke();
  ctx.fillStyle = '#c8a24a';
  ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d4a1e';
  ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
}

// The ball-and-horizon: sky above, earth below, the aeroplane symbol fixed
// in the middle while the world rolls and pitches behind it.
export function drawAttitudeIndicator(ctx, plane, x, y, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.roll);
  const lift = plane.pitch * r * 1.7;
  const skyGrad = ctx.createLinearGradient(0, -r, 0, lift);
  skyGrad.addColorStop(0, '#2c66a8');
  skyGrad.addColorStop(1, '#5ea0d8');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-r, -r + lift, r * 2, r * 2);
  const earthGrad = ctx.createLinearGradient(0, lift, 0, r);
  earthGrad.addColorStop(0, '#8a683e');
  earthGrad.addColorStop(1, '#5f4626');
  ctx.fillStyle = earthGrad;
  ctx.fillRect(-r, lift, r * 2, r * 2);
  ctx.strokeStyle = '#f3f6f8';
  ctx.lineWidth = 1.6;
  for (const off of [-0.5, -0.25, 0.25, 0.5]) {
    const ly = lift + off * r * 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * (off === -0.25 || off === 0.25 ? 0.22 : 0.4), ly);
    ctx.lineTo(r * (off === -0.25 || off === 0.25 ? 0.22 : 0.4), ly);
    ctx.stroke();
  }
  ctx.restore();
  gaugeRing(ctx, x, y, r);
  // Fixed aeroplane symbol.
  ctx.strokeStyle = PALETTE.lampAmber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.62, y); ctx.lineTo(x - r * 0.18, y); ctx.lineTo(x - r * 0.18, y + r * 0.14);
  ctx.moveTo(x + r * 0.62, y); ctx.lineTo(x + r * 0.18, y); ctx.lineTo(x + r * 0.18, y + r * 0.14);
  ctx.stroke();
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
  label(ctx, x, y, r, 'ATTITUDE');
}

export function drawAltimeter(ctx, plane, x, y, r) {
  gaugeFace(ctx, x, y, r, null);
  const feet = Math.max(0, plane.y * 3.281);
  // Tick ring at the rim, numerals in their own clear band inside it —
  // v1 printed the numerals where the drum window landed, and the two
  // garbled each other on every screenshot.
  ctx.strokeStyle = '#cfe0ec';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.lineWidth = i % 5 === 0 ? 2.2 : 1.3;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * r * 0.86, y - Math.cos(a) * r * 0.86);
    ctx.lineTo(x + Math.sin(a) * r * 0.95, y - Math.cos(a) * r * 0.95);
    ctx.stroke();
    ctx.fillStyle = '#cfe0ec';
    ctx.font = `600 ${Math.max(8, r * 0.25)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i), x + Math.sin(a) * r * 0.68, y - Math.cos(a) * r * 0.68 + r * 0.09);
  }
  needle(ctx, x, y, ((feet / 1000) % 1) * Math.PI * 2, r * 0.6);
  needle(ctx, x, y, ((feet / 10000) % 1) * Math.PI * 2, r * 0.42, PALETTE.lampAmber);
  // The drum window sits in the one empty band of the dial — below the
  // hub, above the bottom numeral — framed, with FEET in microprint
  // under it and ×100 FT at the dial's foot where nothing else lives.
  ctx.fillStyle = '#05080b';
  ctx.fillRect(x - r * 0.3, y + r * 0.16, r * 0.6, r * 0.22);
  ctx.strokeStyle = '#48586a';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x - r * 0.3, y + r * 0.16, r * 0.6, r * 0.22);
  ctx.fillStyle = PALETTE.lampGreen;
  ctx.font = `700 ${Math.max(9, r * 0.2)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(feet)).padStart(4, '0'), x, y + r * 0.325);
  ctx.fillStyle = '#9fb6c6';
  ctx.font = `600 ${Math.max(7, r * 0.14)}px system-ui, sans-serif`;
  ctx.fillText('FEET', x, y + r * 0.52);
  ctx.font = `600 ${Math.max(7, r * 0.16)}px system-ui, sans-serif`;
  ctx.fillText('ALT ×100', x, y - r * 0.44);
}

export function drawAirspeedDial(ctx, plane, x, y, r) {
  gaugeFace(ctx, x, y, r, 'AIRSPEED KT');
  const knots = plane.speed * 1.944;
  // Stall arc in red, cruise in green, hard against the rim: the dial
  // itself teaches discipline, and the arcs never touch the numerals.
  arc(ctx, x, y, r * 0.93, speedAngle(0), speedAngle(46), PALETTE.lampRed);
  arc(ctx, x, y, r * 0.93, speedAngle(46), speedAngle(120), PALETTE.lampGreen);
  arc(ctx, x, y, r * 0.93, speedAngle(120), speedAngle(170), '#e8eef4');
  ctx.strokeStyle = '#cfe0ec';
  for (let v = 0; v <= 160; v += 10) {
    const a = speedAngle(v);
    ctx.lineWidth = v % 20 === 0 ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * r * 0.8, y - Math.cos(a) * r * 0.8);
    ctx.lineTo(x + Math.sin(a) * r * 0.87, y - Math.cos(a) * r * 0.87);
    ctx.stroke();
  }
  for (let v = 0; v <= 160; v += 20) {
    const a = speedAngle(v);
    ctx.fillStyle = '#cfe0ec';
    ctx.font = `600 ${Math.max(7, r * 0.24)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(v), x + Math.sin(a) * r * 0.63, y - Math.cos(a) * r * 0.63 + r * 0.09);
  }
  needle(ctx, x, y, speedAngle(knots), r * 0.74, plane.stalled ? PALETTE.lampRed : '#f3f6f8');
}

function speedAngle(knots) {
  return -2.25 + (Math.min(170, knots) / 170) * 4.5;
}

function arc(ctx, x, y, r, a0, a1, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(x, y, r, a0 - Math.PI / 2, a1 - Math.PI / 2);
  ctx.stroke();
}

// A moving ribbon under a fixed lubber line: N, the numbered tens, and the
// exact heading in a window — the heading the HUD also prints in digits.
export function drawCompassRibbon(ctx, plane, cx, y, w) {
  const deg = headingDegrees(plane);
  ctx.fillStyle = 'rgba(8,12,17,0.82)';
  ctx.fillRect(cx - w / 2, y - 15, w, 30);
  ctx.strokeStyle = '#3d4c5c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - w / 2, y - 15, w, 30);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2, y - 15, w, 30);
  ctx.clip();
  ctx.textAlign = 'center';
  for (let i = -8; i <= 8; i++) {
    const stepDeg = Math.round(deg / 10) * 10 + i * 10;
    const px = cx + (stepDeg - deg) * (w / 120);
    const norm = ((stepDeg % 360) + 360) % 360;
    ctx.fillStyle = '#dfeaf2';
    ctx.font = `600 12px system-ui, sans-serif`;
    if (norm % 30 === 0) {
      ctx.fillText(COMPASS_POINTS[norm / 30], px, y + 4);
    } else {
      ctx.fillRect(px - 0.75, y - 6, 1.5, 8);
    }
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.beginPath();
  ctx.moveTo(cx - 6, y - 21);
  ctx.lineTo(cx + 6, y - 21);
  ctx.lineTo(cx, y - 13);
  ctx.closePath();
  ctx.fill();
}

export function drawThrottleFuelHull(ctx, plane, x, y, u) {
  const bw = u * 0.92;
  const bx = x - bw / 2;
  bar(ctx, bx, y - u * 0.42, bw, u * 0.17, plane.throttle, '#e8a33d', 'THROTTLE');
  bar(ctx, bx, y - u * 0.05, bw, u * 0.17, plane.fuel / 100,
    plane.fuel < 22 ? PALETTE.lampRed : '#4da3ff', 'FUEL');
  bar(ctx, bx, y + u * 0.32, bw, u * 0.17, plane.hull / 100,
    plane.hull < 45 ? PALETTE.lampRed : PALETTE.lampGreen, 'HULL');
}

function bar(ctx, x, y, w, h, frac, colour, name) {
  ctx.fillStyle = 'rgba(8,12,17,0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(120,160,190,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  // The fill is a lit gradient with a bright leading edge, and the
  // trough carries quarter ticks so the level reads at a glance.
  const fw = Math.max(0, (w - 3) * Math.min(1, frac));
  if (fw > 2) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.18, colour);
    grad.addColorStop(1, colour);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1.5, y + 1.5, fw, h - 3);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(220,235,245,0.28)';
  for (const q of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(x + w * q, y + 2);
    ctx.lineTo(x + w * q, y + h - 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#dfeaf2';
  ctx.font = `700 ${Math.max(8, h * 0.72)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`${name} ${Math.round(frac * 100)}%`, x + 4, y - 3);
}

export function drawWarningLamps(ctx, plane, cx, y, u) {
  const lamps = [
    { text: 'GEAR', on: plane.gearDown, colour: PALETTE.lampGreen },
    { text: 'STALL', on: plane.stalled, colour: PALETTE.lampRed },
    { text: 'LOW FUEL', on: plane.fuel < 22, colour: PALETTE.lampAmber },
    { text: 'BRAKE', on: plane.brakes, colour: PALETTE.lampAmber },
  ];
  ctx.textAlign = 'center';
  lamps.forEach((lamp, i) => {
    const x = cx + (i - 1.5) * u * 0.62;
    ctx.fillStyle = lamp.on ? lamp.colour : 'rgba(60,72,84,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, u * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lamp.on ? '#eef4f8' : '#7d8fa0';
    ctx.font = `700 ${Math.max(7, u * 0.11)}px system-ui, sans-serif`;
    ctx.fillText(lamp.text, x, y + u * 0.24);
  });
}

function gaugeRing(ctx, x, y, r) {
  const bezel = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.3, x, y, r * 1.09);
  bezel.addColorStop(0, '#5d6f82');
  bezel.addColorStop(0.55, '#2c3947');
  bezel.addColorStop(1, '#12181f');
  ctx.strokeStyle = bezel;
  ctx.lineWidth = r * 0.13;
  ctx.beginPath(); ctx.arc(x, y, r * 1.03, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#48586a';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, r * 0.97, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(190,225,255,0.10)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.44, r * 0.44, r * 0.2, -0.6, 0, Math.PI * 2); ctx.fill();
}

function label(ctx, x, y, r, text) {
  ctx.fillStyle = '#9fb6c6';
  ctx.font = `600 ${Math.max(8, r * 0.24)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y + r * 0.68 + r + 8);
}
