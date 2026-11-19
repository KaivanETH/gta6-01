// Interactive world markers (mission starts, objectives, safehouse, gun shop, properties,
// garage): glowing ground rings with floating icons and labels, shared by the HUD/minimap.

export function drawMarkers(ctx, state, time, b) {
  state.markerLights = [];
  for (const m of state.markers || []) {
    if (m.x < b.x0 - 80 || m.x > b.x1 + 80 || m.y < b.y0 - 80 || m.y > b.y1 + 80) continue;
    const r = m.r || 22;
    const pulse = 0.5 + Math.sin(time * 4 + m.x) * 0.5;
    ctx.fillStyle = hexA(m.color, 0.18 + 0.12 * pulse);
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(m.color, 0.9); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.x, m.y, r * (0.75 + 0.25 * pulse), 0, Math.PI * 2); ctx.stroke();
    // light beam
    const g = ctx.createLinearGradient(m.x, m.y, m.x, m.y - 70);
    g.addColorStop(0, hexA(m.color, 0.55)); g.addColorStop(1, hexA(m.color, 0));
    ctx.fillStyle = g; ctx.fillRect(m.x - r * 0.6, m.y - 70, r * 1.2, 70);
    // icon badge
    const by = m.y - 34 - Math.sin(time * 3) * 4;
    ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(m.x, by, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.icon || '!', m.x, by + 1);
    if (m.label) markerLabel(ctx, m, m.x, by - 22);
    state.markerLights.push(m);
  }
}

// Marker labels sit on a tiny dark plate: names stay readable over white tower roofs and
// bright sand, which is where most of the city's landmarks live.
export function markerLabel(ctx, m, x, y) {
  if (!m || !m.label) return;
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(m.label).width + 12;
  ctx.fillStyle = 'rgba(4,4,18,0.66)';
  ctx.fillRect(x - w / 2, y - 7, w, 14);
  ctx.strokeStyle = hexA(m.color || '#ffffff', 0.55); ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2 + 0.5, y - 6.5, w - 1, 13);
  ctx.fillStyle = '#ffffff'; ctx.fillText(m.label, x, y + 0.5);
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
