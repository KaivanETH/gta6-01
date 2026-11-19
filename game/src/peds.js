// Pedestrians: creation and looks, sidewalk-ring walking with street crossings, beach/park
// wanderers, panic and fleeing, getting hit by cars, knock-downs, deaths and population upkeep.
import { NODES_X, NODES_Y, ROAD_HALF, SIDEWALK, nodeX, nodeY, BLOCK, MARGIN, CRIME_HEAT, PED_TARGET } from './config.js';
import { reportCrime } from './police.js';
import { dropCash } from './pickups.js';
import { solidAt } from './world.js';
import { sfx, volAt } from './audio.js';
import { gameHour } from './state.js';
import { rng, clamp, dist2 } from './mathutil.js';
import { blood, shake } from './fx.js';

let nextPedId = 1;
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673b'];
const SHIRT = ['#ff4f7b', '#2ec4b6', '#ffc93c', '#3a86ff', '#ffffff', '#ff8c42', '#8338ec', '#06d6a0', '#ef476f', '#118ab2', '#f4a261', '#e9c46a'];
const PANTS = ['#264653', '#3d405b', '#6c584c', '#1d3557', '#e5e5e5', '#2b2d42', '#b5838d'];
const HAIR = ['#2b1d0e', '#4a3222', '#0e0e0e', '#c9a46b', '#7a3e1d', '#888888'];

export function randomLook(role = 'civ') {
  if (role === 'cop') return { skin: rng.pick(SKIN), shirt: '#1f3a8a', pants: '#14213d', hair: '#111', hat: '#0b1d4d' };
  if (role === 'gang') return { skin: rng.pick(SKIN), shirt: rng.pick(['#0f5257', '#1b1b1b', '#14532d']), pants: '#1a1a1a', hair: '#0e0e0e', bandana: '#19b3a6' };
  return { skin: rng.pick(SKIN), shirt: rng.pick(SHIRT), pants: rng.pick(PANTS), hair: rng.pick(HAIR), hat: rng.chance(0.15) ? rng.pick(['#f4e3b5', '#ffffff', '#e63946']) : null };
}

export function createPed(x, y, role = 'civ', opts = {}) {
  return {
    kind: 'ped', id: nextPedId++, x, y, a: rng.range(0, Math.PI * 2), vx: 0, vy: 0, r: 7,
    role, look: opts.look || randomLook(role), health: opts.health || (role === 'cop' ? 90 : 60), maxHealth: opts.health || 60,
    state: 'walk', speed: rng.range(38, 58), walkPhase: rng.range(0, 6), flash: 0,
    bi: 0, bj: 0, corner: 0, dir: 1, tx: x, ty: y, crossing: false, panic: 0, fearX: 0, fearY: 0,
    armed: opts.armed ?? (role === 'cop' || role === 'gang' || role === 'boss' || rng.chance(0.08)),
    weapon: opts.weapon || (role === 'gang' ? 'smg' : 'pistol'), shootCd: rng.range(0.5, 1.5), hostile: !!opts.hostile,
    downT: 0, idleT: 0, zone: opts.zone || null, persistent: !!opts.persistent, missionTag: opts.missionTag || null,
    talk: null,
  };
}

// --- sidewalk ring geometry ----------------------------------------------------------------
const RING = ROAD_HALF + SIDEWALK / 2;
export function ringCorner(bi, bj, k) {
  const x0 = nodeX(bi) + RING, x1 = nodeX(bi + 1) - RING, y0 = nodeY(bj) + RING, y1 = nodeY(bj + 1) - RING;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }][k];
}
const CROSS = { 0: [[-1, 0, 1], [0, -1, 3]], 1: [[1, 0, 0], [0, -1, 2]], 2: [[1, 0, 3], [0, 1, 1]], 3: [[-1, 0, 2], [0, 1, 0]] };

function validBlock(bi, bj) { return bi >= 0 && bj >= 0 && bi < NODES_X - 1 && bj < NODES_Y - 1; }

export function placeOnRing(p, bi, bj) {
  p.bi = bi; p.bj = bj;
  const k = rng.int(0, 3);
  const c0 = ringCorner(bi, bj, k), c1 = ringCorner(bi, bj, (k + 1) % 4);
  const t = rng.next();
  p.x = c0.x + (c1.x - c0.x) * t; p.y = c0.y + (c1.y - c0.y) * t;
  p.dir = rng.chance(0.5) ? 1 : -1;
  p.corner = p.dir === 1 ? (k + 1) % 4 : k;
  const c = ringCorner(bi, bj, p.corner);
  p.tx = c.x; p.ty = c.y;
}

function nextRingTarget(p) {
  if (!p.crossing && rng.chance(0.28)) {
    const opts = CROSS[p.corner].filter(([dx, dy]) => validBlock(p.bi + dx, p.bj + dy));
    if (opts.length) {
      const [dx, dy, k] = rng.pick(opts);
      p.bi += dx; p.bj += dy; p.corner = k; p.crossing = true;
      const c = ringCorner(p.bi, p.bj, k);
      p.tx = c.x; p.ty = c.y;
      return;
    }
  }
  p.crossing = false;
  p.corner = (p.corner + p.dir + 4) % 4;
  const c = ringCorner(p.bi, p.bj, p.corner);
  p.tx = c.x; p.ty = c.y;
}

function blockOf(x, y) {
  return {
    bi: clamp(Math.floor((x - MARGIN) / BLOCK), 0, NODES_X - 2),
    bj: clamp(Math.floor((y - MARGIN) / BLOCK), 0, NODES_Y - 2),
  };
}

function resumeWalking(p) {
  if (p.zone) { p.state = 'wander'; p.tx = p.x; p.ty = p.y; return; }
  const { bi, bj } = blockOf(p.x, p.y);
  p.bi = bi; p.bj = bj;
  let best = 0, bd = Infinity;
  for (let k = 0; k < 4; k++) { const c = ringCorner(bi, bj, k); const d = dist2(p.x, p.y, c.x, c.y); if (d < bd) { bd = d; best = k; } }
  p.corner = best; p.crossing = false;
  const c = ringCorner(bi, bj, best); p.tx = c.x; p.ty = c.y;
  p.state = 'walk';
}

// --- scare / hit ------------------------------------------------------------------------------
export function scarePeds(state, x, y, radius, byPlayer = true) {
  const r2 = radius * radius;
  for (const p of state.peds) {
    if (p.role !== 'civ' || p.state === 'dead' || p.state === 'down') continue;
    if (dist2(p.x, p.y, x, y) > r2) continue;
    if (p.armed && byPlayer && state.wanted.level >= 3 && rng.chance(0.5)) { p.hostile = true; p.state = 'fight'; p.panic = 8; continue; }
    // one scream per runner per scare, not a chorus: keep the crowd audio legible
    if (p.state !== 'flee' && rng.chance(0.22)) sfx.scream(volAt(state, p.x, p.y) * 0.55);
    p.state = 'flee'; p.panic = rng.range(4, 8); p.fearX = x; p.fearY = y;
  }
}

export function hurtPed(state, p, amount, source, kx = 0, ky = 0) {
  if (p.state === 'dead') return;
  p.health -= amount;
  p.flash = 0.15;
  p.vx += kx; p.vy += ky;
  blood(state, p.x, p.y, amount > 30 ? 8 : 4);
  if (source === 'player') {
    if (p.role === 'cop') reportCrime(state, p.health <= 0 ? 'killCop' : 'hitCop', p.x, p.y);
    else if (p.role === 'civ') reportCrime(state, p.health <= 0 ? 'killPed' : 'hitPed', p.x, p.y);
    if (p.role === 'civ' && p.armed && state.wanted.level >= 2) p.hostile = true;
  }
  if (p.health <= 0) {
    p.state = 'dead'; p.deadT = 0; p.health = 0;
    if (source === 'player') state.stats.kills++;
    if (p.role !== 'cop' && rng.chance(0.7)) dropCash(state, p.x, p.y, rng.int(8, 60));
    if (p.role === 'cop' && rng.chance(0.6)) state.pickups.push({ type: 'ammo', weapon: 'pistol', amount: 12, x: p.x + 8, y: p.y, life: 40 });
  } else if (p.role === 'civ') {
    if (amount > 20) { p.state = 'down'; p.downT = rng.range(1.2, 2.4); }
    else if (!p.hostile) { p.state = 'flee'; p.panic = 6; p.fearX = state.player.x; p.fearY = state.player.y; }
  }
  scarePeds(state, p.x, p.y, 220, source === 'player');
}

function vehicleHits(state) {
  for (const v of state.vehicles) {
    const sp = Math.hypot(v.vx, v.vy);
    if (sp < 45) continue;
    const reach = v.spec.len / 2 + 8;
    const c = Math.cos(v.a), s = Math.sin(v.a);
    for (const p of state.peds) {
      if (p.state === 'dead' && sp < 120) continue;
      const dx = p.x - v.x, dy = p.y - v.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const lf = dx * c + dy * s, lr = -dx * s + dy * c;
      if (Math.abs(lf) > v.spec.len / 2 + p.r || Math.abs(lr) > v.spec.wid / 2 + p.r) continue;
      if (p.hitCd && p.hitCd > 0) continue;
      p.hitCd = 0.6;
      const src = v.driver === 'player' ? 'player' : null;
      const side = lr >= 0 ? 1 : -1;
      const kx = v.vx * 0.9 + -s * side * 90, ky = v.vy * 0.9 + c * side * 90;
      if (p.state !== 'dead') {
        p.state = 'down'; p.downT = rng.range(1.5, 3);
        hurtPed(state, p, sp * 0.22, src, kx, ky);
        sfx.impact(0.4, volAt(state, p.x, p.y));
        if (src) shake(state, 3);
      } else { p.vx += kx * 0.5; p.vy += ky * 0.5; }
      v.vx *= 0.9; v.vy *= 0.9;
    }
  }
}

// Shared ped motion with circle-vs-solid push-out. Returns true when blocked.
export function movePed(state, p, dt) {
  p.x += p.vx * dt; p.y += p.vy * dt;
  let blocked = false;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const ox = Math.cos(a) * p.r, oy = Math.sin(a) * p.r;
    if (solidAt(state.world, p.x + ox, p.y + oy)) { p.x -= ox * 0.35; p.y -= oy * 0.35; blocked = true; }
  }
  if (solidAt(state.world, p.x, p.y)) { p.x -= p.vx * dt * 1.2; p.y -= p.vy * dt * 1.2; blocked = true; }
  return blocked;
}

function steerTo(p, tx, ty, speed, dt, accel = 8) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
  const wvx = dx / d * speed, wvy = dy / d * speed;
  const k = Math.min(1, accel * dt);
  p.vx += (wvx - p.vx) * k; p.vy += (wvy - p.vy) * k;
  if (speed > 1) p.a = Math.atan2(p.vy, p.vx);
  return d;
}

function avoidCars(state, p) {
  // sidestep an approaching fast vehicle
  for (const v of state.vehicles) {
    const sp = Math.hypot(v.vx, v.vy);
    if (sp < 140) continue;
    const dx = p.x - v.x, dy = p.y - v.y;
    if (dx * dx + dy * dy > 150 * 150) continue;
    const along = (dx * v.vx + dy * v.vy) / sp;
    if (along < 0) continue;
    const side = (-dx * v.vy + dy * v.vx) / sp;
    if (Math.abs(side) < 26 && rng.chance(0.5)) {
      const sgn = side >= 0 ? -1 : 1;
      p.vx += (-v.vy / sp) * 260 * sgn; p.vy += (v.vx / sp) * 260 * sgn;
      p.state = 'flee'; p.panic = 2.5; p.fearX = v.x; p.fearY = v.y;
      return;
    }
  }
}

function updateCiv(state, p, dt) {
  switch (p.state) {
    case 'walk': {
      const d = steerTo(p, p.tx, p.ty, p.speed, dt);
      if (d < 6) nextRingTarget(p);
      if (rng.chance(dt * 0.02)) { p.state = 'idle'; p.idleT = rng.range(1, 4); }
      avoidCars(state, p);
      break;
    }
    case 'idle':
      p.vx *= 0.8; p.vy *= 0.8; p.idleT -= dt;
      if (p.idleT <= 0) p.state = p.zone ? 'wander' : 'walk';
      break;
    case 'wander': {
      const d = steerTo(p, p.tx, p.ty, p.speed * 0.7, dt);
      if (d < 6) {
        if (rng.chance(0.4)) { p.state = 'idle'; p.idleT = rng.range(2, 6); }
        const z = p.zone; p.tx = z.x + rng.range(10, z.w - 10); p.ty = z.y + rng.range(10, z.h - 10);
      }
      avoidCars(state, p);
      break;
    }
    case 'flee': {
      p.panic -= dt;
      const dx = p.x - p.fearX, dy = p.y - p.fearY, d = Math.hypot(dx, dy) || 1;
      // panicked runners push a little harder than a normal walk, and shove each other aside
      steerTo(p, p.x + dx / d * 100 + rng.range(-20, 20), p.y + dy / d * 100 + rng.range(-20, 20), 138, dt, 6);
      if (p.panic <= 0) resumeWalking(p);
      break;
    }
    case 'fight':
      p.panic -= dt;
      if (p.panic <= 0) { p.hostile = false; resumeWalking(p); }
      break;
    case 'down':
      p.vx *= Math.exp(-4 * dt); p.vy *= Math.exp(-4 * dt);
      p.downT -= dt;
      if (p.downT <= 0) { p.state = 'flee'; p.panic = 5; p.fearX = state.player.x; p.fearY = state.player.y; }
      break;
  }
}

export function updatePeds(state, dt, aiHooks) {
  vehicleHits(state);
  for (const p of state.peds) {
    p.flash = Math.max(0, p.flash - dt);
    if (p.hitCd) p.hitCd -= dt;
    if (p.state === 'dead') {
      p.deadT += dt;
      p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt);
      movePed(state, p, dt);
      continue;
    }
    if (p.state === 'down' && p.role !== 'civ') {
      p.vx *= Math.exp(-4 * dt); p.vy *= Math.exp(-4 * dt); p.downT -= dt;
      if (p.downT <= 0) p.state = 'chase';
    } else if (p.role === 'civ' && !p.hostile) updateCiv(state, p, dt);
    else if (aiHooks[p.role]) aiHooks[p.role](state, p, dt);
    else if (p.role === 'civ' && p.hostile) aiHooks.gang && aiHooks.gang(state, p, dt);
    const sp = Math.hypot(p.vx, p.vy);
    p.walkPhase += sp * dt * 0.18;
    movePed(state, p, dt);
  }
}

// Keep a lively crowd around the player: spawn on sidewalks/beach/park, despawn far away.
export function managePopulation(state, dt) {
  const pl = state.player;
  const cx = pl.vehicle ? pl.vehicle.x : pl.x, cy = pl.vehicle ? pl.vehicle.y : pl.y;
  const far2 = 1500 * 1500;
  state.peds = state.peds.filter((p) => p.persistent || dist2(p.x, p.y, cx, cy) < far2 && !(p.state === 'dead' && p.deadT > 45));
  const civs = state.peds.filter((p) => p.role === 'civ').length;
  const hour = gameHour(state);
  const target = hour > 1 && hour < 6 ? PED_TARGET.night : PED_TARGET.day;
  state.pedCd -= dt;
  if (civs < target && state.pedCd <= 0) {
    // Fill a little faster while the streets are still thin, then settle into a steady trickle.
    state.pedCd = civs < target * 0.55 ? 0.03 : 0.055;
    spawnCivNear(state, cx, cy, state.mode === 'play' ? 460 : 0, 1250);
  }
}

export function spawnCivNear(state, cx, cy, minD, maxD) {
  const w = state.world;
  // 30% chance: beach or park wanderer if such a zone is nearby
  const zones = [w.beach, ...(w.parkZones || [])];
  if (rng.chance(0.3)) {
    for (const z of zones) {
      const zx = clamp(cx, z.x, z.x + z.w), zy = clamp(cy, z.y, z.y + z.h);
      if (dist2(zx, zy, cx, cy) > maxD * maxD) continue;
      const x = z.x + rng.range(20, z.w - 20), y = clamp(cy + rng.range(-maxD, maxD), z.y + 20, z.y + z.h - 20);
      const d2 = dist2(x, y, cx, cy);
      if (d2 < minD * minD || d2 > maxD * maxD || solidAt(w, x, y)) continue;
      const p = createPed(x, y, 'civ', { zone: z });
      p.state = 'wander'; p.tx = x; p.ty = y;
      if (z === w.beach) p.look.shirt = rng.pick(['#ff4f7b', '#2ec4b6', '#ffe14d', '#ff8c42', '#f1c27d']);
      state.peds.push(p);
      return p;
    }
  }
  for (let tries = 0; tries < 8; tries++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(minD, maxD);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const { bi, bj } = blockOf(x, y);
    const p = createPed(0, 0, 'civ');
    placeOnRing(p, bi, bj);
    if (dist2(p.x, p.y, cx, cy) < minD * minD) continue;
    state.peds.push(p);
    return p;
  }
  return null;
}

export const PED_CRIME = CRIME_HEAT;
