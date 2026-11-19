// Wanted level and police response: crime heat → 1–5 stars, cop cars spawned per star level,
// pursuit/ramming AI over the road grid, officers on foot, roadblocks at 3+, a helicopter at 4+,
// line-of-sight evasion that drops stars, and the busted check.
import {
  WANTED_THRESHOLDS, COPS_PER_LEVEL, COP_SIGHT, EVADE_BASE, EVADE_PER_STAR, CRIME_HEAT, ROAD_HALF,
  PURSUIT, BUST_CAR_TIME, BUST_FOOT_TIME, BUST_LOW_STAR_GRACE, COP_CATCHUP,
} from './config.js';
import { createVehicle, forwardSpeed, doorPoint } from './vehicles.js';
import { createPed, randomLook } from './peds.js';
import { npcShoot } from './combat.js';
import { lineOfSight } from './world.js';
import { randomEdgeNear, laneSegment, nearestNode, nextNodeToward, nodePos, neighbors } from './roads.js';
import { sfx } from './audio.js';
import { toast, bigMessage } from './state.js';
import { rng, clamp, wrapAngle, dist2, angleTo } from './mathutil.js';

export function playerPos(state) {
  const pl = state.player;
  return pl.vehicle ? { x: pl.vehicle.x, y: pl.vehicle.y, vx: pl.vehicle.vx, vy: pl.vehicle.vy } : { x: pl.x, y: pl.y, vx: pl.vx, vy: pl.vy };
}

export function setWantedLevel(state, level) {
  const w = state.wanted;
  const before = w.level;
  w.level = clamp(level, 0, 5);
  w.heat = Math.max(w.heat, WANTED_THRESHOLDS[w.level]);
  if (w.level < before) w.heat = WANTED_THRESHOLDS[w.level];
  if (w.level > before) { w.flash = 2; w.unseen = 0; sfx.star(); }
  state.stats.maxWanted = Math.max(state.stats.maxWanted, w.level);
}

export function reportCrime(state, kind, x, y) {
  if (state.mode !== 'play' || state.cheatNoCops) return;
  const w = state.wanted;
  w.heat += CRIME_HEAT[kind] || 20;
  let lvl = 0;
  for (let i = 0; i < WANTED_THRESHOLDS.length; i++) if (w.heat >= WANTED_THRESHOLDS[i]) lvl = i;
  if (lvl > w.level) { setWantedLevel(state, lvl); }
  w.lastX = x; w.lastY = y; w.unseen = 0;
}

function copUnits(state) {
  const units = [];
  for (const v of state.vehicles) if (v.role === 'cop' && v.driver && !v.wrecked) units.push(v);
  for (const p of state.peds) if (p.role === 'cop' && p.state !== 'dead') units.push(p);
  return units;
}

// Seconds of being unseen needed to drop a star at the current level (the HUD fills toward it).
export function evadeTime(level) {
  return EVADE_BASE + Math.max(1, level) * EVADE_PER_STAR;
}

// Seconds a cruiser must sit on the player before the bust: a car is more forgiving than
// being cornered on foot, and one lone star gives the player time to break away.
export function bustTime(state) {
  const lvl = state.wanted.level;
  const base = state.player.vehicle ? BUST_CAR_TIME : BUST_FOOT_TIME;
  return base + Math.max(0, 3 - lvl) * BUST_LOW_STAR_GRACE;
}

// One cruiser rolling in on a lane; the pursuit table decides how close it arrives.
function spawnCopCar(state, px, py) {
  const lvl = Math.max(1, state.wanted.level);
  const [near, far] = (PURSUIT[lvl] || PURSUIT[1]).ring;
  const e = randomEdgeNear(rng, px, py, near, far);
  if (!e) return null;
  const seg = laneSegment(e.a, e.b);
  const x = (seg.sx + seg.ex) / 2, y = (seg.sy + seg.ey) / 2;
  const v = createVehicle('police', x, y, seg.angle, { role: 'cop', driver: { role: 'cop', look: randomLook('cop') } });
  v.siren = true; v.sleeping = false;
  v.ai = { node: e.b, prev: e.a, stuck: 0, reverse: 0, shootCd: rng.range(1, 2) };
  state.vehicles.push(v);
  return v;
}

// A fresh chase should feel like a response: send a small wave of cruisers at once.
function sendWaves(state, px, py, n) {
  for (let i = 0; i < n; i++) spawnCopCar(state, px, py);
}

function spawnRoadblock(state, pp) {
  const sp = Math.hypot(pp.vx, pp.vy);
  if (sp < 80) return;
  const ax = pp.x + pp.vx / sp * 650, ay = pp.y + pp.vy / sp * 650;
  const n = nearestNode(ax, ay);
  const c = nodePos(n);
  if (dist2(c.x, c.y, pp.x, pp.y) < 420 * 420) return;
  if (state.vehicles.some((v) => v.role === 'roadblock' && dist2(v.x, v.y, c.x, c.y) < 200 * 200)) return;
  const horizontal = Math.abs(pp.vx) > Math.abs(pp.vy);
  for (const s of [-1, 1]) {
    const x = c.x + (horizontal ? 0 : s * ROAD_HALF * 0.55), y = c.y + (horizontal ? s * ROAD_HALF * 0.55 : 0);
    const v = createVehicle('police', x, y, (horizontal ? Math.PI / 2 : 0) + s * 0.35, { role: 'roadblock', driver: null });
    v.siren = true; v.sleeping = true;
    state.vehicles.push(v);
    const d = doorPoint(v, s);
    const cop = createPed(d.x, d.y, 'cop');
    cop.state = 'guard';
    state.peds.push(cop);
  }
  toast(state, 'Roadblock ahead!', '#ff5a5a', 2.2);
}

function updateHeli(state, dt, pp) {
  const w = state.wanted;
  if (w.level >= 4 && !state.heli) {
    state.heli = { x: pp.x - 900, y: pp.y - 700, vx: 0, vy: 0, a: 0, rotor: 0, shootCd: 2, orbit: rng.range(0, 6), leaving: false };
  }
  const h = state.heli;
  if (!h) return;
  h.rotor += dt * 40;
  if (w.level < 4) h.leaving = true;
  let tx, ty;
  if (h.leaving) { tx = h.x - 2000; ty = h.y - 2000; }
  else {
    h.orbit += dt * 0.5;
    tx = pp.x + Math.cos(h.orbit) * 250 + pp.vx * 0.25; ty = pp.y + Math.sin(h.orbit) * 190 + pp.vy * 0.25;
  }
  const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy) || 1;
  const sp = Math.min(520, d * 1.6);
  h.vx += (dx / d * sp - h.vx) * Math.min(1, dt * 1.5);
  h.vy += (dy / d * sp - h.vy) * Math.min(1, dt * 1.5);
  h.x += h.vx * dt; h.y += h.vy * dt;
  h.a = Math.atan2(pp.y - h.y, pp.x - h.x);
  if (h.leaving && dist2(h.x, h.y, pp.x, pp.y) > 2200 * 2200) state.heli = null;
  if (!h.leaving && w.level >= 5) {
    h.shootCd -= dt;
    if (h.shootCd <= 0 && dist2(h.x, h.y, pp.x, pp.y) < 380 * 380) {
      h.shootCd = 0.12; h.burst = (h.burst || 0) + 1;
      if (h.burst > 8) { h.burst = 0; h.shootCd = 2.2; }
      npcShoot(state, { x: h.x, y: h.y, role: 'cop', air: true }, pp.x, pp.y, 'smg', 0.55);
    }
  }
}

export function updatePolice(state, dt) {
  const w = state.wanted;
  const pp = playerPos(state);
  w.flash = Math.max(0, w.flash - dt);
  const units = copUnits(state);

  // line of sight
  w.seen = false;
  if (w.level > 0) {
    for (const u of units) {
      if (dist2(u.x, u.y, pp.x, pp.y) < COP_SIGHT * COP_SIGHT && lineOfSight(state.world, u.x, u.y, pp.x, pp.y)) { w.seen = true; break; }
    }
    if (state.heli && !state.heli.leaving && dist2(state.heli.x, state.heli.y, pp.x, pp.y) < 640 * 640) w.seen = true;
    if (w.seen) { w.unseen = 0; w.lastX = pp.x; w.lastY = pp.y; }
    else {
      w.unseen += dt;
      if (w.unseen > evadeTime(w.level)) {
        w.unseen = 0;
        setWantedLevel(state, w.level - 1);
        if (w.level === 0) {
          w.heat = 0; w.evaded = 3;
          toast(state, 'You lost the cops', '#7ddc6a', 2.5);
          bigMessage(state, 'EVADED', 'They lost your trail — keep the engine hot', '#7ddc6a', 2.4);
          sfx.star();
        } else toast(state, 'Wanted level reduced', '#ffc93c', 2);
      }
    }
  }

  // spawn pursuit units
  const activeCars = state.vehicles.filter((v) => v.role === 'cop' && v.driver && !v.wrecked).length;
  w.units = activeCars;
  w.evaded = Math.max(0, (w.evaded || 0) - dt);
  const tune = PURSUIT[Math.max(1, w.level)] || PURSUIT[1];
  if (w.level > 0 && activeCars < COPS_PER_LEVEL[w.level] && rng.chance(dt * tune.roll)) {
    sendWaves(state, pp.x, pp.y, Math.min(tune.send, COPS_PER_LEVEL[w.level] - activeCars));
  }
  if (tune.roadblock > 0) {
    w.roadblockCd -= dt;
    if (w.roadblockCd <= 0) { w.roadblockCd = tune.roadblock; spawnRoadblock(state, pp); }
  } else w.roadblockCd = Math.min(w.roadblockCd, 4);
  updateHeli(state, dt, pp);

  // busted check
  const pl = state.player;
  let bustNear = false;
  if (w.level > 0 && !pl.dead) {
    if (pl.vehicle) {
      const slow = Math.hypot(pl.vehicle.vx, pl.vehicle.vy) < 28;
      if (slow) for (const u of units) {
        const r = u.kind === 'vehicle' ? 70 : 42;
        if (dist2(u.x, u.y, pp.x, pp.y) < r * r) { bustNear = true; break; }
      }
    } else {
      for (const u of units) if (u.kind === 'ped' && dist2(u.x, u.y, pp.x, pp.y) < 24 * 24) { bustNear = true; break; }
      if (w.level <= 1 && Math.hypot(pl.vx, pl.vy) > 80) bustNear = false;
    }
  }
  w.bust = bustNear ? (w.bust || 0) + dt : Math.max(0, (w.bust || 0) - dt * 2);
  if (w.bust > bustTime(state)) { w.bust = 0; state.onBusted && state.onBusted(); }

  // the chase is over: cop cars return to normal patrol and leave
  if (w.level === 0) {
    for (const v of state.vehicles) if (v.role === 'cop') { v.siren = false; v.role = 'leaving'; }
  }
}

// Pursuit driving for a cop car.
export function driveCop(state, v, dt) {
  const ai = v.ai;
  const pp = playerPos(state);
  const pl = state.player;
  const d = Math.hypot(pp.x - v.x, pp.y - v.y);
  if (ai.reverse > 0) { ai.reverse -= dt; v.throttle = -1; v.steer = 0; v.handbrake = false; return; }

  const lvl = state.wanted.level;
  const tune = PURSUIT[Math.max(1, lvl)] || PURSUIT[1];
  let tx, ty, target = tune.speed || 400;
  const los = d < 300 + lvl * 30 && lineOfSight(state.world, v.x, v.y, pp.x, pp.y);
  // a cruiser far from the action drives flat out until it is back in the wake
  if (pl.vehicle && d > 520) target = Math.max(target, Math.hypot(pp.vx, pp.vy) + COP_CATCHUP);
  if (los) {
    // aim ahead of the player to cut them off and ram; close in hard when right behind
    const lead = tune.lead || 0.3;
    tx = pp.x + pp.vx * lead; ty = pp.y + pp.vy * lead;
    // close the gap fast from range, then sit on the player's bumper instead of ploughing through
    if (pl.vehicle) {
      const ps = Math.hypot(pp.vx, pp.vy);
      if (d > 520) target = Math.max(target, ps + COP_CATCHUP);
      else if (d > 140) target = Math.max(target, ps + 50);
      else target = Math.min(target, ps + 15);
    }
    if (!pl.vehicle && d < 170) {
      // stop and deploy officers
      v.throttle = 0; v.handbrake = true; v.steer = 0;
      if (Math.hypot(v.vx, v.vy) < 40 && !v.deployed) deployOfficers(state, v);
      return;
    }
  } else {
    const here = nearestNode(v.x, v.y);
    const hp = nodePos(here);
    if (ai.node === undefined || dist2(v.x, v.y, nodePos(ai.node).x, nodePos(ai.node).y) < 60 * 60) {
      const from = dist2(v.x, v.y, hp.x, hp.y) < 80 * 80 ? here : ai.node;
      const nxt = nextNodeToward(from, pp.x, pp.y, ai.prev);
      ai.prev = from; ai.node = nxt;
    }
    const np = nodePos(ai.node);
    tx = np.x; ty = np.y;
  }
  const desired = Math.atan2(ty - v.y, tx - v.x);
  const err = wrapAngle(desired - v.a);
  const vF = forwardSpeed(v);
  if (Math.abs(err) > 1.0) target = 150;
  if (Math.abs(err) > 2.2 && vF < 60) { v.throttle = -0.7; v.steer = -Math.sign(err); v.handbrake = false; return; }
  v.steer = clamp(err * 3, -1, 1);
  v.throttle = clamp((target - vF) / 60, -1, 1);
  v.handbrake = Math.abs(err) > 1.2 && vF > 220;
  if (Math.abs(vF) < 10 && target > 50) ai.stuck += dt; else ai.stuck = 0;
  if (ai.stuck > 1.6) { ai.stuck = 0; ai.reverse = 0.9; }

  // drive-by fire from the passenger seat at 4+ stars
  if (state.wanted.level >= 4 && los && d < 280) {
    ai.shootCd -= dt;
    if (ai.shootCd <= 0) { ai.shootCd = rng.range(0.6, 1.2); npcShoot(state, v, pp.x, pp.y, 'pistol', 0.5); }
  }
}

function deployOfficers(state, v) {
  v.deployed = true;
  const look = v.driver.look;
  v.driver = null; v.role = 'copParked';
  for (const side of [-1, 1]) {
    const dp = doorPoint(v, side);
    const cop = createPed(dp.x, dp.y, 'cop', { look: side < 0 ? look : undefined });
    cop.state = 'chase';
    state.peds.push(cop);
  }
  sfx.door();
}

// Officer on foot.
export function copFootAI(state, p, dt) {
  const w = state.wanted;
  const pp = playerPos(state);
  const d = Math.hypot(pp.x - p.x, pp.y - p.y);
  if (w.level === 0 || state.player.dead) {
    p.vx *= 0.85; p.vy *= 0.85;
    return;
  }
  p.shootCd -= dt;
  const los = d < 360 && lineOfSight(state.world, p.x, p.y, pp.x, pp.y);
  const wantShoot = w.level >= 2 && los && d > 40;
  if (wantShoot && p.shootCd <= 0) {
    p.shootCd = rng.range(0.8, 1.5) - w.level * 0.08;
    p.a = angleTo(p.x, p.y, pp.x, pp.y);
    npcShoot(state, p, pp.x + rng.range(-8, 8), pp.y + rng.range(-8, 8), 'pistol', 0.62);
    p.vx *= 0.3; p.vy *= 0.3;
    return;
  }
  if (p.state === 'guard' && d > 380) { p.vx *= 0.8; p.vy *= 0.8; p.a = angleTo(p.x, p.y, pp.x, pp.y); return; }
  const speed = d > 30 ? 118 : 30;
  const dx = pp.x - p.x, dy = pp.y - p.y, l = d || 1;
  p.vx += (dx / l * speed - p.vx) * Math.min(1, dt * 6);
  p.vy += (dy / l * speed - p.vy) * Math.min(1, dt * 6);
  p.a = Math.atan2(dy, dx);
}

export function clearPolice(state) {
  state.vehicles = state.vehicles.filter((v) => !['cop', 'roadblock', 'copParked'].includes(v.role) || v.driver === 'player');
  state.peds = state.peds.filter((p) => p.role !== 'cop');
  state.heli = null;
  state.wanted.level = 0; state.wanted.heat = 0; state.wanted.unseen = 0; state.wanted.bust = 0;
}

export function hasNeighbors(n) { return neighbors(n).length > 0; }
