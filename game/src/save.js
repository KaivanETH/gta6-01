// Save/load to localStorage: progress, cash, weapons, properties, stats, time of day,
// player position (and current car), collected Golden Shells, plus persisted options.
import { SAVE_KEY, OPTIONS_KEY } from './config.js';
import { createVehicle } from './vehicles.js';
import { applyPropertyPerks } from './economy.js';
import { toast } from './state.js';

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function hasSave() {
  const s = storage();
  return !!(s && s.getItem(SAVE_KEY));
}

export function saveSummary() {
  const s = storage();
  if (!s) return null;
  try {
    const d = JSON.parse(s.getItem(SAVE_KEY));
    return d ? `Story ${d.story.completed.length}/7 · $${Math.floor(d.cash).toLocaleString('en-US')} · ${new Date(d.savedAt).toLocaleString()}` : null;
  } catch { return null; }
}

export function saveGame(state, silent = false) {
  const s = storage();
  if (!s) return false;
  const pl = state.player;
  const v = pl.vehicle;
  const data = {
    v: 1, savedAt: Date.now(),
    cash: state.cash, clock: state.clock, radio: state.radio,
    story: state.story, properties: state.properties, stats: state.stats,
    player: { x: pl.x, y: pl.y, health: pl.health, armor: pl.armor, weapon: pl.weapon, weapons: pl.weapons, ammo: pl.ammo },
    vehicle: v ? { type: v.type, color: v.color, x: v.x, y: v.y, a: v.a, health: v.health } : null,
    shells: (state.shells || []).filter((q) => q.taken).map((q) => q.id),
  };
  try { s.setItem(SAVE_KEY, JSON.stringify(data)); } catch { return false; }
  if (!silent) toast(state, 'Game saved', '#7ddc6a', 2);
  return true;
}

export function loadGame(state) {
  const s = storage();
  if (!s) return false;
  let d;
  try { d = JSON.parse(s.getItem(SAVE_KEY)); } catch { return false; }
  if (!d) return false;
  state.cash = d.cash; state.clock = d.clock; state.radio = d.radio || 0;
  state.story = { ...d.story, introSeen: true };
  state.properties = d.properties; state.stats = { ...state.stats, ...d.stats };
  const pl = state.player;
  Object.assign(pl, { x: d.player.x, y: d.player.y, health: d.player.health, armor: d.player.armor, weapon: d.player.weapon, weapons: d.player.weapons, ammo: d.player.ammo, dead: false, vehicle: null, enter: null });
  applyPropertyPerks(state);
  if (d.vehicle) {
    const v = createVehicle(d.vehicle.type, d.vehicle.x, d.vehicle.y, d.vehicle.a, { role: 'player', color: d.vehicle.color, driver: 'player' });
    v.health = d.vehicle.health;
    state.vehicles.push(v);
    pl.vehicle = v;
  }
  state.shellsTaken = d.shells || [];
  if (state.shells) for (const q of state.shells) q.taken = state.shellsTaken.includes(q.id);
  state.camera.x = pl.x; state.camera.y = pl.y;
  return true;
}

export function loadOptions() {
  const s = storage();
  const def = { volume: 0.8, music: true, showFps: false, shake: true };
  if (!s) return def;
  try { return { ...def, ...JSON.parse(s.getItem(OPTIONS_KEY) || '{}') }; } catch { return def; }
}

export function saveOptions(opts) {
  const s = storage();
  if (s) try { s.setItem(OPTIONS_KEY, JSON.stringify(opts)); } catch { /* storage full or blocked */ }
}
