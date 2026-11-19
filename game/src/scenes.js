// Photo-mode scene presets selected with ?scene=… (used for the press screenshots and quick
// testing): each one starts a real game and stages a moment — a police chase, a downtown
// drive, a mission in progress — then the normal simulation takes over.
import { SECONDS_PER_HOUR, nodeX, nodeY } from './config.js';
import { startMission, jumpToStep, MISSIONS } from './missions.js';
import { setWantedLevel } from './police.js';
import { createVehicle } from './vehicles.js';
import { randomLook } from './peds.js';
import { laneSegment, nodeId } from './roads.js';
import { rng } from './mathutil.js';
import { tireSmoke } from './fx.js';

function S() { return window.__bd.state; }

function putPlayerInCar(state, type, x, y, a, color, speed = 0) {
  const v = createVehicle(type, x, y, a, { role: 'player', driver: 'player', color });
  v.vx = Math.cos(a) * speed; v.vy = Math.sin(a) * speed;
  state.vehicles = state.vehicles.filter((o) => Math.hypot(o.x - x, o.y - y) > 120);
  state.vehicles.push(v);
  state.player.vehicle = v;
  state.player.x = x; state.player.y = y;
  return v;
}

export function applyScene(_state, name, api) {
  if (name === 'title') return;
  api.newGame();
  let state = S();
  const q = new URLSearchParams(location.search);
  // the sandbox scenes take their spawn corner from the query string; the scripted scenes stay put
  const free = name === 'free';
  const spawnI = free ? Math.round(Number(q.get('i') || 5)) : 9;
  const spawnJ = free ? Math.round(Number(q.get('j') || 3)) : 4;
  const curb = free ? 66 : 0;
  state.player.x = nodeX(spawnI) + curb; state.player.y = nodeY(spawnJ) + curb;
  api.startPlay(false);
  state = S();
  state.bigText = null;
  state.cash = 18450;
  state.player.weapons = { fist: true, knife: true, pistol: true, smg: true };
  state.player.ammo = { pistol: 84, smg: 240, shotgun: 0 };
  state.player.armor = 70;

  if (name === 'chase') {
    // Four-star pursuit on Calle Esperanza: Sol's Rayo GT is out front, a pack of cruisers is
    // on the bumper with lights strobing, a wrecked patrol car burns in the oncoming lane and
    // the helicopter is already overhead. The throttle is the player's from here.
    // Golden hour: the low sun throws long building shadows across the avenue.
    state.clock = 17.4 * SECONDS_PER_HOUR;
    const seg = laneSegment(nodeId(4, 4), nodeId(5, 4));
    const x = seg.sx + 30, y = seg.sy;
    const hero = putPlayerInCar(state, 'sports', x, y, 0, '#ff3b2f', 320);
    // the press chase is a moment, not a survival run: a reinforced hero car keeps the shot
    // in the fight while the cruiser pack and the helicopter put on the pressure
    hero.health = hero.maxHealth = 220;
    state.player.weapon = 'smg';
    setWantedLevel(state, 4);
    state.wanted.flash = 0;
    api.populate(x + 460, y + 40);
    api.populate(x + 240, y - 300);
    // the pack sits in two staggered rows behind the hero car so no cruiser covers it
    for (const [dx, dy, a, sp] of [[-208, -46, 0.03, 336], [-246, 50, -0.03, 334], [-352, -2, 0.02, 330]]) {
      const c = createVehicle('police', x + dx, y + dy, a, { role: 'cop', driver: { role: 'cop', look: randomLook('cop') } });
      c.siren = true; c.sleeping = false; c.vx = sp; c.vy = 0;
      c.ai = { node: nodeId(6, 4), prev: nodeId(4, 4), stuck: 0, reverse: 0, shootCd: 1.2 };
      state.vehicles.push(c);
    }
    state.heli = { x: x + 240, y: y - 210, vx: 230, vy: 20, a: 0.4, rotor: 0, shootCd: 3, orbit: -1.2, leaving: false };
    // a hanging bank of tyre smoke behind the car: the scene opens mid-drift, so the first
    // frames already show the slide that the player is about to continue
    for (let i = 0; i < 30; i++) {
      tireSmoke(state, x - 30 - i * 18 + rng.range(-10, 10), y + rng.range(-16, 16), 0.8);
    }
    // rubber laid down the avenue, and a patrol car already burning on the far lane
    for (let i = 0; i < 46; i++) {
      const sx = x - 60 - i * 26;
      state.skids.push({ x1: sx, y1: y - 9, x2: sx - 24, y2: y - 9, life: 22 });
      state.skids.push({ x1: sx, y1: y + 9, x2: sx - 24, y2: y + 9, life: 22 });
    }
    const wreck = createVehicle('police', x + 470, y - 92, 2.6, { role: 'copParked' });
    wreck.health = 0; wreck.onFire = true; wreck.fireT = 60; wreck.sleeping = false;
    state.vehicles.push(wreck);
    // burn marks and a warm glow around the wreck read as a fresh crash rather than a parked car
    for (let i = 0; i < 10; i++) {
      state.decals.push({ x: x + 470 + Math.cos(i * 0.9) * (14 + i * 3), y: y - 92 + Math.sin(i * 0.9) * 10, r: 8 + (i % 4) * 3, type: 'scorch', life: 60, rot: i });
    }
    // a couple of smart cars in the oncoming lane so the avenue is not a one-sided parade
    for (const [dx, dy] of [[-40, 76], [150, 84], [-260, 70]]) {
      const c = createVehicle(rng.pick(['sedan', 'taxi', 'muscle']), x + dx, y + dy, Math.PI, { role: 'traffic', driver: { role: 'civ', look: randomLook() } });
      c.vx = -c.spec.maxSpeed * 0.35; c.sleeping = false;
      c.ai = { a: nodeId(5, 5), b: nodeId(4, 5), next: nodeId(3, 5), cruise: 150, stuck: 0, reverse: 0, panic: 0, honk: 0 };
      state.vehicles.push(c);
    }
    // Give the hero a clean runway: clear only the same lane ahead for a stretch so the
    // chase reads as speed instead of a pile-up, while the cross streets stay busy.
    state.vehicles = state.vehicles.filter((o) => {
      if (o.driver === 'player' || o.role === 'cop') return true;
      const ahead = o.x - x, lat = Math.abs(o.y - y);
      return !(ahead > 0 && ahead < 760 && lat < 34);
    });
    state.camera.x = x + 60; state.camera.y = y;
    state.camera.zoom = 1.0;
    state.bigText = null;
  } else if (name === 'city') {
    // midday cruise: a Rayo GT rolling south down Av. Faro through the Centro tower blocks
    state.clock = 12.7 * SECONDS_PER_HOUR;
    const seg = laneSegment(nodeId(8, 0), nodeId(8, 1));
    putPlayerInCar(state, 'sports', seg.sx, seg.sy + 60, Math.PI / 2, '#ff9f1c', 170);
    state.camera.x = seg.sx; state.camera.y = seg.sy + 190;
    api.populate(state.player.x, state.player.y);
  } else if (name === 'free') {
    // A sandbox start for staged press shots: Sol stands armed on a named corner with the
    // clock and story progress taken from the query string, no wanted level and no mission.
    // Everything after this frame comes from real keyboard and mouse input.
    const hour = Number(q.get('hour'));
    state.clock = (Number.isFinite(hour) ? hour : 17.3) * SECONDS_PER_HOUR;
    const done = Math.max(0, Math.min(MISSIONS.length, Number(q.get('story') || 0)));
    state.story.next = done;
    state.story.completed = MISSIONS.slice(0, done).map((m) => m.id);
    state.player.weapon = 'smg';
    state.player.armor = 100;
    state.camera.x = state.player.x; state.camera.y = state.player.y;
    state.camera.zoom = 1.1;
    // make the corner busy straight away instead of waiting for the spawner to catch up
    api.populate(state.player.x, state.player.y);
    api.populate(state.player.x, state.player.y);
    api.populate(state.player.x, state.player.y);
  } else if (name === 'mission') {
    // Mission 3, "El Flaco Paga", caught mid-ram: Sol's Toro is on the cab's bumper through
    // Barrio Rosa with the objective ticker, the timer and the target bar all live.
    // Barrio Rosa at dusk gives the neon shopfronts and amber light the best read.
    state.clock = 17.8 * SECONDS_PER_HOUR;
    state.wantedHintShown = false;
    state.story.next = 2;
    state.story.completed = MISSIONS.slice(0, 2).map((m) => m.id);
    const seg = laneSegment(nodeId(4, 7), nodeId(5, 7));
    putPlayerInCar(state, 'muscle', seg.sx, seg.sy, 0, '#b71c1c', 250);
    startMission(state, 2);
    jumpToStep(state, 'chase');
    const m = state.mission, cab = m && m.tags.flaco;
    if (cab) {
      cab.x = state.player.x + 170; cab.y = state.player.y - 16;
      cab.a = 0; cab.vx = 205; cab.vy = 0;
      cab.health = cab.maxHealth * 0.78;
      m.timer = 150;
    }
    // One star on the clock: a rammed cab is a crime, so the wanted HUD has something live
    // to show beside the objective ticker instead of a row of dark sockets.
    setWantedLevel(state, 1);
    state.wanted.seen = true;
    state.wanted.unseen = 0;
    state.bigText = null;
    state.player.weapon = 'smg';
    state.player.armor = 100;
    state.camera.x = state.player.x + 90; state.camera.y = state.player.y;
    state.camera.zoom = 1.02;
  }
}

