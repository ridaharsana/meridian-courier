// config.js — Meridian Courier: every named place, tuning constant and colour
// of the Skyferry Archipelago lives here, so the rest of the game reads like a
// chart of the islands it flies over.

export const WORLD = {
  seaLevel: 0,
  viewDistance: 5200,
  terrainStep: 130,
  terrainRadius: 3300,
  gravity: 9.8,
  dayName: 'MERIDIAN COURIER',
  daySub: 'Skyferry Archipelago — est. 1962',
};

// The archipelago: x east, z south, heights in metres. Each island carries a
// gaussian peak; runways sit on flattened plateaus carved by terrain.js.
export const ISLANDS = [
  { name: 'MERIDIAN HOME ISLE', x: 0, z: 1700, radius: 980, peak: 150, town: false },
  { name: 'CORAL CAY', x: -2300, z: 500, radius: 620, peak: 84, town: false },
  { name: 'MOUNT VELA', x: 1900, z: -700, radius: 860, peak: 430, town: false },
  { name: 'PORTO LUME', x: 2500, z: 2300, radius: 780, peak: 118, town: true },
  { name: 'GULL ROCK', x: -1700, z: -1900, radius: 470, peak: 66, town: false },
  { name: 'FARREL SHOAL', x: 700, z: -2700, radius: 560, peak: 74, town: false },
];

// Runway plateaus: centre, heading of the strip (degrees, direction of travel
// on final), length and the flat altitude the terrain is carved to.
export const RUNWAYS = [
  { id: 'HOME', name: 'MERIDIAN FIELD 09', x: 0, z: 1700, heading: 90, length: 760, width: 46, altitude: 24 },
  { id: 'LUME', name: 'PORTO LUME STRIP 36', x: 2500, z: 2300, heading: 0, length: 640, width: 40, altitude: 20 },
];

export const AIRCRAFT = {
  name: 'SKYFERRY SF-2 "PETREL"',
  maxSpeed: 92,          // m/s at full throttle, level
  minSpeed: 14,
  stallSpeed: 24,        // below this the nose drops and the wing complains
  throttleRate: 0.55,    // per second
  pitchRate: 0.85,       // rad/s at full stick
  rollRate: 1.9,
  yawRate: 0.35,
  fuelCapacity: 100,
  fuelBurnFull: 1.55,    // units per second at full throttle
  startFuel: 100,
};

export const PALETTE = {
  skyTop: '#1f5fa8',
  skyMid: '#6ea9dc',
  skyLow: '#f2e3ba',
  sun: '#fff3c4',
  sunCore: '#fffbe8',
  sea: '#1d6f8e',
  seaDeep: '#124e6a',
  seaShallow: '#3a97a8',
  sand: '#e6d194',
  sandWet: '#cbb37e',
  grassLow: '#79a95c',
  grassHigh: '#4d7d43',
  treeDark: '#2e5d33',
  treeLight: '#4c8148',
  rock: '#8d8578',
  rockDark: '#6d675c',
  snow: '#f4f7f5',
  snowShade: '#cfdde8',
  runway: '#4a4d52',
  runwayLine: '#f5f2e6',
  townWall: '#e8dcc3',
  townRoof: '#b5542f',
  ring: '#ffb62e',
  ringNext: '#3dff7a',
  panel: '#10151c',
  panelEdge: '#2c3947',
  lampGreen: '#51ff8a',
  lampAmber: '#ffb62e',
  lampRed: '#ff5147',
  ink: '#eef4f8',
};

export const CONTROLS_TEXT = [
  'W / S or ↑ ↓ — throttle & pitch (stick: arrows or mouse drag)',
  '← → or A / D — bank and turn · Q / E — rudder',
  'G — landing gear · B — wheel brakes · C — chase / cockpit camera',
  'M — next mission · Enter — start / restart · P — pause',
];
