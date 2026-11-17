// WebAudio sound engine, everything synthesised in code: engine hum pitched by speed,
// police siren, tyre screech, gunshots, punches, impacts, explosions, footsteps and UI blips.

let ac = null;
let master, sfxBus, musicBus, noiseBuf;
let engine = null, siren = null, screech = null;
let volume = 0.8, musicOn = true;

export function getAudioContext() { return ac; }
export function getMusicBus() { return musicBus; }

export function initAudio() {
  if (ac) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = volume; master.connect(ac.destination);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  comp.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
  musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  buildEngine(); buildSiren(); buildScreech();
}

export function setVolume(v) { volume = v; if (master) master.gain.setTargetAtTime(v, ac.currentTime, 0.05); }
export function setMusicEnabled(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ac.currentTime, 0.1); }

function noiseSource() {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9;
  return s;
}

function envGain(peak, attack, decay, t0) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function burst({ type = 'lowpass', freq = 1000, q = 1, peak = 0.5, attack = 0.002, decay = 0.2, vol = 1, sweepTo = null }) {
  if (!ac || vol <= 0.01) return;
  const t = ac.currentTime;
  const n = noiseSource();
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  const g = envGain(peak * vol, attack, decay, t);
  n.connect(f); f.connect(g); g.connect(sfxBus);
  n.start(t); n.stop(t + attack + decay + 0.05);
}

function tone({ wave = 'sine', freq = 440, to = null, peak = 0.3, attack = 0.005, decay = 0.2, vol = 1, delay = 0 }) {
  if (!ac || vol <= 0.01) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = wave; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  const g = envGain(peak * vol, attack, decay, t);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + attack + decay + 0.05);
}

export const sfx = {
  shot(kind = 'pistol', vol = 1) {
    const big = kind === 'shotgun';
    burst({ type: 'bandpass', freq: big ? 900 : 1500, q: 0.7, peak: big ? 0.9 : 0.7, decay: big ? 0.28 : 0.13, vol, sweepTo: 300 });
    tone({ wave: 'sine', freq: big ? 140 : 180, to: 40, peak: 0.6, decay: big ? 0.25 : 0.12, vol });
  },
  punch(vol = 1) { burst({ type: 'bandpass', freq: 500, q: 1.2, peak: 0.6, decay: 0.08, vol }); tone({ freq: 110, to: 60, peak: 0.4, decay: 0.08, vol }); },
  slash(vol = 1) { burst({ type: 'highpass', freq: 2500, peak: 0.35, attack: 0.02, decay: 0.12, vol, sweepTo: 6000 }); },
  impact(strength = 1, vol = 1) {
    const s = Math.min(1.5, strength);
    burst({ type: 'lowpass', freq: 500 + 500 * s, peak: 0.5 + 0.4 * s, decay: 0.15 + 0.15 * s, vol, sweepTo: 120 });
    tone({ wave: 'triangle', freq: 90, to: 35, peak: 0.5 * s, decay: 0.2, vol });
  },
  glass(vol = 1) { for (let i = 0; i < 4; i++) tone({ wave: 'triangle', freq: 2400 + Math.random() * 2400, peak: 0.08, decay: 0.12, delay: i * 0.02, vol }); },
  explosion(vol = 1) {
    burst({ type: 'lowpass', freq: 900, peak: 1.0, attack: 0.01, decay: 1.4, vol, sweepTo: 60 });
    tone({ wave: 'sine', freq: 70, to: 25, peak: 0.9, decay: 1.0, vol });
  },
  footstep(vol = 0.3) { burst({ type: 'bandpass', freq: 1800 + Math.random() * 600, q: 2, peak: 0.25, decay: 0.035, vol }); },
  door(vol = 1) { tone({ wave: 'square', freq: 160, to: 80, peak: 0.12, decay: 0.08, vol }); burst({ type: 'lowpass', freq: 700, peak: 0.3, decay: 0.08, vol }); },
  horn(vol = 1) { tone({ wave: 'square', freq: 392, peak: 0.08, attack: 0.01, decay: 0.35, vol }); tone({ wave: 'square', freq: 494, peak: 0.07, attack: 0.01, decay: 0.35, vol }); },
  cash(vol = 1) { tone({ freq: 1320, peak: 0.18, decay: 0.08, vol }); tone({ freq: 1760, peak: 0.18, decay: 0.16, delay: 0.07, vol }); },
  pickup(vol = 1) { tone({ wave: 'triangle', freq: 660, to: 1320, peak: 0.2, decay: 0.15, vol }); },
  ui(vol = 1) { tone({ wave: 'triangle', freq: 880, peak: 0.12, decay: 0.05, vol }); },
  star(vol = 1) { tone({ wave: 'square', freq: 520, peak: 0.08, decay: 0.12, vol }); tone({ wave: 'square', freq: 390, peak: 0.08, decay: 0.2, delay: 0.1, vol }); },
  pass() { [523, 659, 784, 1046].forEach((f, i) => tone({ wave: 'triangle', freq: f, peak: 0.22, decay: 0.35, delay: i * 0.11 })); },
  fail() { [392, 330, 262].forEach((f, i) => tone({ wave: 'sawtooth', freq: f, peak: 0.12, decay: 0.35, delay: i * 0.16 })); },
  scream(vol = 1) { tone({ wave: 'sawtooth', freq: 700 + Math.random() * 300, to: 400, peak: 0.07, attack: 0.03, decay: 0.4, vol }); },
};

function buildEngine() {
  const o1 = ac.createOscillator(); o1.type = 'sawtooth';
  const o2 = ac.createOscillator(); o2.type = 'square';
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 3;
  const g = ac.createGain(); g.gain.value = 0;
  const g2 = ac.createGain(); g2.gain.value = 0.5;
  o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(sfxBus);
  o1.frequency.value = 50; o2.frequency.value = 25;
  o1.start(); o2.start();
  engine = { o1, o2, f, g };
}

// speed01: 0..1 of max speed, throttle: 0..1. on=false silences it (player on foot).
export function updateEngineSound(on, speed01, throttle) {
  if (!engine) return;
  const t = ac.currentTime;
  const gearPos = (speed01 * 4) % 1; // fake gear shifts
  const base = 42 + speed01 * 90 + gearPos * 40 + throttle * 12;
  engine.o1.frequency.setTargetAtTime(base, t, 0.05);
  engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
  engine.f.frequency.setTargetAtTime(300 + throttle * 700 + speed01 * 600, t, 0.08);
  engine.g.gain.setTargetAtTime(on ? 0.07 + throttle * 0.06 : 0, t, 0.1);
}

function buildSiren() {
  const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = 700;
  const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.9;
  const lg = ac.createGain(); lg.gain.value = 220;
  lfo.connect(lg); lg.connect(o.frequency);
  const g = ac.createGain(); g.gain.value = 0;
  o.connect(g); g.connect(sfxBus);
  o.start(); lfo.start();
  siren = { o, lfo, g };
}
export function updateSiren(intensity, fast) {
  if (!siren) return;
  const t = ac.currentTime;
  siren.g.gain.setTargetAtTime(Math.min(0.09, intensity * 0.09), t, 0.15);
  siren.lfo.frequency.setTargetAtTime(fast ? 3.2 : 0.9, t, 0.3);
}

function buildScreech() {
  const n = noiseSource(); n.loopStart = 0; n.loopEnd = 2;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 6;
  const g = ac.createGain(); g.gain.value = 0;
  n.connect(f); f.connect(g); g.connect(sfxBus); n.start();
  screech = { g };
}
export function updateScreech(amount) {
  if (!screech) return;
  screech.g.gain.setTargetAtTime(Math.min(0.25, amount * 0.25), ac.currentTime, 0.05);
}

// Distance attenuation from the camera centre.
export function volAt(state, x, y) {
  const d = Math.hypot(x - state.camera.x, y - state.camera.y);
  return Math.max(0, 1 - d / 1100);
}
