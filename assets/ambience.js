// ambience.js — o som de cada mundo.
// Nenhum arquivo é baixado: o navegador sintetiza tudo, camada por camada, do
// mesmo jeito que o asoftmurmur faz com chuva, vento, ondas, pássaros e grilos.
// Isso mantém o pacote exportado sem dependência, sem licença e sem CDN.

const CLIMATE_LAYER = {
  claro: null,
  chuva: "rain",
  neve: "hush",
  névoa: "drone",
  vento: "gust",
};

const BIOME_LAYERS = {
  oceano: ["waves", "wind"],
  costa: ["waves", "gulls"],
  campina: ["wind", "crickets"],
  mata: ["birds", "insects", "leaves"],
  serra: ["gust", "drone"],
};

function noiseBuffer(ctx, kind) {
  const len = Math.floor(ctx.sampleRate * 4);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "brown") {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    } else if (kind === "pink") {
      last = 0.98 * last + 0.02 * white;
      data[i] = last * 2.4 + white * 0.2;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

export function createAmbience(biome, climate) {
  let ctx = null;
  let master = null;
  let running = false;
  let buffers = {};
  const nodes = [];
  const timers = [];

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  };

  function buffer(kind) {
    if (!buffers[kind]) buffers[kind] = noiseBuffer(ctx, kind);
    return buffers[kind];
  }

  function noise(kind) {
    const src = ctx.createBufferSource();
    src.buffer = buffer(kind);
    src.loop = true;
    src.start();
    nodes.push(src);
    return src;
  }

  function lfo(rate, depth, target) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.value = rate;
    amp.gain.value = depth;
    osc.connect(amp).connect(target);
    osc.start();
    nodes.push(osc);
    return osc;
  }

  function wind(strength) {
    const src = noise("pink");
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 520;
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.1 * strength;
    src.connect(band).connect(gain).connect(master);
    lfo(0.07 + Math.random() * 0.05, 0.06 * strength, gain.gain);
    lfo(0.03, 180, band.frequency);
  }

  function waves() {
    const src = noise("brown");
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 620;
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    src.connect(low).connect(gain).connect(master);
    lfo(0.09, 0.14, gain.gain);
    lfo(0.05, 260, low.frequency);
  }

  function rain() {
    const src = noise("white");
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 1100;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.value = 0.11;
    src.connect(high).connect(low).connect(gain).connect(master);
    lfo(0.12, 0.03, gain.gain);

    const drop = () => {
      if (!running) return;
      const src2 = noise("white");
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + Math.random() * 2600;
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      src2.connect(bp).connect(g).connect(master);
      src2.start();
      src2.stop(ctx.currentTime + 0.25);
      later(drop, 90 + Math.random() * 420);
    };
    later(drop, 400);
  }

  function gust() {
    wind(1.5);
    const src = noise("white");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.03;
    src.connect(bp).connect(gain).connect(master);
    lfo(0.11, 0.03, gain.gain);
  }

  function drone() {
    [55, 82.5, 110].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.value = 0.018 / (i + 1);
      osc.connect(gain).connect(master);
      osc.start();
      nodes.push(osc);
    });
    wind(0.5);
  }

  function hush() {
    wind(0.7);
    const src = noise("pink");
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    src.connect(low).connect(gain).connect(master);
  }

  function chirp(base, spread, length) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const t0 = ctx.currentTime;
    const f = base + Math.random() * spread;
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.5), t0 + length * 0.6);
    osc.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + length);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.05, t0 + length * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(t0 + length + 0.05);
  }

  function birds() {
    const call = () => {
      if (!running) return;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) later(() => chirp(1500, 1200, 0.08 + Math.random() * 0.08), i * (90 + Math.random() * 120));
      later(call, 2600 + Math.random() * 6000);
    };
    later(call, 1200);
  }

  function gulls() {
    const call = () => {
      if (!running) return;
      chirp(700, 300, 0.35);
      later(call, 6000 + Math.random() * 9000);
    };
    later(call, 3000);
  }

  function crickets() {
    const tick = () => {
      if (!running) return;
      for (let i = 0; i < 3; i++) later(() => chirp(4200, 300, 0.035), i * 60);
      later(tick, 380 + Math.random() * 260);
    };
    later(tick, 500);
  }

  function insects() {
    const buzz = () => {
      if (!running) return;
      chirp(2600, 900, 0.5);
      later(buzz, 1800 + Math.random() * 4000);
    };
    later(buzz, 2000);
  }

  function leaves() {
    wind(0.55);
  }

  const BUILDERS = {
    wind,
    waves,
    rain,
    gust,
    drone,
    hush,
    birds,
    gulls,
    crickets,
    insects,
    leaves,
  };

  function build() {
    const layers = [...(BIOME_LAYERS[biome] || ["wind"])];
    const extra = CLIMATE_LAYER[climate];
    if (extra && layers.indexOf(extra) === -1) layers.push(extra);
    layers.forEach((name) => {
      const fn = BUILDERS[name];
      if (fn) fn();
    });
  }

  async function start() {
    if (running) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") await ctx.resume();
    running = true;
    build();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
    return true;
  }

  function stop() {
    if (!running) return;
    running = false;
    timers.splice(0).forEach(clearTimeout);
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    }
    const dead = nodes.splice(0);
    setTimeout(() => {
      dead.forEach((n) => {
        try {
          n.stop();
        } catch (err) {
          /* já parado */
        }
      });
    }, 700);
  }

  return {
    isOn: () => running,
    async toggle() {
      if (running) {
        stop();
        return false;
      }
      return start();
    },
    stop,
    dispose() {
      stop();
      if (ctx) {
        setTimeout(() => ctx && ctx.close().catch(() => {}), 900);
        ctx = null;
      }
    },
  };
}