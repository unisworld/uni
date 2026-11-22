// Procedural world audio: biome/climate ambience plus the four-chord, reverberant
// harmonic bed, small bird-like chirps and melodic plucks used by the Neocities world.
const CLIMATE_LAYER = { claro: null, chuva: "rain", neve: "hush", névoa: "drone", vento: "gust" };
const BIOME_LAYERS = {
  oceano: ["waves", "wind"], costa: ["waves", "gulls"], campina: ["wind", "crickets"],
  mata: ["birds", "insects", "leaves"], serra: ["gust", "drone"],
};
const CHORDS = [
  [110, 164.81, 220, 329.63], [87.31, 130.81, 174.61, 261.63],
  [98, 146.83, 196, 293.66], [130.81, 196, 261.63, 392],
];
const PENTATONIC = [523.25, 587.33, 698.46, 783.99, 880, 1046.5, 1174.66];

function noiseBuffer(ctx, kind) {
  const length = Math.floor(ctx.sampleRate * 4);
  const result = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = result.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "brown") { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.2; }
    else if (kind === "pink") { last = 0.98 * last + 0.02 * white; data[i] = last * 2.4 + white * 0.2; }
    else data[i] = white;
  }
  return result;
}
function impulseBuffer(ctx, seconds = 4.8, decay = 2.4) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const result = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = result.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return result;
}

export function createAmbience(biome, climate) {
  let ctx = null, master = null, reverb = null, wet = null;
  let state = "off", disposed = false, chordIndex = 0;
  const stateListeners = new Set();
  function setState(next) { if (state === next) return; state = next; stateListeners.forEach(fn => { try { fn(next); } catch {} }); }
  let contextListener = null;
  const buffers = new Map();
  const timers = new Set();
  const groups = new Set();
  let currentGroup = null;

  const makeGroup = () => { const g = { nodes: new Set(), sources: new Set(), cleanupTimer: null }; groups.add(g); return g; };
  function track(node, source = false) {
    const group = currentGroup;
    if (group) {
      group.nodes.add(node);
      if (source) group.sources.add(node);
      if (source) node.onended = () => { group.nodes.delete(node); group.sources.delete(node); };
    }
    return node;
  }
  function node(factory, source = false) { return track(factory(), source); }
  function releaseWhenEnded(source, ownedNodes) {
    const group = currentGroup;
    source.onended = () => {
      ownedNodes.forEach(n => { try { n.disconnect(); } catch {} group?.nodes.delete(n); group?.sources.delete(n); });
    };
  }
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (disposed || state === "off" || state === "unavailable") return;
      if (state === "on") fn(); else later(fn, 1000);
    }, ms);
    timers.add(id);
    return id;
  }
  function buffer(kind) {
    if (!buffers.has(kind)) buffers.set(kind, noiseBuffer(ctx, kind));
    return buffers.get(kind);
  }
  function connectWet(from) { if (reverb && wet) { from.connect(reverb); } }
  function noise(kind, { loop = true, stopAt } = {}) {
    const src = node(() => ctx.createBufferSource(), true);
    src.buffer = buffer(kind); src.loop = loop; src.start();
    if (stopAt != null) src.stop(stopAt);
    return src;
  }
  function lfo(rate, depth, target) {
    const osc = node(() => ctx.createOscillator(), true);
    const amp = node(() => ctx.createGain());
    osc.frequency.value = rate; amp.gain.value = depth;
    osc.connect(amp); amp.connect(target); osc.start(); return osc;
  }
  function filteredNoise(kind, filterType, frequency, gainValue, modulation = null) {
    const src = noise(kind), filter = node(() => ctx.createBiquadFilter()), gain = node(() => ctx.createGain());
    filter.type = filterType; filter.frequency.value = frequency;
    if (filterType === "bandpass") filter.Q.value = 0.6;
    gain.gain.value = gainValue;
    src.connect(filter); filter.connect(gain); gain.connect(master);
    if (modulation) lfo(modulation.rate, modulation.depth, modulation.target === "filter" ? filter.frequency : gain.gain);
    return { src, filter, gain };
  }
  function wind(strength = 0.65) {
    const { filter, gain } = filteredNoise("pink", "bandpass", 520, 0.075 * strength,
      { rate: 0.075, depth: 0.025 * strength, target: "gain" });
    lfo(0.03, 150, filter.frequency);
  }
  function waves() {
    const { filter, gain } = filteredNoise("brown", "lowpass", 620, 0.14,
      { rate: 0.09, depth: 0.09, target: "gain" });
    lfo(0.05, 210, filter.frequency);
  }
  function rain() {
    const src = noise("white"), high = node(() => ctx.createBiquadFilter());
    const low = node(() => ctx.createBiquadFilter()), gain = node(() => ctx.createGain());
    high.type = "highpass"; high.frequency.value = 1100;
    low.type = "lowpass"; low.frequency.value = 7000; gain.gain.value = 0.075;
    src.connect(high); high.connect(low); low.connect(gain); gain.connect(master);
    lfo(0.12, 0.018, gain.gain);
    const drop = () => {
      if (state !== "on") return;
      const t = ctx.currentTime;
      const src = noise("white", { loop: false, stopAt: t + 0.25 });
      const bp = node(() => ctx.createBiquadFilter()), g = node(() => ctx.createGain());
      bp.type = "bandpass"; bp.frequency.value = 1800 + Math.random() * 2600; bp.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      src.connect(bp); bp.connect(g); g.connect(master); releaseWhenEnded(src, [src, bp, g]);
      later(drop, 120 + Math.random() * 420);
    };
    later(drop, 400);
  }
  function gust() {
    wind(1.1);
    const src = noise("white"), bp = node(() => ctx.createBiquadFilter()), gain = node(() => ctx.createGain());
    bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.4; gain.gain.value = 0.018;
    src.connect(bp); bp.connect(gain); gain.connect(master); lfo(0.11, 0.012, gain.gain);
  }
  function drone() {
    [55, 82.5, 110].forEach((f, i) => {
      const osc = node(() => ctx.createOscillator(), true), gain = node(() => ctx.createGain());
      osc.type = "sine"; osc.frequency.value = f; gain.gain.value = 0.012 / (i + 1);
      osc.connect(gain); gain.connect(master); osc.start();
    });
    wind(0.45);
  }
  function hush() {
    wind(0.55);
    const src = noise("pink"), low = node(() => ctx.createBiquadFilter()), gain = node(() => ctx.createGain());
    low.type = "lowpass"; low.frequency.value = 300; gain.gain.value = 0.045;
    src.connect(low); low.connect(gain); gain.connect(master);
  }
  function chirp(base, spread, length, melodic = false) {
    const t = ctx.currentTime + 0.015;
    const osc = node(() => ctx.createOscillator(), true), gain = node(() => ctx.createGain());
    const pan = ctx.createStereoPanner ? node(() => ctx.createStereoPanner()) : node(() => ctx.createGain());
    const f = base + Math.random() * spread;
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.5), t + length * 0.6);
    osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + length);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(melodic ? 0.045 : 0.032, t + length * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    if (pan.pan) pan.pan.value = Math.random() * 1.5 - 0.75;
    osc.connect(gain); gain.connect(pan); pan.connect(master); pan.connect(reverb);
    releaseWhenEnded(osc, [osc, gain, pan]);
    osc.start(t); osc.stop(t + length + 0.05);
  }
  function birds() {
    const call = () => { const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) later(() => chirp(1500, 1200, 0.08 + Math.random() * 0.08), i * (100 + Math.random() * 130));
      later(call, 3000 + Math.random() * 5000); };
    later(call, 1200);
  }
  function gulls() { const call = () => { chirp(700, 300, 0.35); later(call, 6500 + Math.random() * 7000); }; later(call, 2800); }
  function crickets() { const call = () => { for (let i = 0; i < 3; i++) later(() => chirp(4200, 300, 0.035), i * 65); later(call, 500 + Math.random() * 250); }; later(call, 500); }
  function insects() { const call = () => { chirp(2600, 900, 0.5); later(call, 2200 + Math.random() * 3000); }; later(call, 2000); }
  function leaves() { wind(0.4); }

  function padStep() {
    if (state !== "on" && state !== "starting") return;
    const group = currentGroup;
    const t = ctx.currentTime, chord = CHORDS[chordIndex++ % CHORDS.length];
    const groupGain = node(() => ctx.createGain());
    const lowpass = node(() => ctx.createBiquadFilter());
    lowpass.type = "lowpass"; lowpass.frequency.value = 880; lowpass.Q.value = 0.4;
    groupGain.gain.setValueAtTime(0.0001, t); groupGain.gain.linearRampToValueAtTime(0.075, t + 4);
    groupGain.gain.linearRampToValueAtTime(0.0001, t + 11.5);
    groupGain.connect(lowpass); lowpass.connect(master); lowpass.connect(reverb);
    const voices = chord.map((f, i) => {
      const osc = node(() => ctx.createOscillator(), true);
      osc.type = i % 2 ? "triangle" : "sine"; osc.frequency.value = f; osc.detune.value = Math.random() * 8 - 4;
      osc.connect(groupGain); return osc;
    });
    let ended = 0;
    voices.forEach(osc => {
      osc.onended = () => {
        osc.disconnect(); group?.sources.delete(osc); group?.nodes.delete(osc);
        ended++;
        if (ended === voices.length) {
          [groupGain, lowpass].forEach(n => { try { n.disconnect(); } catch {} group?.nodes.delete(n); });
        }
      };
      osc.start(t); osc.stop(t + 12.2);
    });
    later(padStep, 10500);
  }
  function melodicChirp() {
    if (state !== "on") return;
    const base = [1568, 1760, 2093, 2349, 2637][Math.floor(Math.random() * 5)];
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) later(() => chirp(base, 350, 0.07 + Math.random() * 0.035, true), i * 100);
    later(melodicChirp, 2600 + Math.random() * 4200);
  }
  function pluck() {
    if (state !== "on") return;
    const t = ctx.currentTime, osc = node(() => ctx.createOscillator(), true), gain = node(() => ctx.createGain());
    const filter = node(() => ctx.createBiquadFilter());
    osc.type = "triangle"; osc.frequency.value = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    gain.gain.setValueAtTime(0.0001, t); gain.gain.linearRampToValueAtTime(0.045, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0004, t + 3.4);
    filter.type = "lowpass"; filter.frequency.setValueAtTime(3200, t); filter.frequency.exponentialRampToValueAtTime(680, t + 2.6);
    osc.connect(gain); gain.connect(filter); filter.connect(master); filter.connect(reverb); osc.start(t); osc.stop(t + 3.6);
    later(pluck, 2600 + Math.random() * 4000);
  }

  function ensureContext() {
    if (ctx) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulseBuffer(ctx);
    wet = ctx.createGain(); wet.gain.value = 0.28; reverb.connect(wet); wet.connect(master);
    contextListener = () => {
      if (disposed || state === "off") return;
      if (ctx.state === "running") setState("on");
      else if (ctx.state === "suspended") { setState("blocked"); installUnlock(); }
    };
    ctx.addEventListener?.("statechange", contextListener);
    return true;
  }
  function build() {
    currentGroup = makeGroup();
    const names = [...(BIOME_LAYERS[biome] || ["wind"])];
    const extra = CLIMATE_LAYER[climate]; if (extra && !names.includes(extra)) names.push(extra);
    const builders = { wind, waves, rain, gust, drone, hush, birds, gulls, crickets, insects, leaves };
    names.forEach(name => builders[name]?.());
    padStep(); later(melodicChirp, 1400); later(pluck, 3200);
  }
  function installUnlock() {
    if (disposed || !ctx || state === "off") return;
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
  }
  function removeUnlock() {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  }
  async function unlock(event) {
    // Let the control's click handler own its gesture, otherwise pointerdown
    // could unlock auto-start and the following click would immediately mute.
    if (event?.target?.closest?.("#sound")) return false;
    if (disposed || !ctx || state === "off") return false;
    try { await ctx.resume(); } catch { setState("blocked"); return false; }
    if (ctx.state === "running") { setState("on"); removeUnlock(); return true; }
    setState("blocked"); return false;
  }
  async function start() {
    if (disposed || state === "on" || state === "starting") return state === "on";
    if (state === "blocked" && ctx) return unlock();
    if (!ensureContext()) { setState("unavailable"); return false; }
    setState("starting");
    try {
      build();
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
      master.gain.setTargetAtTime(0.42, t, 1.15);
      try { await ctx.resume(); } catch { /* first trusted gesture will retry */ }
      if (disposed) return false;
      if (ctx.state === "running") { setState("on"); removeUnlock(); return true; }
      setState("blocked"); installUnlock(); return false;
    } catch (error) {
      stop(); setState("unavailable"); return false;
    }
  }
  function cleanupGroup(group) {
    if (!groups.has(group)) return;
    if (group.cleanupTimer) clearTimeout(group.cleanupTimer);
    group.nodes.forEach(n => { try { n.disconnect(); } catch {} });
    group.nodes.clear(); group.sources.clear(); groups.delete(group);
  }
  function stop() {
    if (state === "off" || state === "unavailable") return;
    setState("off"); removeUnlock();
    timers.forEach(clearTimeout); timers.clear();
    const t = ctx?.currentTime || 0;
    if (master && ctx && ctx.state !== "closed") {
      try { master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.setTargetAtTime(0.0001, t, 0.12); } catch {}
    }
    for (const group of [...groups]) {
      if (ctx?.state === "suspended") {
        group.sources.forEach(source => { try { source.stop(); } catch {} });
        cleanupGroup(group);
      } else {
        group.sources.forEach(source => { try { source.stop(t + 0.38); } catch {} });
        group.cleanupTimer = setTimeout(() => cleanupGroup(group), 550);
      }
    }
  }
  async function dispose() {
    if (disposed) return;
    stop(); disposed = true; removeUnlock();
    timers.forEach(clearTimeout); timers.clear();
    for (const group of [...groups]) { group.sources.forEach(source => { try { source.stop(); } catch {} }); cleanupGroup(group); }
    if (ctx) {
      const old = ctx; ctx = null;
      [master, reverb, wet].forEach(n => { try { n?.disconnect(); } catch {} });
      try { old.removeEventListener?.("statechange", contextListener); } catch {}
      try { await old.close(); } catch {}
      master = reverb = wet = null;
    }
    setState("off"); stateListeners.clear();
  }
  return {
    isOn: () => state === "on",
    getState: () => state,
    onState(fn) { stateListeners.add(fn); fn(state); return () => stateListeners.delete(fn); },
    async toggle() { if (state === "on" || state === "starting") { stop(); return false; } return start(); },
    start,
    unlock,
    stop,
    dispose,
  };
}
