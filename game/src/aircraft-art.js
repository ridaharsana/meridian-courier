// aircraft-art.js — the Petrel as a real 3D aeroplane: a lathe-turned
// fuselage, slab wings with dihedral, a glass canopy and a spinning
// prop, built once as a three.js group and posed every frame from the
// flight model. The cockpit frame for the pilot's-eye view stays a 2D
// overlay drawing, kept in this file because it is aircraft too.

import * as THREE from 'three';
import { PALETTE } from './config.js';
import { headingDegrees } from './flight-model.js';

// v17: the Petrel's paint deepened a step — a richer orange body
// and a hotter tail, so the aeroplane pops against sea and sky at
// contact-sheet size instead of blending into the golden terrain.
const APRICOT = 0xf0a83e;
const APRICOT_DEEP = 0xe08a26;
const UMBER = 0xb03412;
const TAIL_RED = 0xd23c14;
const CREAM = 0xf6ead2;

function petrelFinTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c4502e';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#fdf6e0';
  g.font = '800 44px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('PETREL', 128, 78);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// buildPetrelAircraft returns the group plus the parts the frame loop
// animates: the prop assembly, the blur disc and the gear group.
// Options dress the airframe: a livery colour pair (the AI traffic
// flies a sister ship in steel blue) — the accessories (belly cargo
// pod, wheel spats, winglets, pitot tube, fin beacon, wingtip
// strobes) are built on every airframe; the pod shows by flag.
export function buildPetrelAircraft(options = {}) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const apricot = new THREE.MeshStandardMaterial({ color: options.colour ?? APRICOT, roughness: 0.46, metalness: 0.08 });
  const apricotDeep = new THREE.MeshStandardMaterial({ color: options.deepColour ?? APRICOT_DEEP, roughness: 0.52, metalness: 0.08 });
  const umber = new THREE.MeshStandardMaterial({ color: UMBER, roughness: 0.5, metalness: 0.05 });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.55, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.35, metalness: 0.7 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 0.4,
  });
  const strobeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0,
  });

  // Fuselage: a lathe profile, tail tip first, swelling through the
  // cabin and tapering into the nose. rotateX turns the lathe axis
  // onto -Z, so the nose points the three.js way.
  const profile = [
    [0.04, 0.0], [0.3, 0.7], [0.52, 2.0], [0.74, 3.6], [0.84, 4.9],
    [0.82, 6.0], [0.62, 7.1], [0.34, 7.9], [0.1, 8.25], [0.02, 8.4],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fuselageGeo = new THREE.LatheGeometry(profile, 22);
  fuselageGeo.rotateX(-Math.PI / 2);
  fuselageGeo.translate(0, 0, 4.2);
  const fuselage = new THREE.Mesh(fuselageGeo, apricot);
  fuselage.castShadow = true;
  body.add(fuselage);

  // The umber cheatline: a slim band carried down both flanks.
  for (const sideSign of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 5.6), umber);
    band.position.set(0.8 * sideSign, 0.08, -0.5);
    body.add(band);
  }

  // The belly cargo pod: a faired capsule slung under the fuselage,
  // fitted for the mail run and shown only when the sortie's plane
  // flag says so (the renderer poses it from plane.cargoPod).
  const pod = new THREE.Group();
  const podBodyGeo = new THREE.CapsuleGeometry(0.52, 1.7, 4, 10);
  podBodyGeo.rotateX(Math.PI / 2);
  const podBody = new THREE.Mesh(podBodyGeo, umber);
  podBody.position.set(0, -0.82, -0.35);
  pod.add(podBody);
  const podSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, 2.2), apricotDeep);
  podSkirt.position.set(0, -0.48, -0.35);
  pod.add(podSkirt);
  pod.visible = false;
  body.add(pod);

  // Canopy: a scaled sphere segment in near-black glass — low
  // roughness and high metalness so the sky and sun live in it.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1c3448, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.6,
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 14), glass);
  canopy.scale.set(0.82, 0.62, 1.5);
  canopy.position.set(0, 0.55, -1.2);
  body.add(canopy);

  // Wings: two slabs with a breath of dihedral, cream tips, and a
  // darker flap panel along the trailing edge.
  for (const sideSign of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.13, 1.3), apricot);
    wing.position.set(2.15 * sideSign, -0.02, -0.55);
    wing.rotation.z = 0.07 * sideSign;
    wing.castShadow = true;
    body.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 1.3), cream);
    tip.position.set(3.95 * sideSign, 0.11, -0.55);
    tip.rotation.z = 0.07 * sideSign;
    body.add(tip);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.34), umber);
    flap.position.set(1.7 * sideSign, 0.03, 0.22);
    flap.rotation.z = 0.07 * sideSign;
    body.add(flap);
    // Navigation lamps: red to port, green to starboard.
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 8),
      new THREE.MeshStandardMaterial({
        color: sideSign < 0 ? 0xff2a20 : 0x2aff66,
        emissive: sideSign < 0 ? 0xff2a20 : 0x2aff66, emissiveIntensity: 2.4,
      }),
    );
    lamp.position.set(4.2 * sideSign, 0.14, -0.55);
    body.add(lamp);
    // Wingtip strobe beside the nav lamp: dark until its double
    // flash fires (the frame loop drives strobeMat).
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), strobeMat);
    strobe.position.set(4.2 * sideSign, 0.3, -0.55);
    body.add(strobe);
    // Winglet: a small upturned fence at the tip, in the deep
    // apricot so its broad shaded face reads as wing, not furniture.
    const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.66), apricotDeep);
    winglet.position.set(4.28 * sideSign, 0.34, -0.55);
    winglet.rotation.z = -0.35 * sideSign;
    body.add(winglet);
    // Pitot tube under the port wing only, reaching into clean air.
    if (sideSign < 0) {
      const pitotGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6);
      pitotGeo.rotateX(Math.PI / 2);
      const pitot = new THREE.Mesh(pitotGeo, metal);
      pitot.position.set(-2.3, -0.24, -1.15);
      body.add(pitot);
    }
  }

  // Tailplane and the fin, which carries the PETREL name.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.85), apricotDeep);
  tailplane.position.set(0, 0.28, 3.75);
  body.add(tailplane);
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 1.15, 1.0),
    new THREE.MeshStandardMaterial({ map: petrelFinTexture(), roughness: 0.5, metalness: 0.05 }),
  );
  fin.position.set(0, 0.85, 3.8);
  body.add(fin);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: TAIL_RED, roughness: 0.5 }));
  rudder.position.set(0, 0.72, 4.35);
  body.add(rudder);
  // Anti-collision beacon on top of the fin: a red jewel whose pulse
  // the frame loop breathes through beaconMat.
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), beaconMat);
  beacon.position.set(0, 1.52, 3.8);
  body.add(beacon);

  // Prop assembly at the nose: spinner cone, two blades, and the
  // translucent blur disc that fades in as the throttle rises.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -4.35);
  const spinner = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.7, 14),
    new THREE.MeshStandardMaterial({ color: TAIL_RED, roughness: 0.35, metalness: 0.2 }),
  );
  spinner.geometry.rotateX(-Math.PI / 2);
  spinner.position.z = -0.2;
  prop.add(spinner);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2b2320, roughness: 0.6 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.7, 0.05), bladeMat);
    blade.rotation.z = a;
    prop.add(blade);
  }
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 26),
    new THREE.MeshBasicMaterial({ color: 0xf3e9d2, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  blurDisc.position.z = 0.05;
  prop.add(blurDisc);
  body.add(prop);

  // Dressing details: a wire aerial from the canopy to the fin, a
  // short mast, and exhaust stubs along the cowling flanks.
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a2d31 });
  const wireGeo = new THREE.CylinderGeometry(0.016, 0.016, 4.9, 4);
  const wire = new THREE.Mesh(wireGeo, wireMat);
  wire.position.set(0, 1.62, 1.35);
  wire.rotation.x = Math.PI / 2 - Math.atan2(0.95, 4.9);
  body.add(wire);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.55, 6),
    new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.4, metalness: 0.6 }));
  mast.position.set(0, 1.18, -0.9);
  body.add(mast);
  for (const sideSign of [-1, 1]) {
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.55, metalness: 0.5 }));
    stub.geometry = stub.geometry.clone();
    stub.rotation.z = sideSign * Math.PI / 2.4;
    stub.position.set(0.62 * sideSign, -0.42, -3.3);
    body.add(stub);
  }

  // Landing gear: three legs with wheels, folded away by flag.
  const gear = new THREE.Group();
  const legMat = new THREE.MeshStandardMaterial({ color: 0x8f97a3, roughness: 0.35, metalness: 0.7 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.9 });
  const addWheel = (x, y, z) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, Math.abs(y) + 0.3, 8), legMat);
    leg.position.set(x, y / 2 - 0.1, z);
    gear.add(leg);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.position.set(x, y, z);
    gear.add(wheel);
  };
  addWheel(0, -1.05, -3.1);
  addWheel(-0.85, -1.1, 0.5);
  addWheel(0.85, -1.1, 0.5);
  // Wheel spats over the mains: teardrop fairings that swallow the
  // top two-thirds of each tyre and leave the contact patch bare.
  for (const sideSign of [-1, 1]) {
    const spat = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), apricotDeep);
    spat.scale.set(0.62, 0.95, 1.55);
    spat.position.set(0.85 * sideSign, -0.9, 0.5);
    gear.add(spat);
  }
  body.add(gear);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, prop, blurDisc, gear, pod, beaconMat, strobeMat };
}

// Pose the group from the flight model: the model space nose is -Z,
// so yaw is the negated compass heading and the Euler order is YXZ —
// yaw first, then pitch, then roll about the body's own axes.
export function updatePetrelAircraft(petrel, plane, t = 0) {
  const g = petrel.group;
  g.position.set(plane.x, plane.y, plane.z);
  g.rotation.order = 'YXZ';
  g.rotation.set(plane.pitch, -plane.heading, -plane.roll);
  petrel.prop.rotation.z = plane.propSpin;
  petrel.blurDisc.material.opacity = Math.min(0.26, plane.throttle * 0.3 + (plane.speed > 4 ? 0.08 : 0));
  petrel.gear.visible = plane.gearDown;
  petrel.pod.visible = Boolean(plane.cargoPod);
  // The fin beacon breathes in a slow swell; the strobes answer in
  // the classic double flash, twice a breath apart.
  const swell = Math.pow(Math.max(0, Math.sin(t * 3.4)), 6);
  petrel.beaconMat.emissiveIntensity = 0.35 + swell * 3.4;
  const cycle = t % 1.5;
  petrel.strobeMat.emissiveIntensity = (cycle < 0.05 || (cycle > 0.16 && cycle < 0.21)) ? 7 : 0;
  return g;
}

// The pilot's-eye frame: coaming, posts and the compass ball, drawn
// on the 2D overlay above the 3D windscreen view.
export function drawCockpitFrame(ctx, width, height, plane) {
  const panelTop = height * 0.68;
  const panelGrad = ctx.createLinearGradient(0, panelTop - 34, 0, height);
  panelGrad.addColorStop(0, '#2e2a26');
  panelGrad.addColorStop(0.24, PALETTE.panel);
  panelGrad.addColorStop(1, '#090d12');
  ctx.fillStyle = panelGrad;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, panelTop + 26);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 34, width, panelTop + 26);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a6f4d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 26);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 34, width, panelTop + 26);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,205,220,0.4)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 40);
  ctx.quadraticCurveTo(width * 0.5, panelTop - 20, width, panelTop + 40);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const fx of [0.16, 0.84]) {
    const sx = width * fx;
    const sy = panelTop + 30;
    ctx.fillStyle = '#5a6a7a';
    ctx.beginPath(); ctx.arc(sx, sy, 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#141a21';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx - 3, sy + 1.4); ctx.lineTo(sx + 3, sy - 1.4);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(214,222,230,0.75)';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('SKYFERRY SF-2 · PETREL · MERIDIAN WORKS', width - 26, height - 14);
  for (const side of [0.06, 0.94]) {
    ctx.save();
    ctx.translate(width * side, 0);
    ctx.rotate(side < 0.5 ? 0.1 : -0.1);
    const postGrad = ctx.createLinearGradient(-13, 0, 13, 0);
    postGrad.addColorStop(0, '#0b0f14');
    postGrad.addColorStop(0.55, '#26313f');
    postGrad.addColorStop(1, '#0b0f14');
    ctx.fillStyle = postGrad;
    ctx.fillRect(-13, 0, 26, panelTop + 30);
    ctx.restore();
  }
  const ccx = width / 2;
  const ccy = panelTop - 8;
  ctx.fillStyle = '#1d2733';
  ctx.beginPath();
  ctx.arc(ccx, ccy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.lampAmber;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (plane) {
    const deg = headingDegrees(plane);
    ctx.save();
    ctx.beginPath(); ctx.arc(ccx, ccy, 15, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0d141c';
    ctx.fillRect(ccx - 15, ccy - 15, 30, 30);
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      const a = ((i * 90 - deg) * Math.PI) / 180;
      const lx = ccx + Math.sin(a) * 10.5;
      const ly = ccy - Math.cos(a) * 10.5 + 3.5;
      ctx.fillStyle = i === 0 ? PALETTE.lampRed : '#e8eef4';
      ctx.fillText('NESW'[i], lx, ly);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(220,240,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(ccx - 5, ccy - 7, 6, 3.4, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.lampAmber;
    ctx.beginPath();
    ctx.moveTo(ccx - 4, ccy - 24); ctx.lineTo(ccx + 4, ccy - 24); ctx.lineTo(ccx, ccy - 18);
    ctx.closePath();
    ctx.fill();
  }
}
