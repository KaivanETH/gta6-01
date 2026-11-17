// Minimap (fixed north) and full-screen city map: a pre-rendered overview of districts,
// roads, water and buildings, with blips for the player, mission targets, police, the
// helicopter, vehicles, shops/properties and Golden Shells.
import { WORLD_W, WORLD_H, NODES_X, NODES_Y, ROAD_HALF, nodeX, nodeY, DISTRICTS, COAST_X, HARBOR_Y } from './config.js';
import { isWater } from './world.js';
import { rrect } from './sprites.js';

const SCALE = 0.125;
let mapCanvas = null;

const DISTRICT_TINT = { centro: '#d9d2c6', playa: '#f3e3b8', muelles: '#b2b2aa', lomas: '#a7d48a', rosa: '#e8c6b2', parque: '#86c96a' };

export function buildMapCanvas(world) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(WORLD_W * SCALE); c.height = Math.ceil(WORLD_H * SCALE);
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  g.fillStyle = '#7fb764'; g.fillRect(0, 0, WORLD_W, WORLD_H);
  g.fillStyle = '#2aa7c9';
  g.fillRect(COAST_X - 10, 0, WORLD_W, WORLD_H);
  g.fillRect(0, HARBOR_Y, WORLD_W, WORLD_H);
  g.fillStyle = '#efdcab';
  g.fillRect(world.beach.x, world.beach.y, world.beach.w, world.beach.h);
  g.fillRect(world.southShore.x, world.southShore.y, world.southShore.w, world.southShore.h);
  g.fillStyle = '#b8b3a8'; g.fillRect(world.quay.x, world.quay.y, world.quay.w, world.quay.h);
  if (world.eastDock) g.fillRect(world.eastDock.x, world.eastDock.y, world.eastDock.w, world.eastDock.h);
  g.fillStyle = '#a07a52';
  for (const p of world.piers) g.fillRect(p.x, p.y, p.w, p.h);
  for (const b of world.blocks) { g.fillStyle = DISTRICT_TINT[b.district]; g.fillRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h); }
  g.fillStyle = '#6a6a74';
  for (let j = 0; j < NODES_Y; j++) g.fillRect(nodeX(0) - ROAD_HALF, nodeY(j) - ROAD_HALF, nodeX(NODES_X - 1) - nodeX(0) + ROAD_HALF * 2, ROAD_HALF * 2);
  for (let i = 0; i < NODES_X; i++) g.fillRect(nodeX(i) - ROAD_HALF, nodeY(0) - ROAD_HALF, ROAD_HALF * 2, nodeY(NODES_Y - 1) - nodeY(0) + ROAD_HALF * 2);
  for (const s of world.buildings) { g.fillStyle = s.style === 'container' ? s.base : 'rgba(70,60,80,0.55)'; g.fillRect(s.x, s.y, s.w, s.h); }
  for (const s of world.ships) { g.fillStyle = s.color; g.fillRect(s.x, s.y, s.w, s.h); }
  mapCanvas = c;
  return c;
}

function blip(ctx, x, y, r, color, stroke = '#000') {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
}

function iconBlip(ctx, x, y, color, icon) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, y + 0.5);
}

export function drawMinimap(ctx, state, x, y, size, time) {
  if (!mapCanvas) return;
  const pl = state.player;
  const me = pl.vehicle || pl;
  const span = pl.vehicle ? 1700 : 1250; // world units across
  const k = size / span;
  ctx.save();
  // frame
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  rrect(ctx, x - 5, y - 5, size + 10, size + 10, 14); ctx.fill();
  const wl = state.wanted.level;
  if (wl > 0) {
    ctx.strokeStyle = Math.floor(time * 4) % 2 ? '#ff3b3b' : '#3b7bff'; ctx.lineWidth = 4;
    rrect(ctx, x - 4, y - 4, size + 8, size + 8, 13); ctx.stroke();
  }
  rrect(ctx, x, y, size, size, 10); ctx.clip();
  const sx = (me.x - span / 2) * SCALE, sy = (me.y - span / 2) * SCALE, sw = span * SCALE;
  ctx.fillStyle = '#2aa7c9'; ctx.fillRect(x, y, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapCanvas, sx, sy, sw, sw, x, y, size, size);
  const toMap = (wx, wy) => ({ x: x + (wx - me.x + span / 2) * k, y: y + (wy - me.y + span / 2) * k });
  const inside = (p) => p.x > x + 4 && p.x < x + size - 4 && p.y > y + 4 && p.y < y + size - 4;
  const clampEdge = (p) => ({ x: Math.max(x + 8, Math.min(x + size - 8, p.x)), y: Math.max(y + 8, Math.min(y + size - 8, p.y)) });

  // vehicles
  for (const v of state.vehicles) {
    if (v === pl.vehicle) continue;
    const p = toMap(v.x, v.y);
    if (!inside(p)) continue;
    if (v.role === 'cop' || v.role === 'roadblock') blip(ctx, p.x, p.y, 4, Math.floor(time * 6) % 2 ? '#ff3b3b' : '#3b7bff', '#fff');
    else if (!v.wrecked) { ctx.fillStyle = v.driver ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)'; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  }
  for (const p of state.peds) {
    if (p.state === 'dead') continue;
    if (p.role === 'cop' || p.hostile || p.role === 'gang' || p.role === 'boss') {
      const q = toMap(p.x, p.y);
      if (inside(q)) blip(ctx, q.x, q.y, 2.5, p.role === 'cop' ? '#3b7bff' : '#ff3b3b');
    }
  }
  if (state.heli) { const q = toMap(state.heli.x, state.heli.y); if (inside(q)) iconBlip(ctx, q.x, q.y, '#1f3a8a', 'H'); }
  // shells
  if (state.shells) for (const s of state.shells) if (!s.taken) { const q = toMap(s.x, s.y); if (inside(q)) blip(ctx, q.x, q.y, 2.5, '#ffd34d'); }
  // markers
  for (const m of state.markers || []) {
    let q = toMap(m.x, m.y);
    if (!inside(q)) { if (!m.mission) continue; q = clampEdge(q); }
    iconBlip(ctx, q.x, q.y, m.color, m.icon || '!');
  }
  // player arrow
  const c = toMap(me.x, me.y);
  ctx.translate(c.x, c.y); ctx.rotate(me.a);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ff4f7b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // north tag
  ctx.fillStyle = '#ffc93c'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', x + size / 2, y + 9);
}

export function drawFullMap(ctx, state, view, time) {
  if (!mapCanvas) return;
  const pad = 70;
  const s = Math.min((view.w - pad * 2) / mapCanvas.width, (view.h - pad * 2) / mapCanvas.height);
  const w = mapCanvas.width * s, h = mapCanvas.height * s;
  const x = (view.w - w) / 2, y = (view.h - h) / 2 + 10;
  ctx.fillStyle = 'rgba(8,10,30,0.85)'; ctx.fillRect(0, 0, view.w, view.h);
  ctx.drawImage(mapCanvas, x, y, w, h);
  ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  const k = s * SCALE;
  const toMap = (wx, wy) => ({ x: x + wx * k, y: y + wy * k });
  // district labels
  const labels = { lomas: [1.5, 5], centro: [6, 2.5], playa: [10.4, 3.5], rosa: [4.5, 8], muelles: [8.5, 9.6], parque: [6, 3.5] };
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [id, [bi, bj]] of Object.entries(labels)) {
    const p = toMap(nodeX(0) + bi * 400, nodeY(0) + bj * 400);
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(DISTRICTS[id].name.toUpperCase(), p.x, p.y);
    ctx.fillStyle = '#fff'; ctx.fillText(DISTRICTS[id].name.toUpperCase(), p.x, p.y);
  }
  for (const m of state.markers || []) { const q = toMap(m.x, m.y); iconBlip(ctx, q.x, q.y, m.color, m.icon || '!'); }
  if (state.shells) for (const sh of state.shells) if (!sh.taken && state.properties.penthouse) { const q = toMap(sh.x, sh.y); blip(ctx, q.x, q.y, 3, '#ffd34d'); }
  const me = state.player.vehicle || state.player;
  const q = toMap(me.x, me.y);
  const pulse = 6 + Math.sin(time * 6) * 2;
  ctx.strokeStyle = '#ff4f7b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, pulse + 4, 0, Math.PI * 2); ctx.stroke();
  blip(ctx, q.x, q.y, 5, '#ffffff', '#ff4f7b');
  ctx.fillStyle = '#ffc93c'; ctx.font = 'bold 22px "Trebuchet MS", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('BAHÍA DORADA — CITY MAP', x, y - 24);
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#ddd';
  ctx.fillText('★ mission   H safehouse   G gun shop   W respray   $ property for sale   ● shells (with penthouse)', x, y + h + 22);
}

export function isMapWater(world, x, y) { return isWater(world, x, y); }
