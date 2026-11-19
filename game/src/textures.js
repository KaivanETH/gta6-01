// Procedural tile textures generated once into small canvases and used as repeating
// patterns: asphalt, sidewalk slabs, grass, sand, plaza stone, terracotta pavers,
// dock concrete, pier planks and sea water.
import { makeRng, shadeColor } from './mathutil.js';

const R = makeRng(99);
const cache = {};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function noise(g, w, h, base, amt, count, size = 1) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    g.fillStyle = shadeColor(base, R.range(-amt, amt));
    g.fillRect(R.int(0, w), R.int(0, h), size, size);
  }
}

const builders = {
  asphalt(g) {
    noise(g, 64, 64, '#4b4b54', 0.12, 900);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(R.range(0, 64), R.range(0, 64), R.range(4, 9), R.range(2, 5), R.range(0, 3), 0, 7); g.fill(); }
  },
  sidewalk(g) {
    noise(g, 32, 32, '#d3cbbd', 0.05, 160);
    g.strokeStyle = 'rgba(90,80,70,0.25)'; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, 32, 32);
  },
  grass(g) {
    noise(g, 64, 64, '#7cbc58', 0.12, 700);
    for (let i = 0; i < 40; i++) { g.fillStyle = shadeColor('#7cbc58', R.range(-0.25, 0.15)); g.fillRect(R.int(0, 64), R.int(0, 64), 1, 3); }
  },
  lawn(g) {
    noise(g, 64, 64, '#86c55f', 0.08, 500);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, 64, 32);
  },
  sand(g) {
    noise(g, 64, 64, '#efdcab', 0.07, 900);
    for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(160,120,60,0.2)'; g.fillRect(R.int(0, 64), R.int(0, 64), 2, 1); }
  },
  plaza(g) {
    noise(g, 48, 48, '#ddd6c8', 0.04, 200);
    // a light inset border on each slab catches the light better than flat grid lines
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    for (let y = 0; y < 48; y += 16) for (let x = 0; x < 48; x += 16) g.strokeRect(x + 1.5, y + 1.5, 13, 13);
    g.strokeStyle = 'rgba(120,110,100,0.3)';
    for (let i = 0; i <= 48; i += 16) { g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, 48); g.moveTo(0, i + 0.5); g.lineTo(48, i + 0.5); g.stroke(); }
  },
  resort(g) {
    noise(g, 40, 40, '#f3e6c8', 0.04, 160);
    g.strokeStyle = 'rgba(200,170,120,0.35)';
    g.beginPath(); g.moveTo(0, 20.5); g.lineTo(40, 20.5); g.moveTo(20.5, 0); g.lineTo(20.5, 40); g.stroke();
  },
  pavers(g) {
    noise(g, 32, 32, '#d9a88a', 0.08, 200);
    g.strokeStyle = 'rgba(120,60,40,0.35)';
    for (let y = 0; y < 32; y += 8) {
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(32, y + 0.5); g.stroke();
      const off = (y / 8) % 2 ? 8 : 0;
      for (let x = off; x < 32; x += 16) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 8); g.stroke(); }
    }
  },
  yard(g) {
    noise(g, 64, 64, '#a3a39b', 0.1, 600);
    g.fillStyle = 'rgba(60,50,40,0.1)';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(R.range(0, 64), R.range(0, 64), R.range(3, 10), R.range(2, 6), 0, 0, 7); g.fill(); }
  },
  planks(g) {
    noise(g, 32, 32, '#9c7451', 0.1, 220);
    g.strokeStyle = 'rgba(50,30,15,0.5)';
    for (let x = 0; x <= 32; x += 8) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 32); g.stroke(); }
  },
  water(g) {
    const grd = g.createLinearGradient(0, 0, 128, 128);
    grd.addColorStop(0, '#1aa6c6'); grd.addColorStop(1, '#168fb3');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const x = R.range(0, 128), y = R.range(0, 128), w = R.range(8, 20);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke();
    }
  },
  park(g) {
    noise(g, 64, 64, '#74b852', 0.1, 600);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,240,120,0.5)'; g.fillRect(R.int(0, 64), R.int(0, 64), 2, 2); }
  },
};

const SIZES = { asphalt: 64, sidewalk: 32, grass: 64, lawn: 64, sand: 64, plaza: 48, resort: 40, pavers: 32, yard: 64, planks: 32, water: 128, park: 64 };

export function pattern(ctx, name) {
  if (cache[name]) return cache[name];
  const s = SIZES[name];
  const c = canvas(s, s);
  builders[name](c.getContext('2d'));
  cache[name] = ctx.createPattern(c, 'repeat');
  return cache[name];
}
