// shots.js — the screenshot scenes. Each named scene poses the real game
// — same renderer, same HUD, same instruments — at a moment a player can

import { PHASES, startSortie } from './game-state.js';

export const SHOT_NAMES = ['cover', 'approach', 'cargo', 'finale'];

export function applyShotScene(game, name) {
  // The posed chase view (v9): cover and cargo are shot from a rear
  // three-quarter station, not dead astern — from square behind, the
  game.shotCam = null;
  const QUARTER = { side: 5.0, up: 3.3, aim: 40 };
  // Cargo is shot from the port quarter instead: its showcase is the
  // fleet working the bay ahead-left, and a starboard station swings
  const QUARTER_PORT = { side: -5.0, up: 3.3, aim: 40 };
  if (name === 'approach') {
    // Cockpit on final for Porto Lume Strip 36: runway ahead and filling
    // the windscreen, gear down, glide alive on the panel.
    startSortie(game, 1);
    const plane = game.plane;
    plane.x = 2500; plane.z = 3050; plane.y = 128;
    plane.heading = 0; // strip 36 runs north: final is flown on heading 000
    plane.speed = 34; plane.throttle = 0.34;
    plane.gearDown = true; plane.onGround = false;
    plane.pitch = -0.06;
    game.cameraMode = 'cockpit';
  } else if (name === 'cargo') {
    // Chase over the harbour town with a gate ahead and the strait beyond.
    startSortie(game, 1);
    const plane = game.plane;
    plane.x = 1960; plane.z = 1980; plane.y = 210;
    plane.heading = (38 * Math.PI) / 180;
    plane.speed = 52; plane.throttle = 0.72;
    plane.roll = 0.24; plane.onGround = false;
    game.cameraMode = 'chase';
    game.shotCam = QUARTER_PORT;
  } else if (name === 'finale') {
    // Over the threshold home: gear down, the strip stretching ahead
    // under the wing, the day's last landing a breath away.
    startSortie(game, 0);
    const plane = game.plane;
    plane.x = -300; plane.z = 1700; plane.y = 37;
    plane.heading = Math.PI / 2;
    plane.speed = 30; plane.throttle = 0.3;
    plane.gearDown = true; plane.onGround = false;
    plane.pitch = -0.05;
    game.missionState.ringsPassed = 8;
    game.missionState.mission.rings.forEach((r) => { r.passed = true; });
    game.cameraMode = 'chase';
  } else {
    // cover: the Ring Run, second gate ahead, home isle spread below.
    startSortie(game, 0);
    const plane = game.plane;
    const target = game.missionState.mission.rings[1];
    plane.x = target.x - Math.sin(target.heading * Math.PI / 180) * 175;
    plane.z = target.z + Math.cos(target.heading * Math.PI / 180) * 175;
    // v9: the pose steps 30 m to port of the gate line. The Pilot
    // Islet bridge leaves its Home shore almost parallel to this
    const rad = (target.heading * Math.PI) / 180;
    plane.x -= Math.cos(rad) * 30;
    plane.z -= Math.sin(rad) * 30;
    plane.y = target.y + 4;
    // Nose 3° right of the course: the correction made visible, and
    // it swings the gate back toward the frame's centre against the
    plane.heading = ((target.heading + 3) * Math.PI) / 180;
    plane.speed = 54; plane.throttle = 0.78;
    plane.roll = 0.18; plane.onGround = false;
    game.missionState.mission.rings[0].passed = true;
    game.missionState.ringsPassed = 1;
    game.missionState.elapsed = 47;
    game.cameraMode = 'chase';
    game.shotCam = QUARTER;
  }
  game.phase = PHASES.FLY;
  return game;
}
