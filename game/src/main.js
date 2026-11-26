// main.js — Meridian Courier's frame: owns the canvas, the clock and the
// order of a frame. Flight physics step, mission watch, camera settle,
// then the world painted back to front — sky, sea, terrain, town, strips,
// rings, the aeroplane and her shadow, the panel, the HUD, the words.

import { createInput, attachInput, readInput } from './input.js';
import { createGame, startSortie, handleToggle, endSortie, PHASES } from './game-state.js';
import { stepFlight } from './flight-model.js';
import { updateMission, nextRing } from './missions.js';
import {
  createCamera, chaseCamera, cockpitCamera, makeProjector,
  drawSky, drawSea, drawTerrain, drawRunways, drawTown, drawLandmarks, drawRing, drawClouds,
  drawBridge, drawBoats, drawPier, drawHarbourRoad,
} from './renderer-3d.js';
import { drawChaseAircraft, drawCockpitFrame, drawAircraftShadow } from './aircraft-art.js';
import { drawInstrumentPanel } from './instruments.js';
import {
  drawHudDigits, drawMissionBanner, drawCentreMarker, drawEventFlash,
  drawTitleScreen, drawBriefing, drawSortieEnd,
} from './hud.js';
import { createAudio, startAudio, updateAudio, playGateChime, playTouchdownBell, playStallWarning } from './audio.js';
import { applyShotScene } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput();
attachInput(input, canvas);
const audio = createAudio();
const camera = createCamera();
const game = createGame();

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotMode = Boolean(shotName);
if (shotMode) {
  applyShotScene(game, shotName);
  snapCamera();
} else {
  game.phase = PHASES.TITLE;
}

function snapCamera() {
  if (game.cameraMode === 'cockpit') cockpitCamera(camera, game.plane);
  else chaseCamera(camera, game.plane, 1, true);
}

let last = performance.now();
let stallBeepAt = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const frameInput = readInput(input);
  for (const toggle of frameInput.toggles) {
    startAudio(audio);
    handleToggle(game, toggle);
    if (toggle === 'confirm' && game.phase === PHASES.BRIEF) {
      // Briefing dismissed by the same press that throttles up.
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
  }

  if (game.cameraMode === 'cockpit') cockpitCamera(camera, game.plane);
  else chaseCamera(camera, game.plane, shotMode ? 1 : dt, shotMode);
  render(t);
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
  // Ring events arrive through updateMission's own event list in
  // missions.js' contract: re-derive the flash from the count change.
  if (game.missionState.ringsPassed > ringsBefore) {
    const clean = true;
    game.flash = {
      text: `GATE ${game.missionState.ringsPassed} — THROUGH`,
      sub: clean ? 'Clean through the hoop' : 'Through, with paint traded',
      until: t + 1.6,
    };
    playGateChime(audio, clean);
  }
  const td = missionEvents.find((e) => e.kind === 'touchdown');
  if (td && td.rating) {
    game.flash = { text: 'TOUCHDOWN', sub: td.rating.label, until: t + 2.4 };
    playTouchdownBell(audio, td.rating.score >= 55);
  }
  if (game.plane.stalled && t > stallBeepAt) {
    playStallWarning(audio);
    stallBeepAt = t + 0.55;
  }
}

function render(t) {
  const width = canvas.width;
  const height = canvas.height;
  const plane = game.plane;
  const project = makeProjector(camera, width, height);
  const horizon = drawSky(ctx, camera, width, height);
  drawSea(ctx, project, camera, width, height, horizon);
  drawClouds(ctx, project, plane, t);
  drawTerrain(ctx, project, plane);
  drawTown(ctx, project, plane);
  drawRunways(ctx, project);
  drawLandmarks(ctx, project);
  // The built world of v6: the Pilot Islet bridge, working boats
  // and the harbour road — the landmarks that make the chart a
  // place. (A Vela waterfall was tried and cut in QA: at screenshot
  // range it read as a scratch on the slope, not as water.)
  drawBridge(ctx, project);
  drawPier(ctx, project);
  drawBoats(ctx, project, t);
  drawHarbourRoad(ctx, project);
  // Mission rings, the next one pulsing green.
  const upcoming = nextRing(game.missionState);
  for (const ring of game.missionState.mission.rings) {
    if (ring.passed) continue;
    drawRing(ctx, project, ring, ring === upcoming, Math.sin(t * 5) * 0.5 + 0.5);
  }
  drawAircraftShadow(ctx, project, plane);
  if (game.cameraMode === 'cockpit') {
    drawCockpitFrame(ctx, width, height, plane);
  } else {
    drawChaseAircraft(ctx, plane, width, height, t, project, camera);
  }
  drawInstrumentPanel(ctx, plane, width, height, game.cameraMode);
  drawHudDigits(ctx, plane, width, height);
  drawMissionBanner(ctx, game.missionState, plane, width);
  drawCentreMarker(ctx, plane, width, height);
  if (game.flash && t < game.flash.until) {
    drawEventFlash(ctx, game.flash.text, game.flash.sub, width, height, game.flash.until - t);
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
