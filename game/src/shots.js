// shots.js — the screenshot scenes: each poses the real game.

import { PHASES, startSortie } from './game-state.js';

export const SHOT_NAMES = ['cover', 'approach', 'cargo', 'finale'];

// ------------------------------------------------------------------
// The scenic route (v16): one loop a ferry pilot would fly purely
// for the view, and the four stations where the camera waits on it.
//   leg 1 — the strait gate: out of Meridian Field along the
//     ring line, the Pilot Islet bridge sliding under the wing
//     and the sun's glitter lane opening ahead (COVER).
//   leg 2 — the mail line: the same strait flown the other way on
//     the Porto Lume run, Mount Vela's snowy shoulder filling the
//     sky ahead (CARGO, at the second gate).
//   leg 3 — the waterfront final: down the harbour mouth and over
//     the rooftops of Porto Lume to Strip 36 (APPROACH).
//   leg 4 — the valley return: the ring run complete, home down
//     the Meridian Field valley on short final (FINALE).
// Every pose sits on its mission's real line, so the banner, the
// cue and the dials all read true from the pose itself.

const SCENIC = {
  cargoGate: 1, // mission-1 ring the cargo station flies at
};

export function applyShotScene(game, name) {
  game.shotCam = null;
  game.juiceSeed = null;
  const QUARTER = { side: 6.5, up: 2.4, aim: 42, back: 17, aimSide: -10 };
  const QUARTER_PORT = { side: -6.5, up: 3.3, aim: 46 };
  const QUARTER_FINALE = { side: 5.5, up: 2.8, aim: 34, back: 15, aimSide: -5 };
  if (name === 'approach') {
    // Leg 3: the waterfront final over the rooftops of Porto Lume.
    // (v16 scouting tried starting further out; the town shrank to
    // a model village and the strip lost its read — the closer
    // v15 framing stands.)
    startSortie(game, 1);
    const plane = game.plane;
    plane.x = 2500; plane.z = 3050; plane.y = 128;
    plane.heading = 0; // strip 36 runs north: final is flown on heading 000
    plane.speed = 34; plane.throttle = 0.34;
    plane.gearDown = true; plane.onGround = false;
    plane.pitch = -0.06;
    game.cameraMode = 'cockpit';
  } else if (name === 'cargo') {
    // Leg 2: at the second mail gate, Vela ahead, the bridge astarboard.
    startSortie(game, 1);
    const plane = game.plane;
    const target = game.missionState.mission.rings[SCENIC.cargoGate];
    const rad = (target.heading * Math.PI) / 180;
    plane.x = target.x - Math.sin(rad) * 190;
    plane.z = target.z + Math.cos(rad) * 190;
    plane.y = target.y + 4;
    plane.heading = ((target.heading + 3) * Math.PI) / 180;
    plane.speed = 52; plane.throttle = 0.72;
    plane.roll = 0.2; plane.onGround = false;
    game.juiceSeed = 'cargo';
    game.missionState.mission.rings[0].passed = true;
    game.missionState.ringsPassed = 1;
    game.missionState.elapsed = 64;
    game.cameraMode = 'chase';
    game.shotCam = QUARTER_PORT;
  } else if (name === 'finale') {
    // Leg 4: the valley return — the ring run complete, home down
    // the Meridian Field valley on short final. (v16 scouting flew
    // the Gull Rock lighthouse pass instead: from every workable
    // station the tower read as a speck over empty sea, and the
    // valley's leading lines beat it outright — this framing,
    // the v15 one, stands.)
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
    // Leg 1: the strait gate — the second gate of the ring run,
    // the bridge pylon sliding under the wing, the glitter lane
    // and the balloon ahead. (v16 scouting flew two challengers:
    // the third-gate station, which pushed the balloon out of
    // the top of the frame, and a low bridge reach, which lost
    // the green gate altogether and still only saw the span from
    // above. Neither beat this frame, so it stands.)
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
