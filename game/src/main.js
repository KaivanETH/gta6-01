// Entry point and game loop: builds the city, owns the mode state machine (title → intro →
// play ⇄ menus), runs the fixed-step simulation of every system, and draws each frame.
import { WEAPONS, BUST_CASH_LOSS, WASTED_CASH_LOSS, DISTRICTS, SECONDS_PER_HOUR } from './config.js';
import { generateWorld, districtAt } from './world.js';
import { createGameState, toast, bigMessage } from './state.js';
import { initInput, wasPressed, endInputFrame } from './input.js';
import { updateCamera, startCinematic, endCinematic } from './camera.js';
import { renderWorld } from './render.js';
import { drawHUD } from './hud.js';
import { buildMapCanvas } from './minimap.js';
import { stepVehicle, collideVehicles } from './vehicles.js';
import { updatePeds, managePopulation } from './peds.js';
import { manageTraffic, driveTraffic, spawnParkedCars, makeTrafficCar } from './traffic.js';
import { updatePolice, driveCop, copFootAI, clearPolice } from './police.js';
import { gangAI, processExplosions } from './combat.js';
import { updatePlayer, exitVehicle } from './player.js';
import { updateFx } from './fx.js';
import { updateMission, missionMarkers, failMission } from './missions.js';
import { updatePickups, placeGoldenShells } from './pickups.js';
import { updateEconomy, economyMarkers, interactableAt, applyPropertyPerks } from './economy.js';
import { initMenus, openMenu, titleMenu, pauseMenu, updateMenu, drawMenu, topMenu, shopMenu, safehouseMenu, propertyMenu, drawIntro, drawCredits } from './menus.js';
import { initAudio, setVolume, setMusicEnabled, updateEngineSound, updateSiren, updateScreech } from './audio.js';
import { setMusic, musicFor, RADIO_STATIONS } from './music.js';
import { saveGame, loadGame, loadOptions } from './save.js';
import { streetNameAt, randomEdgeNear } from './roads.js';
import { rng, reseed, dist2 } from './mathutil.js';
import { INTRO_CRAWL } from './story.js';
import { applyScene } from './scenes.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: 1280, h: 720, zoomScale: 1 };
const world = generateWorld(2026);
buildMapCanvas(world);
let state = null;
const AI_HOOKS = { cop: copFootAI, gang: gangAI, boss: gangAI };

function resize() {
  view.w = canvas.width = Math.max(640, window.innerWidth);
  view.h = canvas.height = Math.max(400, window.innerHeight);
  view.zoomScale = Math.max(0.7, Math.min(1.5, view.h / 720));
}
window.addEventListener('resize', resize);
resize();

function freshState() {
  const options = state ? state.options : loadOptions();
  state = createGameState(world);
  state.options = options;
  state.onWasted = () => onDeath('wasted');
  state.onBusted = () => onDeath('busted');
  state.onAutosave = () => { saveGame(state, true); toast(state, 'Autosaved', '#7ddc6a', 1.6); };
  placeGoldenShells(state);
  spawnParkedCars(state);
  window.__bd = { state, api, view, world };
  return state;
}

// Seed traffic and pedestrians around a point so the city is alive immediately.
function populateAround(x, y) {
  for (let i = 0; i < 26; i++) {
    const e = randomEdgeNear(rng, x, y, 150, 1300);
    if (e) state.vehicles.push(makeTrafficCar(state, e.a, e.b));
  }
  for (let i = 0; i < 60; i++) managePopulation(state, 1);
}

const TITLE_PANS = [
  [4300, 900, 4500, 2400], [2600, 1000, 3200, 1500], [3800, 4300, 2900, 4100], [900, 1700, 1500, 2600],
];
let titlePan = 0;
function titleCinematic() {
  const p = TITLE_PANS[titlePan++ % TITLE_PANS.length];
  startCinematic(state, p[0], p[1], p[2], p[3], 0.85, 0.75, 16);
  state.player.x = p[0]; state.player.y = p[1];
}

const api = {
  newGame() {
    freshState();
    state.mode = 'intro';
    state.intro = { t: 0 };
    state.clock = 17.2 * SECONDS_PER_HOUR;
    populateAround(4200, 1500);
    startCinematic(state, 4500, 900, 3300, 2700, 0.7, 0.95, INTRO_CRAWL.length * 4.2);
    state.menuStack = [];
  },
  continueGame() {
    freshState();
    loadGame(state);
    state.menuStack = [];
    startPlay(false);
    toast(state, 'Save loaded', '#7ddc6a');
  },
  save() { saveGame(state); },
  quitToTitle() { goTitle(); },
  startPlay: (...a) => startPlay(...a),
};
initMenus(api);

function goTitle() {
  freshState();
  state.mode = 'title';
  state.clock = 18 * SECONDS_PER_HOUR;
  state.menuStack = [];
  titleCinematic();
  populateAround(state.player.x, state.player.y);
  openMenu(state, titleMenu(state));
}

function startPlay(fresh = true) {
  state.mode = 'play';
  endCinematic(state);
  const pl = state.player;
  if (fresh) { const sh = world.landmarks.safehouse; pl.x = sh.x + 26; pl.y = sh.y; }
  state.camera.x = pl.x; state.camera.y = pl.y; state.camera.zoom = 1.1;
  state.vehicles = state.vehicles.filter((v) => v.role !== 'traffic' || dist2(v.x, v.y, pl.x, pl.y) > 500 * 500);
  state.peds = [];
  populateAround(pl.x, pl.y);
  if (fresh) {
    state.story.introSeen = true;
    bigMessage(state, 'BAHÍA DORADA', 'Find Tío Ramón at Café La Ramona — follow the ★', '#ffc93c', 5);
    toast(state, 'WASD move · E steal cars · Mouse/Space attack · Esc menu', '#ffffff', 7);
  }
}

function onDeath(kind) {
  const pl = state.player;
  if (pl.dead) return;
  if (pl.vehicle) exitVehicle(state, true);
  pl.dead = true;
  state.deathKind = kind;
  state.respawnTimer = 3.5;
  state.stats[kind]++;
  if (state.mission) failMission(state, kind === 'busted' ? 'You got busted' : 'You died');
}

function respawn() {
  const pl = state.player;
  const busted = state.deathKind === 'busted';
  const loss = Math.floor(state.cash * (busted ? BUST_CASH_LOSS : WASTED_CASH_LOSS));
  state.cash -= loss;
  const L = busted ? world.landmarks.policeHQ : world.landmarks.hospital;
  pl.x = L.x; pl.y = L.y + 12; pl.vx = pl.vy = 0;
  pl.health = pl.maxHealth; pl.armor = 0; pl.dead = false; pl.enter = null;
  if (busted) { for (const w of ['smg', 'shotgun']) pl.ammo[w] = Math.floor((pl.ammo[w] || 0) / 2); }
  if (!pl.weapons[pl.weapon]) pl.weapon = 'fist';
  clearPolice(state);
  state.camera.x = pl.x; state.camera.y = pl.y;
  toast(state, `${busted ? 'Bail' : 'Hospital bill'}: −$${loss}`, '#ff6b6b', 3);
}

// ---- per-frame UI input (once per frame) ------------------------------------------------
function frameInput() {
  if (state.mode === 'menu' || state.mode === 'title') { updateMenu(state); return; }
  if (state.mode === 'intro') {
    if (wasPressed('Enter') || wasPressed('Escape') || wasPressed('Space')) { state.intro.t = 1e9; }
    return;
  }
  if (state.mode !== 'play') return;
  if (state.credits) {
    if (state.credits.t > 3 && (wasPressed('Enter') || wasPressed('Escape'))) state.credits = null;
    return;
  }
  if (wasPressed('Escape') || wasPressed('KeyP')) { state.mode = 'menu'; openMenu(state, pauseMenu(state)); return; }
  if (wasPressed('KeyM')) { state.mode = 'menu'; openMenu(state, { id: 'map', kind: 'map', items: [{ label: 'Back', run: () => { state.menuStack.pop(); state.mode = 'play'; } }] }); return; }
  if (wasPressed('Tab') && state.player.vehicle) { state.radio = (state.radio + 1) % RADIO_STATIONS.length; toast(state, '♪ ' + RADIO_STATIONS[state.radio].name, RADIO_STATIONS[state.radio].color, 2); }
  if ((wasPressed('KeyE') || wasPressed('KeyF')) && !state.player.dead) {
    const it = interactableAt(state);
    if (it && !state.subtitle) {
      if (it.kind === 'gunshop') { state.mode = 'menu'; openMenu(state, shopMenu(state)); }
      else if (it.kind === 'safehouse') { state.mode = 'menu'; openMenu(state, safehouseMenu(state)); }
      else if (it.kind === 'property' && !state.properties[it.prop]) { state.mode = 'menu'; openMenu(state, propertyMenu(state, it.prop)); }
      state.consumedUse = true;
    }
  }
}

// ---- simulation step -------------------------------------------------------------------
function simulate(dt) {
  state.time += dt;
  const live = state.mode === 'play';
  if (live || state.mode === 'intro') state.clock += dt;
  if (state.mode === 'title' || state.mode === 'intro') {
    state.player.x = state.camera.x; state.player.y = state.camera.y;
  }
  if (live && !state.player.dead && !state.consumedUse) updatePlayer(state, dt, view);
  if (live) state.stats.playTime += dt;

  const cx = state.camera.x, cy = state.camera.y;
  const active = [];
  for (const v of state.vehicles) {
    if (dist2(v.x, v.y, cx, cy) > 2100 * 2100 && v.driver !== 'player') continue;
    if (v.driver && v.driver !== 'player') {
      if (v.role === 'cop' && live) driveCop(state, v, dt);
      else if (v.ai) {
        if (v.role === 'leaving' && !v.ai.cruise) { const nv = makeTrafficCar(state, 0, 1); v.ai = nv.ai; }
        driveTraffic(state, v, dt);
      }
    }
    stepVehicle(state, v, dt);
    active.push(v);
  }
  collideVehicles(state, active, dt);
  updatePeds(state, dt, AI_HOOKS);
  if (live) {
    updatePolice(state, dt);
    processExplosions(state);
    updateMission(state, dt);
    updatePickups(state, dt);
    updateEconomy(state, dt);
  } else processExplosions(state);
  manageTraffic(state, dt);
  managePopulation(state, dt);
  updateFx(state, dt);
  state.carHits = [];
  if (state.respawnTimer > 0) { state.respawnTimer -= dt; if (state.respawnTimer <= 0) respawn(); }
}

function updateUiTimers(dt) {
  for (const t of state.toasts) t.life -= dt;
  state.toasts = state.toasts.filter((t) => t.life > 0);
  if (state.bigText) { state.bigText.life -= dt; if (state.bigText.life <= 0) state.bigText = null; }
  if (state.districtToast) { state.districtToast.life -= dt; if (state.districtToast.life <= 0) state.districtToast = null; }
  const me = state.player.vehicle || state.player;
  const d = districtAt(me.x, me.y);
  if (d !== state.lastDistrict) {
    if (state.lastDistrict && state.mode === 'play') state.districtToast = { name: DISTRICTS[d].name, tag: DISTRICTS[d].tag, life: 3.5, max: 3.5 };
    state.lastDistrict = d;
  }
  state.streetTimer = (state.streetTimer || 0) - dt;
  if (state.streetTimer <= 0) { state.streetTimer = 0.4; state.streetName = streetNameAt(me.x, me.y); }
  state.markers = state.mode === 'play' ? missionMarkers(state).concat(economyMarkers(state)) : [];
  if (state.credits) state.credits.t += dt;
  if (state.mode === 'intro') {
    state.intro.t += dt;
    if (state.intro.t >= INTRO_CRAWL.length * 4.2) startPlay(true);
  }
  if (state.mode === 'title' && state.camera.cinematic && state.camera.cinematic.t >= state.camera.cinematic.dur) titleCinematic();
}

function updateAudio() {
  const pl = state.player;
  const v = pl.vehicle;
  const playing = state.mode === 'play';
  updateEngineSound(playing && !!v && !pl.dead, v ? Math.min(1, Math.hypot(v.vx, v.vy) / v.spec.maxSpeed) : 0, v ? Math.max(0, v.throttle) : 0);
  updateScreech(playing && v ? v.skidding : 0);
  let near = Infinity;
  if (playing) for (const c of state.vehicles) if (c.siren && !c.wrecked) near = Math.min(near, Math.hypot(c.x - pl.x, c.y - pl.y));
  updateSiren(playing ? Math.max(0, 1 - near / 900) : 0, state.wanted.level >= 3);
  setMusic(state.options.music ? musicFor(state) : null);
}

// ---- main loop -----------------------------------------------------------------------------
let last = performance.now(), acc = 0, fps = 60, fpsT = 0, frames = 0;
const STEP = 1 / 60;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frameInput();
  if (state.mode !== 'menu') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) {
      simulate(STEP);
      acc -= STEP; n++;
      if (n === 1) { endInputFrame(0); state.consumedUse = false; }
    }
    if (n >= 4) acc = 0;
    updateCamera(state, dt, view);
    if (!state.options.shake) state.camera.shake = 0;
  }
  updateUiTimers(dt);
  updateAudio();
  draw();
  endInputFrame(dt);
  state.consumedUse = false;
  frames++; fpsT += dt;
  if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}

function draw() {
  renderWorld(ctx, state, view, state.time);
  if (state.mode === 'play' || (state.mode === 'menu' && topMenu(state)?.kind !== 'map')) drawHUD(ctx, state, view, state.time);
  if (state.mode === 'intro') drawIntro(ctx, state, view, state.time);
  if (state.mode === 'menu' || state.mode === 'title') drawMenu(ctx, state, view, state.time);
  if (state.credits && state.mode === 'play') drawCredits(ctx, state, view);
  if (state.options.showFps) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.fillText(`${fps} fps · ${state.vehicles.length} cars · ${state.peds.length} peds`, 8, view.h - 6);
  }
}

initInput(canvas, () => {
  initAudio();
  setVolume(state.options.volume);
  setMusicEnabled(state.options.music);
});

reseed(Date.now() & 0xffff);
goTitle();
const scene = new URLSearchParams(location.search).get('scene');
if (scene) applyScene(state, scene, api, view);
requestAnimationFrame(frame);

export { state, WEAPONS, applyPropertyPerks };
