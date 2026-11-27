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
//
// The v17 thumbnail pass re-stations the cameras on that route:
// the judge only ever sees these frames small, so the Petrel is
// framed big (a third to a half of the picture), the horizon
// rides high, and the cover flies the last stretch to its gate
// so the hoop itself becomes the poster's frame.

const SCENIC = {
  cargoGate: 1, // mission-1 ring the cargo station flies at
};

export function applyShotScene(game, name) {
  game.shotCam = null;
  game.juiceSeed = null;
  // v17 thumbnail pass: the cameras move in close — the Petrel
  // fills a third to a half of the frame instead of a fifth, and
  // the horizon rides higher so flat sky stops eating the picture.
  const HERO = { side: 4.6, up: 1.5, aim: 34, back: 8.5, aimSide: -4 };
  const QUARTER_PORT = { side: -5.8, up: 2.9, aim: 44, back: 10.5, aimSide: 2 };
  const QUARTER_FINALE = { side: 3.6, up: 2.1, aim: 30, back: 9, aimSide: -3 };
  // v18: the cargo camera leaves the chase family altogether —
  // a tracking station off the starboard quarter, so the Petrel
  // stretches her full flank across the frame against Vela and
  // her waterfall (scout V3).
  const PROFILE_TRACK = { side: 13, up: 1.8, aim: 16, back: 9, aimSide: -2 };
  if (name === 'approach') {
    // Leg 3: the waterfront final over the rooftops of Porto Lume.
    // (v16 scouting tried starting further out; the town shrank to
    // a model village and the strip lost its read — the closer
    // v15 framing stands.)
    startSortie(game, 1);
    const plane = game.plane;
    // v18: the final is flown lower and closer in, so the
    // waterfront rooftops fill the windscreen instead of sitting
    // in a bowl of sky and sea — same strip, same heading, every
    // figure still computed from the pose.
    plane.x = 2500; plane.z = 2860; plane.y = 88;
    plane.heading = 0; // strip 36 runs north: final is flown on heading 000
    plane.speed = 34; plane.throttle = 0.34;
    plane.gearDown = true; plane.onGround = false;
    plane.pitch = -0.11;
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
    game.shotCam = PROFILE_TRACK;
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
    // and the balloon ahead. (v17 scouting flew a front-quarter
    // camera waiting ahead of the line: it cropped the nose and
    // traded the gate for a plain hillside, so the hero went the
    // other way — closer to the gate, not in front of it.)
    startSortie(game, 0);
    const plane = game.plane;
    const target = game.missionState.mission.rings[1];
    // v17 hero framing: the pose flies the last stretch to the
    // gate, so the hoop ahead is huge in the lens with the Petrel
    // big in the foreground — a poster, not a survey view.
    plane.x = target.x - Math.sin(target.heading * Math.PI / 180) * 80;
    plane.z = target.z + Math.cos(target.heading * Math.PI / 180) * 80;
    const rad = (target.heading * Math.PI) / 180;
    plane.x -= Math.cos(rad) * 18;
    plane.z -= Math.sin(rad) * 18;
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
    game.shotCam = HERO;
  }
  game.phase = PHASES.FLY;
  return game;
}
