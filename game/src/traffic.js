// Civilian traffic AI: lane following with pure-pursuit steering, turns at intersections,
// stopping for red lights, braking for cars/peds/the player, honking, panic driving and
// spawning/despawning cars on lanes around the player. Also seeds the parked cars.
import { TRAFFIC_MIX } from './config.js';
import { createVehicle, forwardSpeed } from './vehicles.js';
import { randomLook } from './peds.js';
import { laneSegment, chooseNextNode, randomEdgeNear, lightState, nodePos, nearestNode, neighbors } from './roads.js';
import { sfx, volAt } from './audio.js';
import { gameHour } from './state.js';
import { rng, clamp, wrapAngle, dist2, segmentDistance } from './mathutil.js';

export function spawnParkedCars(state) {
  for (const p of state.world.parking) {
    const type = p.prefer || rng.pick(['sedan', 'sedan', 'sports', 'pickup', 'muscle', 'taxi', 'sedan']);
    state.vehicles.push(createVehicle(type, p.x, p.y, p.a, { role: 'parked' }));
  }
}

export function makeTrafficCar(state, a, b, t = rng.range(0.1, 0.7), type = rng.pick(TRAFFIC_MIX)) {
  const seg = laneSegment(a, b);
  const x = seg.sx + (seg.ex - seg.sx) * t, y = seg.sy + (seg.ey - seg.sy) * t;
  const v = createVehicle(type, x, y, seg.angle, { role: 'traffic', driver: { role: 'civ', look: randomLook() } });
  v.ai = { a, b, next: chooseNextNode(rng, b, a), cruise: rng.range(140, 215), stuck: 0, reverse: 0, panic: 0, honk: 0 };
  const sp = v.ai.cruise * 0.7;
  v.vx = Math.cos(seg.angle) * sp; v.vy = Math.sin(seg.angle) * sp;
  return v;
}

export function manageTraffic(state, dt) {
  const pl = state.player;
  const cx = pl.vehicle ? pl.vehicle.x : pl.x, cy = pl.vehicle ? pl.vehicle.y : pl.y;
  const keep = [];
  let traffic = 0;
  for (const v of state.vehicles) {
    const d2 = dist2(v.x, v.y, cx, cy);
    const isTraffic = v.role === 'traffic' && v.driver && v.driver !== 'player';
    if (['leaving', 'copParked', 'roadblock', 'cop'].includes(v.role) && v.driver !== 'player' && d2 > 2000 * 2000) continue;
    if (isTraffic && d2 > 1900 * 1900) continue;
    if (v.wrecked && d2 > 1600 * 1600 && !v.missionTag) continue;
    if (v.role === 'abandoned' && d2 > 2200 * 2200 && v.driver !== 'player') continue;
    if (isTraffic) traffic++;
    keep.push(v);
  }
  state.vehicles = keep;
  state.trafficCd -= dt;
  const hour = gameHour(state);
  const target = hour > 1 && hour < 5 ? 22 : 44;
  if (traffic < target && state.trafficCd <= 0) {
    state.trafficCd = 0.08;
    const minD = state.mode === 'play' ? 640 : 200;
    const e = randomEdgeNear(rng, cx, cy, minD, 1500);
    if (e) {
      const v = makeTrafficCar(state, e.a, e.b);
      if (!state.vehicles.some((o) => dist2(o.x, o.y, v.x, v.y) < 70 * 70)) state.vehicles.push(v);
    }
  }
}

// Returns the closest obstacle distance ahead in the car's lane (vehicles, peds, player).
function obstacleAhead(state, v, range) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  let best = range;
  let isPlayer = false;
  const test = (x, y, rad) => {
    const dx = x - v.x, dy = y - v.y;
    const along = dx * c + dy * s;
    if (along <= 0 || along > best + v.spec.len) return false;
    const lat = Math.abs(-dx * s + dy * c);
    if (lat > v.spec.wid / 2 + rad + 4) return false;
    const gap = along - v.spec.len / 2 - rad;
    if (gap < best) { best = Math.max(0, gap); return true; }
    return false;
  };
  for (const o of state.vehicles) {
    if (o === v) continue;
    if (Math.abs(o.x - v.x) > range + 60 || Math.abs(o.y - v.y) > range + 60) continue;
    if (test(o.x, o.y, o.spec.wid * 0.6) && o.driver === 'player') isPlayer = true;
  }
  for (const p of state.peds) {
    if (p.state === 'dead' && p.role !== 'civ') continue;
    if (Math.abs(p.x - v.x) > range + 40 || Math.abs(p.y - v.y) > range + 40) continue;
    test(p.x, p.y, 8);
  }
  const pl = state.player;
  if (!pl.vehicle && !pl.dead && test(pl.x, pl.y, 8)) isPlayer = true;
  return { gap: best, isPlayer };
}

export function driveTraffic(state, v, dt) {
  const ai = v.ai;
  if (!ai || v.wrecked) { v.throttle = 0; v.handbrake = true; return; }
  ai.panic = Math.max(0, ai.panic - dt);
  const seg = laneSegment(ai.a, ai.b);
  const len = Math.hypot(seg.ex - seg.sx, seg.ey - seg.sy);
  const proj = segmentDistance(v.x, v.y, seg.sx, seg.sy, seg.ex, seg.ey);
  const distToEnd = (1 - proj.t) * len;
  const nseg = laneSegment(ai.b, ai.next);

  // lookahead target along lane, or through the intersection into the next lane
  const look = 34 + Math.abs(forwardSpeed(v)) * 0.25;
  let tx, ty;
  if (distToEnd > look) {
    const t = proj.t + look / len;
    tx = seg.sx + (seg.ex - seg.sx) * t; ty = seg.sy + (seg.ey - seg.sy) * t;
  } else {
    const k = Math.min(1, (look - distToEnd) / 60);
    tx = seg.ex + (nseg.sx - seg.ex) * k; ty = seg.ey + (nseg.sy - seg.ey) * k;
    if (k >= 1) { tx = nseg.sx + Math.cos(nseg.angle) * 20; ty = nseg.sy + Math.sin(nseg.angle) * 20; }
  }
  // switch to next segment once we are on it
  if (dist2(v.x, v.y, nseg.sx, nseg.sy) < 26 * 26 || (proj.t >= 0.999 && segmentDistance(v.x, v.y, nseg.sx, nseg.sy, nseg.ex, nseg.ey).d < 18)) {
    ai.a = ai.b; ai.b = ai.next; ai.next = pickNext(ai, ai.b, ai.a);
  }
  // lost (pushed off route): re-route from nearest node
  if (proj.d > 150) {
    const n = nearestNode(v.x, v.y);
    const ns = neighbors(n);
    ai.a = ns[rng.int(0, ns.length - 1)]; ai.b = n; ai.next = pickNext(ai, n, ai.a);
  }

  let target = ai.panic > 0 ? 300 : ai.cruise;
  const turning = Math.abs(wrapAngle(nseg.angle - seg.angle)) > 0.3;
  if (turning && distToEnd < 120) target = Math.min(target, 95);
  // lights
  if (ai.panic <= 0 && distToEnd < 90 && distToEnd > 4 && proj.t > 0.4) {
    const light = lightState(ai.b, state.time, seg.dy === 0);
    if (light !== 'green' && !(light === 'yellow' && distToEnd < 30)) target = Math.min(target, Math.max(0, (distToEnd - 6) * 2.4));
  }
  const ob = obstacleAhead(state, v, 110);
  if (ob.gap < 110) target = Math.min(target, Math.max(0, (ob.gap - 12) * 2.6));
  if (ob.isPlayer && ob.gap < 50) {
    ai.honk -= dt;
    if (ai.honk <= 0) { ai.honk = rng.range(1.5, 3.5); sfx.horn(volAt(state, v.x, v.y) * 0.5); v.horn = 0.4; }
  }
  v.horn = Math.max(0, v.horn - dt);

  const vF = forwardSpeed(v);
  // stuck handling: reverse briefly
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    v.throttle = -0.8; v.steer = -Math.sign(wrapAngle(Math.atan2(ty - v.y, tx - v.x) - v.a)); v.handbrake = false;
    return;
  }
  if (target > 40 && Math.abs(vF) < 8 && ob.gap > 60) ai.stuck += dt; else ai.stuck = 0;
  if (ai.stuck > 2.5) { ai.stuck = 0; ai.reverse = 1.0; }

  const desired = Math.atan2(ty - v.y, tx - v.x);
  const err = wrapAngle(desired - v.a);
  v.steer = clamp(err * 2.8, -1, 1);
  const dv = target - vF;
  v.throttle = clamp(dv / 50, -1, 1);
  v.handbrake = target < 2 && Math.abs(vF) < 20;
}

// Give an AI driver (a cop that stopped chasing, a mission car afterwards) normal traffic behaviour.
export function adoptTrafficAI(v) {
  const n = nearestNode(v.x, v.y);
  const ns = neighbors(n);
  const prev = ns[rng.int(0, ns.length - 1)];
  v.ai = { a: prev, b: n, next: chooseNextNode(rng, n, prev), cruise: rng.range(150, 210), stuck: 0, reverse: 0, panic: 0, honk: 0 };
}

// Make nearby drivers panic (after gunfire or a crash).
export function panicTraffic(state, x, y, radius) {
  for (const v of state.vehicles) {
    if (v.ai && v.role === 'traffic' && dist2(v.x, v.y, x, y) < radius * radius) v.ai.panic = rng.range(5, 9);
  }
}

export function nodeCenter(id) { return nodePos(id); }

// Route choice: a mission can install ai.chooser (flee from the player, head to a destination).
function pickNext(ai, at, prev) {
  return ai.chooser ? ai.chooser(at, prev) : chooseNextNode(rng, at, prev);
}
