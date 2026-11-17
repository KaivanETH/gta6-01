// Menus and full-screen overlays: title screen (New Game / Continue / Options / Controls),
// pause menu (map, mission log, save/load, options, quit), gun shop, safehouse, property
// purchase, the opening cinematic crawl and the ending credits. Keyboard and mouse driven.
import { GAME_TITLE, GAME_SUBTITLE } from './config.js';
import { wasPressed, getMouse } from './input.js';
import { rrect } from './sprites.js';
import { formatMoney } from './mathutil.js';
import { MISSIONS } from './story.js';
import { shopItems, buyProperty, PROPERTIES, restAtSafehouse } from './economy.js';
import { drawFullMap } from './minimap.js';
import { sfx, setVolume, setMusicEnabled } from './audio.js';
import { hasSave, saveSummary, saveOptions } from './save.js';
import { INTRO_CRAWL } from './story.js';

const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
let api = null;
let itemRects = [];

export function initMenus(gameApi) { api = gameApi; }

export function openMenu(state, menu) {
  state.menuStack = state.menuStack || [];
  menu.index = menu.index ?? firstEnabled(menu.items || []);
  state.menuStack.push(menu);
  sfx.ui(0.5);
}
export function closeMenu(state) {
  state.menuStack.pop();
  if (!state.menuStack.length && state.mode === 'menu') state.mode = 'play';
}
export function topMenu(state) { return state.menuStack && state.menuStack[state.menuStack.length - 1]; }

function firstEnabled(items) { const i = items.findIndex((it) => !it.disabled); return i < 0 ? 0 : i; }

// ---- menu definitions ---------------------------------------------------------------------
export function titleMenu(state) {
  return {
    id: 'title', kind: 'title', items: [
      { label: 'New Game', run: () => api.newGame() },
      { label: 'Continue', sub: saveSummary() || 'No saved game', disabled: !hasSave(), run: () => api.continueGame() },
      { label: 'Options', run: () => openMenu(state, optionsMenu(state)) },
      { label: 'Controls', run: () => openMenu(state, { id: 'controls', kind: 'controls', title: 'CONTROLS', items: [{ label: 'Back', run: () => closeMenu(state) }] }) },
    ],
  };
}

export function pauseMenu(state) {
  return {
    id: 'pause', title: 'PAUSED', subtitle: 'Bahía Dorada', items: [
      { label: 'Resume', run: () => closeMenu(state) },
      { label: 'City Map', run: () => openMenu(state, { id: 'map', kind: 'map', items: [{ label: 'Back', run: () => closeMenu(state) }] }) },
      { label: 'Mission Log', run: () => openMenu(state, missionLogMenu(state)) },
      { label: 'Save Game', sub: state.mission ? 'Finish or fail the current mission first' : '', disabled: !!state.mission, run: () => { api.save(); closeMenu(state); } },
      { label: 'Load Game', sub: saveSummary() || 'No saved game', disabled: !hasSave(), run: () => api.continueGame() },
      { label: 'Options', run: () => openMenu(state, optionsMenu(state)) },
      { label: 'Controls', run: () => openMenu(state, { id: 'controls', kind: 'controls', title: 'CONTROLS', items: [{ label: 'Back', run: () => closeMenu(state) }] }) },
      { label: 'Quit to Title', run: () => api.quitToTitle() },
    ],
  };
}

function optionsMenu(state) {
  const o = state.options;
  const m = {
    id: 'options', title: 'OPTIONS', items: [
      { label: 'Volume', right: () => `${Math.round(o.volume * 100)}%`, adjust: (d) => { o.volume = Math.max(0, Math.min(1, o.volume + d * 0.1)); setVolume(o.volume); }, run: () => { o.volume = o.volume >= 1 ? 0 : Math.min(1, o.volume + 0.1); setVolume(o.volume); } },
      { label: 'Music & Radio', right: () => (o.music ? 'ON' : 'OFF'), run: () => { o.music = !o.music; setMusicEnabled(o.music); } },
      { label: 'Screen Shake', right: () => (o.shake ? 'ON' : 'OFF'), run: () => { o.shake = !o.shake; } },
      { label: 'Show FPS', right: () => (o.showFps ? 'ON' : 'OFF'), run: () => { o.showFps = !o.showFps; } },
      { label: 'Back', run: () => { saveOptions(o); closeMenu(state); } },
    ],
  };
  return m;
}

function missionLogMenu(state) {
  const items = MISSIONS.map((ms, i) => {
    const done = state.story.completed.includes(ms.id);
    const current = state.mission && state.mission.index === i;
    const status = done ? '✔ PASSED' : current ? '▶ ACTIVE' : i === state.story.next ? '★ AVAILABLE' : 'LOCKED';
    return { label: `${i + 1}. ${ms.title}`, right: status, sub: i <= state.story.next ? `${ms.summary}  (${ms.giverName}, reward ${formatMoney(ms.reward)})` : '???', info: true };
  });
  items.push({ label: 'Back', run: () => closeMenu(state) });
  return { id: 'log', kind: 'log', title: 'MISSION LOG', items };
}

export function shopMenu(state) {
  const m = { id: 'shop', title: 'ARMERÍA LA PALMA', subtitle: 'Guns, ammo & armor', items: [] };
  // purchases change prices/ownership, so the list is rebuilt after every buy
  const rebuild = () => {
    m.items = shopItems(state).map((it) => ({ ...it, run: () => { it.run(); rebuild(); } }));
    m.items.push({ label: 'Leave', run: () => closeMenu(state) });
  };
  rebuild();
  return m;
}

export function safehouseMenu(state) {
  return {
    id: 'safehouse', title: 'CASA BRISA', subtitle: state.properties.penthouse ? 'Safehouse · Penthouse perks active' : 'Safehouse', items: [
      { label: 'Save Game', sub: state.mission ? 'Not during a mission' : 'Writes to this browser\'s storage', disabled: !!state.mission, run: () => { if (state.properties.penthouse) { state.player.health = state.player.maxHealth; state.player.armor = state.player.maxArmor; } api.save(); closeMenu(state); } },
      { label: 'Rest', sub: 'Heal and skip to morning / evening', disabled: !!state.mission || state.wanted.level > 0, run: () => { restAtSafehouse(state); closeMenu(state); } },
      { label: 'Switch Radio Preset', right: () => ['Ola', 'Retro', 'Cumbia', 'Off'][state.radio], run: () => { state.radio = (state.radio + 1) % 4; } },
      { label: 'Leave', run: () => closeMenu(state) },
    ],
  };
}

export function propertyMenu(state, id) {
  const p = PROPERTIES[id];
  return {
    id: 'property', title: p.name.toUpperCase(), subtitle: `Perk: ${p.perk}`, items: [
      { label: `Buy for ${formatMoney(p.price)}`, disabled: state.cash < p.price, sub: state.cash < p.price ? `You have ${formatMoney(state.cash)}` : '', run: () => { buyProperty(state, id); closeMenu(state); } },
      { label: 'Leave', run: () => closeMenu(state) },
    ],
  };
}

// ---- input --------------------------------------------------------------------------------
export function updateMenu(state) {
  const m = topMenu(state);
  if (!m) return;
  const items = m.items;
  const move = (d) => {
    let i = m.index;
    for (let k = 0; k < items.length; k++) { i = (i + d + items.length) % items.length; if (!items[i].disabled && !items[i].info || m.kind === 'log') break; }
    m.index = i; sfx.ui(0.35);
  };
  if (wasPressed('ArrowUp') || wasPressed('KeyW')) move(-1);
  if (wasPressed('ArrowDown') || wasPressed('KeyS')) move(1);
  const it = items[m.index];
  if (it && it.adjust && (wasPressed('ArrowLeft') || wasPressed('KeyA'))) { it.adjust(-1); sfx.ui(0.5); }
  if (it && it.adjust && (wasPressed('ArrowRight') || wasPressed('KeyD'))) { it.adjust(1); sfx.ui(0.5); }
  const mouse = getMouse();
  for (const r of itemRects) {
    if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) {
      if (mouse.moved > 0 && m.index !== r.i && !items[r.i].disabled) m.index = r.i;
      if (mouse.clicked && !items[r.i].disabled && items[r.i].run) { items[r.i].run(); sfx.ui(0.7); return; }
    }
  }
  if ((wasPressed('Enter') || wasPressed('NumpadEnter') || wasPressed('KeyE') || wasPressed('Space')) && it && !it.disabled && it.run) { it.run(); sfx.ui(0.7); return; }
  if ((wasPressed('Escape') || wasPressed('Backspace')) && m.id !== 'title') {
    if (m.id === 'options') saveOptions(state.options);
    closeMenu(state);
  }
}

// ---- drawing ------------------------------------------------------------------------------
function t(ctx, s, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

export function drawMenu(ctx, state, view, time) {
  const m = topMenu(state);
  if (!m) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (m.kind === 'title') return drawTitle(ctx, state, view, time, m);
  if (m.kind === 'map') { drawFullMap(ctx, state, view, time); t(ctx, 'Esc — back', view.w - 30, view.h - 24, 14, '#ccc', 'right'); itemRects = []; return; }
  ctx.fillStyle = 'rgba(8,8,28,0.72)'; ctx.fillRect(0, 0, view.w, view.h);
  if (m.kind === 'controls') return drawControls(ctx, state, view, m);
  const wide = m.kind === 'log';
  const w = wide ? 760 : 480;
  const x = view.w / 2 - w / 2;
  let y = wide ? 90 : 150;
  t(ctx, m.title, view.w / 2, y, 40, '#ffc93c', 'center');
  if (m.subtitle) t(ctx, m.subtitle, view.w / 2, y + 36, 16, '#dddddd', 'center', 'normal');
  if (m.id === 'shop' || m.id === 'property') t(ctx, 'Cash: ' + formatMoney(state.cash), view.w / 2, y + 60, 18, '#7ddc6a', 'center');
  y += m.subtitle ? 90 : 64;
  if (m.id === 'shop' || m.id === 'property') y += 14;
  itemRects = [];
  const rowH = wide ? 52 : 46;
  m.items.forEach((it, i) => {
    const sel = i === m.index;
    ctx.fillStyle = sel ? 'rgba(255,79,123,0.9)' : 'rgba(255,255,255,0.08)';
    rrect(ctx, x, y, w, rowH - 6, 8); ctx.fill();
    const col = it.disabled ? '#888' : '#fff';
    t(ctx, it.label, x + 18, y + (it.sub ? 15 : (rowH - 6) / 2), 19, col);
    const right = typeof it.right === 'function' ? it.right() : it.right;
    if (right) t(ctx, right, x + w - 18, y + (rowH - 6) / 2, 17, it.disabled ? '#888' : sel ? '#fff' : '#ffc93c', 'right');
    if (it.sub) {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w - (right ? 140 : 10), rowH); ctx.clip();
      t(ctx, it.sub, x + 18, y + 33, 12, sel ? '#ffe' : '#aaa', 'left', 'normal');
      ctx.restore();
    }
    itemRects.push({ x, y, w, h: rowH - 6, i });
    y += rowH;
  });
  if (m.kind === 'log') drawStats(ctx, state, view, y + 10);
  t(ctx, '↑/↓ select · Enter confirm · Esc back', view.w / 2, view.h - 26, 13, '#aaa', 'center', 'normal');
}

function drawStats(ctx, state, view, y) {
  const s = state.stats;
  const shells = (state.shells || []).filter((q) => q.taken).length;
  const owned = Object.entries(state.properties).filter(([, v]) => v).length;
  const line = `Kills ${s.kills} · Cars stolen ${s.carsStolen} · Driven ${(s.distance / 10000).toFixed(1)} km · Max wanted ${s.maxWanted}★ · Shells ${shells}/16 · Properties ${owned}/3 · Busted ${s.busted} · Wasted ${s.wasted}`;
  t(ctx, line, view.w / 2, y, 14, '#ddd', 'center', 'normal');
}

function drawControls(ctx, state, view, m) {
  const rows = [
    ['W A S D / Arrows', 'Walk · Drive (accelerate, brake/reverse, steer)'],
    ['Mouse', 'Aim on foot, drive-by aim from a car'],
    ['Left click / Space / J', 'Attack / shoot (on foot) · Space = handbrake (car)'],
    ['Shift', 'Sprint'],
    ['E (or F)', 'Enter / steal / exit car · use shops & safehouse'],
    ['Q · 1-5 · Mouse wheel', 'Switch weapon'],
    ['H · R', 'Horn · siren (police car)'],
    ['Tab', 'Change radio station'],
    ['M', 'City map'],
    ['Enter', 'Skip dialogue / cinematic'],
    ['Esc / P', 'Pause menu: save, load, mission log, options'],
  ];
  t(ctx, 'CONTROLS', view.w / 2, 110, 40, '#ffc93c', 'center');
  let y = 180;
  for (const [k, d] of rows) {
    t(ctx, k, view.w / 2 - 20, y, 17, '#ffc93c', 'right');
    t(ctx, d, view.w / 2 + 10, y, 17, '#ffffff', 'left', 'normal');
    y += 34;
  }
  itemRects = [{ x: view.w / 2 - 100, y: y + 10, w: 200, h: 40, i: 0 }];
  ctx.fillStyle = 'rgba(255,79,123,0.9)'; rrect(ctx, view.w / 2 - 100, y + 10, 200, 40, 8); ctx.fill();
  t(ctx, 'Back', view.w / 2, y + 30, 19, '#fff', 'center');
}

function drawTitle(ctx, state, view, time, m) {
  const W = view.w, H = view.h;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(40,10,60,0.55)'); g.addColorStop(0.55, 'rgba(255,90,90,0.15)'); g.addColorStop(1, 'rgba(10,5,30,0.85)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // sun
  const sx = W * 0.72, sy = H * 0.34;
  const sg = ctx.createLinearGradient(0, sy - 110, 0, sy + 110);
  sg.addColorStop(0, '#ffe66d'); sg.addColorStop(0.6, '#ff7a59'); sg.addColorStop(1, '#ff3d7f');
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(sx, sy, 110, 0, Math.PI * 2); ctx.fillStyle = sg; ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) ctx.fillRect(sx - 120, sy + 18 + i * 16, 240, 3 + i * 1.3);
  ctx.restore();
  // palms silhouettes
  drawPalmSilhouette(ctx, W * 0.9, H * 0.62, 1.2, time);
  drawPalmSilhouette(ctx, W * 0.55, H * 0.68, 0.9, time + 1);
  // logo
  ctx.save();
  ctx.translate(W * 0.08, H * 0.25);
  ctx.font = `italic 900 92px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lg = ctx.createLinearGradient(0, -50, 0, 50);
  lg.addColorStop(0, '#fff4b0'); lg.addColorStop(0.5, '#ffb347'); lg.addColorStop(1, '#ff3d7f');
  ctx.lineWidth = 10; ctx.strokeStyle = '#2a0b3d'; ctx.strokeText(GAME_TITLE, 0, 0);
  ctx.fillStyle = lg; ctx.fillText(GAME_TITLE, 0, 0);
  ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = '#3cf2ff'; ctx.lineWidth = 5; ctx.strokeText(GAME_SUBTITLE.toUpperCase(), 6, 66); ctx.fillText(GAME_SUBTITLE.toUpperCase(), 6, 66);
  ctx.restore();
  // menu
  itemRects = [];
  let y = H * 0.48;
  const x = W * 0.08;
  m.items.forEach((it, i) => {
    const sel = i === m.index;
    const w = 330;
    ctx.fillStyle = sel ? 'rgba(255,61,127,0.92)' : 'rgba(10,6,30,0.55)';
    rrect(ctx, x, y, w, 46, 10); ctx.fill();
    if (sel) { ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2; rrect(ctx, x, y, w, 46, 10); ctx.stroke(); }
    t(ctx, it.label.toUpperCase(), x + 20, y + (it.sub && i === 1 ? 16 : 23), 21, it.disabled ? '#777' : '#fff');
    if (it.sub && i === 1) t(ctx, it.sub, x + 20, y + 35, 11, '#ddd', 'left', 'normal');
    itemRects.push({ x, y, w, h: 46, i });
    y += 56;
  });
  t(ctx, 'An original open-world crime game · every name, place and sound is fictional and made in code', W / 2, H - 22, 13, 'rgba(255,255,255,0.7)', 'center', 'normal');
  t(ctx, 'Enter to select', x, y + 10, 13, '#ccc', 'left', 'normal');
}

function drawPalmSilhouette(ctx, x, y, s, time) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#1a0b2a'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 220); ctx.quadraticCurveTo(-20, 100, 10, 0); ctx.stroke();
  ctx.fillStyle = '#1a0b2a';
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.5 + Math.sin(time + k) * 0.04;
    ctx.save(); ctx.translate(10, 0); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(55, 0, 60, 10, 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ---- intro cinematic & credits -----------------------------------------------------------
export function drawIntro(ctx, state, view, time) {
  const it = state.intro;
  const W = view.w, H = view.h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const bar = 90;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
  const per = 4.2;
  const i = Math.min(INTRO_CRAWL.length - 1, Math.floor(it.t / per));
  const k = (it.t % per) / per;
  const a = Math.min(1, k * 5, (1 - k) * 5);
  ctx.globalAlpha = Math.max(0, a);
  ctx.font = `bold 24px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(INTRO_CRAWL[i], W / 2, H - bar - 50);
  ctx.fillStyle = '#fff'; ctx.fillText(INTRO_CRAWL[i], W / 2, H - bar - 50);
  ctx.globalAlpha = 1;
  if (it.t < 3) {
    ctx.globalAlpha = Math.min(1, (3 - it.t));
    ctx.font = `italic 900 64px ${FONT}`; ctx.fillStyle = '#ffc93c'; ctx.strokeStyle = '#2a0b3d'; ctx.lineWidth = 8;
    ctx.strokeText(GAME_TITLE, W / 2, H / 2 - 40); ctx.fillText(GAME_TITLE, W / 2, H / 2 - 40);
    ctx.globalAlpha = 1;
  }
  t(ctx, 'Enter — skip', W - 24, H - 40, 13, '#bbb', 'right', 'normal');
}

export function drawCredits(ctx, state, view) {
  const c = state.credits;
  const W = view.w, H = view.h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(8,4,24,${Math.min(0.85, c.t * 0.4)})`; ctx.fillRect(0, 0, W, H);
  c.lines.forEach((line, i) => {
    const a = Math.max(0, Math.min(1, c.t - i * 1.5));
    ctx.globalAlpha = a;
    t(ctx, line, W / 2, H * 0.3 + i * 52, i === 0 ? 54 : 22, i === 0 ? '#ffc93c' : '#fff', 'center', i === 0 ? '900' : 'bold');
  });
  ctx.globalAlpha = 1;
  if (c.t > 6) t(ctx, 'Press Enter to keep exploring', W / 2, H - 60, 16, '#ccc', 'center', 'normal');
}
