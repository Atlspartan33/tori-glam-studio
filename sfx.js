// sfx.js — tiny synthesized sounds. No audio files, works offline.
let ac = null, noiseBuf = null;

export function unlock() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  }
  ac.resume?.();
}

function tone(freq, dur, { type = 'sine', gain = 0.18, to = null, at = 0 } = {}) {
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.03);
}

function noise(dur, { freq = 2000, q = 1, gain = 0.3, sweepTo = null } = {}) {
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ac.currentTime;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf;
  f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch {} };

export const sparkle = () => { [1318, 1760, 2093, 2637].forEach((f, i) => tone(f, 0.2, { at: i * 0.05, gain: 0.1, type: 'triangle' })); buzz(15); };
export const boing = () => { tone(170, 0.38, { to: 560, gain: 0.22 }); buzz(20); };
export const off = () => { tone(520, 0.16, { to: 200, gain: 0.12, type: 'triangle' }); buzz(10); };
export const pop = () => { tone(620, 0.08, { to: 980, gain: 0.14 }); buzz(10); };
export const tick = (n) => tone(n === 1 ? 990 : 660, 0.14, { gain: 0.16, type: 'triangle' });
export const shutter = () => { noise(0.08, { freq: 3000, q: 0.7, gain: 0.5 }); setTimeout(() => noise(0.06, { freq: 1800, q: 0.7, gain: 0.35 }), 70); buzz(30); };
export const swoosh = () => { noise(0.35, { freq: 400, sweepTo: 4000, q: 1.2, gain: 0.35 }); buzz(15); };
export const tada = () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, { at: i * 0.07, gain: 0.12, type: 'triangle' }));
