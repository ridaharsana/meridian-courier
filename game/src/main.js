// main.js — owns the canvases, the clock and the order of a frame:
// the three.js world renders first, then the 2D overlay draws the
// cockpit frame, the instrument panel and the HUD on top of it.

import { createInput, attachInput, readInput } from './input.js';
import { createGame, startSortie, handleToggle, endSortie, PHASES } from './game-state.js';
import { stepFlight } from './flight-model.js';
import { updateMission } from './missions.js';
import { createCamera, chaseCamera, cockpitCamera, createWorld, syncWorld } from './renderer-3d.js';
import { drawCockpitFrame } from './aircraft-art.js';
import { drawInstrumentPanel } from './instruments.js';
import {
  drawHudDigits, drawMissionBanner, drawCentreMarker, drawEventFlash,
  drawTitleScreen, drawBriefing, drawSortieEnd,
} from './hud.js';
import { createAudio, startAudio, updateAudio, playGateChime, playTouchdownBell, playStallWarning } from './audio.js';
import { applyShotScene } from './shots.js';
import {
  createParticlePool, spawnRingBurst, spawnWingtipTrail, spawnPropwashDust,
  spawnSmokeTrail, seedShotJuice, updateParticles,
} from './juice-particles.js';

const glCanvas = document.getElementById('gl');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput();
attachInput(input, canvas);
const audio = createAudio();
const camera = createCamera();
const game = createGame();
const juicePool = createParticlePool();
const world = createWorld(glCanvas);
let frameDt = 0.016;

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotMode = Boolean(shotName);
if (shotMode) {
  applyShotScene(game, shotName);
  if (game.juiceSeed) {
    seedShotJuice(juicePool, game.juiceSeed, game.plane, game.missionState.mission.rings[1]);
  }
  snapCamera();
} else {
  game.phase = PHASES.TITLE;
}

function snapCamera() {
  if (game.cameraMode === 'cockpit') cockpitCamera(camera, game.plane);
  else chaseCamera(camera, game.plane, 1, true, game.shotCam || null);
}

let last = performance.now();
let stallBeepAt = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  frameDt = dt;
  last = now;
  const t = now / 1000;
  const frameInput = readInput(input);
  for (const toggle of frameInput.toggles) {
    startAudio(audio);
    handleToggle(game, toggle);
    if (toggle === 'smoke' && game.phase === PHASES.FLY) {
      game.flash = {
        text: game.smokeOn ? 'SMOKE ON' : 'SMOKE OFF',
        sub: 'Aerobatic smoke from both wingtips',
        until: t + 1.4,
        start: t,
      };
    }
    if (toggle === 'confirm' && game.phase === PHASES.BRIEF) {
    }
  }
  if (game.phase === PHASES.BRIEF && (frameInput.throttleDelta > 0 || frameInput.throttleSet)) {
    game.phase = PHASES.FLY;
  }

  const events = [];
  if (game.phase === PHASES.FLY && !game.paused && !shotMode) {
    const ev = stepFlight(game.plane, frameInput, dt);
    if (ev.kind !== 'air') events.push(ev);
    const before = game.missionState.ringsPassed;
    const missionEvents = [];
    updateMission(game.missionState, game.plane, dt, missionEventsToGameEvents(missionEvents, ev));
    collectMissionEvents(game, missionEvents, before, t);
    if (game.missionState.complete || game.missionState.failed) {
      if (game.phase === PHASES.FLY) endSortie(game);
    }
  }
  if (shotMode) {
    // Posed but alive: prop turning, lamps lit, a breath of bank.
    game.plane.propSpin += dt * 30;
    // Seeded juice ages in slow motion so a still catches it mid-act.
    updateParticles(juicePool, dt * 0.22);
  } else if (game.phase === PHASES.FLY && !game.paused) {
    updateParticles(juicePool, dt);
    if (!game.plane.onGround) {
      spawnWingtipTrail(juicePool, game.plane, dt);
      if (game.smokeOn) spawnSmokeTrail(juicePool, game.plane, dt);
    }
  }

  if (game.cameraMode === 'cockpit') cockpitCamera(camera, game.plane);
  else chaseCamera(camera, game.plane, shotMode ? 1 : dt, shotMode, shotMode ? game.shotCam || null : null);
  render(t, dt);
  updateAudio(audio, game.plane);
  requestAnimationFrame(frame);
}

function missionEventsToGameEvents(missionEvents, groundEvent) {
  if (groundEvent.kind === 'touchdown') missionEvents.push({ kind: 'touchdown', rating: groundEvent.rating });
  if (groundEvent.kind === 'crash') missionEvents.push({ kind: 'crash' });
  if (groundEvent.kind === 'splash') missionEvents.push({ kind: 'splash' });
  return missionEvents;
}

function collectMissionEvents(game, missionEvents, ringsBefore, t) {
  if (game.missionState.ringsPassed > ringsBefore) {
    const clean = true;
    game.flash = {
      text: `GATE ${game.missionState.ringsPassed} — THROUGH`,
      sub: clean ? 'Clean through the hoop' : 'Through, with paint traded',
      until: t + 1.6,
      start: t,
    };
    const flown = game.missionState.mission.rings[ringsBefore];
    if (flown) spawnRingBurst(juicePool, flown.x, flown.y, flown.z);
    playGateChime(audio, clean);
  }
  const td = missionEvents.find((e) => e.kind === 'touchdown');
  if (td && td.rating) {
    game.flash = { text: 'TOUCHDOWN', sub: td.rating.label, until: t + 2.4, start: t };
    spawnPropwashDust(juicePool, game.plane);
    playTouchdownBell(audio, td.rating.score >= 55);
  }
  if (game.plane.stalled && t > stallBeepAt) {
    playStallWarning(audio);
    stallBeepAt = t + 0.55;
  }
}

function render(t, dt) {
  const width = canvas.width;
  const height = canvas.height;
  const plane = game.plane;
  plane.smokeOn = game.smokeOn; // the panel's SMOKE lamp reads the plane
  syncWorld(world, game, camera, juicePool, t, dt);
  ctx.clearRect(0, 0, width, height);
  if (game.cameraMode === 'cockpit') {
    drawCockpitFrame(ctx, width, height, plane);
  }
  drawInstrumentPanel(ctx, plane, width, height, game.cameraMode, frameDt);
  drawHudDigits(ctx, plane, width, height);
  drawMissionBanner(ctx, game.missionState, plane, width, shotMode ? 1 : Math.min(1, game.missionState.elapsed / 0.6));
  drawCentreMarker(ctx, plane, width, height);
  if (game.flash && t < game.flash.until) {
    drawEventFlash(ctx, game.flash.text, game.flash.sub, width, height,
      Math.min(1, (game.flash.until - t) / 0.45), t - (game.flash.start || 0));
  }
  if (game.phase === PHASES.TITLE) drawTitleScreen(ctx, width, height);
  if (game.phase === PHASES.BRIEF) drawBriefing(ctx, game.missionState, width, height);
  if (game.phase === PHASES.END) drawSortieEnd(ctx, game.missionState, plane, width, height);
  if (game.paused) {
    ctx.fillStyle = 'rgba(6,12,20,0.5)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#eef4f8';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED — P TO FLY ON', width / 2, height / 2);
  }
}

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();
if (shotMode) snapCamera();
requestAnimationFrame(frame);
