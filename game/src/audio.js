// audio.js — a WebAudio panel of small synthesised sounds, no audio files:
// the engine's putter rising with throttle, wind over the airframe, a

export function createAudio() {
  return { ctx: null, engine: null, engineGain: null, wind: null, windGain: null, started: false };
}

export function startAudio(audio) {
  if (audio.started) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.ctx = ctx;
    // Engine: a sawtooth through a low-pass, pitch and volume off throttle.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    audio.engine = osc;
    audio.engineFilter = filter;
    audio.engineGain = gain;
    // Wind: filtered noise, swelling with airspeed.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 640;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(ctx.destination);
    noise.start();
    audio.windGain = windGain;
    audio.started = true;
  } catch (err) {
    audio.started = false; // a silent cockpit is better than a crashed game
  }
}

export function updateAudio(audio, plane) {
  if (!audio.started) return;
  const t = audio.ctx.currentTime;
  audio.engine.frequency.setTargetAtTime(46 + plane.throttle * 68 + plane.speed * 0.14, t, 0.08);
  audio.engineFilter.frequency.setTargetAtTime(260 + plane.throttle * 640, t, 0.1);
  audio.engineGain.gain.setTargetAtTime(0.015 + plane.throttle * 0.05, t, 0.1);
  audio.windGain.gain.setTargetAtTime(Math.min(0.06, plane.speed * 0.0007), t, 0.15);
}

function tone(audio, freq, dur, type = 'sine', vol = 0.08, when = 0) {
  if (!audio.started) return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + when;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function playGateChime(audio, clean) {
  tone(audio, clean ? 880 : 660, 0.22, 'sine', 0.09);
  tone(audio, clean ? 1318 : 880, 0.3, 'sine', 0.07, 0.09);
}

export function playTouchdownBell(audio, good) {
  if (good) {
    tone(audio, 523, 0.3, 'triangle', 0.09);
    tone(audio, 784, 0.42, 'triangle', 0.08, 0.1);
  } else {
    tone(audio, 118, 0.4, 'square', 0.1);
    tone(audio, 74, 0.5, 'sawtooth', 0.08, 0.05);
  }
}

export function playStallWarning(audio) {
  tone(audio, 1175, 0.09, 'square', 0.035);
}
