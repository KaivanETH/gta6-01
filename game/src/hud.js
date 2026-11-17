// Heads-up display: cash, wanted stars, health/armor, weapon & ammo, clock, mission objective
// ticker with timers and progress bars, speedometer + radio, district/street names, prompts,
// toasts, dialogue subtitles, big banners, off-screen objective arrow and WASTED/BUSTED screens.
import { WEAPONS, DISTRICTS } from './config.js';
import { formatMoney } from './mathutil.js';
import { gameHour } from './state.js';
import { drawMinimap } from './minimap.js';
import { rrect } from './sprites.js';
import { playerSpeedKmh, nearestEnterable } from './player.js';
import { worldToScreen } from './camera.js';
import { speakerOf } from './missions.js';
import { interactableAt } from './economy.js';
import { RADIO_STATIONS } from './music.js';

const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

function text(ctx, s, x, y, size, color, align = 'left', weight = 'bold', outline = 3) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function star(ctx, cx, cy, r, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
}

function bar(ctx, x, y, w, h, v, color, back = 'rgba(0,0,0,0.55)') {
  ctx.fillStyle = back; rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (v > 0) { ctx.fillStyle = color; rrect(ctx, x + 1.5, y + 1.5, Math.max(h - 3, (w - 3) * Math.min(1, v)), h - 3, (h - 3) / 2); ctx.fill(); }
}

export function drawHUD(ctx, state, view, time) {
  const W = view.w, H = view.h;
  const pl = state.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // damage vignette
  const hurt = Math.max(pl.hurt * 3, pl.health < 30 ? 0.35 + Math.sin(time * 6) * 0.15 : 0);
  if (hurt > 0.01) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(180,0,20,0)'); g.addColorStop(1, `rgba(180,0,20,${Math.min(0.6, hurt)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  drawStatusPanel(ctx, state, W, time);
  drawMissionPanel(ctx, state, time);
  const mm = 196;
  drawMinimap(ctx, state, 22, H - mm - 22, mm, time);
  drawLocation(ctx, state, 22, H - mm - 40);
  if (pl.vehicle) drawSpeedo(ctx, state, W - 120, H - 92, time);
  drawPrompts(ctx, state, W, H);
  drawObjectiveArrow(ctx, state, view, time);
  drawToasts(ctx, state, W);
  drawBust(ctx, state, W, H);
  drawSubtitle(ctx, state, W, H);
  if (!state.credits) drawBigText(ctx, state, W, H);
  if (state.respawnTimer > 0) drawDeath(ctx, state, W, H);
}

function drawStatusPanel(ctx, state, W, time) {
  const pl = state.player;
  const x = W - 24;
  const h = gameHour(state);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  text(ctx, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, x, 26, 20, '#ffffff', 'right');
  text(ctx, formatMoney(state.cash), x, 56, 32, '#7ddc6a', 'right', 'bold', 4);
  // wanted stars
  const w = state.wanted;
  const blink = w.level > 0 && !w.seen && Math.floor(time * 3) % 2 === 0;
  for (let i = 0; i < 5; i++) {
    const on = i < w.level;
    const cx = x - 14 - (4 - i) * 30, cy = 94;
    const pop = w.flash > 0 && on ? 1 + Math.sin(w.flash * 12) * 0.15 : 1;
    star(ctx, cx, cy, 12 * pop, on ? (blink ? 'rgba(255,201,60,0.35)' : '#ffc93c') : 'rgba(0,0,0,0.35)', on ? '#000' : 'rgba(255,255,255,0.45)');
  }
  // health / armor
  bar(ctx, x - 150, 116, 150, 12, pl.health / pl.maxHealth, pl.health < 30 ? '#ff4040' : '#5fd35f');
  bar(ctx, x - 150, 132, 150, 8, pl.armor / pl.maxArmor, '#4fb3ff');
  // weapon
  const wpn = WEAPONS[pl.weapon];
  const ammo = wpn.melee ? '' : `  ${pl.ammo[pl.weapon] || 0}`;
  text(ctx, wpn.name.toUpperCase() + ammo, x, 158, 15, '#ffffff', 'right');
}

function drawMissionPanel(ctx, state, time) {
  const m = state.mission;
  let y = 22;
  if (!m) {
    const done = state.story.completed.length;
    text(ctx, `BAHÍA DORADA`, 24, y + 4, 16, '#ffc93c', 'left');
    const hint = state.story.next < 7 ? 'Follow the ★ on your minimap to the next job' : 'Story complete — the city is yours';
    text(ctx, `${hint}  ·  Story ${done}/7`, 24, y + 26, 13, '#ffffff', 'left', 'normal');
    return;
  }
  const w = 430;
  ctx.fillStyle = 'rgba(10,8,30,0.62)';
  rrect(ctx, 16, 14, w, m.extra ? 92 : 70, 10); ctx.fill();
  ctx.fillStyle = '#ffc93c'; ctx.fillRect(16, 14, 5, m.extra ? 92 : 70);
  text(ctx, m.def.title.toUpperCase(), 32, 32, 15, '#ffc93c', 'left', 'bold', 0);
  text(ctx, m.objective || '…', 32, 58, 16, '#ffffff', 'left', 'bold', 2);
  if (m.timer != null) {
    const t = Math.max(0, m.timer);
    const s = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    text(ctx, s, 16 + w - 14, 32, 18, t < 15 && Math.floor(time * 4) % 2 ? '#ff5a5a' : '#ffffff', 'right', 'bold', 0);
  }
  if (m.extra) {
    const e = m.extra;
    if (e.count !== undefined) text(ctx, `${e.label}: ${e.count}`, 32, 86, 14, '#ff9a9a', 'left', 'bold', 0);
    else {
      text(ctx, e.label, 32, 86, 13, '#dddddd', 'left', 'bold', 0);
      bar(ctx, 130, 79, 150, 12, e.value, e.color || '#ff5a5a');
      if (e.progress !== undefined) { text(ctx, 'Intel', 296, 86, 13, '#dddddd', 'left', 'bold', 0); bar(ctx, 340, 79, 90, 12, e.progress, '#7ddc6a'); }
    }
  }
}

function drawLocation(ctx, state, x, y) {
  const d = DISTRICTS[state.lastDistrict] || DISTRICTS.centro;
  text(ctx, (state.streetName || '').toUpperCase(), x, y, 13, '#ffffff', 'left', 'bold', 3);
  text(ctx, d.name, x, y - 18, 15, '#ffc93c', 'left', 'bold', 3);
  if (state.districtToast) {
    const t = state.districtToast;
    const a = Math.min(1, t.life, (t.max - t.life) * 3);
    ctx.globalAlpha = Math.max(0, a);
    text(ctx, t.name.toUpperCase(), x, y - 64, 30, '#ffffff', 'left', 'bold', 5);
    text(ctx, t.tag, x + 2, y - 40, 15, '#ffc93c', 'left', 'bold', 3);
    ctx.globalAlpha = 1;
  }
}

function drawSpeedo(ctx, state, cx, cy, time) {
  const v = state.player.vehicle;
  const kmh = playerSpeedKmh(state);
  const max = v.spec.maxSpeed / 10 * 3.6;
  ctx.fillStyle = 'rgba(10,8,30,0.6)';
  ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.arc(cx, cy, 58, a0, a1); ctx.stroke();
  const k = Math.min(1, kmh / max);
  const g = ctx.createLinearGradient(cx - 60, cy, cx + 60, cy);
  g.addColorStop(0, '#2ec4b6'); g.addColorStop(0.6, '#ffc93c'); g.addColorStop(1, '#ff4f7b');
  ctx.strokeStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, 58, a0, a0 + (a1 - a0) * k); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = a0 + (a1 - a0) * i / 10;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46); ctx.lineTo(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52); ctx.stroke();
  }
  const na = a0 + (a1 - a0) * k;
  ctx.strokeStyle = '#ff4f7b'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * 48, cy + Math.sin(na) * 48); ctx.stroke();
  text(ctx, String(Math.round(kmh)), cx, cy + 22, 26, '#ffffff', 'center', 'bold', 0);
  text(ctx, 'KM/H', cx, cy + 42, 10, '#bbbbbb', 'center', 'bold', 0);
  text(ctx, v.spec.name.toUpperCase(), cx, cy - 84, 13, '#ffffff', 'center');
  bar(ctx, cx - 50, cy - 74, 100, 6, v.health / v.maxHealth, v.health < v.maxHealth * 0.35 ? '#ff4040' : '#ffc93c');
  const st = RADIO_STATIONS[state.radio];
  text(ctx, '♪ ' + st.name, cx - 80, cy + 66, 12, st.color, 'right', 'bold', 3);
}

function drawPrompts(ctx, state, W, H) {
  const pl = state.player;
  if (pl.dead || state.subtitle) return;
  let msg = null;
  const it = interactableAt(state);
  if (it) {
    msg = it.kind === 'gunshop' ? 'Press E — Armería La Palma (shop)' : it.kind === 'safehouse' ? 'Press E — Casa Brisa (save / rest)' : it.kind === 'property' ? (state.properties[it.prop] ? 'Your property' : 'Press E — Buy property') : null;
  } else if (!pl.vehicle && !pl.enter) {
    const v = nearestEnterable(state);
    if (v) msg = v.driver && v.driver !== 'player' ? `Press E — Carjack ${v.spec.name}` : `Press E — Enter ${v.spec.name}`;
  }
  if (!msg) return;
  ctx.font = `bold 16px ${FONT}`;
  const w = ctx.measureText(msg).width + 30;
  ctx.fillStyle = 'rgba(10,8,30,0.7)'; rrect(ctx, W / 2 - w / 2, H - 150, w, 32, 8); ctx.fill();
  text(ctx, msg, W / 2, H - 134, 16, '#ffffff', 'center', 'bold', 0);
}

function drawObjectiveArrow(ctx, state, view, time) {
  const m = (state.markers || []).find((q) => q.mission);
  if (!m) return;
  const p = worldToScreen(state, m.x, m.y, view);
  const W = view.w, H = view.h, pad = 46;
  if (p.x > pad && p.x < W - pad && p.y > pad && p.y < H - pad) return;
  const cx = W / 2, cy = H / 2;
  const a = Math.atan2(p.y - cy, p.x - cx);
  const t = Math.min((W / 2 - pad) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - pad) / Math.abs(Math.sin(a) || 1e-6));
  const x = cx + Math.cos(a) * t, y = cy + Math.sin(a) * t;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = m.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  const s = 1 + Math.sin(time * 6) * 0.12;
  ctx.beginPath(); ctx.moveTo(18 * s, 0); ctx.lineTo(-10, -12 * s); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawToasts(ctx, state, W) {
  let y = 190;
  for (const t of state.toasts) {
    const a = Math.min(1, t.life * 2);
    ctx.globalAlpha = a;
    text(ctx, t.text, W - 24, y, 15, t.color, 'right', 'bold', 3);
    y += 22;
  }
  ctx.globalAlpha = 1;
}

function drawBust(ctx, state, W, H) {
  const b = state.wanted.bust || 0;
  if (b <= 0.05) return;
  const max = state.player.vehicle ? 2.2 : 1.4;
  text(ctx, 'GETTING BUSTED — MOVE!', W / 2, H / 2 - 90, 20, '#7fb3ff', 'center', 'bold', 4);
  bar(ctx, W / 2 - 110, H / 2 - 72, 220, 12, b / max, '#3b7bff');
}

function drawSubtitle(ctx, state, W, H) {
  const s = state.subtitle;
  if (!s || s.i >= s.lines.length) return;
  const [who, line] = s.lines[s.i];
  const sp = speakerOf(who);
  ctx.font = `bold 19px ${FONT}`;
  const w = Math.min(W - 80, Math.max(420, ctx.measureText(line).width + 60));
  const x = W / 2 - w / 2, y = H - 128;
  ctx.fillStyle = 'rgba(8,6,24,0.78)'; rrect(ctx, x, y, w, 70, 12); ctx.fill();
  ctx.fillStyle = sp.color; ctx.fillRect(x, y + 10, 4, 50);
  text(ctx, sp.name.toUpperCase(), x + 20, y + 20, 14, sp.color, 'left', 'bold', 0);
  text(ctx, line, x + 20, y + 46, 19, '#ffffff', 'left', 'bold', 0);
  text(ctx, 'Enter ▸', x + w - 14, y + 20, 11, '#999', 'right', 'bold', 0);
}

function drawBigText(ctx, state, W, H) {
  const b = state.bigText;
  if (!b) return;
  const k = b.life / b.max;
  const a = Math.min(1, b.life * 2, (1 - k) * 8);
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H * 0.3 - 46, W, 100);
  text(ctx, b.title, W / 2, H * 0.3, 46, b.color, 'center', 'bold', 6);
  if (b.sub) text(ctx, b.sub, W / 2, H * 0.3 + 38, 20, '#ffffff', 'center', 'bold', 4);
  ctx.globalAlpha = 1;
}

function drawDeath(ctx, state, W, H) {
  const k = Math.min(1, (3.5 - state.respawnTimer) * 1.2);
  ctx.fillStyle = `rgba(20,0,10,${0.45 * k})`; ctx.fillRect(0, 0, W, H);
  const busted = state.deathKind === 'busted';
  text(ctx, busted ? 'BUSTED' : 'WASTED', W / 2, H / 2, 84, busted ? '#7fb3ff' : '#ff3b3b', 'center', 'bold', 8);
  text(ctx, busted ? 'Released from Comisaría Central — bribes aren\'t free' : 'Patched up at Hospital San Lucía — the bill is yours', W / 2, H / 2 + 58, 18, '#ffffff', 'center', 'bold', 4);
}
