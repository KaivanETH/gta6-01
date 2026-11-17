// Frame composer: draws the world in layers — ground, shadows, skid marks, pickups, markers,
// pedestrians, vehicles, particles, the leaning buildings/props, helicopter, then lighting.
import { applyCamera, visibleBounds } from './camera.js';
import { drawGround } from './cityground.js';
import { drawBuildingShadows, drawElevated } from './buildings.js';
import { drawVehicle, drawPed, drawHeli, drawHeliShadow } from './sprites.js';
import { drawGroundFx, drawParticles } from './fx.js';
import { drawPickups } from './pickups.js';
import { drawMarkers } from './markers.js';
import { currentLighting, drawLighting } from './lighting.js';

export function renderWorld(ctx, state, view, time) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#7cbc58';
  ctx.fillRect(0, 0, view.w, view.h);
  applyCamera(ctx, state, view);
  const b = visibleBounds(state, view, 60);
  const lit = currentLighting(state);
  state.lighting = lit;

  drawGround(ctx, state, b, time);
  drawBuildingShadows(ctx, state, b, lit.sun);
  drawGroundFx(ctx, state);
  drawPickups(ctx, state, time);
  drawMarkers(ctx, state, time, b);
  if (state.heli) drawHeliShadow(ctx, state.heli);

  const inView = (o, m = 60) => o.x > b.x0 - m && o.x < b.x1 + m && o.y > b.y0 - m && o.y < b.y1 + m;
  for (const p of state.peds) if (p.state === 'dead' && inView(p)) drawPed(ctx, p, time);
  for (const p of state.peds) if (p.state !== 'dead' && inView(p)) drawPed(ctx, p, time);
  const pl = state.player;
  if (!pl.vehicle && !pl.dead) drawPed(ctx, pl, time, true);
  for (const v of state.vehicles) if (v.wrecked && inView(v)) drawVehicle(ctx, v, time);
  for (const v of state.vehicles) if (!v.wrecked && inView(v)) drawVehicle(ctx, v, time);
  if (pl.dead && !pl.vehicle) drawPed(ctx, { ...pl, state: 'dead' }, time);
  drawParticles(ctx, state);
  drawElevated(ctx, state, b, time, lit.night);
  if (state.heli) drawHeli(ctx, state.heli, time);

  drawLighting(ctx, state, view, lit, b, time, (c) => applyCamera(c, state, view));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
