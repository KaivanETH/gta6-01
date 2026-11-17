// Progression and economy: the gun shop, the Casa Brisa safehouse (save/rest), the respray
// garage, and three purchasable properties with perks (penthouse, garage share, nightclub).
import { WEAPONS } from './config.js';
import { dist2, formatMoney } from './mathutil.js';
import { toast, bigMessage, gameHour } from './state.js';
import { sfx } from './audio.js';
import { clearPolice } from './police.js';
import { VEHICLE_TYPES } from './config.js';
import { rng } from './mathutil.js';

export const PROPERTIES = {
  penthouse: { name: 'Torre Brisa Penthouse', landmark: 'penthouse', price: 4000, perk: 'Rest heals fully and grants +50 armor; max armor 150' },
  garage:    { name: 'Garaje Solera (partner)', landmark: 'garage', price: 6000, perk: 'Free repairs & resprays at the garage' },
  club:      { name: 'Club Marea', landmark: 'club', price: 12000, perk: '+$300 income every in-game hour' },
};

export function economyMarkers(state) {
  const L = state.world.landmarks;
  const out = [
    { ...L.safehouse, color: '#7ddc6a', icon: 'H', label: 'Casa Brisa — Safehouse', kind: 'safehouse', r: 20 },
    { ...L.gunshop, color: '#ff6b6b', icon: 'G', label: 'Armería La Palma', kind: 'gunshop', r: 20 },
    { ...L.garage, color: '#3a86ff', icon: 'W', label: 'Garaje Solera — Respray', kind: 'garage', r: 34 },
  ];
  for (const [id, p] of Object.entries(PROPERTIES)) {
    if (id === 'garage') continue;
    const owned = state.properties[id];
    out.push({ ...L[p.landmark], color: owned ? '#b37dff' : '#ffc93c', icon: owned ? '⌂' : '$', label: owned ? p.name : `${p.name} — FOR SALE ${formatMoney(p.price)}`, kind: 'property', prop: id, r: 20 });
  }
  return out;
}

// Returns the marker the player stands in (on foot), if any.
export function interactableAt(state) {
  const pl = state.player;
  if (pl.vehicle) return null;
  for (const m of state.markers || []) {
    if (!m.kind || m.kind === 'garage') continue;
    if (dist2(m.x, m.y, pl.x, pl.y) < (m.r + 8) ** 2) return m;
  }
  return null;
}

export function shopItems(state) {
  const pl = state.player;
  const items = [];
  for (const id of ['knife', 'pistol', 'smg', 'shotgun']) {
    const w = WEAPONS[id];
    if (!pl.weapons[id]) items.push({ label: `Buy ${w.name}`, right: formatMoney(w.price), price: w.price, action: () => { pl.weapons[id] = true; pl.weapon = id; if (w.ammoPack) pl.ammo[id] = (pl.ammo[id] || 0) + w.ammoPack; } });
    else if (w.ammoPack) items.push({ label: `${w.name} ammo ×${w.ammoPack}`, right: formatMoney(w.ammoPrice), price: w.ammoPrice, sub: `owned: ${pl.ammo[id] || 0}`, action: () => { pl.ammo[id] = (pl.ammo[id] || 0) + w.ammoPack; } });
  }
  items.push({ label: 'Body Armor', right: formatMoney(400), price: 400, sub: `${Math.round(pl.armor)}/${pl.maxArmor}`, action: () => { pl.armor = pl.maxArmor; } });
  items.push({ label: 'First-aid Kit', right: formatMoney(150), price: 150, sub: `${Math.round(pl.health)}/${pl.maxHealth}`, action: () => { pl.health = pl.maxHealth; } });
  return items.map((it) => ({ ...it, disabled: state.cash < it.price, run: () => buy(state, it) }));
}

function buy(state, it) {
  if (state.cash < it.price) { sfx.fail(); toast(state, 'Not enough cash', '#ff6b6b'); return; }
  state.cash -= it.price;
  it.action();
  sfx.cash();
  toast(state, 'Purchased: ' + it.label.replace('Buy ', ''), '#7ddc6a', 1.8);
}

export function buyProperty(state, id) {
  const p = PROPERTIES[id];
  if (state.properties[id]) return;
  if (state.cash < p.price) { sfx.fail(); toast(state, `You need ${formatMoney(p.price)}`, '#ff6b6b'); return; }
  state.cash -= p.price;
  state.properties[id] = true;
  applyPropertyPerks(state);
  sfx.pass();
  bigMessage(state, 'PROPERTY ACQUIRED', p.name, '#b37dff', 4);
  if (state.onAutosave) state.onAutosave();
}

export function applyPropertyPerks(state) {
  state.player.maxArmor = state.properties.penthouse ? 150 : 100;
}

export function restAtSafehouse(state) {
  const pl = state.player;
  pl.health = pl.maxHealth;
  if (state.properties.penthouse) pl.armor = Math.min(pl.maxArmor, pl.armor + 50);
  const h = gameHour(state);
  const target = h >= 6 && h < 17 ? 19 : 9;
  const add = ((target - h + 24) % 24) * 20;
  state.clock += add;
  toast(state, `You rested until ${target}:00`, '#7ddc6a', 2.5);
}

export function updateEconomy(state, dt) {
  // nightclub income
  const hour = Math.floor(state.clock / 20);
  if (hour !== state.clubIncomeHour) {
    state.clubIncomeHour = hour;
    if (state.properties.club) { state.cash += 300; toast(state, 'Club Marea income +$300', '#b37dff', 2); }
  }
  // garage respray when driving in
  const pl = state.player;
  state.garageCd = Math.max(0, (state.garageCd || 0) - dt);
  if (pl.vehicle && state.garageCd <= 0) {
    const g = state.world.landmarks.garage;
    const v = pl.vehicle;
    if (dist2(g.x, g.y, v.x, v.y) < 40 * 40 && Math.hypot(v.vx, v.vy) < 80 && !v.missionTag) {
      state.garageCd = 8;
      const cost = state.properties.garage ? 0 : 250;
      if (state.cash < cost) { toast(state, 'Respray costs $250', '#ff6b6b'); return; }
      state.cash -= cost;
      v.health = v.maxHealth; v.onFire = false;
      v.color = rng.pick(VEHICLE_TYPES[v.type].colors.concat(['#ff4f7b', '#2ec4b6', '#ffffff']));
      const had = state.wanted.level > 0;
      if (state.wanted.level <= 3) clearPolice(state);
      sfx.cash();
      bigMessage(state, 'FRESH PAINT', cost ? `Repaired & resprayed −$${cost}${had ? ' · heat cleared' : ''}` : `On the house, partner${had ? ' · heat cleared' : ''}`, '#3a86ff', 3);
    }
  }
}
