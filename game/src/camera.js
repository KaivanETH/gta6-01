// Camera: smooth follow with velocity lookahead, speed-based zoom-out, screen shake,
// cinematic pans for the intro, and screen↔world conversions.
import { WORLD_W, WORLD_H } from './config.js';
import { clamp, lerp, rng } from './mathutil.js';

export function updateCamera(state, dt, view) {
  const cam = state.camera;
  if (cam.cinematic) {
    const c = cam.cinematic;
    c.t = Math.min(c.dur, c.t + dt);
    const k = c.t / c.dur, e = k * k * (3 - 2 * k);
    cam.x = lerp(c.x0, c.x1, e); cam.y = lerp(c.y0, c.y1, e); cam.zoom = lerp(c.z0, c.z1, e);
    return;
  }
  const pl = state.player;
  const tgt = pl.vehicle || pl;
  let lx = 0, ly = 0, zoom = 1.12;
  if (pl.vehicle) {
    const v = pl.vehicle;
    // In a hot pursuit the camera stops leaning so far ahead, which keeps the cruisers on
    // the player's bumper inside the frame instead of below the bottom edge.
    const chasing = state.wanted.level >= 3;
    const lead = chasing ? 0.26 : 0.55, leadY = chasing ? 0.2 : 0.45;
    lx = clamp(v.vx * lead, chasing ? -150 : -300, chasing ? 150 : 300);
    ly = clamp(v.vy * leadY, chasing ? -110 : -200, chasing ? 110 : 200);
    const sp = Math.hypot(v.vx, v.vy) / v.spec.maxSpeed;
    zoom = 1.06 - sp * 0.19;
  } else {
    lx = pl.vx * 0.3; ly = pl.vy * 0.3;
  }
  if (state.wanted.level >= 3 && pl.vehicle) zoom -= 0.03;
  cam.targetZoom = zoom * (view.zoomScale || 1);
  const k = 1 - Math.exp(-dt * 4.5);
  cam.lookX = lerp(cam.lookX || 0, lx, 1 - Math.exp(-dt * 1.8));
  cam.lookY = lerp(cam.lookY || 0, ly, 1 - Math.exp(-dt * 1.8));
  cam.x = lerp(cam.x, tgt.x + cam.lookX, k);
  cam.y = lerp(cam.y, tgt.y + cam.lookY, k);
  cam.zoom = lerp(cam.zoom, cam.targetZoom, 1 - Math.exp(-dt * 1.5));
  const hw = view.w / 2 / cam.zoom, hh = view.h / 2 / cam.zoom;
  cam.x = clamp(cam.x, hw * 0.5, WORLD_W - hw * 0.5);
  cam.y = clamp(cam.y, hh * 0.5, WORLD_H - hh * 0.5);
}

export function startCinematic(state, x0, y0, x1, y1, z0, z1, dur) {
  state.camera.cinematic = { x0, y0, x1, y1, z0, z1, dur, t: 0 };
}
export function endCinematic(state) { state.camera.cinematic = null; }

// Applies the camera transform; returns shake offsets used.
export function applyCamera(ctx, state, view) {
  const cam = state.camera;
  const sx = cam.shake > 0 ? rng.range(-cam.shake, cam.shake) * 0.5 : 0;
  const sy = cam.shake > 0 ? rng.range(-cam.shake, cam.shake) * 0.5 : 0;
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, view.w / 2 - cam.x * cam.zoom + sx, view.h / 2 - cam.y * cam.zoom + sy);
}

export function screenToWorld(state, sx, sy, view) {
  const cam = state.camera;
  return { x: (sx - view.w / 2) / cam.zoom + cam.x, y: (sy - view.h / 2) / cam.zoom + cam.y };
}

export function worldToScreen(state, x, y, view) {
  const cam = state.camera;
  return { x: (x - cam.x) * cam.zoom + view.w / 2, y: (y - cam.y) * cam.zoom + view.h / 2 };
}

export function visibleBounds(state, view, pad = 100) {
  const cam = state.camera;
  const hw = view.w / 2 / cam.zoom + pad, hh = view.h / 2 / cam.zoom + pad;
  return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
}
