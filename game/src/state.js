// The single shared game state object and its factory: player, entity lists, wanted level,
// story progress, properties, camera and transient UI messages.
import { START_CASH, START_HOUR, SECONDS_PER_HOUR } from './config.js';

export function createPlayer(x, y) {
  return {
    kind: 'player', x, y, a: -Math.PI / 2, vx: 0, vy: 0, r: 8, state: 'alive',
    look: { skin: '#c68642', shirt: '#ff4f7b', pants: '#1d3557', hair: '#2b1d0e', ponytail: true },
    health: 100, maxHealth: 100, armor: 0, maxArmor: 100,
    weapon: 'fist', weapons: { fist: true }, ammo: { pistol: 0, smg: 0, shotgun: 0 },
    vehicle: null, stamina: 1, attackCd: 0, swing: 0, walkPhase: 0, hurt: 0,
    enter: null, // { vehicle, timer } while jacking / entering
    aimX: x, aimY: y - 50, moving: false, dead: false,
  };
}

export function createGameState(world) {
  const sp = world.landmarks.safehouse;
  return {
    mode: 'title', world,
    time: 0, clock: START_HOUR * SECONDS_PER_HOUR, // in-game seconds; hour = clock / SECONDS_PER_HOUR
    player: createPlayer(sp.x + 30, sp.y),
    vehicles: [], peds: [], tracers: [], particles: [], skids: [], decals: [], pickups: [],
    heli: null,
    wanted: { level: 0, heat: 0, unseen: 0, seen: false, lastX: 0, lastY: 0, roadblockCd: 8, flash: 0, units: 0, evaded: 0, bust: 0 },
    cash: START_CASH,
    story: { next: 0, completed: [], introSeen: false },
    mission: null,
    properties: { penthouse: false, garage: false, club: false },
    stats: { kills: 0, carsStolen: 0, distance: 0, busted: 0, wasted: 0, maxWanted: 0, playTime: 0 },
    camera: { x: sp.x, y: sp.y, zoom: 1, shake: 0, targetZoom: 1 },
    toasts: [], bigText: null, subtitle: null, districtToast: null, lastDistrict: null,
    respawnTimer: 0, deathKind: null,
    trafficCd: 0, pedCd: 0, clubIncomeHour: Math.floor(START_HOUR),
    radio: 0,
    menuStack: [],
    debug: false,
  };
}

export function gameHour(state) {
  return (state.clock / SECONDS_PER_HOUR) % 24;
}

// Small transient line in the top-right stack. Doubling the same line refreshes it instead
// of stacking two identical toasts, which keeps a busy chase from flooding the corner.
export function toast(state, text, color = '#fff', life = 3.2) {
  const same = state.toasts.find((t) => t.text === text);
  if (same) { same.life = Math.max(same.life, life); same.max = Math.max(same.max, life); return; }
  state.toasts.push({ text, color, life, max: life });
  if (state.toasts.length > 5) state.toasts.shift();
}

export function bigMessage(state, title, sub = '', color = '#ffc93c', life = 3.5) {
  state.bigText = { title, sub, color, life, max: life };
}
