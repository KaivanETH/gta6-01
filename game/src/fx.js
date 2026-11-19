// Particle and decal effects: sparks, smoke, fire, explosions, blood, water splashes,
// tire skid marks, scorch decals, muzzle flashes, tracers and camera shake.
import { rng } from './mathutil.js';

const MAX_PARTICLES = 900;
const MAX_SKIDS = 900;

function add(state, p) {
  if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
  p.max = p.life;
  state.particles.push(p);
}

export function shake(state, amount) {
  state.camera.shake = Math.min(26, state.camera.shake + amount);
}

export function sparks(state, x, y, n = 8, dirA = null) {
  for (let i = 0; i < n; i++) {
    const a = dirA === null ? rng.range(0, Math.PI * 2) : dirA + rng.range(-0.9, 0.9);
    const s = rng.range(120, 380);
    add(state, { type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.15, 0.4), size: 2, drag: 4, color: rng.chance(0.5) ? '#fff6a0' : '#ffb347' });
  }
}

export function smoke(state, x, y, dark = false, size = 8) {
  add(state, { type: 'smoke', x, y, vx: rng.range(-15, 15), vy: rng.range(-25, -5), life: rng.range(0.8, 1.6), size, grow: 14, drag: 1, color: dark ? '#2b2b2b' : '#d8d8d8' });
}

// Tyre smoke that scales with how hard the car is sliding (0..1): a hard drift throws a
// longer, fatter, more opaque cloud than a light chirp.
export function tireSmoke(state, x, y, slip = 0.5) {
  const k = Math.max(0, Math.min(1, slip));
  add(state, { type: 'smoke', x, y, vx: rng.range(-14, 14), vy: rng.range(-14, 14), life: rng.range(0.5, 0.85) + k * 0.4, size: 5 + k * 4, grow: 17 + k * 12, drag: 1, color: '#f6f6f6', alpha: 0.22 + k * 0.2 });
}

export function fire(state, x, y, size = 10) {
  add(state, { type: 'fire', x: x + rng.range(-6, 6), y: y + rng.range(-6, 6), vx: rng.range(-12, 12), vy: rng.range(-50, -20), life: rng.range(0.3, 0.7), size, grow: -8, drag: 1, color: rng.pick(['#ffdd55', '#ff9a2e', '#ff5a1f']) });
}

export function blood(state, x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), s = rng.range(20, 110);
    add(state, { type: 'blood', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.2, 0.45), size: rng.range(1.5, 3), drag: 6, color: '#a3122a' });
  }
  decal(state, x, y, rng.range(5, 10), 'blood');
}

export function splash(state, x, y, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), s = rng.range(30, 140);
    add(state, { type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.3, 0.6), size: 2, drag: 3, color: '#e9fbff' });
  }
}

export function debris(state, x, y, color = '#666', n = 6) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), s = rng.range(60, 260);
    add(state, { type: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.5, 1.1), size: rng.range(2, 4), drag: 3, rot: rng.range(0, 6), spin: rng.range(-12, 12), color });
  }
}

export function muzzleFlash(state, x, y, a) {
  add(state, { type: 'flash', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: 0, vy: 0, life: 0.09, size: 14, drag: 0, color: '#fff2a8' });
}

export function explosionFx(state, x, y) {
  add(state, { type: 'flash', x, y, vx: 0, vy: 0, life: 0.25, size: 120, drag: 0, color: '#fff0b0' });
  add(state, { type: 'ring', x, y, vx: 0, vy: 0, life: 0.45, size: 10, grow: 320, drag: 0, color: '#ffffff' });
  for (let i = 0; i < 26; i++) fire(state, x + rng.range(-25, 25), y + rng.range(-25, 25), rng.range(12, 24));
  for (let i = 0; i < 14; i++) smoke(state, x + rng.range(-30, 30), y + rng.range(-30, 30), true, 14);
  sparks(state, x, y, 24);
  debris(state, x, y, '#333', 12);
  decal(state, x, y, 40, 'scorch');
  shake(state, 18);
}

export function tracer(state, x1, y1, x2, y2, color = '#fff6c0') {
  state.tracers.push({ x1, y1, x2, y2, life: 0.11, color });
}

export function skid(state, x1, y1, x2, y2) {
  if (state.skids.length >= MAX_SKIDS) state.skids.shift();
  state.skids.push({ x1, y1, x2, y2, life: 22 });
}

export function decal(state, x, y, r, type) {
  if (state.decals.length > 140) state.decals.shift();
  state.decals.push({ x, y, r, type, life: 60, rot: rng.range(0, 6.28) });
}

export function updateFx(state, dt) {
  const ps = state.particles;
  let w = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vy *= d;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.grow) p.size = Math.max(0.5, p.size + p.grow * dt);
    if (p.spin) p.rot += p.spin * dt;
    ps[w++] = p;
  }
  ps.length = w;
  for (const t of state.tracers) t.life -= dt;
  state.tracers = state.tracers.filter((t) => t.life > 0);
  for (const s of state.skids) s.life -= dt;
  if (state.skids.length && state.skids[0].life <= 0) state.skids = state.skids.filter((s) => s.life > 0);
  for (const d of state.decals) d.life -= dt;
  if (state.decals.length && state.decals[0].life <= 0) state.decals = state.decals.filter((d) => d.life > 0);
  state.camera.shake = Math.max(0, state.camera.shake - dt * 30);
}

// Ground-level marks: skids, blood, scorch. Drawn under vehicles.
export function drawGroundFx(ctx, state) {
  ctx.lineCap = 'round';
  // two passes per mark: a wide soft rubber halo and a dark core, so a drift reads on the
  // mid-grey asphalt from the far camera instead of vanishing into it
  for (const s of state.skids) {
    const a = Math.min(1, s.life / 22);
    ctx.lineWidth = 7;
    ctx.strokeStyle = `rgba(18,16,22,${0.2 * a})`;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  ctx.lineWidth = 3.5;
  for (const s of state.skids) {
    const a = Math.min(1, s.life / 22);
    ctx.strokeStyle = `rgba(16,14,20,${0.62 * a})`;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  for (const d of state.decals) {
    const a = Math.min(1, d.life / 10);
    ctx.fillStyle = d.type === 'blood' ? `rgba(120,10,25,${0.55 * a})` : `rgba(20,15,10,${0.5 * a})`;
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, d.rot, 0, Math.PI * 2); ctx.fill();
  }
}

// Airborne particles and bullet tracers. Drawn above vehicles.
export function drawParticles(ctx, state) {
  for (const t of state.tracers) {
    ctx.strokeStyle = t.color; ctx.lineWidth = 1.6; ctx.globalAlpha = Math.min(1, t.life / 0.07);
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of state.particles) {
    const k = p.life / p.max;
    switch (p.type) {
      case 'spark':
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.globalAlpha = k;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        break;
      case 'smoke': {
        // soft radial puff: a hard-edged circle reads as a grey ball at this camera distance,
        // a falloff to transparent reads as smoke volume
        ctx.globalAlpha = (p.alpha || 0.55) * k;
        const sg = ctx.createRadialGradient(p.x, p.y, p.size * 0.15, p.x, p.y, p.size);
        sg.addColorStop(0, p.color); sg.addColorStop(1, 'rgba(244,244,244,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'fire':
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.size * k), 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'blood':
        ctx.globalAlpha = k; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        break;
      case 'debris':
        ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); ctx.restore();
        break;
      case 'flash': {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'ring':
        ctx.globalAlpha = k * 0.7; ctx.strokeStyle = p.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
        break;
    }
  }
  ctx.globalAlpha = 1;
}
