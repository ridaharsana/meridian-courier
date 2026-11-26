// flight-model.js — how the Petrel flies: throttle, lift, stall, banked
// turns, wind, fuel and hull. One job: step the aircraft state forward and

import { AIRCRAFT, WORLD } from './config.js';
import { groundHeight, runwayFrame } from './terrain-archipelago.js';
import { RUNWAYS } from './config.js';

export function createAircraft() {
  return {
    x: -300, z: 1700, y: 24,           // parked on the strip at Meridian Field
    heading: Math.PI / 2,              // facing east, down the strip (compass 090)
    pitch: 0, roll: 0,
    speed: 0, vertical: 0,
    throttle: 0, gearDown: true, brakes: false,
    fuel: AIRCRAFT.startFuel, hull: 100,
    onGround: true, stalled: false, propSpin: 0,
    windX: 0, windZ: 0,
    lastTouchdown: null,
  };
}

export function headingDegrees(plane) {
  let deg = (plane.heading * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

export function stepFlight(plane, input, dt) {
  const P = AIRCRAFT;
  // Throttle lever, with the engine spooling rather than snapping.
  plane.throttle = clamp(plane.throttle + input.throttleDelta * P.throttleRate * dt * 3, 0, 1);
  if (input.throttleSet !== null) plane.throttle = clamp(input.throttleSet, 0, 1);

  // Stick: pitch and roll ease toward the commanded attitude.
  const targetRoll = input.roll * 1.05;
  plane.roll += (targetRoll - plane.roll) * Math.min(1, dt * 5.2);
  const speedFactor = clamp(plane.speed / 40, 0.25, 1);
  plane.pitch += (input.pitch * P.pitchRate * speedFactor - plane.pitch * 1.4) * dt * 2.2;
  plane.pitch = clamp(plane.pitch, -0.5, 0.42);

  // A banked wing turns the aeroplane; a rudder nudges it. Slow flight
  // turns lazily, fast flight carves — turn discipline is the game.
  const turnRate = Math.sin(plane.roll) * 0.62 * clamp(plane.speed / 46, 0, 1.15)
    + input.yaw * P.yawRate * speedFactor;
  plane.heading += turnRate * dt;

  // Airspeed: thrust against drag, gravity trading along the flight path.
  const thrust = plane.throttle * 13.5;
  const drag = 0.0038 * plane.speed * plane.speed + (plane.gearDown ? 1.1 : 0.25);
  const slope = -Math.sin(plane.pitch) * WORLD.gravity * 0.82;
  plane.speed += (thrust - drag + slope) * dt * (plane.onGround ? 0.62 : 1);
  plane.speed = clamp(plane.speed, 0, P.maxSpeed + 26);

  // Lift and sink: below the stall the wing stops holding the nose up.
  plane.stalled = !plane.onGround && plane.speed < P.stallSpeed;
  let climb = Math.sin(plane.pitch) * plane.speed;
  if (plane.stalled) climb -= (P.stallSpeed - plane.speed) * 0.55;
  climb -= plane.onGround ? climb : 0;
  plane.vertical += (climb - plane.vertical) * Math.min(1, dt * 3.4);

  // Advance through the air, then let the wind have its say.
  plane.x += Math.sin(plane.heading) * plane.speed * dt + plane.windX * dt;
  plane.z += -Math.cos(plane.heading) * plane.speed * dt + plane.windZ * dt;
  plane.y += plane.vertical * dt;

  plane.propSpin += dt * (2 + plane.throttle * 46 + plane.speed * 0.22);

  // Fuel: a working engine drinks; an empty tank glides.
  if (plane.throttle > 0.02 && plane.fuel > 0) {
    plane.fuel = Math.max(0, plane.fuel - plane.throttle * P.fuelBurnFull * dt);
  }
  if (plane.fuel <= 0) plane.throttle = Math.max(0, plane.throttle - dt * 0.8);

  return judgeGroundContact(plane, input, dt);
}

function judgeGroundContact(plane, input, dt) {
  const ground = groundHeight(plane.x, plane.z);
  const event = { kind: 'air', ground };
  if (plane.y > ground + 0.01) {
    plane.onGround = false;
    return event;
  }
  // Contact. Only an aeroplane that was truly airborne gets its arrival
  // judged: one already rolling follows the ground over bumps and dips
  const wasAirborne = !plane.onGround;
  const sink = -plane.vertical;
  const runway = RUNWAYS.find((r) => {
    const f = runwayFrame(r, plane.x, plane.z);
    return Math.abs(f.along) <= r.length / 2 && Math.abs(f.across) <= r.width / 2;
  });
  plane.y = ground;
  if (wasAirborne && ground <= 0.4 && !runway) {
    event.kind = 'splash';
    plane.hull = Math.max(0, plane.hull - 34 - sink * 4);
    plane.speed *= 0.4;
    plane.onGround = true;
    return event;
  }
  if (wasAirborne && sink >= 1.2) {
    // A touchdown worth judging.
    const aligned = runway
      ? Math.abs(angleDiff(headingDegrees(plane), runway.heading)) < 24
        || Math.abs(angleDiff(headingDegrees(plane), (runway.heading + 180) % 360)) < 24
      : false;
    const rating = rateTouchdown(sink, plane, runway, aligned);
    plane.lastTouchdown = rating;
    event.kind = rating.kind;
    event.rating = rating;
    if (rating.kind === 'crash') {
      plane.hull = Math.max(0, plane.hull - rating.damage);
      plane.speed = 0;
    } else {
      plane.hull = Math.max(0, plane.hull - rating.damage);
      event.kind = 'touchdown';
    }
  }
  plane.onGround = true;
  plane.vertical = 0;
  if (plane.pitch < 0) plane.pitch *= 0.4;
  // Rolling: brakes and grass both slow her; a held-back stick at speed
  // lifts her off again — the takeoff is the pilot's decision.
  if (input.brakes) plane.speed = Math.max(0, plane.speed - 16 * dt);
  if (!runway) plane.speed = Math.max(0, plane.speed - 3.2 * dt);
  if (plane.speed > AIRCRAFT.stallSpeed + 4 && plane.pitch > 0.1) {
    plane.onGround = false;
    plane.y = ground + 0.4;
    plane.vertical = 2.2;
    event.kind = 'liftoff';
  }
  return event;
}

export function rateTouchdown(sink, plane, runway, aligned) {
  if (!plane.gearDown) return { kind: 'crash', label: 'BELLY LANDING — GEAR UP', damage: 46, score: 0 };
  if (sink > 9) return { kind: 'crash', label: 'ARRIVAL — THE AIRFRAME OBJECTS', damage: 38 + sink * 2, score: 0 };
  if (!runway) {
    return sink > 4.5
      ? { kind: 'crash', label: 'ROUGH GROUND ARRIVAL', damage: 30, score: 0 }
      : { kind: 'touchdown', label: 'OFF-FIELD LANDING', damage: 8, score: 30 };
  }
  if (!aligned) return { kind: 'touchdown', label: 'LANDED ACROSS THE STRIP', damage: 10, score: 25 };
  if (sink < 1.6) return { kind: 'touchdown', label: 'GREASED IT — TEXTBOOK', damage: 0, score: 100 };
  if (sink < 3.2) return { kind: 'touchdown', label: 'FIRM AND HONEST', damage: 0, score: 80 };
  if (sink < 5.5) return { kind: 'touchdown', label: 'HEAVY — THE STRUTS FELT THAT', damage: 6, score: 55 };
  return { kind: 'touchdown', label: 'ARRIVED WITH CONVICTION', damage: 14, score: 35 };
}

export function angleDiff(a, b) {
  let d = ((a - b + 540) % 360) - 180;
  return d;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
