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
  // A low islet in the strait north-east of Home Isle, close enough
  // that the ferry road bridges to it: the archipelago's one bridge,
  // and the first landmark a Ring Run pilot passes on the course.
  { name: 'PILOT ISLET', x: 1250, z: 150, radius: 300, peak: 34, town: false },
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
  // Golden hour (v6): the whole chart is graded late-afternoon — a
  // deep blue zenith over a warm amber horizon, a low warm sun, and
  // every surface tone below warmed a step toward it, so the four
  // screenshots read as one hour of one day.
  skyTop: '#26457e',
  skyMid: '#7e9cc0',
  skyLow: '#f8c47c',
  sun: '#ffd9a3',
  sunCore: '#fff3da',
  sea: '#1a637f',
  seaDeep: '#0f435c',
  seaShallow: '#4599a4',
  // The de-boxed shore: the underwater shelf falls from a pale
  // turquoise lip through a mid shelf tone to the deep floor colour,
  // and the beach itself runs wet → dry with a soft foam edge.
  seaShelf: '#2f869e',
  seaFloor: '#145a76',
  sand: '#eecf92',
  sandDry: '#f4d99b',
  sandWet: '#d3af7d',
  foam: '#faf0da',
  grassLow: '#8ba85e',
  grassHigh: '#527a3e',
  scrub: '#648347',
  // The worked lowlands: crop tones a pilot reads as farmland from
  // pattern altitude — ripe wheat, young crop, deep pasture, fresh
  // plough and pale fallow — fenced by dark hedgerows and crossed by
  // sandy dirt tracks that ring the two big islands.
  cropWheat: '#c8ad55',
  cropYoung: '#7cab4a',
  cropDeep: '#4f7d38',
  cropPlough: '#8a6849',
  cropFallow: '#b5a26e',
  hedge: '#33512e',
  dirt: '#b3986a',
  // Distance haze: far ground, far sea and the horizon itself all
  // lean toward this one warm pale tone — golden-hour air is dusty,
  // not blue — so the world dissolves into the lit sky instead of
  // ending at a drawn line.
  haze: '#d8c39a',
  treeDark: '#2e5d33',
  treeLight: '#4c8148',
  // Broadleaf tones, taken from a real park tree's crown: a grey-brown
  // trunk, a deep shaded underside, a rich mid green for the body of
  // the canopy and a yellow-green cap where the sun lands.
  trunk: '#6d5942',
  trunkShade: '#463727',
  leafDark: '#27512a',
  leafMid: '#4b8a38',
  leafLit: '#93c248',
  leafBright: '#cfe06a',
  rock: '#96826d',
  rockDark: '#71604e',
  snow: '#fdf1dc',
  snowShade: '#e3cdb4',
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
