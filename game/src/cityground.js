// Ground layer of the city: hills, sea and shoreline foam, beach, harbor quay and piers,
// block sidewalks and lot surfaces per district, roads with lane markings, crosswalks,
// stop lines, traffic lights, pools, fountains, parking lots, ships and beach decor.
import {
  NODES_X, NODES_Y, ROAD_HALF, SIDEWALK, nodeX, nodeY, COAST_X, HARBOR_Y, WORLD_W, WORLD_H, PALETTE,
} from './config.js';
import { lightState, nodeId } from './roads.js';
import { pattern } from './textures.js';

const GROUND_PATTERN = { plaza: 'plaza', resort: 'resort', yard: 'yard', lawn: 'lawn', tiles: 'pavers', park: 'park' };

function visible(r, b) {
  return r.x < b.x1 && r.x + r.w > b.x0 && r.y < b.y1 && r.y + r.h > b.y0;
}

export function drawGround(ctx, state, b, time) {
  const w = state.world;
  // base land (hills)
  ctx.fillStyle = pattern(ctx, 'grass');
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);

  // sea (east) and harbor (south)
  if (b.x1 > COAST_X - 40 || b.y1 > HARBOR_Y - 40) {
    ctx.save();
    ctx.translate(Math.sin(time * 0.3) * 12, Math.cos(time * 0.25) * 8);
    ctx.fillStyle = pattern(ctx, 'water');
    if (b.x1 > COAST_X - 40) ctx.fillRect(COAST_X - 60, b.y0 - 20, WORLD_W - COAST_X + 140, b.y1 - b.y0 + 40);
    if (b.y1 > HARBOR_Y - 40) ctx.fillRect(b.x0 - 20, HARBOR_Y - 20, b.x1 - b.x0 + 40, WORLD_H - HARBOR_Y + 120);
    ctx.restore();
  }
  // beach sand + shoreline
  const beach = w.beach;
  if (visible(beach, b)) {
    ctx.fillStyle = pattern(ctx, 'sand');
    ctx.fillRect(beach.x, Math.max(b.y0, beach.y), beach.w + 30, Math.min(b.y1, HARBOR_Y) - Math.max(b.y0, beach.y));
    drawShore(ctx, b, time);
  }
  if (w.eastDock && visible(w.eastDock, b)) {
    const e = w.eastDock;
    ctx.fillStyle = pattern(ctx, 'yard'); ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.strokeStyle = 'rgba(255,220,0,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(e.x + 30, e.y + 20, e.w - 70, e.h - 40);
  }
  if (visible(w.southShore, b)) {
    ctx.fillStyle = pattern(ctx, 'sand');
    const s = w.southShore;
    ctx.fillRect(s.x, s.y, s.w, s.h + 10);
  }
  // quay + piers
  if (visible(w.quay, b)) {
    ctx.fillStyle = pattern(ctx, 'yard');
    const q = w.quay;
    ctx.fillRect(q.x, q.y, q.w, q.h + 4);
    ctx.fillStyle = '#e8c547';
    for (let x = q.x + 10; x < q.x + q.w; x += 60) ctx.fillRect(x, q.y + q.h - 6, 30, 4);
  }
  for (const p of w.piers) {
    if (!visible(p, b)) continue;
    ctx.fillStyle = 'rgba(0,30,50,0.35)'; ctx.fillRect(p.x + 6, p.y + 8, p.w, p.h);
    ctx.fillStyle = pattern(ctx, 'planks'); ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#5a4030';
    for (let y = p.y + 30; y < p.y + p.h; y += 60) { ctx.fillRect(p.x - 4, y, 6, 6); ctx.fillRect(p.x + p.w - 2, y, 6, 6); }
  }
  for (const s of w.ships) if (visible(s, b)) drawShip(ctx, s);

  // outer sidewalks around the grid (the coastal promenade, the hill edges)
  ctx.fillStyle = pattern(ctx, 'sidewalk');
  const gx0 = nodeX(0) - ROAD_HALF - SIDEWALK, gx1 = nodeX(NODES_X - 1) + ROAD_HALF;
  const gy0 = nodeY(0) - ROAD_HALF - SIDEWALK, gy1 = nodeY(NODES_Y - 1) + ROAD_HALF;
  ctx.fillRect(gx0, gy0, gx1 - gx0 + SIDEWALK, SIDEWALK);
  ctx.fillRect(gx0, gy1, gx1 - gx0 + SIDEWALK, SIDEWALK);
  ctx.fillRect(gx0, gy0, SIDEWALK, gy1 - gy0 + SIDEWALK);
  ctx.fillRect(gx1, gy0, SIDEWALK, gy1 - gy0 + SIDEWALK);
  // beach parking pads
  for (const p of w.beachPads || []) if (visible(p, b)) {
    ctx.fillStyle = pattern(ctx, 'asphalt'); ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    for (let k = 0; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(p.x + 4, p.y + 4 + k * 34); ctx.lineTo(p.x + p.w - 4, p.y + 4 + k * 34); ctx.stroke(); }
  }

  // blocks
  for (const blk of w.blocks) {
    const r = blk.rect;
    if (!visible(r, b)) continue;
    ctx.fillStyle = pattern(ctx, 'sidewalk');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = PALETTE.curb; ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    const L = blk.lot;
    ctx.fillStyle = pattern(ctx, GROUND_PATTERN[blk.ground] || 'plaza');
    ctx.fillRect(L.x, L.y, L.w, L.h);
    if (blk.ground === 'park') drawParkPaths(ctx, L);
    if (blk.parkingLot) drawParkingLot(ctx, blk.parkingLot);
    if (blk.ground === 'lawn') drawDriveways(ctx, L);
    if (blk.ground === 'yard') { ctx.strokeStyle = 'rgba(255,220,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(L.x + 4, L.y + 4, L.w - 8, L.h - 8); }
  }

  drawRoads(ctx, b);
  drawDecor(ctx, state, b, time);
  drawTrafficLights(ctx, state, b);
}

function drawShore(ctx, b, time) {
  ctx.fillStyle = 'rgba(217,192,138,0.9)';
  ctx.beginPath();
  const y0 = Math.max(0, b.y0 - 20), y1 = Math.min(HARBOR_Y, b.y1 + 20);
  ctx.moveTo(COAST_X - 40, y0);
  for (let y = y0; y <= y1; y += 20) ctx.lineTo(COAST_X - 20 + Math.sin(y * 0.01) * 14, y);
  ctx.lineTo(COAST_X - 40, y1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
  for (let k = 0; k < 2; k++) {
    const off = (Math.sin(time * 1.2 + k * 2) * 0.5 + 0.5) * 16 + k * 10;
    ctx.globalAlpha = 0.8 - k * 0.35;
    ctx.beginPath();
    for (let y = y0; y <= y1; y += 16) {
      const x = COAST_X + Math.sin(y * 0.01) * 14 + off + Math.sin(y * 0.05 + time * 2) * 3;
      if (y === y0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawShip(ctx, s) {
  ctx.fillStyle = 'rgba(0,20,40,0.35)';
  ctx.beginPath(); ctx.ellipse(s.x + s.w / 2 + 14, s.y + s.h / 2 + 18, s.w / 2, s.h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y + 40); ctx.quadraticCurveTo(s.x + s.w / 2, s.y - 30, s.x + s.w, s.y + 40);
  ctx.lineTo(s.x + s.w, s.y + s.h - 10); ctx.lineTo(s.x, s.y + s.h - 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9c9c9'; ctx.fillRect(s.x + 8, s.y + 40, s.w - 16, s.h - 58);
  const cols = ['#d64545', '#2f7fc1', '#e8a33d', '#3aa36b', '#8e44ad', '#e86f3d'];
  for (let r = 0; r < Math.floor((s.h - 120) / 30); r++) for (let c = 0; c < 4; c++) {
    ctx.fillStyle = cols[(r * 3 + c * 5) % cols.length];
    ctx.fillRect(s.x + 14 + c * (s.w - 28) / 4, s.y + 50 + r * 30, (s.w - 28) / 4 - 3, 26);
  }
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(s.x + 20, s.y + s.h - 70, s.w - 40, 46);
  ctx.fillStyle = '#29475f'; ctx.fillRect(s.x + 28, s.y + s.h - 62, s.w - 56, 10);
}

function drawParkPaths(ctx, L) {
  ctx.fillStyle = '#e2d3b0';
  ctx.fillRect(L.x, L.y + L.h / 2 - 9, L.w, 18);
  ctx.fillRect(L.x + L.w / 2 - 9, L.y, 18, L.h);
  ctx.beginPath(); ctx.arc(L.x + L.w / 2, L.y + L.h / 2, 46, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff6fa8';
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2;
    ctx.beginPath(); ctx.arc(L.x + L.w / 2 + Math.cos(a) * 52, L.y + L.h / 2 + Math.sin(a) * 52, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawParkingLot(ctx, p) {
  ctx.fillStyle = pattern(ctx, 'asphalt');
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
  for (let r = 0; r < 4; r++) for (let c = 0; c <= 3; c++) {
    const x = p.x + 6 + c * 34, y = p.y + 8 + r * 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 46); ctx.stroke();
  }
}

function drawDriveways(ctx, L) {
  ctx.fillStyle = '#bdb6a8';
  const half = L.w / 2;
  for (let k = 0; k < 4; k++) {
    const qx = L.x + (k % 2) * half, qy = L.y + Math.floor(k / 2) * half;
    const px = qx + (k % 2 === 0 ? 2 : half - 26);
    ctx.fillRect(px, k < 2 ? qy - 26 : qy + half - 70, 24, 96);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(L.x + 2, L.y + 2, L.w - 4, L.h - 4);
}

function roadBand(ctx, x, y, w, h) {
  ctx.fillRect(x, y, w, h);
}

function drawRoads(ctx, b) {
  ctx.fillStyle = pattern(ctx, 'asphalt');
  const xa = nodeX(0) - ROAD_HALF, xb = nodeX(NODES_X - 1) + ROAD_HALF;
  const ya = nodeY(0) - ROAD_HALF, yb = nodeY(NODES_Y - 1) + ROAD_HALF;
  for (let j = 0; j < NODES_Y; j++) {
    const y = nodeY(j);
    if (y + ROAD_HALF < b.y0 || y - ROAD_HALF > b.y1) continue;
    roadBand(ctx, Math.max(xa, b.x0), y - ROAD_HALF, Math.min(xb, b.x1) - Math.max(xa, b.x0), ROAD_HALF * 2);
  }
  for (let i = 0; i < NODES_X; i++) {
    const x = nodeX(i);
    if (x + ROAD_HALF < b.x0 || x - ROAD_HALF > b.x1) continue;
    roadBand(ctx, x - ROAD_HALF, Math.max(ya, b.y0), ROAD_HALF * 2, Math.min(yb, b.y1) - Math.max(ya, b.y0));
  }
  // markings per segment
  const inset = ROAD_HALF + 18;
  ctx.lineWidth = 2;
  for (let j = 0; j < NODES_Y; j++) for (let i = 0; i < NODES_X; i++) {
    const x = nodeX(i), y = nodeY(j);
    if (x < b.x0 - 450 || x > b.x1 + 50 || y < b.y0 - 450 || y > b.y1 + 50) continue;
    // east segment
    if (i < NODES_X - 1) {
      ctx.strokeStyle = PALETTE.laneYellow; ctx.setLineDash([16, 12]);
      ctx.beginPath(); ctx.moveTo(x + inset, y); ctx.lineTo(nodeX(i + 1) - inset, y); ctx.stroke();
    }
    if (j < NODES_Y - 1) {
      ctx.strokeStyle = PALETTE.laneYellow; ctx.setLineDash([16, 12]);
      ctx.beginPath(); ctx.moveTo(x, y + inset); ctx.lineTo(x, nodeY(j + 1) - inset); ctx.stroke();
    }
    ctx.setLineDash([]);
    drawCrosswalks(ctx, x, y, i, j);
  }
  ctx.setLineDash([]);
}

function drawCrosswalks(ctx, x, y, i, j) {
  ctx.fillStyle = 'rgba(245,245,245,0.85)';
  const R = ROAD_HALF, d = R + 6;
  for (let k = -R + 6; k < R - 4; k += 9) {
    if (i < NODES_X - 1) ctx.fillRect(x + d, y + k, 10, 5);
    if (i > 0) ctx.fillRect(x - d - 10, y + k, 10, 5);
    if (j < NODES_Y - 1) ctx.fillRect(x + k, y + d, 5, 10);
    if (j > 0) ctx.fillRect(x + k, y - d - 10, 5, 10);
  }
  // stop lines (right-hand lanes)
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  if (i > 0) ctx.fillRect(x - d - 14, y + 2, 3, R - 4);
  if (i < NODES_X - 1) ctx.fillRect(x + d + 11, y - R + 2, 3, R - 4);
  if (j > 0) ctx.fillRect(x - R + 2, y - d - 14, R - 4, 3);
  if (j < NODES_Y - 1) ctx.fillRect(x + 2, y + d + 11, R - 4, 3);
}

function drawTrafficLights(ctx, state, b) {
  for (let j = 0; j < NODES_Y; j++) for (let i = 0; i < NODES_X; i++) {
    const x = nodeX(i), y = nodeY(j);
    if (x < b.x0 - 60 || x > b.x1 + 60 || y < b.y0 - 60 || y > b.y1 + 60) continue;
    const id = nodeId(i, j);
    const h = lightState(id, state.time, true), v = lightState(id, state.time, false);
    const col = (s) => (s === 'green' ? '#3dff6e' : s === 'yellow' ? '#ffd23d' : '#ff3b3b');
    const o = ROAD_HALF + 6;
    for (const [dx, dy, s] of [[-o, -o, v], [o, o, v], [o, -o, h], [-o, o, h]]) {
      ctx.fillStyle = '#222'; ctx.fillRect(x + dx - 4, y + dy - 4, 8, 8);
      ctx.fillStyle = col(s); ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawDecor(ctx, state, b, time) {
  for (const d of state.world.decor) {
    if (d.x > b.x1 + 40 || d.y > b.y1 + 40 || d.x + (d.w || 0) < b.x0 - 40 || d.y + (d.h || 0) < b.y0 - 40) continue;
    switch (d.type) {
      case 'pool': {
        ctx.fillStyle = '#f4f1ea'; ctx.fillRect(d.x - 4, d.y - 4, d.w + 8, d.h + 8);
        const g = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y + d.h);
        g.addColorStop(0, '#5fe0f5'); g.addColorStop(1, '#1fa3d6');
        ctx.fillStyle = g; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let x = d.x + 4; x < d.x + d.w - 4; x += 8) ctx.lineTo(x, d.y + d.h / 2 + Math.sin(x * 0.3 + time * 2) * 2);
        ctx.stroke();
        break;
      }
      case 'fountain': {
        const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
        ctx.fillStyle = '#d8d2c4'; ctx.beginPath(); ctx.arc(cx, cy, d.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3fb8d8'; ctx.beginPath(); ctx.arc(cx, cy, d.w / 2 - 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, ((time * 14 + k * 9) % 26) + 2, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#efe9dc'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'towel':
        ctx.fillStyle = d.color; ctx.fillRect(d.x, d.y, 12, 22);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(d.x, d.y + 6, 12, 3);
        break;
      case 'lifeguard':
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(d.x + 8, d.y + 8, 30, 30);
        ctx.fillStyle = '#e63946'; ctx.fillRect(d.x, d.y, 30, 30);
        ctx.fillStyle = '#fff'; ctx.fillRect(d.x + 4, d.y + 12, 22, 6);
        break;
    }
  }
}
