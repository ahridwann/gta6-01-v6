// Vanta City: Night Runner — shared constants. Everything the game, the HUD and
// the staged screenshots agree on lives here: districts, missions, crew, weapons,
// ranks, the golden-hour palette. No network, no imports.
export const SAVE_KEY = 'vanta-city-save-v1';

// The city is a 760 x 760 square centred on (0, 0). Roads run every 80 units;
// blocks between them hold buildings, palms, stalls and props.
export const CITY_HALF = 380;
export const ROAD_STEP = 80;
export const ROAD_HALF = 11;

// Golden hour: the sun sits low in the west, the sky runs orange -> pink -> violet.
export const GOLDEN = {
  skyTop: 0x8f5aa8,
  skyMid: 0xff9a5c,
  skyLow: 0xffc46b,
  sun: 0xffd27a,
  sunDir: [-0.55, 0.38, 0.42],
  fog: 0xf7a56e,
  hemiSky: 0xffb37a,
  hemiGround: 0x5c3a52,
  ambient: 0xffe0b8,
};

export const DISTRICTS = [
  { id: 'downtown', name: 'DOWNTOWN', label: 'Downtown Core', cx: 0, cz: 0, r: 130, standing: 58, mood: 'NEUTRAL', tint: 0x8f7fb8, tall: true },
  { id: 'harbor', name: 'HARBOR DOCKS', label: 'Harbor Docks', cx: 260, cz: -40, r: 130, standing: 62, mood: 'NEUTRAL', tint: 0x7fa8b8, tall: false },
  { id: 'oldtown', name: 'OLD TOWN', label: 'Old Town Market', cx: -260, cz: 40, r: 130, standing: 71, mood: 'FRIENDLY', tint: 0xd8a06a, tall: false },
  { id: 'beach', name: 'BEACH STRIP', label: 'Beach Strip', cx: 0, cz: 280, r: 130, standing: 64, mood: 'NEUTRAL', tint: 0xf2c078, tall: false },
  { id: 'casino', name: 'CASINO STRIP', label: 'Casino Strip', cx: -40, cz: -270, r: 130, standing: 47, mood: 'WARY', tint: 0xc86ab8, tall: true },
];

export const CREW = [
  { key: 'Z', name: 'Mira', role: 'Driver', ability: 'Swap Plates', desc: 'Drops 1 wanted star', color: '#ff5c8a', cd: 25 },
  { key: 'X', name: 'Lio', role: 'Mechanic', ability: 'Quick Fix', desc: 'Repairs car to 100%', color: '#ffb03a', cd: 30 },
  { key: 'C', name: 'Kiki', role: 'Lookout', ability: 'Eyes Out', desc: 'Marks police on the map', color: '#4dd8c8', cd: 20 },
];

export const WEAPONS = [
  { slot: 1, name: 'FISTS', ammo: Infinity, icon: '✊' },
  { slot: 2, name: 'BAT', ammo: Infinity, icon: '🏏' },
  { slot: 3, name: 'P9', ammo: 84, icon: '🔫' },
  { slot: 4, name: 'MAKO SMG', ammo: 208, icon: '🔫' },
  { slot: 5, name: 'GATOR AR', ammo: 0, icon: '🔒', locked: true },
  { slot: 6, name: 'RPG', ammo: 0, icon: '🔒', locked: true },
  { slot: 7, name: 'SNIPER', ammo: 0, icon: '🔒', locked: true },
];

export const RANKS = [
  { at: 0, name: 'STREET ROOKIE' },
  { at: 150, name: 'WHEELMAN' },
  { at: 400, name: 'DOCK HAND' },
  { at: 800, name: 'FIXER' },
  { at: 1400, name: 'NIGHT RUNNER' },
  { at: 2200, name: 'NIGHT KINGPIN' },
];

export const MISSIONS = [
  {
    id: 'm1', n: 1, title: 'FIRST DROP', pay: 250, fixer: 'Silas Kane',
    brief: 'Silas needs a package across town before the docks close. No questions, no stops.',
    stages: [
      { type: 'goto', label: 'Pick up the package', x: -160, z: 120, r: 14 },
      { type: 'goto', label: 'Deliver to the Harbor office', x: 240, z: -80, r: 14 },
    ],
  },
  {
    id: 'm2', n: 2, title: 'HEAT WAVE', pay: 400, fixer: 'Silas Kane',
    brief: 'The precinct is sweeping Downtown. Stay moving, stay alive for sixty seconds.',
    stages: [
      { type: 'survive', label: 'Survive the sweep', seconds: 60, wanted: 3 },
    ],
  },
  {
    id: 'm3', n: 3, title: 'THE ARMORED HAUL', pay: 650, fixer: 'Silas Kane',
    brief: 'An armored van is rolling to the Harbor. Take it, then bring it home in one piece.',
    stages: [
      { type: 'goto', label: 'Intercept the armored van', x: 80, z: -160, r: 16 },
      { type: 'goto', label: 'Bring the van to the Harbor yard', x: 280, z: 40, r: 16 },
    ],
  },
  {
    id: 'm4', n: 4, title: 'MIDNIGHT GRAND PRIX', pay: 850, fixer: 'Silas Kane',
    brief: 'Four gates, one sunset, no rules. Beat the pack through the Casino Strip.',
    stages: [
      { type: 'goto', label: 'Gate 1 — Casino Strip', x: -120, z: -280, r: 12 },
      { type: 'goto', label: 'Gate 2 — Downtown', x: 40, z: -40, r: 12 },
      { type: 'goto', label: 'Gate 3 — Old Town', x: -240, z: 120, r: 12 },
      { type: 'goto', label: 'Finish — Beach Strip', x: 80, z: 300, r: 12 },
    ],
  },
  {
    id: 'm5', n: 5, title: 'THE ESCORT', pay: 1200, fixer: 'Silas Kane',
    brief: 'A witness needs a quiet ride to the Meridian. Nobody follows. Nobody talks.',
    stages: [
      { type: 'goto', label: 'Pick up the witness', x: -200, z: -200, r: 14 },
      { type: 'goto', label: 'Deliver to the Meridian Hotel', x: -80, z: -240, r: 14 },
    ],
  },
  {
    id: 'm6', n: 6, title: 'THE VAULT', pay: 1800, fixer: 'Silas Kane',
    brief: 'The Meridian vault. Crack it, grab the take, and outrun the whole city at five stars.',
    stages: [
      { type: 'goto', label: 'Reach the Meridian Bank', x: 0, z: -80, r: 14 },
      { type: 'hold', label: 'Crack the vault', seconds: 8, x: 0, z: -80, r: 18 },
      { type: 'goto', label: 'Escape to the Beach Strip', x: 120, z: 300, r: 16, wanted: 5 },
    ],
  },
];

export const CHIP_SPOTS = [
  [-240, -240], [-160, 200], [240, 200], [280, -200], [0, -320], [-320, 0],
  [120, 120], [-80, 280], [320, 80], [-280, -120], [200, -280], [40, 200],
];

export const JUMP_SPOTS = [
  { x: 160, z: 200, dir: 0, label: 'Dune Ramp' },
  { x: -160, z: -160, dir: 1, label: 'Dock Leap' },
  { x: 0, z: -240, dir: 2, label: 'Casino Flyer' },
];

export const RADIO = [
  'VANTA FM 98.6 · Golden Hour Mix',
  'RADIO MANGO 101.2 · Sunset Drive',
  'NEON TIDE 104.4 · Coastal Bass',
];

export const CARS = [
  { name: 'Calyx Sprint GT', color: 0xff7a1a },
  { name: 'Vireo GT', color: 0x2ec4b6 },
  { name: 'Marlin Coupe', color: 0xe63946 },
  { name: 'Dune Runner', color: 0xffd166 },
  { name: 'Harbor Van', color: 0x8d99ae },
];

export const UNIT_NAMES = ['CORAL', 'MARLIN', 'KITE', 'TARPON', 'BULWARK', 'REEF', 'PIER', 'TIDE'];
export const UNIT_ROLES = ['RAMMING', 'FLANKING', 'CLOSING IN', 'ROADBLOCK', 'FIRING', 'SPOTLIGHT'];

export function rankFor(respect) {
  let cur = RANKS[0];
  let next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (respect >= RANKS[i].at) cur = RANKS[i];
    else { next = RANKS[i]; break; }
  }
  return { cur, next };
}

export function districtAt(x, z) {
  let best = DISTRICTS[0];
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = (x - d.cx) ** 2 + (z - d.cz) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}
