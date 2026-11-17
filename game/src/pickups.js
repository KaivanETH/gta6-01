// World pickups: dropped cash, ammo, health and armor packs, and the 16 hidden Golden Shell
// collectibles scattered around Bahía Dorada.
import { WEAPONS } from './config.js';
import { sfx } from './audio.js';
import { toast } from './state.js';
import { makeRng, dist2, formatMoney } from './mathutil.js';

export function dropCash(state, x, y, amount) {
  state.pickups.push({ type: 'cash', amount, x: x + 6, y: y + 4, life: 30 });
}

export function placeGoldenShells(state) {
  const R = makeRng(77);
  const w = state.world;
  const spots = [];
  for (const b of w.blocks) {
    if (spots.length >= 16) break;
    if (R.chance(0.13)) spots.push({ x: b.lot.x + R.range(6, 20), y: b.lot.y + R.range(6, 20) });
  }
  while (spots.length < 16) spots.push({ x: w.beach.x + R.range(40, 240), y: R.range(200, w.beach.h - 200) });
  state.shells = spots.map((s, i) => ({ ...s, id: i, taken: state.shellsTaken ? state.shellsTaken.includes(i) : false }));
}

export function updatePickups(state, dt) {
  const pl = state.player;
  const px = pl.vehicle ? pl.vehicle.x : pl.x, py = pl.vehicle ? pl.vehicle.y : pl.y;
  const reach = pl.vehicle ? 30 : 18;
  for (const k of state.pickups) {
    k.life -= dt;
    if (dist2(k.x, k.y, px, py) > reach * reach || pl.dead) continue;
    k.life = 0;
    switch (k.type) {
      case 'cash': state.cash += k.amount; sfx.cash(0.6); toast(state, '+' + formatMoney(k.amount), '#7ddc6a', 1.4); break;
      case 'ammo': pl.ammo[k.weapon] = (pl.ammo[k.weapon] || 0) + k.amount; pl.weapons[k.weapon] = true; sfx.pickup(); toast(state, `+${k.amount} ${WEAPONS[k.weapon].name} ammo`, '#ffc93c', 1.6); break;
      case 'health': pl.health = Math.min(pl.maxHealth, pl.health + 50); sfx.pickup(); toast(state, '+50 Health', '#ff6b6b'); break;
      case 'armor': pl.armor = Math.min(pl.maxArmor, pl.armor + 50); sfx.pickup(); toast(state, '+50 Armor', '#5cc8ff'); break;
    }
  }
  state.pickups = state.pickups.filter((k) => k.life > 0);
  if (state.shells) for (const s of state.shells) {
    if (s.taken || dist2(s.x, s.y, px, py) > (reach + 6) * (reach + 6)) continue;
    s.taken = true;
    const n = state.shells.filter((q) => q.taken).length;
    state.cash += 250;
    sfx.pass();
    toast(state, `Golden Shell ${n}/16 found  +$250`, '#ffc93c', 3);
    if (n === 16) { state.cash += 5000; toast(state, 'All Golden Shells! +$5,000', '#ffc93c', 5); }
  }
}

export function drawPickups(ctx, state, time) {
  for (const k of state.pickups) {
    const bob = Math.sin(time * 5 + k.x) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(k.x, k.y + 4, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (k.type === 'cash') {
      ctx.fillStyle = '#3fae49'; ctx.fillRect(k.x - 7, k.y - 4 + bob, 14, 8);
      ctx.fillStyle = '#b8f5a0'; ctx.fillRect(k.x - 2, k.y - 2 + bob, 4, 4);
    } else if (k.type === 'ammo') {
      ctx.fillStyle = '#c99a2e'; ctx.fillRect(k.x - 6, k.y - 5 + bob, 12, 10);
      ctx.fillStyle = '#5a3f0e'; ctx.fillRect(k.x - 4, k.y - 3 + bob, 8, 2);
    } else {
      ctx.fillStyle = k.type === 'health' ? '#e63946' : '#3a86ff';
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(k.x - 1.5, k.y - 4 + bob, 3, 8); ctx.fillRect(k.x - 4, k.y - 1.5 + bob, 8, 3);
    }
  }
  if (state.shells) for (const s of state.shells) {
    if (s.taken) continue;
    const pulse = 0.6 + Math.sin(time * 4 + s.id) * 0.4;
    ctx.fillStyle = `rgba(255,215,80,${0.25 * pulse})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * Math.PI; ctx.lineTo(s.x + Math.cos(a) * 8, s.y + 2 + Math.sin(a) * 8); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const a = Math.PI + (i / 6) * Math.PI; ctx.beginPath(); ctx.moveTo(s.x, s.y + 3); ctx.lineTo(s.x + Math.cos(a) * 7, s.y + 2 + Math.sin(a) * 7); ctx.stroke(); }
  }
}
