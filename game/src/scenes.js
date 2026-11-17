// Photo-mode scene presets selected with ?scene=… (used for the press screenshots and quick
// testing): each one starts a real game and stages a moment — a police chase, a downtown
// drive, a mission in progress — then the normal simulation takes over.
import { SECONDS_PER_HOUR, nodeX, nodeY } from './config.js';
import { createVehicle } from './vehicles.js';
import { startMission, jumpToStep, MISSIONS } from './missions.js';
import { setWantedLevel } from './police.js';
import { laneSegment, nodeId } from './roads.js';
import { randomLook } from './peds.js';
import { alertGang } from './combat.js';

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
  state.player.x = nodeX(9); state.player.y = nodeY(4);
  api.startPlay(false);
  state = S();
  state.bigText = null;
  state.cash = 18450;
  state.player.weapons = { fist: true, knife: true, pistol: true, smg: true };
  state.player.ammo = { pistol: 84, smg: 240, shotgun: 0 };
  state.player.armor = 70;

  if (name === 'chase') {
    state.clock = 17.6 * SECONDS_PER_HOUR;
    const seg = laneSegment(nodeId(6, 4), nodeId(7, 4));
    const x = seg.sx + 60, y = seg.sy;
    putPlayerInCar(state, 'sports', x, y, 0, '#e63946', 320);
    state.player.weapon = 'smg';
    state.story.next = 5;
    state.story.completed = MISSIONS.slice(0, 5).map((m) => m.id);
    startMission(state, 5);
    jumpToStep(state, 'loseWanted');
    setWantedLevel(state, 4);
    for (const [dx, dy, a] of [[-120, 6, 0], [-230, -30, 0.1], [-60, -110, 1.3]]) {
      const c = createVehicle('police', x + dx, y + dy, a, { role: 'cop', driver: { role: 'cop', look: randomLook('cop') } });
      c.siren = true; c.sleeping = false; c.vx = 300; c.vy = 0;
      c.ai = { node: nodeId(8, 4), prev: nodeId(6, 4), stuck: 0, reverse: 0, shootCd: 1 };
      state.vehicles.push(c);
    }
    state.heli = { x: x + 120, y: y - 160, vx: 0, vy: 0, a: 0, rotor: 0, shootCd: 3, orbit: 0, leaving: false };
    state.camera.x = x + 100; state.camera.y = y;
  } else if (name === 'city') {
    state.clock = 12.2 * SECONDS_PER_HOUR;
    const seg = laneSegment(nodeId(5, 2), nodeId(5, 3));
    putPlayerInCar(state, 'taxi', seg.sx, seg.sy + 40, Math.PI / 2, undefined, 140);
    state.camera.x = seg.sx; state.camera.y = seg.sy + 120;
  } else if (name === 'mission') {
    state.clock = 18.1 * SECONDS_PER_HOUR;
    state.story.next = 5;
    state.story.completed = MISSIONS.slice(0, 5).map((m) => m.id);
    const L = state.world.landmarks.dockyard;
    state.player.x = L.x - 110; state.player.y = L.y - 10;
    startMission(state, 5);
    jumpToStep(state, 'eliminate');
    alertGang(state, 'yard');
    state.player.weapon = 'smg';
    state.player.a = Math.PI / 2;
    state.camera.x = state.player.x; state.camera.y = state.player.y;
  }
}

