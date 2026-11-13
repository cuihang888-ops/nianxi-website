let context;
let master;
let breeze;
let breezeGain;
const settings = { enabled: false, volume: 0.5, environment: 0.3, effects: 0.65 };

function ensure() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.connect(context.destination);
    master.gain.value = 0;
  }
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

function apply() {
  if (!context) return;
  master.gain.setTargetAtTime(settings.enabled ? settings.volume : 0, context.currentTime, 0.2);
  if (breezeGain) breezeGain.gain.setTargetAtTime(settings.environment * 0.2, context.currentTime, 0.5);
}

export function configureAudio(next) {
  Object.assign(settings, next);
  ensure();
  if (!breeze) {
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < channel.length; i++) {
      previous = (previous + Math.random() * 0.04 - 0.02) / 1.02;
      channel[i] = previous * 3;
    }
    breeze = context.createBufferSource();
    breeze.buffer = buffer;
    breeze.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 530;
    breezeGain = context.createGain();
    breeze.connect(filter).connect(breezeGain).connect(master);
    breeze.start();
  }
  apply();
}

function tone(frequency, duration, type, volume, delay = 0) {
  const ctx = ensure();
  if (!settings.enabled) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const time = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume * settings.effects, time + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(gain).connect(master);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.04);
}

export function playWoodfish() {
  tone(510, 0.19, "sine", 0.7);
  tone(790, 0.08, "triangle", 0.18);
  tone(158, 0.12, "sine", 0.13);
}

export function playBell() {
  [174, 350, 485, 703, 1094].forEach((frequency, index) => tone(frequency, 5.5 - index * 0.55, "sine", 0.22 / (index + 1)));
}

export function playBead() {
  tone(850 + Math.random() * 100, 0.055, "triangle", 0.15);
}

export function playTea() {
  [660, 880, 990].forEach((frequency, i) => tone(frequency, 0.65, "sine", 0.07, i * 0.16));
}

export function disposeAudio() {
  breeze?.stop();
  breeze = null;
  breezeGain = null;
  context?.close().catch(() => {});
  context = null;
  master = null;
}
