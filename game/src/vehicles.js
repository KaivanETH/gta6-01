// Vehicle model: creation, arcade top-down physics with grip/drift, building and water collisions,
// car-to-car impacts, damage, engine fire and explosions.
import { VEHICLE_TYPES } from './config.js';
import { solidAt } from './world.js';
import { sfx, volAt } from './audio.js';
import { rng, clamp, approach } from './mathutil.js';
import { sparks, smoke, fire, skid, tireSmoke, explosionFx, shake, debris } from './fx.js';

let nextId = 1;

export function createVehicle(type, x, y, a, opts = {}) {
  const spec = VEHICLE_TYPES[type];
  return {
    kind: 'vehicle', id: nextId++, type, spec, x, y, a, vx: 0, vy: 0,
    color: opts.color || rng.pick(spec.colors),
    health: spec.health, maxHealth: spec.health,
    driver: opts.driver || null, // null | 'player' | { role, look }
    role: opts.role || 'parked',  // parked | traffic | cop | mission
    ai: null, throttle: 0, steer: 0, handbrake: false,
    siren: false, flash: 0, onFire: false, fireT: 0, wrecked: false, sleeping: !opts.driver,
    skidding: 0, lastSkid: null, hitCd: 0, horn: 0, age: 0, missionTag: opts.missionTag || null,
  };
}

export function forwardSpeed(v) { return v.vx * Math.cos(v.a) + v.vy * Math.sin(v.a); }
export function speedOf(v) { return Math.hypot(v.vx, v.vy); }

// Integrate one vehicle using its current throttle/steer/handbrake controls.
export function stepVehicle(state, v, dt) {
  v.age += dt;
  v.hitCd = Math.max(0, v.hitCd - dt);
  v.flash = Math.max(0, v.flash - dt);
  updateDamage(state, v, dt);
  if (v.sleeping && Math.abs(v.vx) + Math.abs(v.vy) < 1 && !v.driver) return;
  const s = v.spec;
  const fx = Math.cos(v.a), fy = Math.sin(v.a), rx = -fy, ry = fx;
  let vF = v.vx * fx + v.vy * fy;
  let vR = v.vx * rx + v.vy * ry;
  const driving = v.driver && !v.wrecked;
  const thr = driving ? v.throttle : 0;
  const steer = driving ? v.steer : 0;
  const hb = driving ? v.handbrake : true;
  const dmgK = 0.6 + 0.4 * (v.health / v.maxHealth);

  if (thr > 0) {
    if (vF < -4) vF += s.brake * thr * dt;
    else vF += s.accel * dmgK * thr * (1 - Math.max(0, vF) / (s.maxSpeed * dmgK) * 0.85) * dt;
  } else if (thr < 0) {
    if (vF > 4) vF += s.brake * thr * dt;
    else vF = Math.max(-s.maxSpeed * 0.35, vF + s.accel * 0.6 * thr * dt);
  } else {
    vF = approach(vF, 0, 70 * dt);
  }
  if (hb) vF = approach(vF, 0, (driving ? 260 : 420) * dt);
  vF -= vF * 0.12 * dt;
  vF = clamp(vF, -s.maxSpeed * 0.4, s.maxSpeed * 1.05);

  const grip = hb && driving ? s.grip * 0.22 : s.grip;
  vR *= Math.exp(-grip * dt);

  const speedFactor = clamp(vF / 90, -1, 1);
  const hiSpeed = clamp(Math.abs(vF) / s.maxSpeed, 0, 1);
  let turn = steer * s.steer * speedFactor * (1 - 0.32 * hiSpeed);
  if (hb && driving) turn *= 1.45;
  v.a += turn * dt;

  const nfx = Math.cos(v.a), nfy = Math.sin(v.a);
  v.vx = nfx * vF + -nfy * vR;
  v.vy = nfy * vF + nfx * vR;

  // skid detection: sideways slip or hard handbrake
  const slip = Math.abs(vR);
  v.skidding = slip > 75 || (hb && driving && Math.abs(vF) > 120) || (thr > 0.5 && vF < 60 && vF > 0 && s.accel > 380) ? Math.min(1, slip / 200 + 0.3) : 0;
  if (v.skidding) leaveSkid(state, v);
  else v.lastSkid = null;

  v.x += v.vx * dt;
  v.y += v.vy * dt;
  collideWorld(state, v);
  if (Math.abs(v.vx) + Math.abs(v.vy) < 1 && !v.driver) v.sleeping = true;
}

function wheelPoints(v) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  const hl = v.spec.len * 0.32, hw = v.spec.wid * 0.42;
  return [[-hl, -hw], [-hl, hw]].map(([a, b]) => ({ x: v.x + c * a - s * b, y: v.y + s * a + c * b }));
}

function leaveSkid(state, v) {
  const pts = wheelPoints(v);
  if (v.lastSkid) {
    for (let i = 0; i < 2; i++) skid(state, v.lastSkid[i].x, v.lastSkid[i].y, pts[i].x, pts[i].y);
  }
  v.lastSkid = pts;
  if (rng.chance(0.35)) tireSmoke(state, pts[rng.int(0, 1)].x, pts[0].y);
}

export function vehicleCorners(v, inflate = 0) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  const hl = v.spec.len / 2 + inflate, hw = v.spec.wid / 2 + inflate;
  return [[hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, -hw], [0, hw]]
    .map(([a, b]) => ({ x: v.x + c * a - s * b, y: v.y + s * a + c * b }));
}

// Free-direction normal around a blocked point (works for rects and the irregular shoreline).
export function solidNormal(world, x, y, r = 12) {
  let nx = 0, ny = 0;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    const dx = Math.cos(a), dy = Math.sin(a);
    if (!solidAt(world, x + dx * r, y + dy * r)) { nx += dx; ny += dy; }
  }
  const l = Math.hypot(nx, ny);
  return l < 0.01 ? null : { x: nx / l, y: ny / l };
}

function collideWorld(state, v) {
  const world = state.world;
  let hit = false, impactMax = 0, hx = 0, hy = 0;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    for (const p of vehicleCorners(v)) {
      const s = solidAt(world, p.x, p.y);
      if (!s) continue;
      let n;
      if (typeof s === 'object') {
        const dl = p.x - s.x, dr = s.x + s.w - p.x, dt = p.y - s.y, db = s.y + s.h - p.y;
        const m = Math.min(dl, dr, dt, db);
        n = m === dl ? { x: -1, y: 0, d: dl } : m === dr ? { x: 1, y: 0, d: dr } : m === dt ? { x: 0, y: -1, d: dt } : { x: 0, y: 1, d: db };
      } else {
        const nn = solidNormal(world, p.x, p.y);
        if (!nn) continue;
        n = { ...nn, d: 3 };
      }
      v.x += n.x * Math.min(n.d + 0.5, 14);
      v.y += n.y * Math.min(n.d + 0.5, 14);
      const vn = v.vx * n.x + v.vy * n.y;
      if (vn < 0) {
        v.vx -= n.x * vn * 1.35;
        v.vy -= n.y * vn * 1.35;
        v.vx *= 0.92; v.vy *= 0.92;
        if (-vn > impactMax) { impactMax = -vn; hx = p.x; hy = p.y; }
      }
      any = hit = true;
      if (s === 'water' && !v.splashed) { v.splashed = 0.5; }
    }
    if (!any) break;
  }
  if (hit && impactMax > 60) onImpact(state, v, impactMax, hx, hy);
}

function onImpact(state, v, impact, x, y) {
  if (v.hitCd > 0) return;
  v.hitCd = 0.25;
  const dmg = Math.max(0, (impact - 60) * 0.09);
  damageVehicle(state, v, dmg, null);
  sparks(state, x, y, Math.min(16, 4 + impact / 30));
  if (impact > 160) debris(state, x, y, v.color, 4);
  const vol = volAt(state, x, y);
  sfx.impact(impact / 300, vol);
  if (impact > 200) sfx.glass(vol);
  if (v.driver === 'player') shake(state, Math.min(16, impact / 25));
}

export function damageVehicle(state, v, amount, source) {
  if (v.wrecked) return;
  v.health -= amount;
  v.flash = 0.12;
  if (source === 'player' && v.role === 'cop') v.hitByPlayer = true;
  if (v.health <= 0 && !v.onFire) { v.onFire = true; v.fireT = 4 + rng.range(0, 1.5); v.health = 0; v.killer = source; }
}

function updateDamage(state, v, dt) {
  if (v.wrecked) { if (rng.chance(dt * 3)) smoke(state, v.x, v.y, true, 7); return; }
  const hp = v.health / v.maxHealth;
  if (hp < 0.45 && rng.chance(dt * (hp < 0.25 ? 14 : 5))) smoke(state, v.x + Math.cos(v.a) * v.spec.len * 0.35, v.y + Math.sin(v.a) * v.spec.len * 0.35, hp < 0.25, 6);
  if (v.onFire) {
    v.fireT -= dt;
    if (rng.chance(dt * 30)) fire(state, v.x + Math.cos(v.a) * v.spec.len * 0.3, v.y + Math.sin(v.a) * v.spec.len * 0.3, 9);
    if (v.fireT <= 0) explodeVehicle(state, v);
  }
}

export function explodeVehicle(state, v) {
  v.wrecked = true; v.onFire = false;
  v.color = '#2a2622';
  explosionFx(state, v.x, v.y);
  sfx.explosion(volAt(state, v.x, v.y));
  state.explosions = state.explosions || [];
  state.explosions.push({ x: v.x, y: v.y, source: v.killer, vehicle: v });
  v.vx += rng.range(-40, 40); v.vy += rng.range(-40, 40);
}

// Pairwise vehicle collisions using two circles per car.
export function collideVehicles(state, list, dt) {
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      const dx0 = b.x - a.x, dy0 = b.y - a.y;
      const reach = (a.spec.len + b.spec.len) / 2 + 4;
      if (dx0 * dx0 + dy0 * dy0 > reach * reach) continue;
      resolvePair(state, a, b);
    }
  }
}

function circlesOf(v) {
  const c = Math.cos(v.a), s = Math.sin(v.a), o = v.spec.len * 0.26;
  return [{ x: v.x + c * o, y: v.y + s * o }, { x: v.x - c * o, y: v.y - s * o }];
}

function resolvePair(state, a, b) {
  const ra = a.spec.wid * 0.62, rb = b.spec.wid * 0.62;
  const ca = circlesOf(a), cb = circlesOf(b);
  for (const p of ca) for (const q of cb) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const d = Math.hypot(dx, dy), min = ra + rb;
    if (d >= min || d < 0.001) continue;
    const nx = dx / d, ny = dy / d, pen = min - d;
    const ma = a.spec.mass * (a.wrecked ? 2 : 1), mb = b.spec.mass * (b.wrecked ? 2 : 1);
    const ta = mb / (ma + mb), tb = ma / (ma + mb);
    a.x -= nx * pen * ta; a.y -= ny * pen * ta;
    b.x += nx * pen * tb; b.y += ny * pen * tb;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const j = -(1.3) * rv / (1 / ma + 1 / mb);
      a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
      b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
      a.sleeping = b.sleeping = false;
      const impact = -rv;
      if (impact > 50 && a.hitCd <= 0 && b.hitCd <= 0) {
        a.hitCd = b.hitCd = 0.3;
        const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
        const dmg = (impact - 40) * 0.08;
        const srcA = a.driver === 'player' ? 'player' : null, srcB = b.driver === 'player' ? 'player' : null;
        damageVehicle(state, a, dmg * (mb / (ma + mb)) * 2, srcB);
        damageVehicle(state, b, dmg * (ma / (ma + mb)) * 2, srcA);
        sparks(state, cx, cy, Math.min(18, 4 + impact / 25));
        const vol = volAt(state, cx, cy);
        sfx.impact(impact / 260, vol);
        if (impact > 180) { sfx.glass(vol); debris(state, cx, cy, a.color, 3); debris(state, cx, cy, b.color, 3); }
        if (a.driver === 'player' || b.driver === 'player') shake(state, Math.min(14, impact / 22));
        state.carHits = state.carHits || [];
        state.carHits.push({ a, b, impact });
      }
    }
    return;
  }
}

// Exit/door point beside a vehicle (driver side = left of heading).
export function doorPoint(v, side = -1) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  const off = v.spec.wid / 2 + 12;
  return { x: v.x - s * off * side, y: v.y + c * off * side };
}
