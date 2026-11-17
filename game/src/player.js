// Player controller: walking/sprinting on foot, mouse aim with keyboard aim-assist, attacking,
// entering and jacking cars (the driver bails), driving controls, drive-by shooting and exiting.
import { WEAPONS } from './config.js';
import { clamp, dist2, angleTo, rng } from './mathutil.js';
import { isDown, wasPressed, anyDown, anyPressed, moveAxes, getMouse } from './input.js';
import { createPed } from './peds.js';
import { movePed } from './peds.js';
import { doorPoint, forwardSpeed } from './vehicles.js';
import { solidAt } from './world.js';
import { playerFire, cycleWeapon, selectWeaponSlot } from './combat.js';
import { reportCrime } from './police.js';
import { toast } from './state.js';
import { sfx } from './audio.js';
import { screenToWorld } from './camera.js';

const WALK = 92, SPRINT = 165;

export function nearestEnterable(state, maxD = 48) {
  const pl = state.player;
  let best = null, bd = maxD * maxD;
  for (const v of state.vehicles) {
    if (v.wrecked || v.onFire) continue;
    const d = dist2(v.x, v.y, pl.x, pl.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function autoAimTarget(state, ox, oy, facing) {
  let best = null, bs = Infinity;
  for (const p of state.peds) {
    if (p.state === 'dead') continue;
    const hostile = p.hostile || p.role === 'cop' && state.wanted.level > 0 || p.role === 'gang' || p.role === 'boss';
    const d2 = dist2(p.x, p.y, ox, oy);
    if (d2 > 420 * 420) continue;
    const da = Math.abs(((angleTo(ox, oy, p.x, p.y) - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (da > 0.6) continue;
    const score = Math.sqrt(d2) * (1 + da * 2) * (hostile ? 0.4 : 1);
    if (score < bs) { bs = score; best = p; }
  }
  return best;
}

export function updatePlayer(state, dt, view) {
  const pl = state.player;
  if (pl.dead) return;
  pl.attackCd = Math.max(0, pl.attackCd - dt);
  pl.swing = Math.max(0, pl.swing - dt);
  pl.hurt = Math.max(0, pl.hurt - dt);
  const mouse = getMouse();

  // weapon selection
  if (wasPressed('KeyQ') || mouse.wheel > 0) cycleWeapon(state, 1);
  if (mouse.wheel < 0) cycleWeapon(state, -1);
  for (let k = 1; k <= 5; k++) if (wasPressed('Digit' + k)) selectWeaponSlot(state, k - 1);

  if (pl.enter) return updateEntering(state, dt);
  if (pl.vehicle) return updateDriving(state, dt, view);

  // ---- on foot ----
  const ax = moveAxes();
  const sprint = anyDown('ShiftLeft', 'ShiftRight') && pl.stamina > 0.05;
  const speed = sprint ? SPRINT : WALK;
  const len = Math.hypot(ax.x, ax.y) || 1;
  const wx = ax.x / len * speed, wy = ax.y / len * speed;
  const k = Math.min(1, dt * 12);
  pl.vx += (wx - pl.vx) * k; pl.vy += (wy - pl.vy) * k;
  pl.moving = ax.x !== 0 || ax.y !== 0;
  pl.stamina = clamp(pl.stamina + (sprint && pl.moving ? -0.25 : 0.18) * dt, 0, 1);
  movePed(state, pl, dt);
  const before = pl.walkPhase;
  pl.walkPhase += Math.hypot(pl.vx, pl.vy) * dt * 0.18;
  if (Math.floor(before / Math.PI) !== Math.floor(pl.walkPhase / Math.PI)) sfx.footstep(sprint ? 0.35 : 0.22);

  // facing: mouse aim if the mouse is in use, else movement direction
  const mw = screenToWorld(state, mouse.x, mouse.y, view);
  if (mouse.moved > 0 || mouse.down) pl.a = angleTo(pl.x, pl.y, mw.x, mw.y);
  else if (pl.moving) pl.a = Math.atan2(pl.vy, pl.vx);

  // push civilians out of the way
  for (const p of state.peds) {
    if (p.state === 'dead') continue;
    const dx = p.x - pl.x, dy = p.y - pl.y, d2 = dx * dx + dy * dy;
    if (d2 < 15 * 15 && d2 > 0.01) { const d = Math.sqrt(d2); p.x += dx / d * (15 - d) * 0.6; p.y += dy / d * (15 - d) * 0.6; }
  }

  // attack
  if (mouse.down || anyDown('Space', 'KeyJ')) {
    let aim = pl.a;
    if (!(mouse.moved > 0 || mouse.down)) {
      const t = autoAimTarget(state, pl.x, pl.y, pl.a);
      if (t) aim = angleTo(pl.x, pl.y, t.x, t.y), pl.a = aim;
    }
    const wpn = WEAPONS[pl.weapon];
    if (wpn.melee || pl.attackCd <= 0) playerFire(state, pl.x, pl.y, aim);
  }

  // enter / jack a car
  if (anyPressed('KeyE', 'KeyF')) {
    const v = nearestEnterable(state);
    if (v) beginEnter(state, v);
  }
}

function beginEnter(state, v) {
  const pl = state.player;
  const occupied = v.driver && v.driver !== 'player';
  if (Math.hypot(v.vx, v.vy) > (occupied ? 230 : 140)) { toast(state, 'Too fast to grab!', '#ff9a9a', 1.2); return; }
  pl.enter = { vehicle: v, timer: occupied ? 0.75 : 0.35, max: occupied ? 0.75 : 0.35, jack: occupied };
  if (occupied && v.ai) { v.ai.reverse = 0; }
  sfx.door(0.6);
}

function updateEntering(state, dt) {
  const pl = state.player;
  const e = pl.enter;
  const v = e.vehicle;
  if (v.wrecked || !state.vehicles.includes(v)) { pl.enter = null; return; }
  if (e.jack) { v.throttle = 0; v.handbrake = true; v.steer = 0; }
  const door = doorPoint(v, -1);
  pl.x += (door.x - pl.x) * Math.min(1, dt * 10);
  pl.y += (door.y - pl.y) * Math.min(1, dt * 10);
  pl.a = angleTo(pl.x, pl.y, v.x, v.y);
  e.timer -= dt;
  if (e.timer > 0) return;
  pl.enter = null;
  if (e.jack) {
    const role = v.driver.role || 'civ';
    const bail = createPed(door.x, door.y, role === 'cop' ? 'cop' : 'civ', { look: v.driver.look });
    if (role === 'cop') { bail.state = 'chase'; reportCrime(state, 'hitCop', v.x, v.y); }
    else { bail.state = 'down'; bail.downT = 0.7; bail.fearX = v.x; bail.fearY = v.y; bail.vx = (door.x - v.x) * 7; bail.vy = (door.y - v.y) * 7; bail.a = Math.atan2(door.y - v.y, door.x - v.x); }
    state.peds.push(bail);
    reportCrime(state, 'jack', v.x, v.y);
    toast(state, 'Carjacked: ' + v.spec.name, '#ffc93c', 2);
    state.stats.carsStolen++;
  } else if (v.role === 'parked' || v.role === 'copParked' || v.role === 'roadblock') {
    if (v.role !== 'parked') reportCrime(state, 'jack', v.x, v.y);
    state.stats.carsStolen++;
    toast(state, v.spec.name, '#ffffff', 1.6);
  }
  v.driver = 'player';
  if (v.role !== 'mission') v.role = 'player';
  v.ai = null; v.sleeping = false; v.siren = false;
  pl.vehicle = v;
  sfx.door();
}

function updateDriving(state, dt, view) {
  const pl = state.player;
  const v = pl.vehicle;
  const ax = moveAxes();
  v.throttle = -ax.y;
  v.steer = ax.x;
  // reversing flips steering the natural way handled by physics; nothing else needed
  v.handbrake = isDown('Space');
  if (wasPressed('KeyH')) { sfx.horn(); v.horn = 0.4; }
  if (wasPressed('KeyR') && v.type === 'police') v.siren = !v.siren;
  pl.x = v.x; pl.y = v.y; pl.a = v.a;
  pl.vx = v.vx; pl.vy = v.vy;
  state.stats.distance += Math.hypot(v.vx, v.vy) * dt;

  // drive-by: fire guns toward the mouse
  const mouse = getMouse();
  const wpn = WEAPONS[pl.weapon];
  if (mouse.down && !wpn.melee && pl.attackCd <= 0) {
    const mw = screenToWorld(state, mouse.x, mouse.y, view);
    playerFire(state, v.x, v.y, angleTo(v.x, v.y, mw.x, mw.y));
  }

  if (v.wrecked) { exitVehicle(state, true); return; }
  if (anyPressed('KeyE', 'KeyF')) exitVehicle(state, false);
}

export function exitVehicle(state, forced) {
  const pl = state.player;
  const v = pl.vehicle;
  if (!v) return;
  const fast = Math.hypot(v.vx, v.vy) > 90;
  let p = doorPoint(v, -1);
  if (solidAt(state.world, p.x, p.y)) p = doorPoint(v, 1);
  if (solidAt(state.world, p.x, p.y)) p = { x: v.x - Math.cos(v.a) * (v.spec.len / 2 + 12), y: v.y - Math.sin(v.a) * (v.spec.len / 2 + 12) };
  pl.x = p.x; pl.y = p.y;
  pl.vx = v.vx * 0.4; pl.vy = v.vy * 0.4;
  v.driver = null;
  if (v.role === 'player') v.role = 'abandoned';
  v.throttle = 0; v.steer = 0; v.handbrake = false;
  pl.vehicle = null;
  if (fast && !forced) { toast(state, 'Bailed out!', '#ffc93c', 1.2); state.player.health -= 6; }
  sfx.door();
}

export function playerSpeedKmh(state) {
  const v = state.player.vehicle;
  return v ? Math.abs(forwardSpeed(v)) / 10 * 3.6 : 0;
}

export function teleportPlayer(state, x, y) {
  const pl = state.player;
  if (pl.vehicle) { pl.vehicle.x = x; pl.vehicle.y = y; pl.vehicle.vx = pl.vehicle.vy = 0; }
  pl.x = x; pl.y = y; pl.vx = pl.vy = 0;
}

export const randomBailDelay = () => rng.range(0.1, 0.3);
