// Elevated layer with a 2.5D perspective lean: buildings extruded toward the camera with
// shaded facades, floor lines, awnings, balconies, lit night windows and per-style rooftops
// (helipads, pools, gardens, AC units, terracotta, corrugated metal, containers), rooftop
// neon signs, plus palms, trees, street lamps, beach umbrellas and harbor cranes.
import { shadeColor } from './mathutil.js';

export const CAM_H = 720;

export function drawBuildingShadows(ctx, state, b, sun) {
  ctx.fillStyle = 'rgba(30,20,60,0.24)';
  for (const s of state.world.buildings) {
    if (s.x > b.x1 + 80 || s.y > b.y1 + 80 || s.x + s.w < b.x0 - 200 || s.y + s.h < b.y0 - 200) continue;
    const ox = sun.x * s.ht, oy = sun.y * s.ht;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.w, s.y); ctx.lineTo(s.x + s.w + ox, s.y + oy);
    ctx.lineTo(s.x + s.w + ox, s.y + s.h + oy); ctx.lineTo(s.x + ox, s.y + s.h + oy); ctx.lineTo(s.x, s.y + s.h);
    ctx.closePath(); ctx.fill();
  }
  for (const p of state.world.props) {
    if (p.x < b.x0 - 60 || p.x > b.x1 + 60 || p.y < b.y0 - 60 || p.y > b.y1 + 60) continue;
    const ox = sun.x * p.ht, oy = sun.y * p.ht;
    if (p.type === 'lamp') { ctx.fillRect(p.x, p.y - 1, ox, 2); continue; }
    ctx.beginPath(); ctx.ellipse(p.x + ox, p.y + oy, p.r * 1.1, p.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawElevated(ctx, state, b, time, night) {
  const cam = state.camera;
  const items = [];
  const pad = 40;
  for (const s of state.world.buildings) {
    if (s.x > b.x1 + pad || s.y > b.y1 + pad || s.x + s.w < b.x0 - pad || s.y + s.h < b.y0 - pad) continue;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    items.push({ o: s, d: (cx - cam.x) ** 2 + (cy - cam.y) ** 2, k: 0 });
  }
  for (const p of state.world.props) {
    if (p.x < b.x0 - pad || p.x > b.x1 + pad || p.y < b.y0 - pad || p.y > b.y1 + pad) continue;
    items.push({ o: p, d: (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2, k: 1 });
  }
  for (const d of state.world.decor) {
    if (d.type !== 'umbrella' || d.x < b.x0 - pad || d.x > b.x1 + pad || d.y < b.y0 - pad || d.y > b.y1 + pad) continue;
    items.push({ o: d, d: (d.x - cam.x) ** 2 + (d.y - cam.y) ** 2, k: 2 });
  }
  for (const c of state.world.cranes) {
    if (c.x < b.x0 - 300 || c.x > b.x1 + 300 || c.y < b.y0 - 300 || c.y > b.y1 + 300) continue;
    items.push({ o: c, d: (c.x - cam.x) ** 2 + (c.y - cam.y) ** 2 - 1e5, k: 3 });
  }
  items.sort((a, z) => z.d - a.d);
  for (const it of items) {
    if (it.k === 0) drawBuilding(ctx, it.o, cam, time, night);
    else if (it.k === 1) drawProp(ctx, it.o, cam, time);
    else if (it.k === 2) drawUmbrella(ctx, it.o, cam);
    else drawCrane(ctx, it.o, cam);
  }
}

function proj(cam, x, y, f) { return [cam.x + (x - cam.x) * f, cam.y + (y - cam.y) * f]; }

function face(ctx, a, bpt, ra, rb, color, s, night, horizontalEdge) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bpt[0], bpt[1]); ctx.lineTo(rb[0], rb[1]); ctx.lineTo(ra[0], ra[1]); ctx.closePath(); ctx.fill();
  const floors = Math.max(1, Math.floor(s.ht / 15));
  const len = Math.hypot(bpt[0] - a[0], bpt[1] - a[1]);
  // floor lines
  ctx.lineWidth = s.style === 'hotel' ? 2 : 1;
  ctx.strokeStyle = s.style === 'hotel' ? 'rgba(255,255,255,0.75)' : s.glass ? 'rgba(220,245,255,0.45)' : 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  for (let i = 1; i < floors; i++) {
    const t = i / floors;
    ctx.moveTo(a[0] + (ra[0] - a[0]) * t, a[1] + (ra[1] - a[1]) * t);
    ctx.lineTo(bpt[0] + (rb[0] - bpt[0]) * t, bpt[1] + (rb[1] - bpt[1]) * t);
  }
  ctx.stroke();
  // window columns
  if (s.style !== 'container') {
    const cols = Math.floor(len / (s.glass ? 10 : 15));
    ctx.strokeStyle = s.glass ? 'rgba(20,50,80,0.35)' : 'rgba(40,40,60,0.28)';
    ctx.lineWidth = s.glass ? 1 : 2;
    ctx.beginPath();
    for (let i = 1; i < cols; i++) {
      const t = i / cols;
      const bx = a[0] + (bpt[0] - a[0]) * t, by = a[1] + (bpt[1] - a[1]) * t;
      const tx = ra[0] + (rb[0] - ra[0]) * t, ty = ra[1] + (rb[1] - ra[1]) * t;
      ctx.moveTo(bx + (tx - bx) * 0.08, by + (ty - by) * 0.08); ctx.lineTo(bx + (tx - bx) * 0.92, by + (ty - by) * 0.92);
    }
    ctx.stroke();
  }
  // lit windows at night
  if (night > 0.3 && s.style !== 'container' && s.style !== 'warehouse') {
    ctx.strokeStyle = `rgba(255,214,130,${0.55 * night})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < floors; i++) {
      if (((s.id * 7 + i * 3) % 5) < 2) continue;
      const t = (i + 0.5) / floors;
      const p1x = a[0] + (ra[0] - a[0]) * t, p1y = a[1] + (ra[1] - a[1]) * t;
      const p2x = bpt[0] + (rb[0] - bpt[0]) * t, p2y = bpt[1] + (rb[1] - bpt[1]) * t;
      const s0 = ((s.id + i) % 3) * 0.15, s1 = 0.55 + ((s.id * 3 + i) % 4) * 0.1;
      ctx.moveTo(p1x + (p2x - p1x) * s0, p1y + (p2y - p1y) * s0);
      ctx.lineTo(p1x + (p2x - p1x) * s1, p1y + (p2y - p1y) * s1);
    }
    ctx.stroke();
  }
  // shop awnings along the street level
  if (s.awning && horizontalEdge) {
    const t = Math.min(0.35, 12 / s.ht);
    ctx.fillStyle = s.awning;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(bpt[0], bpt[1]);
    ctx.lineTo(bpt[0] + (rb[0] - bpt[0]) * t, bpt[1] + (rb[1] - bpt[1]) * t);
    ctx.lineTo(a[0] + (ra[0] - a[0]) * t, a[1] + (ra[1] - a[1]) * t);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const n = Math.floor(len / 10);
    for (let i = 0; i < n; i += 2) {
      const t0 = i / n, t1 = (i + 1) / n;
      ctx.beginPath();
      ctx.moveTo(a[0] + (bpt[0] - a[0]) * t0, a[1] + (bpt[1] - a[1]) * t0);
      ctx.lineTo(a[0] + (bpt[0] - a[0]) * t1, a[1] + (bpt[1] - a[1]) * t1);
      const ua = [a[0] + (ra[0] - a[0]) * t, a[1] + (ra[1] - a[1]) * t], ub = [bpt[0] + (rb[0] - bpt[0]) * t, bpt[1] + (rb[1] - bpt[1]) * t];
      ctx.lineTo(ua[0] + (ub[0] - ua[0]) * t1, ua[1] + (ub[1] - ua[1]) * t1);
      ctx.lineTo(ua[0] + (ub[0] - ua[0]) * t0, ua[1] + (ub[1] - ua[1]) * t0);
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawBuilding(ctx, s, cam, time, night) {
  const f = CAM_H / (CAM_H - s.ht);
  const x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
  const A = [x0, y0], B = [x1, y0], C = [x1, y1], D = [x0, y1];
  const rA = proj(cam, x0, y0, f), rB = proj(cam, x1, y0, f), rC = proj(cam, x1, y1, f), rD = proj(cam, x0, y1, f);
  const base = s.base;
  if (cam.y < y0) face(ctx, A, B, rA, rB, shadeColor(base, -0.28), s, night, true);
  if (cam.y > y1) face(ctx, D, C, rD, rC, shadeColor(base, -0.08), s, night, true);
  if (cam.x < x0) face(ctx, A, D, rA, rD, shadeColor(base, -0.18), s, night, false);
  if (cam.x > x1) face(ctx, B, C, rB, rC, shadeColor(base, -0.36), s, night, false);
  ctx.save();
  ctx.translate(cam.x * (1 - f), cam.y * (1 - f));
  ctx.scale(f, f);
  drawRoof(ctx, s, time, night);
  ctx.restore();
}

function drawRoof(ctx, s, time, night) {
  const { x, y, w, h } = s;
  ctx.fillStyle = s.roof;
  ctx.fillRect(x, y, w, h);
  switch (s.roofType) {
    case 'gable': {
      const horiz = w >= h;
      ctx.fillStyle = shadeColor(s.roof, 0.15);
      if (horiz) ctx.fillRect(x, y, w, h / 2); else ctx.fillRect(x, y, w / 2, h);
      ctx.strokeStyle = shadeColor(s.roof, -0.35); ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (horiz) { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); } else { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (horiz) for (let yy = y + 4; yy < y + h; yy += 4) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
      else for (let xx = x + 4; xx < x + w; xx += 4) { ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); }
      ctx.stroke();
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'tile': {
      ctx.strokeStyle = 'rgba(90,30,10,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yy = y + 5; yy < y + h; yy += 5) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
      ctx.stroke();
      ctx.strokeStyle = shadeColor(s.roof, -0.3); ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      break;
    }
    case 'corrugated': {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (w > h) for (let xx = x + 4; xx < x + w; xx += 6) { ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); }
      else for (let yy = y + 4; yy < y + h; yy += 6) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = 0; k < 3; k++) ctx.fillRect(x + w * (0.2 + k * 0.3) - 8, y + h * 0.25 - 8, 16, 16);
      if (s.label) {
        const size = Math.min(h * 0.38, w / (s.label.length * 0.75));
        ctx.font = `900 ${size}px "Trebuchet MS", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(s.label, x + w / 2, y + h * 0.62);
      }
      ctx.strokeStyle = shadeColor(s.roof, -0.3); ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      break;
    }
    case 'container': {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      if (w > h) ctx.fillRect(x, y, w, h * 0.3); else ctx.fillRect(x, y, w * 0.3, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (w > h) for (let xx = x + 3; xx < x + w; xx += 4) { ctx.moveTo(xx, y + 1); ctx.lineTo(xx, y + h - 1); }
      else for (let yy = y + 3; yy < y + h; yy += 4) { ctx.moveTo(x + 1, yy); ctx.lineTo(x + w - 1, yy); }
      ctx.stroke();
      break;
    }
    default: {
      // parapet
      ctx.strokeStyle = shadeColor(s.roof, -0.25); ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      if (s.glass) {
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      }
      roofDetail(ctx, s, time, night);
    }
  }
  if (s.neon) drawNeon(ctx, s, night, time);
}

function roofDetail(ctx, s, time, night) {
  const { x, y, w, h } = s;
  const cx = x + w / 2, cy = y + h / 2;
  switch (s.roofType) {
    case 'helipad': {
      const r = Math.min(w, h) * 0.32;
      ctx.fillStyle = '#3b3f46'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(r)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', cx, cy + 1);
      break;
    }
    case 'pool': {
      const pw = w * 0.5, ph = h * 0.3;
      ctx.fillStyle = '#f4f1ea'; ctx.fillRect(cx - pw / 2 - 3, cy - ph / 2 - 3, pw + 6, ph + 6);
      ctx.fillStyle = '#3ccbe8'; ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(cx - pw / 2 + 3, cy - ph / 2 + 3, pw * 0.3, 2);
      ctx.fillStyle = '#ff7aa2';
      for (let k = 0; k < 3; k++) ctx.fillRect(cx - pw / 2 + k * 12, cy + ph / 2 + 6, 6, 12);
      break;
    }
    case 'garden': {
      ctx.fillStyle = '#6fb34f'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      ctx.fillStyle = '#4c8f37';
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x + 12 + ((k * 37) % (w - 24)), y + 12 + ((k * 53) % (h - 24)), 6, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'deck': {
      ctx.fillStyle = '#b48a5a'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      ctx.strokeStyle = 'rgba(60,30,10,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let xx = x + 10; xx < x + w - 6; xx += 5) { ctx.moveTo(xx, y + 6); ctx.lineTo(xx, y + h - 6); } ctx.stroke();
      ctx.fillStyle = '#2ec4b6'; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'antenna': {
      ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.3); ctx.lineTo(cx, cy + h * 0.3); ctx.moveTo(cx - w * 0.2, cy); ctx.lineTo(cx + w * 0.2, cy); ctx.stroke();
      ctx.fillStyle = Math.sin(time * 4) > 0 ? '#ff3030' : '#601010';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {
      // service roof: AC units, vents, a stairwell hut and a water tank on the bigger roofs
      const units = Math.min(16, 3 + Math.floor((w * h) / 5200));
      for (let k = 0; k < units; k++) {
        const ax = x + 9 + ((k * 53 + s.id * 17) % Math.max(10, w - 32));
        const ay = y + 9 + ((k * 37 + s.id * 11) % Math.max(10, h - 30));
        const uw = 12 + (k % 3) * 5, uh = 9 + (k % 2) * 4;
        ctx.fillStyle = '#8f959b'; ctx.fillRect(ax, ay, uw, uh);
        ctx.fillStyle = '#5c6268'; ctx.beginPath(); ctx.arc(ax + uw / 2, ay + uh / 2, Math.min(4, uw / 3), 0, Math.PI * 2); ctx.fill();
      }
      if (w > 96 && h > 96) {
        // stairwell hut and its shadow, then a round water tank on stilts
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx - 20, cy - 12, 40, 30);
        ctx.fillStyle = shadeColor(s.roof, -0.14); ctx.fillRect(cx - 22, cy - 16, 40, 28);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.strokeRect(cx - 22, cy - 16, 40, 28);
        ctx.fillStyle = '#a8b0b6'; ctx.fillRect(cx + 18, cy + 10, 22, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(cx + 30, cy - 26, 13, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(cx + 30, cy - 26, 13, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
}

function drawNeon(ctx, s, night, time) {
  const n = s.neon;
  const size = Math.max(9, Math.min(16, s.w / (n.text.length * 0.75)));
  ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tx = s.x + s.w / 2, ty = s.y + s.h - size * 0.9;
  const flicker = (s.id % 7 === 0 && Math.sin(time * 23) > 0.85) ? 0.3 : 1;
  if (night > 0.25) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = night * flicker;
    ctx.strokeStyle = n.color; ctx.lineWidth = 6; ctx.globalAlpha = 0.35 * night * flicker;
    ctx.strokeText(n.text, tx, ty);
    ctx.globalAlpha = night * flicker;
    ctx.fillStyle = n.color; ctx.fillText(n.text, tx, ty);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6 * night * flicker; ctx.fillText(n.text, tx, ty);
    ctx.restore();
  } else {
    const tw = ctx.measureText(n.text).width;
    ctx.fillStyle = 'rgba(30,30,40,0.75)'; ctx.fillRect(tx - tw / 2 - 4, ty - size / 2 - 2, tw + 8, size + 4);
    ctx.fillStyle = shadeColor(n.color, -0.1); ctx.fillText(n.text, tx, ty);
  }
}

function drawProp(ctx, p, cam, time) {
  const f = CAM_H / (CAM_H - p.ht);
  const [tx, ty] = proj(cam, p.x, p.y, f);
  if (p.type === 'lamp') {
    ctx.strokeStyle = '#4a4f57'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = '#e8e2c8'; ctx.beginPath(); ctx.arc(tx, ty, 3.5, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (p.type === 'palm') {
    ctx.strokeStyle = '#8b6b43'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
    const sway = Math.sin(time * 1.3 + p.x * 0.01) * 0.08;
    const r = p.r * 1.5 * f;
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + sway + p.y * 0.01;
      ctx.fillStyle = k % 2 ? '#2f8f46' : '#3fae55';
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.55, r * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#6b4f2a'; ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // round tree
  const r = p.r * f;
  ctx.fillStyle = '#3d7d34';
  ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4f9a41';
  ctx.beginPath(); ctx.arc(tx - r * 0.25, ty - r * 0.25, r * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#69b856';
  ctx.beginPath(); ctx.arc(tx - r * 0.4, ty - r * 0.4, r * 0.35, 0, Math.PI * 2); ctx.fill();
}

function drawUmbrella(ctx, d, cam) {
  const f = CAM_H / (CAM_H - 16);
  const [tx, ty] = proj(cam, d.x, d.y, f);
  ctx.fillStyle = 'rgba(30,20,60,0.2)'; ctx.beginPath(); ctx.arc(d.x + 8, d.y + 6, 15, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? '#ffffff' : d.color;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.arc(tx, ty, 16 * f, k * Math.PI / 4, (k + 1) * Math.PI / 4); ctx.closePath(); ctx.fill();
  }
}

function drawCrane(ctx, c, cam) {
  const ht = c.small ? 80 : 130;
  const f = CAM_H / (CAM_H - ht);
  const w = c.small ? 44 : 64, h = c.small ? 30 : 40;
  const legs = [[c.x - w / 2, c.y - h / 2], [c.x + w / 2, c.y - h / 2], [c.x + w / 2, c.y + h / 2], [c.x - w / 2, c.y + h / 2]];
  const tops = legs.map(([x, y]) => proj(cam, x, y, f));
  // legs
  ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  legs.forEach(([x, y], i) => { ctx.moveTo(x, y); ctx.lineTo(tops[i][0], tops[i][1]); });
  ctx.stroke();
  ctx.fillStyle = '#3a3f45';
  for (const [x, y] of legs) ctx.fillRect(x - 4, y - 4, 8, 8);
  // top frame
  ctx.strokeStyle = '#f2b824'; ctx.lineWidth = 6 * f;
  ctx.beginPath(); ctx.moveTo(tops[0][0], tops[0][1]);
  for (let i = 1; i <= 4; i++) ctx.lineTo(tops[i % 4][0], tops[i % 4][1]);
  ctx.stroke();
  // boom reaching out over the water, with lattice
  const back = c.small ? 30 : 70, reach = c.small ? 90 : 240, bw = c.small ? 10 : 16;
  const [bx0, by0] = proj(cam, c.x - bw / 2, c.y - back, f);
  const [bx1, by1] = proj(cam, c.x + bw / 2, c.y + reach, f);
  ctx.fillStyle = '#f2b824'; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.strokeStyle = '#9a6f0c'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  const step = 12 * f;
  let flip = false;
  for (let yy = by0; yy < by1 - step; yy += step) { ctx.moveTo(flip ? bx0 : bx1, yy); ctx.lineTo(flip ? bx1 : bx0, yy + step); flip = !flip; }
  ctx.stroke();
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  // machinery house and trolley
  ctx.fillStyle = '#e8e2d6';
  const [mx, my] = proj(cam, c.x - 14, c.y - back + 4, f);
  ctx.fillRect(mx, my, 28 * f, 22 * f);
  ctx.fillStyle = '#c0392b';
  const [tx, ty] = proj(cam, c.x - 9, c.y + reach * 0.55, f);
  ctx.fillRect(tx, ty, 18 * f, 14 * f);
}
