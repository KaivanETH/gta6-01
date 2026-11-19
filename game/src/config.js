// Bahía Dorada — tuning tables only: city grid geometry, districts, vehicle handling,
// weapons, wanted-level response, day cycle timing and the sunny colour palette.

export const GAME_TITLE = 'BAHÍA DORADA';
export const GAME_SUBTITLE = 'Sol, Sal y Sangre';
export const SAVE_KEY = 'bahia_dorada_save_v1';
export const OPTIONS_KEY = 'bahia_dorada_options_v1';

// ---- City grid -------------------------------------------------------------
export const BLOCK = 400;          // distance between intersection centres (px)
export const NODES_X = 12;         // intersections west→east
export const NODES_Y = 12;         // intersections north→south
export const MARGIN = 240;         // land border around the grid
export const ROAD_HALF = 46;       // half the asphalt width
export const LANE_OFFSET = 22;     // lane centre distance from the road centre line
export const SIDEWALK = 24;        // sidewalk band width
export const BEACH_WIDTH = 300;    // sand between the coastal avenue and the sea
export const OCEAN_WIDTH = 640;
export const HARBOR_DEPTH = 640;

export const nodeX = (i) => MARGIN + i * BLOCK;
export const nodeY = (j) => MARGIN + j * BLOCK;

export const COAST_X = nodeX(NODES_X - 1) + ROAD_HALF + SIDEWALK + BEACH_WIDTH;
export const HARBOR_Y = nodeY(NODES_Y - 1) + ROAD_HALF + SIDEWALK + 140;
export const HARBOR_X = nodeX(6) - 80;
export const WORLD_W = COAST_X + OCEAN_WIDTH;
export const WORLD_H = HARBOR_Y + HARBOR_DEPTH;

// Districts: id → display name, ground tone and building style.
export const DISTRICTS = {
  centro:  { name: 'Centro Dorado',  tag: 'Downtown',        ground: '#c9c2b4', style: 'tower' },
  playa:   { name: 'Playa Coral',    tag: 'Beach Strip',     ground: '#e9dcb8', style: 'hotel' },
  muelles: { name: 'Los Muelles',    tag: 'Industrial Docks', ground: '#9a9a92', style: 'warehouse' },
  lomas:   { name: 'Las Lomas',      tag: 'Suburbs',         ground: '#8fbf6a', style: 'house' },
  rosa:    { name: 'Barrio Rosa',    tag: 'Old Town',        ground: '#d8b9a6', style: 'shop' },
  parque:  { name: 'Parque Flamenco', tag: 'City Park',      ground: '#7dbb5c', style: 'park' },
};

// Street names (avenidas run north–south, calles run east–west).
export const AVENUE_NAMES = [
  'Av. Los Pinos', 'Av. Jacaranda', 'Av. Brisa', 'Av. Coral Gables', 'Av. Mercado',
  'Av. Libertad', 'Av. Sol Naciente', 'Av. Palmeras', 'Av. Faro', 'Av. Marea', 'Av. Arena', 'Paseo del Mar',
];
export const STREET_NAMES = [
  'Calle Norte', 'Calle Azul', 'Calle Mango', 'Calle Vidrio', 'Calle Esperanza', 'Calle Flamenco',
  'Calle Rosa', 'Calle Cumbia', 'Calle Ancla', 'Calle Grúa', 'Calle Sal', 'Calle del Puerto',
];

// ---- Vehicles ----------------------------------------------------------------
// maxSpeed/accel in px/s (10 px ≈ 1 m), grip = lateral velocity damping, steer = rad/s.
export const VEHICLE_TYPES = {
  sedan:   { name: 'Vela Sedan',      len: 46, wid: 22, maxSpeed: 330, accel: 250, brake: 520, grip: 7.5, steer: 2.7, mass: 1.0, health: 100, colors: ['#3a6ea5', '#c8c8c8', '#8b2e2e', '#2f5d50', '#e0d6c2', '#5a4a7a'] },
  sports:  { name: 'Rayo GT',         len: 48, wid: 22, maxSpeed: 480, accel: 430, brake: 640, grip: 9.0, steer: 3.0, mass: 0.9, health: 90,  colors: ['#e63946', '#ff9f1c', '#2ec4b6', '#f1fa3c', '#111111', '#ff5fa2'] },
  taxi:    { name: 'Taxi Dorado',     len: 46, wid: 22, maxSpeed: 320, accel: 240, brake: 500, grip: 7.2, steer: 2.6, mass: 1.0, health: 100, colors: ['#ffc93c'] },
  pickup:  { name: 'Mula Pickup',     len: 52, wid: 25, maxSpeed: 300, accel: 220, brake: 460, grip: 6.0, steer: 2.2, mass: 1.5, health: 140, colors: ['#6b8f3c', '#a35d2e', '#d9d9d9', '#344e7a'] },
  police:  { name: 'Patrulla',        len: 48, wid: 22, maxSpeed: 440, accel: 370, brake: 600, grip: 8.6, steer: 2.9, mass: 1.2, health: 160, colors: ['#f4f4f4'] },
  van:     { name: 'Furgón Cargo',    len: 58, wid: 27, maxSpeed: 270, accel: 180, brake: 420, grip: 5.5, steer: 2.0, mass: 1.8, health: 170, colors: ['#e8e8e8', '#7a7f87', '#2b2b2b'] },
  muscle:  { name: 'Toro Muscle',     len: 50, wid: 23, maxSpeed: 430, accel: 400, brake: 520, grip: 6.4, steer: 2.6, mass: 1.2, health: 120, colors: ['#1d1d1d', '#7b1fa2', '#0d47a1', '#b71c1c'] },
};
export const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'pickup', 'sports', 'van', 'muscle', 'sedan'];

// ---- Weapons ----------------------------------------------------------------
export const WEAPONS = {
  fist:    { name: 'Fists',    melee: true,  damage: 14, range: 26, cooldown: 0.38, price: 0 },
  knife:   { name: 'Navaja',   melee: true,  damage: 38, range: 30, cooldown: 0.42, price: 150 },
  pistol:  { name: 'Pistola 9', melee: false, damage: 34, range: 520, cooldown: 0.26, spread: 0.035, pellets: 1, price: 600, ammoPrice: 60, ammoPack: 24 },
  smg:     { name: 'Ráfaga SMG', melee: false, damage: 16, range: 460, cooldown: 0.075, spread: 0.09, pellets: 1, price: 2200, ammoPrice: 120, ammoPack: 90 },
  shotgun: { name: 'Escopeta', melee: false, damage: 15, range: 300, cooldown: 0.8, spread: 0.22, pellets: 7, price: 3000, ammoPrice: 100, ammoPack: 16 },
};
export const WEAPON_ORDER = ['fist', 'knife', 'pistol', 'smg', 'shotgun'];

// ---- Wanted level ----------------------------------------------------------------
export const WANTED_THRESHOLDS = [0, 1, 70, 170, 330, 540]; // heat needed for 0..5 stars
export const COPS_PER_LEVEL = [0, 1, 2, 4, 6, 8];
// One row per star (index 0 unused): how many cruisers a spawn roll sends, how often that
// roll happens per second, the ring they arrive on around the player, their cruise speed,
// how far ahead of the player they aim a ram, and seconds between roadblocks (0 = none).
export const PURSUIT = [
  { roll: 0,    send: 0, ring: [800, 1250], speed: 0,   lead: 0,    roadblock: 0 },
  { roll: 0.55, send: 1, ring: [780, 1200], speed: 320, lead: 0.20, roadblock: 0 },
  { roll: 0.95, send: 1, ring: [740, 1150], speed: 368, lead: 0.30, roadblock: 0 },
  { roll: 1.55, send: 2, ring: [600, 960], speed: 412, lead: 0.40, roadblock: 22 },
  { roll: 2.20, send: 2, ring: [560, 900], speed: 444, lead: 0.48, roadblock: 16 },
  { roll: 3.00, send: 3, ring: [540, 900],  speed: 474, lead: 0.55, roadblock: 9 },
];
export const COP_SIGHT = 560;
export const COP_CATCHUP = 150;      // extra closing speed for a cruiser that has fallen far behind
export const EVADE_BASE = 7;        // seconds unseen before a star drops
export const EVADE_PER_STAR = 1.6;
export const BUST_CAR_TIME = 2.3;   // seconds pinned in a car before BUSTED
export const BUST_FOOT_TIME = 1.5;  // ... and on foot
export const BUST_LOW_STAR_GRACE = 0.45; // extra seconds per missing star, so 1 star is forgiving
export const CRIME_HEAT = {
  jack: 45, hitPed: 30, killPed: 60, gunfire: 25, hitCop: 90, killCop: 180, wreckCop: 140, blowCar: 70,
};

// ---- Time of day -----------------------------------------------------------------
export const SECONDS_PER_HOUR = 30;  // a full day is 12 real minutes
export const START_HOUR = 10.5;

// ---- Street life ----------------------------------------------------------------
// Target crowd sizes around the player; the city fills toward these and thins at night.
export const TRAFFIC_TARGET = { night: 34, commute: 118, evening: 96 };
export const PED_TARGET = { night: 56, day: 140 };
export const COP_EXTRA_FILL = 2;     // cruisers added straight away when a chase begins


// ---- Economy ---------------------------------------------------------------------
export const START_CASH = 350;
export const BUST_CASH_LOSS = 0.15;
export const WASTED_CASH_LOSS = 0.1;

// ---- Palette ------------------------------------------------------------------------
export const PALETTE = {
  asphalt: '#4a4a52', asphaltDark: '#3c3c44', laneLine: '#f2f2f2', laneYellow: '#f7c948',
  sidewalk: '#cfc7ba', curb: '#e8e2d6', sand: '#ecd9a6', sandWet: '#d9c08a',
  sea: '#1fa3c4', seaDeep: '#137d9e', foam: '#e9fbff', grass: '#7cbc58', grassDark: '#5e9e44',
  shadow: 'rgba(20,10,40,0.28)', sunsetTint: '#ff7a3d', nightTint: '#0b1030',
  ui: '#ffffff', uiAccent: '#ff4f7b', uiGold: '#ffc93c', uiTeal: '#2ec4b6', money: '#7ddc6a',
};
