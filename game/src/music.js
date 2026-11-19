// Synthesised music: a step sequencer that plays original loops (drums, bass, pads, plucked
// leads) for the title theme, three in-car radio stations and calm/tense on-foot moods.
import { getAudioContext, getMusicBus } from './audio.js';
import { makeRng } from './mathutil.js';

export const RADIO_STATIONS = [
  { name: 'Radio Ola 98.1', color: '#ff7ad9', song: 'dembow' },
  { name: 'Onda Retro 104', color: '#3cf2ff', song: 'synth' },
  { name: 'Cumbia Sol 92.5', color: '#ffe14d', song: 'cumbia' },
  { name: 'Radio Off', color: '#aaaaaa', song: null },
];

const SONGS = {
  title:  { bpm: 92, root: 45, kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.....x.x.......', lead: 'x..x..x...x.x...', pad: 0.12, wave: 'sawtooth', leadWave: 'triangle', prog: [0, 8, 3, 10] },
  dembow: { bpm: 96, root: 45, kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x..x.x..x..x.', lead: '..x.x...x.x..x..', pad: 0.05, wave: 'square', leadWave: 'sine', prog: [0, 8, 3, 10] },
  synth:  { bpm: 104, root: 40, kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.x.x.x.x.x.x.x.', lead: 'x.x.x.x.x.x.x.x.', pad: 0.14, wave: 'sawtooth', leadWave: 'sawtooth', prog: [0, 5, 8, 7] },
  cumbia: { bpm: 100, root: 43, kick: 'x.......x.......', snare: '....x.......x...', hat: 'xx.xxx.xxx.xxx.x', bass: 'x...x...x...x...', lead: 'x..x..x.x..x..x.', pad: 0.04, wave: 'triangle', leadWave: 'square', prog: [12, 5, 7, 0], major: true },
  foot:   { bpm: 84, root: 45, kick: 'x.........x.....', snare: '................', hat: '....x.......x...', bass: 'x.......x.......', lead: 'x.....x.....x...', pad: 0.1, wave: 'triangle', leadWave: 'sine', prog: [0, 8, 3, 10], quiet: true },
  tension:{ bpm: 128, root: 41, kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.xxx.xxx.xxx.xx', lead: '....x.......x...', pad: 0.06, wave: 'sawtooth', leadWave: 'square', prog: [0, 1, 0, 6] },
};

let current = null, step = 0, nextTime = 0, timer = null, bar = 0;
const R = makeRng(5);

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function chordTones(song, barIdx) {
  const off = song.prog[barIdx % song.prog.length];
  const minor = !song.major && (off === 0 || off === 5 || off === 7 && song.root === 40);
  return [off, off + (minor ? 3 : 4), off + 7];
}

function env(ac, dest, t, peak, attack, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function noise(ac, t, dur, type, freq, peak, dest) {
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource(); s.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  s.connect(f); f.connect(env(ac, dest, t, peak, 0.002, dur));
  s.start(t); s.stop(t + dur + 0.02);
}

function osc(ac, t, wave, freq, peak, attack, decay, dest, filter = 0) {
  const o = ac.createOscillator(); o.type = wave; o.frequency.setValueAtTime(freq, t);
  const g = env(ac, dest, t, peak, attack, decay);
  if (filter) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); f.connect(g); }
  else o.connect(g);
  o.start(t); o.stop(t + attack + decay + 0.05);
  return o;
}

function playStep(ac, dest, song, s, t, spb) {
  const q = song.quiet ? 0.5 : 1;
  if (song.kick[s] === 'x') { const o = osc(ac, t, 'sine', 150, 0.9 * q, 0.003, 0.28, dest); o.frequency.exponentialRampToValueAtTime(42, t + 0.2); }
  if (song.snare[s] === 'x') { noise(ac, t, 0.13, 'bandpass', 1900, 0.45 * q, dest); osc(ac, t, 'triangle', 210, 0.2 * q, 0.002, 0.07, dest); }
  if (song.hat[s] === 'x') noise(ac, t, song === SONGS.cumbia ? 0.06 : 0.03, 'highpass', song === SONGS.cumbia ? 4000 : 7500, 0.16 * q, dest);
  const tones = chordTones(song, bar);
  if (song.bass[s] === 'x') {
    const n = song.root + tones[s % 8 === 4 && song.bass === SONGS.cumbia.bass ? 2 : 0] + (s % 8 === 6 ? 12 : 0);
    osc(ac, t, song.wave, mtof(n), 0.32 * q, 0.005, spb * 1.6, dest, 520);
  }
  if (song.lead[s] === 'x') {
    const deg = tones[(R.int(0, 2) + s) % 3] + (R.chance(0.3) ? 12 : 0);
    osc(ac, t, song.leadWave, mtof(song.root + 24 + deg), (song.leadWave === 'sawtooth' || song.leadWave === 'square' ? 0.06 : 0.14) * q, 0.004, spb * 2.2, dest, 2600);
  }
  if (s === 0 && song.pad > 0) {
    for (const tn of tones) {
      for (const det of [-6, 6]) {
        const o = osc(ac, t, 'sawtooth', mtof(song.root + 12 + tn), song.pad * 0.35 * q, spb * 4, spb * 12, dest, 1100);
        o.detune.value = det;
      }
    }
  }
}

function schedule() {
  const ac = getAudioContext();
  if (!ac || !current) return;
  const song = SONGS[current];
  const spb = 60 / song.bpm / 4;
  const dest = getMusicBus();
  while (nextTime < ac.currentTime + 0.18) {
    playStep(ac, dest, song, step, nextTime, spb);
    step = (step + 1) % 16;
    if (step === 0) bar++;
    nextTime += spb;
  }
}

// The soundtrack switches by situation (title, on foot, radio while driving, tension at 3+
// stars); a change resets the sequencer so the new track starts on its downbeat.
export function setMusic(name) {
  if (name === current) return;
  current = name;
  const ac = getAudioContext();
  if (!ac) return;
  step = 0; bar = 0;
  nextTime = ac.currentTime + 0.08;
  if (!timer) timer = setInterval(schedule, 40);
}

// Chooses the soundtrack for the current situation.
export function musicFor(state) {
  if (state.mode === 'title' || state.mode === 'intro') return 'title';
  if (state.player.vehicle) {
    const st = RADIO_STATIONS[state.radio];
    if (state.wanted.level >= 3) return 'tension';
    return st.song;
  }
  return state.wanted.level >= 2 ? 'tension' : 'foot';
}
