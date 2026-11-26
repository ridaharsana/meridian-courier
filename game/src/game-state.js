// game-state.js — the phase machine and (re)starting of sorties.

import { createAircraft } from './flight-model.js';
import { MISSIONS, createMissionState } from './missions.js';

export const PHASES = { TITLE: 'title', BRIEF: 'brief', FLY: 'fly', END: 'end' };

export function createGame() {
  return {
    phase: PHASES.TITLE,
    missionIndex: 0,
    plane: createAircraft(),
    missionState: createMissionState(MISSIONS[0]),
    cameraMode: 'chase',
    smokeOn: false,     // aerobatic smoke, toggled with X while flying
    paused: false,
    flash: null,        // { text, sub, until } — the gate / event callout
    totalScore: 0,
    dayComplete: false,
  };
}

export function startSortie(game, index) {
  const mission = MISSIONS[index];
  game.missionIndex = index;
  game.missionState = createMissionState(mission);
  game.missionState.mission = {
    ...mission,
    rings: mission.rings.map((r) => ({ ...r, passed: false })),
  };
  const plane = createAircraft();
  const s = mission.start;
  plane.x = s.x;
  plane.z = s.z;
  plane.y = s.y;
  plane.heading = (s.headingDeg * Math.PI) / 180;
  plane.speed = s.speed;
  plane.fuel = s.fuel;
  plane.windX = mission.wind.x;
  plane.windZ = mission.wind.z;
  plane.cargoPod = mission.id === 'cargo-lume'; // the belly pod is fitted for the mail run
  game.smokeOn = false;
  plane.onGround = s.speed === 0;
  game.plane = plane;
  game.phase = PHASES.BRIEF;
}

export function beginFlight(game) {
  if (game.phase === PHASES.BRIEF) game.phase = PHASES.FLY;
}

export function endSortie(game) {
  game.phase = PHASES.END;
  if (game.missionState.complete) game.totalScore += game.missionState.score;
  if (game.missionIndex >= MISSIONS.length - 1 && game.missionState.complete) {
    game.dayComplete = true;
  }
}

export function nextMission(game) {
  const next = (game.missionIndex + 1) % MISSIONS.length;
  startSortie(game, next);
}

export function handleToggle(game, toggle) {
  switch (toggle) {
    case 'confirm':
      if (game.phase === PHASES.TITLE) startSortie(game, 0);
      else if (game.phase === PHASES.BRIEF) beginFlight(game);
      else if (game.phase === PHASES.END) startSortie(game, game.missionIndex);
      break;
    case 'mission':
      if (game.phase !== PHASES.TITLE) nextMission(game);
      break;
    case 'gear':
      if (game.phase === PHASES.FLY) game.plane.gearDown = !game.plane.gearDown;
      break;
    case 'smoke':
      if (game.phase === PHASES.FLY) game.smokeOn = !game.smokeOn;
      break;
    case 'camera':
      game.cameraMode = game.cameraMode === 'chase' ? 'cockpit' : 'chase';
      break;
    case 'pause':
      if (game.phase === PHASES.FLY) game.paused = !game.paused;
      break;
    default:
      break;
  }
}
