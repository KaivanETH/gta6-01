// Combat: player weapons (fists, knife, pistol, SMG, shotgun), hitscan bullets with tracers,
// melee swings, NPC gunfire, player damage/armor, explosions with chain reactions, and
// hostile gang AI that patrols, notices the player and fights back.
import { WEAPONS, WEAPON_ORDER } from './config.js';
import { rng, rayCircle, dist2, angleTo, clamp } from './mathutil.js';
import { solidsNear, isWater } from './world.js';
import { hurtPed, scarePeds } from './peds.js';
import { damageVehicle } from './vehicles.js';
import { reportCrime } from './police.js';
import { panicTraffic } from './traffic.js';
import { sparks, muzzleFlash, tracer, blood, shake, splash } from './fx.js';
import { sfx, volAt } from './audio.js';
import { toast } from './state.js';

// Distance along a ray until it meets a building wall (or maxD).
function wallDistance(world, ox, oy, dx, dy, maxD) {
  for (let t = 6; t < maxD; t += 7) {
    const x = ox + dx * t, y = oy + dy * t;
    const list = solidsNear(world, x, y);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.ht > 6 && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return t;
    }
  }
  return maxD;
}

// Hitscan; returns what was hit. `shooter` is excluded from targets.
export function hitscan(state, ox, oy, angle, range, damage, source, shooter, air = false) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = air ? range : wallDistance(state.world, ox, oy, dx, dy, range);
  let hit = null, hitKind = 'wall';
  for (const p of state.peds) {
    if (p === shooter || p.state === 'dead') continue;
    if (Math.abs(p.x - ox) > range + 20 || Math.abs(p.y - oy) > range + 20) continue;
    if (source !== 'player' && p.role === shooter?.role) continue;
    const t = rayCircle(ox, oy, dx, dy, p.x, p.y, 9);
    if (t >= 0 && t < best) { best = t; hit = p; hitKind = 'ped'; }
  }
  for (const v of state.vehicles) {
    if (v === shooter || (shooter && shooter.vehicle === v)) continue;
    if (source === 'player' && state.player.vehicle === v) continue;
    if (Math.abs(v.x - ox) > range + 40 || Math.abs(v.y - oy) > range + 40) continue;
    const t = rayCircle(ox, oy, dx, dy, v.x, v.y, v.spec.len * 0.42);
    if (t >= 0 && t < best) { best = t; hit = v; hitKind = 'vehicle'; }
  }
  const pl = state.player;
  if (source !== 'player' && !pl.dead) {
    const tgt = pl.vehicle || pl;
    const t = rayCircle(ox, oy, dx, dy, tgt.x, tgt.y, pl.vehicle ? pl.vehicle.spec.len * 0.42 : 9);
    if (t >= 0 && t < best) { best = t; hit = pl; hitKind = 'player'; }
  }
  const hx = ox + dx * best, hy = oy + dy * best;
  tracer(state, ox + dx * 8, oy + dy * 8, hx, hy, source === 'player' ? '#fff6c0' : '#ffd1a8');
  if (hitKind === 'ped') {
    hurtPed(state, hit, damage, source, dx * 60, dy * 60);
    if (source === 'player' && hit.role === 'gang') alertGang(state, hit.missionTag);
  } else if (hitKind === 'vehicle') {
    damageVehicle(state, hit, damage * 0.5, source);
    sparks(state, hx, hy, 5, angle + Math.PI);
    if (hit.ai && hit.role === 'traffic') hit.ai.panic = 6;
    if (source === 'player' && hit.role === 'cop') reportCrime(state, 'hitCop', hx, hy);
  } else if (hitKind === 'player') {
    if (pl.vehicle) { damageVehicle(state, pl.vehicle, damage * 0.4, source); damagePlayer(state, damage * 0.25); sparks(state, hx, hy, 4); }
    else { damagePlayer(state, damage); blood(state, hx, hy, 4); }
  } else if (best < range) {
    sparks(state, hx, hy, 4, angle + Math.PI);
  } else if (isWater(state.world, hx, hy)) splash(state, hx, hy, 5);
  return { hit, kind: hitKind, x: hx, y: hy };
}

export function damagePlayer(state, amount) {
  const pl = state.player;
  if (pl.dead || state.godMode) return;
  const absorbed = Math.min(pl.armor, amount * 0.7);
  pl.armor -= absorbed;
  pl.health -= amount - absorbed;
  pl.hurt = 0.25;
  shake(state, 3);
  if (pl.health <= 0) { pl.health = 0; state.onWasted && state.onWasted(); }
}

let gunfireReportCd = 0;
export function playerFire(state, ox, oy, angle) {
  const pl = state.player;
  const wpn = WEAPONS[pl.weapon];
  if (pl.attackCd > 0) return false;
  if (wpn.melee) {
    pl.attackCd = wpn.cooldown; pl.swing = 0.2;
    meleeSwing(state, ox, oy, angle, wpn);
    return true;
  }
  if ((pl.ammo[pl.weapon] || 0) <= 0) {
    pl.attackCd = 0.3; sfx.ui(0.5);
    toast(state, 'Out of ammo — buy more at Armería La Palma', '#ff9a9a', 1.5);
    const i = WEAPON_ORDER.indexOf('fist'); pl.weapon = WEAPON_ORDER[i];
    return false;
  }
  pl.ammo[pl.weapon]--;
  pl.attackCd = wpn.cooldown;
  muzzleFlash(state, ox + Math.cos(angle) * 10, oy + Math.sin(angle) * 10, angle);
  sfx.shot(pl.weapon);
  shake(state, pl.weapon === 'shotgun' ? 5 : 1.5);
  for (let k = 0; k < wpn.pellets; k++) {
    const a = angle + rng.range(-wpn.spread, wpn.spread);
    hitscan(state, ox, oy, a, wpn.range, wpn.damage, 'player', pl);
  }
  scarePeds(state, ox, oy, 380, true);
  panicTraffic(state, ox, oy, 300);
  gunfireReportCd -= wpn.cooldown;
  if (gunfireReportCd <= 0) {
    gunfireReportCd = 2;
    const witnesses = state.peds.some((p) => p.state !== 'dead' && dist2(p.x, p.y, ox, oy) < 420 * 420);
    if (witnesses && !state.missionNoHeat) reportCrime(state, 'gunfire', ox, oy);
  }
  return true;
}

function meleeSwing(state, ox, oy, angle, wpn) {
  let target = null, bd = Infinity;
  for (const p of state.peds) {
    if (p.state === 'dead') continue;
    const d2 = dist2(p.x, p.y, ox, oy);
    if (d2 > (wpn.range + 8) ** 2) continue;
    const da = Math.abs(((angleTo(ox, oy, p.x, p.y) - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (da > 1.1) continue;
    if (d2 < bd) { bd = d2; target = p; }
  }
  if (target) {
    hurtPed(state, target, wpn.damage, 'player', Math.cos(angle) * 140, Math.sin(angle) * 140);
    if (target.state !== 'dead' && wpn.damage < 20 && target.role === 'civ') { target.state = 'down'; target.downT = 1; }
    if (target.role === 'gang') alertGang(state, target.missionTag);
    if (pl_weapon(state) === 'knife') sfx.slash(); else sfx.punch();
    shake(state, 2);
  } else sfx.slash(0.4);
}
const pl_weapon = (state) => state.player.weapon;

export function npcShoot(state, shooter, tx, ty, weapon, accuracy = 0.6) {
  const wpn = WEAPONS[weapon];
  const base = angleTo(shooter.x, shooter.y, tx, ty);
  const spread = (1 - accuracy) * 0.45 + wpn.spread;
  const a = base + rng.range(-spread, spread);
  muzzleFlash(state, shooter.x, shooter.y, a);
  sfx.shot(weapon, volAt(state, shooter.x, shooter.y) * 0.8);
  hitscan(state, shooter.x, shooter.y, a, wpn.range, wpn.damage * 0.55, shooter.role || 'npc', shooter, !!shooter.air);
}

export function processExplosions(state) {
  if (!state.explosions || !state.explosions.length) return;
  const list = state.explosions; state.explosions = [];
  for (const e of list) {
    if (e.source === 'player' || (e.vehicle && e.vehicle.driver === 'player')) reportCrime(state, e.vehicle?.role === 'cop' ? 'wreckCop' : 'blowCar', e.x, e.y);
    for (const p of state.peds) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 110) hurtPed(state, p, 120 * (1 - d / 110), e.source, (p.x - e.x) * 4, (p.y - e.y) * 4);
    }
    for (const v of state.vehicles) {
      if (v === e.vehicle) continue;
      const d = Math.hypot(v.x - e.x, v.y - e.y);
      if (d < 130) {
        damageVehicle(state, v, 70 * (1 - d / 130), e.source);
        v.vx += (v.x - e.x) / (d || 1) * 220; v.vy += (v.y - e.y) / (d || 1) * 220; v.sleeping = false;
      }
    }
    const pl = state.player;
    const px = pl.vehicle ? pl.vehicle.x : pl.x, py = pl.vehicle ? pl.vehicle.y : pl.y;
    const d = Math.hypot(px - e.x, py - e.y);
    if (d < 110 && !(pl.vehicle && pl.vehicle === e.vehicle && false)) damagePlayer(state, (pl.vehicle ? 40 : 90) * (1 - d / 110));
    if (pl.vehicle === e.vehicle) damagePlayer(state, 200);
    scarePeds(state, e.x, e.y, 500, e.source === 'player');
    panicTraffic(state, e.x, e.y, 500);
    if (d < 600) shake(state, 14 * (1 - d / 600) + 4);
  }
}

// Gang members (Los Tiburones): guard posts, become hostile when alerted, keep range and shoot.
export function gangAI(state, p, dt) {
  const pl = state.player;
  const px = pl.vehicle ? pl.vehicle.x : pl.x, py = pl.vehicle ? pl.vehicle.y : pl.y;
  const d = Math.hypot(px - p.x, py - p.y);
  if (pl.dead) { p.vx *= 0.8; p.vy *= 0.8; return; }
  if (!p.hostile) {
    p.vx *= 0.8; p.vy *= 0.8;
    if (p.guardA !== undefined) p.a = p.guardA + Math.sin(state.time * 0.7 + p.id) * 0.8;
    return;
  }
  p.shootCd -= dt;
  const los = d < 420 && lineOfSightCheap(state, p, px, py);
  if (los && p.shootCd <= 0 && d < 380) {
    p.shootCd = p.role === 'boss' ? rng.range(0.12, 0.3) : rng.range(0.35, 0.9);
    if (p.role === 'boss' && rng.chance(0.15)) p.shootCd = 1.2;
    p.a = angleTo(p.x, p.y, px, py);
    npcShoot(state, p, px, py, p.weapon, p.role === 'boss' ? 0.66 : 0.5);
  }
  const want = los ? 200 : 40;
  const dx = px - p.x, dy = py - p.y, l = d || 1;
  let mx = 0, my = 0;
  if (d > want + 40) { mx = dx / l; my = dy / l; }
  else if (d < want - 60) { mx = -dx / l; my = -dy / l; }
  else { mx = -dy / l * Math.sin(p.id + state.time * 0.5); my = dx / l * Math.sin(p.id + state.time * 0.5); }
  const speed = p.role === 'boss' ? 95 : 105;
  p.vx += (mx * speed - p.vx) * Math.min(1, dt * 5);
  p.vy += (my * speed - p.vy) * Math.min(1, dt * 5);
  if (!los || d >= 380) p.a = Math.atan2(p.vy, p.vx) || p.a;
}

function lineOfSightCheap(state, p, x, y) {
  const d = Math.hypot(x - p.x, y - p.y);
  return wallDistance(state.world, p.x, p.y, (x - p.x) / d, (y - p.y) / d, d) >= d - 2;
}

export function alertGang(state, tag) {
  for (const p of state.peds) if ((p.role === 'gang' || p.role === 'boss') && (!tag || p.missionTag === tag) && !p.hostile) { p.hostile = true; p.shootCd = rng.range(0.3, 1); }
}

export function cycleWeapon(state, dir) {
  const pl = state.player;
  const owned = WEAPON_ORDER.filter((w) => pl.weapons[w]);
  let i = owned.indexOf(pl.weapon);
  i = (i + dir + owned.length) % owned.length;
  pl.weapon = owned[i];
  sfx.ui(0.6);
}

export function selectWeaponSlot(state, slot) {
  const w = WEAPON_ORDER[slot];
  if (w && state.player.weapons[w]) { state.player.weapon = w; sfx.ui(0.6); }
}

export const clampAim = (v) => clamp(v, -1, 1);
