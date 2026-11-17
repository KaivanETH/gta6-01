// Day–evening–night lighting: sun direction for shadows, golden-hour tint, night darkness
// with light pools cut out for street lamps, headlights, neon, fires and the helicopter
// spotlight, plus additive coloured glows for sirens and neon.
import { gameHour } from './state.js';

let lightCanvas = null, lctx = null;

export function lightingFor(hour) {
  let night = 0;
  if (hour >= 21 || hour < 4.5) night = 1;
  else if (hour >= 19) night = (hour - 19) / 2;
  else if (hour < 6.5) night = 1 - (hour - 4.5) / 2;
  const golden = Math.max(0, 1 - Math.abs(hour - 18.3) / 2.2) * 0.9 + Math.max(0, 1 - Math.abs(hour - 6.3) / 1.4) * 0.5;
  const t = Math.max(-1, Math.min(1, (hour - 12.5) / 6.5));
  const sun = night > 0.6 ? { x: 0.12, y: 0.16 } : { x: t * 0.65, y: 0.3 + (1 - Math.abs(t)) * 0.1 };
  return { night, golden, sun };
}

export function currentLighting(state) {
  return lightingFor(gameHour(state));
}

export function drawLighting(ctx, state, view, lit, bounds, time, applyCam) {
  if (lit.golden > 0.02) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(255,150,90,${0.32 * lit.golden})`;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,120,60,${0.07 * lit.golden})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  const inView = (x, y, m = 120) => x > bounds.x0 - m && x < bounds.x1 + m && y > bounds.y0 - m && y < bounds.y1 + m;
  if (lit.night > 0.02) drawDarkness(ctx, state, view, lit, bounds, time, applyCam, inView);
  // additive glows
  applyCam(ctx);
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, color, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  if (lit.night > 0.05) for (const p of state.world.props) if (p.type === 'lamp' && inView(p.x, p.y)) glow(p.x, p.y, 46, 'rgba(255,200,120,0.6)', 0.5 * lit.night);
  if (lit.night > 0.05) for (const s of state.world.buildings) if (s.neon && inView(s.x, s.y, 200)) glow(s.x + s.w / 2, s.y + s.h + 6, 70, s.neon.color, 0.22 * lit.night);
  const ph = Math.floor(time * 8) % 2;
  for (const v of state.vehicles) {
    if (!inView(v.x, v.y, 100)) continue;
    if (v.siren && !v.wrecked) glow(v.x, v.y, 60, ph ? 'rgba(255,40,40,0.9)' : 'rgba(40,90,255,0.9)', 0.6 * lit.night + 0.22);
    if (v.driver && !v.wrecked) {
      const c = Math.cos(v.a), s = Math.sin(v.a);
      glow(v.x - c * v.spec.len / 2, v.y - s * v.spec.len / 2, 16, 'rgba(255,30,30,0.8)', 0.6 * lit.night);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Night: darken the screen, cutting soft holes for every light source.
function drawDarkness(ctx, state, view, lit, bounds, time, applyCam, inView) {
  if (!lightCanvas || lightCanvas.width !== view.w || lightCanvas.height !== view.h) {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = view.w; lightCanvas.height = view.h;
    lctx = lightCanvas.getContext('2d');
  }
  const L = lctx;
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = 'source-over';
  L.clearRect(0, 0, view.w, view.h);
  L.fillStyle = `rgba(8,12,42,${0.66 * lit.night})`;
  L.fillRect(0, 0, view.w, view.h);
  L.globalCompositeOperation = 'destination-out';
  applyCam(L);
  const hole = (x, y, r, a = 1) => {
    const g = L.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = g; L.beginPath(); L.arc(x, y, r, 0, Math.PI * 2); L.fill();
  };
  for (const p of state.world.props) if (p.type === 'lamp' && inView(p.x, p.y)) hole(p.x, p.y, 70, 0.75);
  for (const s of state.world.buildings) if (s.neon && inView(s.x, s.y, 200)) hole(s.x + s.w / 2, s.y + s.h, 90, 0.6);
  for (const v of state.vehicles) {
    if (!v.driver || v.wrecked || !inView(v.x, v.y, 200)) continue;
    const c = Math.cos(v.a), s = Math.sin(v.a);
    const hx = v.x + c * v.spec.len / 2, hy = v.y + s * v.spec.len / 2;
    L.save(); L.translate(hx, hy); L.rotate(v.a);
    const g = L.createRadialGradient(0, 0, 4, 60, 0, 120);
    g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = g;
    L.beginPath(); L.moveTo(0, -8); L.lineTo(150, -55); L.lineTo(150, 55); L.lineTo(0, 8); L.closePath(); L.fill();
    L.restore();
    hole(v.x, v.y, 40, 0.5);
  }
  for (const p of state.particles) if ((p.type === 'fire' || p.type === 'flash') && inView(p.x, p.y)) hole(p.x, p.y, p.type === 'flash' ? p.size * 1.4 : 46, 0.5);
  const pl = state.player;
  hole(pl.vehicle ? pl.vehicle.x : pl.x, pl.vehicle ? pl.vehicle.y : pl.y, 90, 0.45);
  if (state.heli) {
    const h = state.heli;
    const tx = pl.vehicle ? pl.vehicle.x : pl.x, ty = pl.vehicle ? pl.vehicle.y : pl.y;
    hole(tx + Math.sin(time * 1.3) * 20, ty + Math.cos(time) * 20, 120, 1);
    hole(h.x, h.y, 40, 0.6);
  }
  for (const m of state.markerLights || []) hole(m.x, m.y, 60, 0.8);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightCanvas, 0, 0);

}
