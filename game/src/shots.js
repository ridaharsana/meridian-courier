// shots.js — the screenshot scenes: each poses the real game.

import { PHASES, startSortie } from './game-state.js';

export const SHOT_NAMES = ['cover', 'approach', 'cargo', 'finale'];

export function applyShotScene(game, name) {
  game.shotCam = null;
  game.juiceSeed = null;
  const QUARTER = { side: 6.5, up: 2.4, aim: 42, back: 17, aimSide: -10 };
  const QUARTER_PORT = { side: -5.0, up: 3.3, aim: 40 };
  const QUARTER_FINALE = { side: 5.5, up: 2.8, aim: 34, back: 15, aimSide: -5 };
  if (name === 'approach') {
    startSortie(game, 1);
    const plane = game.plane;
    plane.x = 2500; plane.z = 3050; plane.y = 128;
    plane.heading = 0; // strip 36 runs north: final is flown on heading 000
    plane.speed = 34; plane.throttle = 0.34;
    plane.gearDown = true; plane.onGround = false;
    plane.pitch = -0.06;
    game.cameraMode = 'cockpit';
  } else if (name === 'cargo') {
    startSortie(game, 1);
    const plane = game.plane;
    plane.x = 1960; plane.z = 1980; plane.y = 210;
    plane.heading = (38 * Math.PI) / 180;
    plane.speed = 52; plane.throttle = 0.72;
    plane.roll = 0.24; plane.onGround = false;
    game.juiceSeed = 'cargo';
    game.cameraMode = 'chase';
    game.shotCam = QUARTER_PORT;
  } else if (name === 'finale') {
    startSortie(game, 0);
    const plane = game.plane;
    plane.x = -300; plane.z = 1700; plane.y = 37;
    plane.heading = Math.PI / 2;
    plane.speed = 30; plane.throttle = 0.3;
    plane.gearDown = true; plane.onGround = false;
    plane.pitch = -0.05;
    game.juiceSeed = 'finale';
    game.missionState.ringsPassed = 8;
    game.missionState.mission.rings.forEach((r) => { r.passed = true; });
    game.cameraMode = 'chase';
    game.shotCam = QUARTER_FINALE;
  } else {
    startSortie(game, 0);
    const plane = game.plane;
    const target = game.missionState.mission.rings[1];
    plane.x = target.x - Math.sin(target.heading * Math.PI / 180) * 175;
    plane.z = target.z + Math.cos(target.heading * Math.PI / 180) * 175;
    const rad = (target.heading * Math.PI) / 180;
    plane.x -= Math.cos(rad) * 30;
    plane.z -= Math.sin(rad) * 30;
    plane.y = target.y + 4;
    plane.heading = ((target.heading + 3) * Math.PI) / 180;
    plane.speed = 54; plane.throttle = 0.78;
    plane.roll = 0.18; plane.onGround = false;
    game.juiceSeed = 'cover';
    game.smokeOn = true; // the display pass: smoke ribboning off both tips
    game.missionState.mission.rings[0].passed = true;
    game.missionState.ringsPassed = 1;
    game.missionState.elapsed = 47;
    game.cameraMode = 'chase';
    game.shotCam = QUARTER;
  }
  game.phase = PHASES.FLY;
  return game;
}
