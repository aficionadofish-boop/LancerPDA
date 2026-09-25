/* Field Receiver — sound engine. Every sound is synthesized; there are no audio files.
   All tuning lives in DEFAULTS. soundlab.html (preview builds only) edits it live and can save
   an override to this browser's localStorage ("receiver.tuning"). */
window.ReceiverSound = (function () {
  "use strict";

  // A "hit" is a short dry mechanical sound:
  //   click  - broadband noise transient (the sharp edge)
  //   body   - narrow resonant noise (the plastic/metal "tock" that gives it pitch)
  //   rattle - a second, quieter click a few ms later (the cap settling)
  //   thud   - low sine drop; keep near 0 for a dry key, it is what makes a sound "pneumatic"
  // Tuned by ear by the GM in soundlab.html, 2026-09-26.
  var DEFAULTS = {
    master: 0.86,
    press: {
      clickFreq: 3400, clickQ: 9, clickDecay: 0.026, clickGain: 0.45,
      bodyFreq: 1890, bodyQ: 11.1, bodyDecay: 0.026, bodyGain: 0.82,
      rattleDelay: 0.001, rattleGain: 0.28, thudFreq: 60, thudGain: 0.02
    },
    release: {
      clickFreq: 4800, clickQ: 1, clickDecay: 0.006, clickGain: 0.22,
      bodyFreq: 2200, bodyQ: 8, bodyDecay: 0.014, bodyGain: 0.9,
      rattleDelay: 0, rattleGain: 0, thudFreq: 150, thudGain: 0
    },
    toggle: {
      clickFreq: 3000, clickQ: 0.9, clickDecay: 0.014, clickGain: 0.8,
      bodyFreq: 950, bodyQ: 6, bodyDecay: 0.035, bodyGain: 2,
      rattleDelay: 0.011, rattleGain: 0.4, thudFreq: 120, thudGain: 0.2
    },
    detent: {
      clickFreq: 470, clickQ: 1.2, clickDecay: 0.013, clickGain: 1.15,
      bodyFreq: 2330, bodyQ: 8.3, bodyDecay: 0.053, bodyGain: 0,
      rattleDelay: 0.004, rattleGain: 0.22, thudFreq: 60, thudGain: 0
    },
    // message switch: crackly radio static
    static: { dur: 0.176, freq: 1590, q: 1.2, crackleGain: 0.32, hissGain: 0.18 },
    // print-out: one soft resonant tick per step, with random variation
    tty: { interval: 36, jitter: 0.14, freq: 2180, q: 5.8, decay: 0.053, gain: 0.25, variance: 0.08, clickGain: 0 }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, over) {
    Object.keys(over || {}).forEach(function (k) {
      if (base[k] !== null && typeof base[k] === "object") merge(base[k], over[k]);
      else if (typeof over[k] === typeof base[k]) base[k] = over[k];
    });
    return base;
  }

  var T = clone(DEFAULTS);
  try { merge(T, JSON.parse(localStorage.getItem("receiver.tuning") || "{}")); } catch (e) { /* ignore */ }

  var enabled = true;
  try { enabled = JSON.parse(localStorage.getItem("receiver.sound") || "true"); } catch (e) { /* ignore */ }

  // Create the context up front (it starts suspended) so the first key press doesn't pay for it.
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, noiseBuf = null, crackleBuf = null;
  if (AC) {
    try {
      ctx = new AC({ latencyHint: "interactive" });
      master = ctx.createGain();
      master.gain.value = T.master;
      master.connect(ctx.destination);
      noiseBuf = makeNoise(ctx);
      crackleBuf = makeCrackle(ctx);
    } catch (e) { ctx = null; }
  }

  function makeNoise(c) {
    var len = Math.floor(c.sampleRate * 0.6), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeCrackle(c) {
    // Sparse random pops of varying size and length: sounds like a dirty radio band.
    var len = Math.floor(c.sampleRate * 0.6), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) {
      if (Math.random() < 0.004) {
        var amp = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.7);
        var n = 2 + (Math.random() * 14 | 0);
        for (var k = 0; k < n && i + k < len; k++) d[i + k] += amp * Math.exp(-k / (n / 3));
      }
    }
    return b;
  }

  function unlock() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  });

  function noiseHit(buf, t, freq, q, decay, gain, type) {
    if (gain <= 0 || decay <= 0) return;
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = type || "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + decay + 0.02);
  }
  function sineDrop(t, freq, decay, gain) {
    if (gain <= 0) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.45), t + decay);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + decay + 0.02);
  }
  function vary(x, amount) { return x * (1 + (Math.random() * 2 - 1) * amount); }

  function hit(p) {
    var t = ctx.currentTime;
    noiseHit(noiseBuf, t, vary(p.clickFreq, 0.08), p.clickQ, p.clickDecay, p.clickGain);
    noiseHit(noiseBuf, t, vary(p.bodyFreq, 0.04), p.bodyQ, p.bodyDecay, p.bodyGain);
    if (p.rattleGain > 0) {
      noiseHit(noiseBuf, t + p.rattleDelay, vary(p.clickFreq * 1.25, 0.1), p.clickQ, p.clickDecay * 0.8, p.rattleGain);
    }
    sineDrop(t, p.thudFreq, 0.06, p.thudGain);
  }

  function ready() { return enabled && ctx; }

  var lastTick = 0, nextGap = 0;

  return {
    DEFAULTS: DEFAULTS,
    tuning: T,
    isOn: function () { return enabled; },
    setOn: function (v) {
      enabled = v;
      try { localStorage.setItem("receiver.sound", JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
    setTuning: function (next) {
      merge(T, next);
      if (master) master.gain.value = T.master;
    },
    saveTuning: function () { try { localStorage.setItem("receiver.tuning", JSON.stringify(T)); } catch (e) { /* ignore */ } },
    resetTuning: function () {
      merge(T, clone(DEFAULTS));
      if (master) master.gain.value = T.master;
      try { localStorage.removeItem("receiver.tuning"); } catch (e) { /* ignore */ }
    },
    down: function () { if (ready()) hit(T.press); },
    up: function () { if (ready()) hit(T.release); },
    toggle: function () { if (ready()) hit(T.toggle); },
    detent: function () { if (ready()) hit(T.detent); },
    static: function () {
      if (!ready()) return;
      var p = T.static, t = ctx.currentTime;
      noiseHit(crackleBuf, t, p.freq, p.q, p.dur, p.crackleGain);
      noiseHit(noiseBuf, t, p.freq, p.q * 0.6, p.dur * 0.7, p.hissGain);
    },
    tty: function () {
      if (!ready()) return;
      var now = performance.now(), p = T.tty;
      if (now - lastTick < nextGap) return;
      lastTick = now;
      nextGap = vary(p.interval, p.jitter / 2);
      var t = ctx.currentTime;
      noiseHit(noiseBuf, t, vary(p.freq, p.variance), p.q, vary(p.decay, p.variance), vary(p.gain, p.variance));
      noiseHit(noiseBuf, t, 4500, 0.7, 0.004, p.clickGain);
    }
  };
})();
