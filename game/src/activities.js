// Side activities outside the story: taxi fares (drive any Taxi Dorado to pick up waiting
// passengers and race them across the city against the meter for cash).
import { NODES_X, NODES_Y, SIDEWALK } from './config.js';
import { createPed } from './peds.js';
import { blockRect } from './world.js';
import { sfx } from './audio.js';
import { toast, bigMessage } from './state.js';
import { rng, dist2, formatMoney } from './mathutil.js';

function sidewalkSpotNear(x, y, minD, maxD) {
  for (let k = 0; k < 40; k++) {
    const bi = rng.int(0, NODES_X - 2), bj = rng.int(0, NODES_Y - 2);
    const b = blockRect(bi, bj);
    const side = rng.int(0, 3);
    const t = rng.range(0.25, 0.75);
    const p = side === 0 ? { x: b.x + b.w * t, y: b.y + SIDEWALK / 2 } : side === 1 ? { x: b.x + b.w - SIDEWALK / 2, y: b.y + b.h * t }
      : side === 2 ? { x: b.x + b.w * t, y: b.y + b.h - SIDEWALK / 2 } : { x: b.x + SIDEWALK / 2, y: b.y + b.h * t };
    const d2 = dist2(p.x, p.y, x, y);
    if (d2 > minD * minD && d2 < maxD * maxD) return p;
  }
  return null;
}

export function updateActivities(state, dt) {
  const pl = state.player;
  const v = pl.vehicle;
  const a = state.activity;
  state.stats.fares = state.stats.fares || 0;
  if (!v || v.type !== 'taxi' || state.mission || pl.dead) {
    if (a) cancelFare(state, a.phase === 'dropoff' ? 'The passenger got out' : null);
    return;
  }
  if (!a) {
    state.fareCd = (state.fareCd ?? 2) - dt;
    if (state.fareCd > 0) return;
    const spot = sidewalkSpotNear(v.x, v.y, 260, 700);
    if (!spot) return;
    const ped = createPed(spot.x, spot.y, 'civ', { persistent: true });
    ped.state = 'idle'; ped.idleT = 1e9; ped.fare = true;
    state.peds.push(ped);
    state.activity = { type: 'taxi', phase: 'pickup', ped, timer: null };
    toast(state, 'Taxi: a passenger is waiting — follow the marker', '#ffc93c', 3);
    return;
  }
  if (a.phase === 'pickup') {
    if (a.ped.state === 'dead' || !state.peds.includes(a.ped)) return cancelFare(state, 'The passenger is gone');
    a.ped.state = 'idle'; a.ped.idleT = 1e9;
    if (dist2(a.ped.x, a.ped.y, v.x, v.y) < 70 * 70 && Math.hypot(v.vx, v.vy) < 45) {
      state.peds = state.peds.filter((p) => p !== a.ped);
      const to = sidewalkSpotNear(v.x, v.y, 900, 2200) || sidewalkSpotNear(v.x, v.y, 400, 3000);
      const d = Math.hypot(to.x - v.x, to.y - v.y);
      Object.assign(a, { phase: 'dropoff', to, timer: d / 150 + 12, fare: Math.round(d / 9 + 25), look: a.ped.look });
      sfx.door();
      toast(state, `Fare accepted: ${formatMoney(a.fare)} — get there before the meter runs out`, '#ffc93c', 3);
    }
    return;
  }
  a.timer -= dt;
  if (a.timer <= 0) return cancelFare(state, 'Too slow! The passenger stormed out');
  if (dist2(a.to.x, a.to.y, v.x, v.y) < 80 * 80 && Math.hypot(v.vx, v.vy) < 45) {
    const tip = Math.round(a.timer * 3);
    state.cash += a.fare + tip;
    state.stats.fares++;
    const p = createPed(a.to.x, a.to.y, 'civ', { look: a.look });
    p.state = 'walk';
    state.peds.push(p);
    sfx.cash();
    bigMessage(state, 'FARE COMPLETE', `${formatMoney(a.fare)} + ${formatMoney(tip)} tip · fares today: ${state.stats.fares}`, '#ffc93c', 2.8);
    state.activity = null; state.fareCd = 3;
  }
}

function cancelFare(state, msg) {
  const a = state.activity;
  if (a && a.ped) { a.ped.persistent = false; a.ped.fare = false; a.ped.state = 'walk'; a.ped.idleT = 0; }
  if (msg) toast(state, msg, '#ff9a9a', 2.5);
  state.activity = null; state.fareCd = 4;
}

export function activityMarkers(state) {
  const a = state.activity;
  if (!a) return [];
  if (a.phase === 'pickup') return [{ x: a.ped.x, y: a.ped.y, color: '#ffc93c', icon: 'T', label: 'Passenger', r: 22, mission: true }];
  return [{ x: a.to.x, y: a.to.y, color: '#ffc93c', icon: 'T', label: 'Drop-off', r: 30, mission: true }];
}

// HUD panel data for the active side job.
export function activityPanel(state) {
  const a = state.activity;
  if (!a) return null;
  return {
    title: 'TAXI DORADO — FARES',
    objective: a.phase === 'pickup' ? 'Pick up the waiting passenger' : `Drive the passenger to the drop-off (${formatMoney(a.fare)})`,
    timer: a.phase === 'dropoff' ? a.timer : null,
  };
}
