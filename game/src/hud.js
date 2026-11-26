// hud.js — everything the pilot reads that is not an instrument: the big
// ALTITUDE / SPEED / HEADING digits, the mission banner and objective
// arrow, the gate flash, and the full-screen states (title, briefing,
// touchdown verdict, crash, results). One job: words and numbers on glass.

import { PALETTE, WORLD, CONTROLS_TEXT } from './config.js';
import { headingDegrees } from './flight-model.js';
import { objectiveCue } from './missions.js';

export function drawHudDigits(ctx, plane, width, height) {
  const feet = Math.max(0, Math.round(plane.y * 3.281));
  const knots = Math.round(plane.speed * 1.944);
  const hdg = Math.round(headingDegrees(plane));
  chip(ctx, width * 0.5 - 268, 14, 'ALTITUDE', `${feet} FT`);
  chip(ctx, width * 0.5 - 88, 14, 'SPEED', `${knots} KT`);
  chip(ctx, width * 0.5 + 92, 14, 'HEADING', `${String(hdg).padStart(3, '0')}°`);
  // Vertical speed tucked under altitude: the number landings are made of.
  const vs = Math.round(plane.vertical * 196.85);
  ctx.fillStyle = 'rgba(8,12,17,0.72)';
  ctx.fillRect(width * 0.5 - 268, 64, 168, 24);
  ctx.fillStyle = vs < -700 ? PALETTE.lampRed : '#cfe0ec';
  ctx.font = '700 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`V/S ${vs >= 0 ? '+' : ''}${vs} FT/MIN`, width * 0.5 - 184, 80);
}

function chip(ctx, x, y, label, value) {
  ctx.fillStyle = 'rgba(8,12,17,0.78)';
  ctx.fillRect(x, y, 168, 46);
  ctx.strokeStyle = 'rgba(120,160,190,0.55)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x, y, 168, 46);
  ctx.fillStyle = '#8fb0c6';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + 84, y + 14);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '700 21px ui-monospace, monospace';
  ctx.fillText(value, x + 84, y + 38);
}

export function drawMissionBanner(ctx, state, plane, width) {
  const m = state.mission;
  ctx.fillStyle = 'rgba(8,12,17,0.66)';
  ctx.fillRect(width * 0.5 - 300, 96, 600, 30);
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(m.title, width * 0.5, 116);
  // Objective cue: label, distance, and an arrow that swings to the turn.
  const cue = objectiveCue(state, plane);
  const mins = Math.floor(state.elapsed / 60);
  const secs = String(Math.floor(state.elapsed % 60)).padStart(2, '0');
  ctx.fillStyle = 'rgba(8,12,17,0.66)';
  ctx.fillRect(width * 0.5 - 300, 130, 600, 28);
  ctx.fillStyle = '#eef4f8';
  ctx.font = '600 13.5px system-ui, sans-serif';
  ctx.fillText(`▸ ${cue.label} · ${(cue.dist / 1000).toFixed(2)} KM · ${mins}:${secs}`, width * 0.5, 149);
  const ax = width * 0.5 + 268;
  ctx.save();
  ctx.translate(ax, 144);
  ctx.rotate((cue.turn * Math.PI) / 180);
  ctx.fillStyle = PALETTE.ringNext;
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(5.5, 6); ctx.lineTo(0, 2.6); ctx.lineTo(-5.5, 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function drawCentreMarker(ctx, plane, width, height) {
  const cx = width / 2;
  const cy = height * 0.44;
  ctx.strokeStyle = plane.stalled ? PALETTE.lampRed : 'rgba(238,244,248,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 13, cy);
  ctx.moveTo(cx + 13, cy); ctx.lineTo(cx + 26, cy);
  ctx.stroke();
  if (plane.stalled) {
    ctx.fillStyle = PALETTE.lampRed;
    ctx.font = '800 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL — NOSE DOWN, THROTTLE UP', cx, cy + 44);
  }
}

export function drawEventFlash(ctx, text, sub, width, height, alpha) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = PALETTE.lampGreen;
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, height * 0.3);
  ctx.fillStyle = '#eef4f8';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText(sub, width / 2, height * 0.3 + 28);
  ctx.restore();
}

function veil(ctx, width, height) {
  ctx.fillStyle = 'rgba(6,12,20,0.62)';
  ctx.fillRect(0, 0, width, height);
}

export function drawTitleScreen(ctx, width, height) {
  veil(ctx, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.fillText(WORLD.daySub.toUpperCase(), width / 2, height * 0.2);
  ctx.fillStyle = '#f6ead2';
  ctx.font = '800 62px Georgia, serif';
  ctx.fillText('MERIDIAN COURIER', width / 2, height * 0.2 + 66);
  ctx.fillStyle = '#cfe0ec';
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillText('Fly the mail across the Skyferry Archipelago in the Petrel — rings, cargo, and one stormy ride home.', width / 2, height * 0.2 + 104);
  ctx.font = '600 14.5px system-ui, sans-serif';
  CONTROLS_TEXT.forEach((line, i) => {
    ctx.fillText(line, width / 2, height * 0.52 + i * 24);
  });
  ctx.fillStyle = PALETTE.ringNext;
  ctx.font = '800 19px system-ui, sans-serif';
  ctx.fillText('PRESS ENTER TO START THE DAY', width / 2, height * 0.52 + 128);
}

export function drawBriefing(ctx, state, width, height) {
  veil(ctx, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillText(state.mission.title, width / 2, height * 0.34);
  ctx.fillStyle = '#eef4f8';
  ctx.font = '600 16.5px system-ui, sans-serif';
  wrapText(ctx, state.mission.brief, width / 2, height * 0.34 + 40, 640, 23);
  ctx.fillStyle = PALETTE.ringNext;
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.fillText('THROTTLE UP WHEN READY — W OR ↑', width / 2, height * 0.34 + 128);
}

export function drawSortieEnd(ctx, state, plane, width, height) {
  veil(ctx, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = state.complete ? PALETTE.ringNext : PALETTE.lampRed;
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillText(state.complete ? 'SORTIE COMPLETE' : 'SORTIE OVER', width / 2, height * 0.3);
  ctx.fillStyle = '#f6ead2';
  ctx.font = '700 19px Georgia, serif';
  wrapText(ctx, state.verdict, width / 2, height * 0.3 + 42, 700, 26);
  ctx.fillStyle = '#cfe0ec';
  ctx.font = '600 16px ui-monospace, monospace';
  const rows = [
    `GATES FLOWN ........ ${state.ringsPassed}`,
    `SCORE .............. ${state.score}`,
    `FUEL LEFT .......... ${Math.round(plane.fuel)}%`,
    `HULL ............... ${Math.round(plane.hull)}%`,
    `TIME ............... ${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`,
  ];
  rows.forEach((row, i) => ctx.fillText(row, width / 2, height * 0.3 + 96 + i * 25));
  ctx.fillStyle = PALETTE.lampAmber;
  ctx.font = '800 16px system-ui, sans-serif';
  ctx.fillText('ENTER — FLY IT AGAIN · M — NEXT MISSION', width / 2, height * 0.3 + 96 + rows.length * 25 + 26);
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, cx, yy);
      yy += lineHeight;
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}
