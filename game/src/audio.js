// Procedural WebAudio: no samples, no files. Engine hum, sirens, gunshots, a
// sunset bassline and UI blips, all synthesized. Created lazily on the first
// user gesture so browsers never block the page on load.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let muted = false;
  let sirenOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 58;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lp); osc2.connect(lp);
      lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); osc2.start();
      engineOsc._mate = osc2;
    } catch { return false; }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  // A lazy two-bar bassline: A minor pentatonic, golden-hour tempo 96 BPM.
  const BASS = [55, 0, 55, 65.41, 0, 55, 82.41, 73.42, 55, 0, 55, 65.41, 98, 82.41, 73.42, 65.41];
  let step = 0;
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted) return;
      const f = BASS[step % BASS.length];
      step += 1;
      if (f) tone(f, 0.32, 'triangle', 0.12);
      if (step % 4 === 1) tone(220, 0.1, 'sine', 0.05);
    }, 156);
  }

  return {
    unlock() { if (ensure()) { if (ctx.state === 'suspended') ctx.resume(); startMusic(); } },
    setEngine(speed01, nitro) {
      if (!ctx || !engineOsc) return;
      const f = 55 + speed01 * 140 + (nitro ? 60 : 0);
      engineOsc.frequency.value = f;
      engineOsc._mate.frequency.value = f * 1.03;
      engineGain.gain.value = muted ? 0 : 0.03 + speed01 * 0.05;
    },
    setSiren(on) {
      sirenOn = on;
      if (!ctx) return;
      if (on && !this._sirenTimer) {
        let hi = false;
        this._sirenTimer = setInterval(() => {
          if (!muted) tone(hi ? 960 : 720, 0.28, 'sine', 0.045);
          hi = !hi;
        }, 300);
      } else if (!on && this._sirenTimer) {
        clearInterval(this._sirenTimer);
        this._sirenTimer = null;
      }
    },
    shot() { noiseBurst(0.12, 0.25, 2400); tone(180, 0.08, 'square', 0.1, 60); },
    punch() { noiseBurst(0.08, 0.18, 700); },
    pickup() { tone(880, 0.12, 'sine', 0.14); tone(1320, 0.18, 'sine', 0.12); },
    cash() { tone(1046, 0.1, 'triangle', 0.14); setTimeout(() => tone(1568, 0.22, 'triangle', 0.14), 90); },
    busted() { tone(330, 0.5, 'sawtooth', 0.12, 110); },
    wasted() { tone(220, 0.8, 'sawtooth', 0.14, 55); },
    blip() { tone(660, 0.07, 'sine', 0.1); },
    nitro() { noiseBurst(0.5, 0.12, 3000); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
  };
}
