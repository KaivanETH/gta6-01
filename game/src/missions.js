// Mission runtime: starts missions at their giver's marker, runs each step type from story.js
// (dialog, goto, steal/deliver, chase, pickup, lose-wanted, stakeout, tail, eliminate), keeps
// timers and objective text for the HUD, spawns/cleans mission actors, and pays rewards.
import { MISSIONS, CAST, CREDITS } from './story.js';
import { rng, dist2, clamp } from './mathutil.js';
import { lotRect } from './world.js';
import { lineOfSight, solidAt } from './world.js';
import { nearestNode, neighbors, laneSegment, nextNodeToward, nodePos } from './roads.js';
import { createVehicle } from './vehicles.js';
import { createPed, randomLook } from './peds.js';
import { setWantedLevel } from './police.js';
import { makeTrafficCar } from './traffic.js';
import { toast, bigMessage } from './state.js';
import { wasPressed } from './input.js';
import { sfx } from './audio.js';
import { formatMoney } from './mathutil.js';
import { alertGang } from './combat.js';

export function resolvePos(state, at) {
  if (!at) return null;
  if (typeof at === 'string') {
    if (at[0] === '@') {
      const m = state.mission;
      const tag = at.slice(1);
      if (m && m.tagPos[tag]) return m.tagPos[tag];
      const e = m && m.tags[tag];
      return e ? { x: e.x, y: e.y } : null;
    }
    return state.world.landmarks[at];
  }
  if (at.block) {
    const L = lotRect(at.block[0], at.block[1]);
    return { x: L.x + L.w / 2 + (at.dx || 0), y: L.y + L.h / 2 + (at.dy || 0) };
  }
  return at;
}

function playerXY(state) {
  const pl = state.player;
  return pl.vehicle ? pl.vehicle : pl;
}

function spawnOnLaneNear(state, x, y, type, opts) {
  const n = nearestNode(x, y);
  const ns = neighbors(n);
  const b = ns[rng.int(0, ns.length - 1)];
  const v = makeTrafficCar(state, n, b, 0.35, type);
  Object.assign(v, { role: 'mission', missionTag: opts.tag });
  if (opts.color) v.color = opts.color;
  if (opts.driver) v.driver = opts.driver;
  v.health = v.maxHealth = v.spec.health * (opts.tough || 1);
  // clear any car in the way
  state.vehicles = state.vehicles.filter((o) => o.missionTag || o.driver === 'player' || dist2(o.x, o.y, v.x, v.y) > 60 * 60);
  state.vehicles.push(v);
  return v;
}

// ---------------------------------------------------------------------------------------------
const STEPS = {
  dialog: {
    start(state, m, st) { state.subtitle = { lines: st.lines, i: 0, t: 0 }; },
    update(state, m, st, dt) {
      const s = state.subtitle;
      if (!s) return 'done';
      s.t += dt;
      if (s.t > 3.9 || wasPressed('Enter') || wasPressed('NumpadEnter')) { s.i++; s.t = 0; }
      if (s.i >= s.lines.length) { state.subtitle = null; return 'done'; }
    },
  },
  goto: {
    start(state, m, st) { m.objective = st.text; },
    update(state, m, st) {
      const p = resolvePos(state, st.at), me = playerXY(state);
      if (dist2(p.x, p.y, me.x, me.y) < st.r * st.r) return 'done';
    },
    marker(state, m, st) { const p = resolvePos(state, st.at); return { ...p, color: '#ffc93c', icon: '★', label: p.name, r: Math.min(st.r, 40) }; },
  },
  spawnVehicle: {
    start(state, m, st) {
      const p = resolvePos(state, st.at);
      const v = createVehicle(st.vtype, p.x, p.y, st.a || 0, { role: 'mission', color: st.color, missionTag: st.tag });
      state.vehicles = state.vehicles.filter((o) => dist2(o.x, o.y, p.x, p.y) > 50 * 50 || o.driver === 'player');
      state.vehicles.push(v);
      m.tags[st.tag] = v;
    },
    update() { return 'done'; },
  },
  enterVehicle: {
    start(state, m, st) { m.objective = st.text; },
    update(state, m, st) {
      const v = m.tags[st.tag];
      if (!v || v.wrecked) return 'fail:The car was destroyed';
      if (state.player.vehicle === v) return 'done';
    },
    marker(state, m, st) { const v = m.tags[st.tag]; return v && { x: v.x, y: v.y, color: '#2ec4b6', icon: 'C', label: v.spec.name, r: 30 }; },
  },
  wanted: {
    start(state, m, st) { setWantedLevel(state, Math.max(state.wanted.level, st.level)); if (st.toast) toast(state, st.toast, '#ff5a5a', 3); },
    update() { return 'done'; },
  },
  deliver: {
    start(state, m, st) { m.objective = st.text; m.timer = st.time; },
    update(state, m, st, dt) {
      const v = m.tags[st.tag];
      if (!v || v.wrecked) return 'fail:The car was destroyed';
      m.timer -= dt;
      if (m.timer <= 0) return 'fail:Out of time';
      if (state.player.vehicle !== v) { m.objective = 'Get back in the ' + v.spec.name; return; }
      m.objective = st.text;
      const p = resolvePos(state, st.at);
      if (dist2(p.x, p.y, v.x, v.y) < st.r * st.r && Math.hypot(v.vx, v.vy) < 90) { m.timer = null; return 'done'; }
    },
    marker(state, m, st) {
      const v = m.tags[st.tag];
      if (v && state.player.vehicle !== v) return { x: v.x, y: v.y, color: '#2ec4b6', icon: 'C', r: 30 };
      const p = resolvePos(state, st.at); return { ...p, color: '#ffc93c', icon: '★', label: p.name, r: st.r };
    },
  },
  chase: {
    start(state, m, st) {
      const near = resolvePos(state, st.near);
      const v = spawnOnLaneNear(state, near.x + 200, near.y + 200, st.vtype, {
        tag: st.tag, color: st.color, tough: st.tag === 'varela' ? 1.8 : 1.3,
        driver: { role: st.tag === 'varela' ? 'boss' : 'civ', look: randomLook() },
      });
      v.ai.panic = 99999; v.ai.cruise = st.tag === 'varela' ? 330 : 270;
      v.ai.chooser = (at, prev) => fleeChoice(state, at, prev);
      m.tags[st.tag] = v;
      m.objective = st.text; m.timer = st.time;
      toast(state, st.tag === 'varela' ? 'Varela is making a run for it!' : 'Flaco spotted you — he\'s running!', '#ff5a5a', 3);
    },
    update(state, m, st, dt) {
      const v = m.tags[st.tag];
      m.timer -= dt;
      const me = playerXY(state);
      if (v.health <= v.maxHealth * st.disable || v.wrecked || v.onFire) {
        m.timer = null;
        disableChased(state, m, st, v);
        return 'done';
      }
      if (m.timer <= 0) return 'fail:He got away';
      const d2 = dist2(v.x, v.y, me.x, me.y);
      if (d2 < 800 * 800) m.engaged = true;
      if (m.engaged && d2 > 1700 * 1700) return 'fail:He got away';
      m.extra = { label: 'Target car', value: v.health / v.maxHealth };
    },
    marker(state, m, st) { const v = m.tags[st.tag]; return v && { x: v.x, y: v.y, color: '#ff4f4f', icon: '!', r: 30 }; },
  },
  pickupItem: {
    start(state, m, st) {
      const p = resolvePos(state, st.at);
      m.item = { x: p.x + 20, y: p.y + 10, name: st.item };
      m.objective = st.text;
    },
    update(state, m, st) {
      const me = playerXY(state);
      if (dist2(m.item.x, m.item.y, me.x, me.y) < 30 * 30) { sfx.pickup(); toast(state, 'Got: ' + m.item.name, '#ffc93c', 2.5); m.item = null; return 'done'; }
    },
    marker(state, m) { return m.item && { x: m.item.x, y: m.item.y, color: '#7ddc6a', icon: '$', label: m.item.name, r: 18 }; },
  },
  loseWanted: {
    start(state, m, st) { m.objective = st.text; },
    update(state, m) {
      if (state.wanted.level === 0) return 'done';
      m.objective = state.wanted.seen ? 'Lose the police — break their line of sight' : 'Stay hidden… the heat is cooling down';
    },
  },
  stakeout: {
    start(state, m, st) {
      const w = resolvePos(state, st.at);
      m.zone = resolvePos(state, 'stakeout');
      m.progress = 0; m.detect = 0; m.objective = st.text;
      const posts = [[-70, 30, 1.6], [70, 40, 1.4], [0, 80, -1.6]];
      for (const [dx, dy, a] of posts) {
        const g = createPed(w.x + dx, w.y - dy, 'gang', { persistent: true, missionTag: 'stakeout' });
        g.guardA = a; g.state = 'guard'; g.hostile = false;
        state.peds.push(g);
      }
    },
    update(state, m, st, dt) {
      const me = playerXY(state);
      const inZone = dist2(me.x, me.y, m.zone.x, m.zone.y) < st.r * st.r;
      if (inZone) m.progress += dt;
      m.objective = inZone ? st.text : 'Return to the stakeout zone on Calle Ancla';
      for (const g of state.peds) {
        if (g.missionTag !== 'stakeout' || g.state === 'dead') continue;
        if (g.hostile) return 'fail:You were spotted!';
        const d = Math.hypot(g.x - me.x, g.y - me.y);
        if (d < 170 && lineOfSight(state.world, g.x, g.y, me.x, me.y)) m.detect += dt * 0.55 * (1 + (170 - d) / 70);
      }
      if (state.peds.some((g) => g.missionTag === 'stakeout' && g.state === 'dead')) m.detect = 1;
      m.detect = Math.max(0, m.detect - dt * 0.08);
      if (m.detect >= 1) { alertGang(state, 'stakeout'); return 'fail:You were spotted!'; }
      m.extra = { label: 'Detection', value: m.detect, color: '#ff5a5a', progress: m.progress / st.time };
      if (m.progress >= st.time) { m.extra = null; return 'done'; }
    },
    marker(state, m, st) { return m.zone && { x: m.zone.x, y: m.zone.y, color: '#b37dff', icon: 'S', label: 'Stakeout', r: 40 }; },
  },
  follow: {
    start(state, m, st) {
      const from = resolvePos(state, st.from), to = resolvePos(state, st.to);
      const v = spawnOnLaneNear(state, from.x, from.y - 40, st.vtype, { tag: st.tag, color: '#2b2b2b', tough: 2, driver: { role: 'gang', look: randomLook('gang') } });
      v.ai.cruise = 165; v.ai.panic = 0;
      v.ai.chooser = (at, prev) => nextNodeToward(at, to.x, to.y, prev);
      m.tags[st.tag] = v; m.dest = to; m.lost = 0; m.close = 0; m.objective = st.text;
      toast(state, 'The van is leaving!', '#ffc93c', 2.5);
    },
    update(state, m, st, dt) {
      const v = m.tags[st.tag];
      if (!v || v.wrecked) return 'fail:The van was destroyed';
      const me = playerXY(state);
      const d = Math.hypot(v.x - me.x, v.y - me.y);
      m.lost = d > 560 ? m.lost + dt : 0;
      m.close = d < 80 ? m.close + dt : Math.max(0, m.close - dt);
      if (m.lost > 7) return 'fail:You lost the van';
      if (m.close > 3) { alertGang(state); return 'fail:The driver spotted you'; }
      m.objective = d > 460 ? 'You\'re falling behind — catch up to the van!' : d < 110 ? 'Too close! Back off!' : st.text;
      const n = nearestNode(m.dest.x, m.dest.y), np = nodePos(n);
      if (dist2(v.x, v.y, np.x, np.y) < 140 * 140 || dist2(v.x, v.y, m.dest.x, m.dest.y) < 260 * 260) {
        v.ai.cruise = 0; v.driver = { role: 'gang', look: v.driver.look }; return 'done';
      }
      m.extra = { label: 'Distance', value: clamp(1 - (d - 80) / 480, 0, 1), color: d > 460 || d < 110 ? '#ff5a5a' : '#7ddc6a' };
    },
    marker(state, m, st) { const v = m.tags[st.tag]; return v && { x: v.x, y: v.y, color: '#ff9f1c', icon: 'V', r: 32 }; },
  },
  eliminate: {
    start(state, m, st) {
      const p = resolvePos(state, st.at);
      const list = [];
      for (let k = 0; k < st.count; k++) {
        const a = (k / st.count) * Math.PI * 2;
        const isBoss = st.boss && k === 0;
        let gx = p.x, gy = p.y;
        for (let tries = 0; tries < 20; tries++) {
          const r = st.spread * rng.range(0.3, 1);
          gx = p.x + Math.cos(a + tries * 0.7) * r; gy = p.y + Math.sin(a + tries * 0.7) * r;
          if (!solidAt(state.world, gx, gy) && !solidAt(state.world, gx + 8, gy + 8) && !solidAt(state.world, gx - 8, gy - 8)) break;
        }
        const g = createPed(gx, gy, isBoss ? 'boss' : 'gang', {
          persistent: true, missionTag: st.tag, health: isBoss ? 420 : 75, weapon: isBoss ? 'smg' : rng.chance(0.3) ? 'shotgun' : 'pistol',
          look: isBoss ? { skin: '#c68642', shirt: '#f4f4f4', pants: '#111', hair: '#111', bandana: '#d4af37' } : undefined,
        });
        g.hostile = !!st.boss; g.guardA = rng.range(0, 6.28); g.state = 'guard';
        state.peds.push(g); list.push(g);
      }
      m.enemies = list; m.objective = st.text;
    },
    update(state, m, st) {
      const me = playerXY(state);
      for (const g of m.enemies) if (!g.hostile && g.state !== 'dead' && dist2(g.x, g.y, me.x, me.y) < 300 * 300) alertGang(state, st.tag);
      const left = m.enemies.filter((g) => g.state !== 'dead').length;
      m.extra = { label: 'Enemies left', count: left };
      if (left === 0) { m.extra = null; return 'done'; }
    },
    marker(state, m) {
      const alive = (m.enemies || []).filter((g) => g.state !== 'dead');
      return alive.length ? { x: alive[0].x, y: alive[0].y, color: '#ff4f4f', icon: 'X', r: 16 } : null;
    },
  },
  giveWeapon: {
    start(state, m, st) {
      const pl = state.player;
      pl.weapons[st.weapon] = true; pl.ammo[st.weapon] = (pl.ammo[st.weapon] || 0) + st.ammo; pl.weapon = st.weapon;
      toast(state, st.toast, '#ffc93c', 3); sfx.pickup();
    },
    update() { return 'done'; },
  },
};

function fleeChoice(state, at, prev) {
  const me = playerXY(state);
  let best = -1, bd = -1;
  for (const n of neighbors(at)) {
    if (n === prev) continue;
    const p = nodePos(n);
    const d = Math.hypot(p.x - me.x, p.y - me.y) + rng.range(0, 260);
    if (d > bd) { bd = d; best = n; }
  }
  return best >= 0 ? best : prev;
}

function disableChased(state, m, st, v) {
  v.ai = null; v.throttle = 0; v.handbrake = true;
  m.tagPos[st.tag] = { x: v.x, y: v.y };
  const look = v.driver && v.driver.look;
  v.driver = null; v.role = 'parked';
  if (st.onDisable === 'dropCash') {
    const p = createPed(v.x + 30, v.y, 'civ', { look });
    p.state = 'flee'; p.panic = 10; p.fearX = v.x; p.fearY = v.y;
    state.peds.push(p);
    toast(state, 'Flaco bailed and dropped the bag!', '#ffc93c', 3);
  }
  if (st.onDisable === 'bossExit') toast(state, 'Varela is out of the car — finish this!', '#ff5a5a', 3);
}

// ---------------------------------------------------------------------------------------------
export function startMission(state, index) {
  const def = MISSIONS[index];
  state.mission = { def, index, step: -1, tags: {}, tagPos: {}, objective: '', timer: null, extra: null, item: null };
  bigMessage(state, def.title, `Mission ${index + 1} of ${MISSIONS.length}`, '#ffc93c', 3);
  sfx.pass();
  nextStep(state);
}

function nextStep(state) {
  const m = state.mission;
  m.step++;
  m.extra = null;
  if (m.step >= m.def.steps.length) return passMission(state);
  const st = m.def.steps[m.step];
  STEPS[st.type].start(state, m, st);
}

export function updateMission(state, dt) {
  const m = state.mission;
  if (!m) {
    // start trigger at the next giver's marker
    const idx = state.story.next;
    if (idx < MISSIONS.length && state.mode === 'play') {
      const g = state.world.landmarks[MISSIONS[idx].giver];
      const me = playerXY(state);
      const slow = !state.player.vehicle || Math.hypot(state.player.vehicle.vx, state.player.vehicle.vy) < 120;
      if (slow && dist2(g.x, g.y, me.x, me.y) < 30 * 30 && state.wanted.level === 0) startMission(state, idx);
      else if (slow && dist2(g.x, g.y, me.x, me.y) < 30 * 30 && !state.wantedHintShown) { state.wantedHintShown = true; toast(state, 'Lose your wanted level before starting a mission', '#ff9a9a', 3); }
    }
    return;
  }
  if (state.player.dead) return;
  const st = m.def.steps[m.step];
  const r = STEPS[st.type].update(state, m, st, dt);
  if (r === 'done') { m.timer = null; nextStep(state); }
  else if (r && r.startsWith('fail:')) failMission(state, r.slice(5));
}

export function passMission(state) {
  const m = state.mission;
  state.cash += m.def.reward;
  state.story.completed.push(m.def.id);
  state.story.next = Math.max(state.story.next, m.index + 1);
  bigMessage(state, 'MISSION PASSED', '+' + formatMoney(m.def.reward), '#7ddc6a', 4);
  sfx.pass();
  cleanupMission(state, true);
  state.mission = null;
  if (state.onAutosave) state.onAutosave();
  if (state.story.next >= MISSIONS.length) { state.credits = { t: 0, lines: CREDITS }; }
}

export function failMission(state, reason) {
  if (!state.mission) return;
  bigMessage(state, 'MISSION FAILED', reason, '#ff5a5a', 4);
  sfx.fail();
  state.subtitle = null;
  cleanupMission(state, false);
  state.mission = null;
}

function cleanupMission(state, passed) {
  for (const p of state.peds) if (p.persistent && p.missionTag) { p.persistent = false; if (!passed && p.state !== 'dead') p.hostile = false; }
  for (const v of state.vehicles) if (v.missionTag) {
    v.missionTag = null;
    if (v.driver !== 'player') { if (v.driver && v.ai) { v.role = 'traffic'; v.ai.chooser = null; v.ai.panic = 0; } else v.role = 'parked'; }
    else v.role = 'player';
  }
}

export function missionMarkers(state) {
  const m = state.mission;
  if (!m) {
    const idx = state.story.next;
    if (idx >= MISSIONS.length) return [];
    const def = MISSIONS[idx];
    const g = state.world.landmarks[def.giver];
    return [{ ...g, color: '#ffc93c', icon: String(idx + 1), label: `${def.title} — ${def.giverName}`, r: 26, mission: true }];
  }
  const st = m.def.steps[m.step];
  const h = STEPS[st.type].marker;
  const mk = h && h(state, m, st);
  return mk ? [{ ...mk, mission: true }] : [];
}

export function speakerOf(key) { return CAST[key] || { name: key, color: '#fff' }; }
export { MISSIONS };

// Jump the active mission to a step (used by photo-mode scenes and debugging).
export function jumpToStep(state, stepType) {
  const m = state.mission;
  if (!m) return;
  state.subtitle = null;
  m.step = m.def.steps.findIndex((s) => s.type === stepType) - 1;
  nextStep(state);
}
