// Photo-mode scene presets selected with ?scene=… (used for the press screenshots and quick
// testing): each one starts a real game and stages a moment — a police chase, a downtown
// drive, a mission in progress — then the normal simulation takes over.
import { SECONDS_PER_HOUR, nodeX, nodeY } from './config.js';
import { startMission, jumpToStep, MISSIONS } from './missions.js';
import { setWantedLevel } from './police.js';
import { createVehicle } from './vehicles.js';
import { randomLook } from './peds.js';
import { laneSegment, nodeId } from './roads.js';

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
    state.clock = 17.4 * SECONDS_PER_HOUR;
    const seg = laneSegment(nodeId(4, 4), nodeId(5, 4));
    const x = seg.sx + 30, y = seg.sy;
    putPlayerInCar(state, 'sports', x, y, 0, '#ff3b2f', 320);
    state.player.weapon = 'smg';
    setWantedLevel(state, 4);
    state.wanted.flash = 0;
    api.populate(x + 460, y + 40);
    api.populate(x + 240, y - 300);
    for (const [dx, dy, a, sp] of [[-150, 6, 0, 330], [-236, -30, 0.1, 330], [-322, 24, -0.08, 322]]) {
      const c = createVehicle('police', x + dx, y + dy, a, { role: 'cop', driver: { role: 'cop', look: randomLook('cop') } });
      c.siren = true; c.sleeping = false; c.vx = sp; c.vy = 0;
      c.ai = { node: nodeId(6, 4), prev: nodeId(4, 4), stuck: 0, reverse: 0, shootCd: 1.2 };
      state.vehicles.push(c);
    }
    state.heli = { x: x + 240, y: y - 210, vx: 230, vy: 20, a: 0.4, rotor: 0, shootCd: 3, orbit: -1.2, leaving: false };
    // rubber laid down the avenue, and a patrol car already burning on the far lane
    for (let i = 0; i < 46; i++) {
      const sx = x - 60 - i * 26;
      state.skids.push({ x1: sx, y1: y - 9, x2: sx - 24, y2: y - 9, life: 22 });
      state.skids.push({ x1: sx, y1: y + 9, x2: sx - 24, y2: y + 9, life: 22 });
    }
    const wreck = createVehicle('police', x + 300, y - 52, 2.6, { role: 'copParked' });
    wreck.health = 0; wreck.onFire = true; wreck.fireT = 60; wreck.sleeping = false;
    state.vehicles.push(wreck);
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
    state.clock = 17.8 * SECONDS_PER_HOUR;
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
    state.bigText = null;
    state.player.weapon = 'smg';
    state.player.armor = 100;
    state.camera.x = state.player.x + 90; state.camera.y = state.player.y;
  }
}

