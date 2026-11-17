// Procedural top-down sprites drawn with canvas paths: cars of every type (with damage,
// brake lights and police light bars), pedestrians/officers/gang members, the player,
// and the police helicopter.
import { shadeColor } from './mathutil.js';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export { rrect };

export function drawVehicle(ctx, v, time) {
  const L = v.spec.len, W = v.spec.wid;
  const hl = L / 2, hw = W / 2;
  ctx.save();
  ctx.translate(v.x, v.y);
  // shadow
  ctx.save();
  ctx.translate(4, 5);
  ctx.rotate(v.a);
  ctx.fillStyle = 'rgba(15,10,35,0.32)';
  rrect(ctx, -hl - 1, -hw - 1, L + 2, W + 2, 7);
  ctx.fill();
  ctx.restore();
  ctx.rotate(v.a);
  // wheels
  ctx.fillStyle = '#151515';
  const st = (v.steer || 0) * 0.45;
  for (const [wx, wy, front] of [[hl * 0.62, -hw, 1], [hl * 0.62, hw, 1], [-hl * 0.62, -hw, 0], [-hl * 0.62, hw, 0]]) {
    ctx.save(); ctx.translate(wx, wy); if (front) ctx.rotate(st); ctx.fillRect(-5, -2.5, 10, 5); ctx.restore();
  }
  const body = v.flash > 0 ? '#ffffff' : v.color;
  const dark = shadeColor(v.wrecked ? '#2a2622' : v.color, -0.35);
  // body
  ctx.fillStyle = dark;
  rrect(ctx, -hl, -hw, L, W, 6); ctx.fill();
  ctx.fillStyle = body;
  rrect(ctx, -hl + 1.5, -hw + 1.5, L - 3, W - 3, 5); ctx.fill();
  if (!v.wrecked) {
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rrect(ctx, -hl + 3, -hw + 3, L - 6, W * 0.28, 3); ctx.fill();
  }
  const t = v.type;
  if (t === 'pickup') {
    ctx.fillStyle = shadeColor(v.color, -0.45);
    ctx.fillRect(-hl + 3, -hw + 3, L * 0.42, W - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-hl + 3 + i * L * 0.1, -hw + 4); ctx.lineTo(-hl + 3 + i * L * 0.1, hw - 4); ctx.stroke(); }
  }
  if (t === 'van') {
    ctx.fillStyle = shadeColor(v.color, 0.08);
    ctx.fillRect(-hl + 3, -hw + 3, L * 0.68, W - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.strokeRect(-hl + 3, -hw + 3, L * 0.68, W - 6);
  }
  // glass
  if (!v.wrecked) {
    ctx.fillStyle = '#1d2a3a';
    const wsX = t === 'van' ? hl * 0.42 : t === 'sports' ? hl * 0.05 : hl * 0.12;
    ctx.beginPath(); // windshield
    ctx.moveTo(wsX, -hw + 3); ctx.lineTo(wsX + 9, -hw + 4.5); ctx.lineTo(wsX + 9, hw - 4.5); ctx.lineTo(wsX, hw - 3); ctx.closePath(); ctx.fill();
    if (t !== 'van' && t !== 'pickup') {
      ctx.beginPath(); // rear window
      ctx.moveTo(-hl * 0.55, -hw + 3.5); ctx.lineTo(-hl * 0.55 - 6, -hw + 5); ctx.lineTo(-hl * 0.55 - 6, hw - 5); ctx.lineTo(-hl * 0.55, hw - 3.5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(160,210,255,0.35)';
    ctx.fillRect(wsX + 2, -hw + 5, 2, W * 0.3);
  }
  // type details
  if (t === 'taxi') {
    ctx.fillStyle = '#222'; ctx.fillRect(-4, -4, 9, 8);
    ctx.fillStyle = '#fff6c2'; ctx.fillRect(-3, -3, 7, 6);
    ctx.fillStyle = '#222'; ctx.fillRect(-hl + 4, -1, L - 8, 2);
  }
  if (t === 'police') {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(hl - 11, -hw + 2, 9, W - 4);
    ctx.fillRect(-hl + 2, -hw + 2, 8, W - 4);
    ctx.fillStyle = '#1f4fa8'; ctx.fillRect(-6, -hw + 1, 12, 2.5); ctx.fillRect(-6, hw - 3.5, 12, 2.5);
    const on = v.siren && !v.wrecked;
    const ph = Math.floor(time * 8) % 2;
    ctx.fillStyle = on ? (ph ? '#ff2b2b' : '#5a0d0d') : '#7a1e1e'; ctx.fillRect(-3, -hw + 4, 5, W / 2 - 4);
    ctx.fillStyle = on ? (ph ? '#14306b' : '#2f7bff') : '#1e2f6a'; ctx.fillRect(-3, 0, 5, W / 2 - 4);
  }
  if (t === 'sports' || t === 'muscle') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-hl + 3, -2.5, L - 6, 1.6); ctx.fillRect(-hl + 3, 1, L - 6, 1.6);
    if (t === 'muscle') { ctx.fillStyle = '#111'; ctx.fillRect(hl * 0.35, -3, 8, 6); }
  }
  // lights
  ctx.fillStyle = '#fff7d1';
  ctx.fillRect(hl - 3, -hw + 2, 3, 4); ctx.fillRect(hl - 3, hw - 6, 3, 4);
  const braking = v.driver && v.throttle < -0.1;
  ctx.fillStyle = braking ? '#ff3030' : '#a8141e';
  ctx.fillRect(-hl, -hw + 2, 2.5, 4); ctx.fillRect(-hl, hw - 6, 2.5, 4);
  // damage scratches
  if (v.health < v.maxHealth * 0.5 && !v.wrecked) {
    ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hl - 6, -hw + 2); ctx.lineTo(hl - 14, -hw + 7); ctx.moveTo(-hl + 6, hw - 2); ctx.lineTo(-hl + 15, hw - 6); ctx.stroke();
  }
  ctx.restore();
}

export function drawPed(ctx, p, time, isPlayer = false) {
  const look = p.look;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.state === 'dead' || p.state === 'down') {
    ctx.rotate(p.a + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 2, 6, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.pants; ctx.fillRect(-4, 2, 8, 9);
    ctx.fillStyle = p.flash > 0 ? '#fff' : look.shirt; ctx.beginPath(); ctx.ellipse(0, -1, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.skin; ctx.beginPath(); ctx.arc(0, -9, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.hair; ctx.beginPath(); ctx.arc(0, -10, 3.5, Math.PI, 0); ctx.fill();
    ctx.restore();
    return;
  }
  // shadow
  ctx.fillStyle = 'rgba(15,10,35,0.3)';
  ctx.beginPath(); ctx.ellipse(3, 4, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255,79,123,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.rotate(p.a);
  const sw = Math.sin(p.walkPhase) * 4;
  // legs
  ctx.fillStyle = look.pants;
  ctx.fillRect(sw - 2, -4.5, 5, 3.5); ctx.fillRect(-sw - 2, 1, 5, 3.5);
  // arms
  ctx.fillStyle = look.skin;
  const armed = p.kind === 'player' ? p.weapon !== 'fist' && p.weapon !== 'knife' : (p.hostile || p.role === 'cop' && p.state === 'chase');
  if (armed) {
    ctx.fillRect(2, -5, 8, 2.5); ctx.fillRect(2, 2.5, 8, 2.5);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(8, -2, 7, 3);
  } else {
    const swing = p.swing > 0 ? 7 : 0;
    ctx.beginPath(); ctx.arc(-sw * 0.6 + swing, -6.5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sw * 0.6, 6.5, 2.2, 0, Math.PI * 2); ctx.fill();
    if (p.kind === 'player' && p.weapon === 'knife') { ctx.fillStyle = '#d9d9d9'; ctx.fillRect(-sw * 0.6 + swing + 1, -7.5, 7, 1.6); }
  }
  // torso
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : look.shirt;
  ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (look.bandana) { ctx.fillStyle = look.bandana; ctx.fillRect(-1, -3, 3, 6); }
  if (p.role === 'cop') { ctx.fillStyle = '#ffd34d'; ctx.fillRect(0.5, -4.5, 2, 2); }
  // head
  ctx.fillStyle = look.skin;
  ctx.beginPath(); ctx.arc(1, 0, 3.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.hat || look.hair;
  ctx.beginPath(); ctx.arc(0, 0, look.hat ? 4.4 : 3.6, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  if (look.hat) { ctx.beginPath(); ctx.arc(1, 0, 3.4, 0, Math.PI * 2); ctx.fill(); }
  if (look.ponytail) { ctx.fillStyle = look.hair; ctx.beginPath(); ctx.ellipse(-5, 0, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function drawHeliShadow(ctx, h) {
  ctx.save();
  ctx.translate(h.x + 40, h.y + 55);
  ctx.rotate(h.a);
  ctx.fillStyle = 'rgba(10,10,30,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-40, -2, 24, 4);
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,10,30,0.08)'; ctx.fill();
  ctx.restore();
}

export function drawHeli(ctx, h, time) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.a);
  ctx.fillStyle = '#e9eef5';
  ctx.fillRect(-44, -2.5, 30, 5);
  ctx.fillStyle = '#16213e'; ctx.fillRect(-48, -7, 6, 14);
  ctx.fillStyle = '#e9eef5';
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#16213e';
  ctx.beginPath(); ctx.ellipse(-4, 0, 14, 12, 0, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  ctx.fillStyle = '#4fb3ff';
  ctx.beginPath(); ctx.ellipse(12, 0, 8, 8, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
  const ph = Math.floor(time * 6) % 2;
  ctx.fillStyle = ph ? '#ff2b2b' : '#2f7bff'; ctx.fillRect(-2, -13, 4, 3);
  // rotor
  ctx.fillStyle = 'rgba(40,40,50,0.18)';
  ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(25,25,30,0.8)'; ctx.lineWidth = 3;
  for (let k = 0; k < 2; k++) {
    const a = h.rotor + k * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 36, Math.sin(a) * 36); ctx.lineTo(-Math.cos(a) * 36, -Math.sin(a) * 36); ctx.stroke();
  }
  ctx.restore();
}
