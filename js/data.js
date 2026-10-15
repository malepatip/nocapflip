/* ---------- game data ---------- */
var IDEAL = {"table":{"water":[0.86,85,0.78],"glitter":[0.88,87.5,0.84],"sports":[0.86,87.5,0.98],"hype":[0.86,87.5,0.6],"flask":[0.86,85,0.48],"tumbler":[1,87.5,0.36]},"tray":{"water":[0.9,85,0.52],"glitter":[0.88,85,0.6],"sports":[0.9,85,0.62],"hype":[0.88,85,0.5],"flask":[0.88,85,0.3],"tumbler":[0.88,85,0.2]},"books":{"water":[0.88,85,0.4],"glitter":[0.88,85,0.4],"sports":[0.88,85,0.66],"hype":[0.88,85,0.42],"flask":[0.88,85,0.22],"tumbler":[0.86,85,0.28]},"stool":{"water":[0.86,85,0.48],"glitter":[0.84,85,0.42],"sports":[0.84,85,0.52],"hype":[0.82,85,0.42],"flask":[0.84,85,0.4],"tumbler":[0.7,87.5,0.38]},"hang":{"water":[0.45,72.5,0.88],"glitter":[0.45,72.5,0.88],"sports":[0.44,72.5,0.81],"hype":[0.46,73.8,0.74],"flask":[0.45,73.8,0.61],"tumbler":[0.45,75,0.27]}};

/* skins: how each bottle is drawn. body = plastic tint, label = band colour, cap = cap colour, liquid = contents */
var SKINS = {
  tap:     { type: 'water',   name: 'Fountain refill',      body: 'rgba(220,235,240,.5)',  label: '#8a9a90', cap: '#f4b41b', liquid: 'rgba(150,200,230,.5)', line: 'An old bottle, refilled at the fountain by the gym. Yours.' },
  camo:    { type: 'water',   name: 'Camo water bottle',    body: 'rgba(200,230,255,.55)', label: '#4b5d3a', cap: '#2f3d26', liquid: 'rgba(120,180,240,.55)', line: 'Camo label. You cannot see it. That is the point.' },
  water:   { type: 'water',   name: 'Crinkly water bottle', body: 'rgba(200,230,255,.55)', label: '#2a5bd7', cap: '#2a5bd7', liquid: 'rgba(120,180,240,.55)', line: 'The thin one. Crinkles when you grab it.' },
  glitter: { type: 'glitter', name: 'Glitter bottle',       body: 'rgba(240,210,255,.6)',  label: '#b04fd6', cap: '#f2a3ff', liquid: 'rgba(200,140,255,.5)', glitter: true, line: 'Sticker-covered. Glitter in the water. Somehow legal.' },
  sports:  { type: 'sports',  name: 'Sports-drink bottle',  body: 'rgba(255,255,255,.35)', label: '#f4b41b', cap: '#fff', liquid: 'rgba(60,200,255,.75)', line: 'Squat, heavy, lands like it wants to.' },
  hype:    { type: 'hype',    name: 'Hype drink bottle',    body: 'rgba(20,20,30,.9)',     label: '#2fe36c', cap: '#111', liquid: 'rgba(80,255,120,.35)', dark: true, line: 'The one your parents won\'t buy. Tall and slim.' },
  flask:   { type: 'flask',   name: 'Insulated flask',      body: '#b9c2cc', label: '#6b7a88', cap: '#2b313a', liquid: null, metal: true, line: 'Steel. Clangs. Bounces when it should stick.' },
  tumbler: { type: 'tumbler', name: 'The 40 oz',            body: '#e9c9d2', label: '#c88ca0', cap: '#d8b6c0', liquid: null, metal: true, handle: true, line: 'Forty ounces, handle, a straw. Nobody has flipped it.' }
};

var KIDS = [
  { id: 'ezra', venue: 'classroom',    name: 'Ezra',    stool: '#d9342b', skill: 0.2,  stage: 'table', skin: 'water',   goal: 2, line: 'Landed it once in September. Still talking about it.' },
  { id: 'mia', venue: 'hallway',     name: 'Mia',     stool: '#b04fd6', skill: 0.3,  stage: 'table', skin: 'glitter', goal: 2, line: 'Glitter bottle. Claims the glitter helps. It does not.' },
  { id: 'jaxon', venue: 'restroom',   name: 'Jaxon',   stool: '#f4b41b', skill: 0.4,  stage: 'tray',  skin: 'sports',  goal: 3, line: 'Says skibidi unironically. Lands it anyway. Onto the tray.' },
  { id: 'harper', venue: 'cafeteria',  name: 'Harper',  stool: '#2a5bd7', skill: 0.5,  stage: 'table', skin: 'hype',    goal: 3, line: 'Lands it first try, then leaves. The aura is unreal.' },
  { id: 'kai', venue: 'classroom',     name: 'Kai',     stool: '#2f9e5b', skill: 0.55, stage: 'books', skin: 'camo',    goal: 3, line: 'Flips onto the textbook stack with his off hand. For the aura.' },
  { id: 'nova', venue: 'gym',    name: 'Nova',    stool: '#e8752a', skill: 0.65, stage: 'stool', skin: 'hype',    goal: 3, line: 'Ring light in her backpack. Flips it off the table onto the stool.' },
  { id: 'mason', venue: 'outside',   name: 'Mason',   stool: '#1f9bb8', skill: 0.75, stage: 'tray',  skin: 'flask',   goal: 3, line: 'Says six seven every time anyone says six or seven.' },
  { id: 'olivia', venue: 'hallway',  name: 'Olivia',  stool: '#8a6cf0', skill: 0.82, stage: 'books', skin: 'sports',  goal: 3, line: 'The sports-drink flip is her whole personality. Onto the books.' },
  { id: 'addison', venue: 'cafeteria', name: 'Addison', stool: '#c88ca0', skill: 0.9,  stage: 'table', skin: 'tumbler', goal: 4, line: '7th grade. Head of the table. Has the 40 oz. Has never flipped it. Nobody has.' }
];
var STAGE_WORDS = { table: 'anywhere on the table', tray: 'on the lunch tray', books: 'on top of the textbooks', stool: 'off the table, onto the stool', hang: 'cap to cap under the hanging bottle' };
var RANKS = [[0, 'NPC'], [300, 'mid'], [1000, 'lowkey goated'], [2500, 'sigma'], [6000, 'main character'], [15000, 'final boss']];
var AURA = { land: 100, cap: 1000, flop: -25, win: 500, lose: -200, wrong: -25 };

/* ---------- persistence (per-browser convenience only) ---------- */
var SAVE_KEY = 'nocap.v1';
var S = { aura: 0, beaten: [], bottles: ['tap'], active: 'tap', stats: { flips: 0, lands: 0, caps: 0, best: 0, streak: 0 }, clip: false, sound: true, rec: true, clock: true, audio: 'fart', name: '', pid: '' };
function load() { try { var raw = localStorage.getItem(SAVE_KEY); if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') { S = Object.assign(S, o); S.stats = Object.assign({ flips: 0, lands: 0, caps: 0, best: 0, streak: 0 }, o.stats || {}); } } } catch (e) {} }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function rankFor(a) { var r = RANKS[0][1]; RANKS.forEach(function (x) { if (a >= x[0]) r = x[1]; }); return r; }
function fmt(n) { return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US'); }

/* ---------- tiny synth sounds (start after a tap) ---------- */
var AC = null, OUT = null, ADEST = null;
function audio() {
  if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); OUT = AC.createGain(); OUT.gain.value = 0.9;
    /* soft limiter so stacked sounds (farts + synth + clips) never clip, in the speakers or in the recording */
    var lim = AC.createDynamicsCompressor(); lim.threshold.value = -14; lim.knee.value = 12; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.2;
    OUT.connect(lim); lim.connect(AC.destination); try { ADEST = AC.createMediaStreamDestination(); lim.connect(ADEST); } catch (e) { ADEST = null; } fartPreload(); }
  if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
  if (S.audio === 'clean') cleanPreload();
  return AC;
}
/* clean-mode recorded samples (nice + fail), decoded once and reused like the farts */
var CLEAN_BUFS = { nice: null, fail: null }, CLEAN_FETCHED = {};
function cleanLoad(key, url) {
  if (CLEAN_BUFS[key] || CLEAN_FETCHED[key]) return; CLEAN_FETCHED[key] = true;
  fetch(url).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (ab) {
    if (!ab) return; try { var p = AC.decodeAudioData(ab, function (buf) { CLEAN_BUFS[key] = buf; }, function () {}); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }).catch(function () {});
}
function cleanPreload() { cleanLoad('nice', 'nice.m4a'); cleanLoad('fail', 'fail.m4a'); }
function cleanPlay(key, rate) {
  var buf = CLEAN_BUFS[key]; if (!buf) return false;
  var src = AC.createBufferSource(); src.buffer = buf; if (rate) src.playbackRate.value = rate;
  var g = AC.createGain(); g.gain.value = 1; src.connect(g); g.connect(OUT); src.start(AC.currentTime);
  return true;
}
function sfx(kind) {
  if (!S.sound) return;
  try {
    audio();
    var t = AC.currentTime, clean = S.audio === 'clean';
    if (kind === 'flop' || kind === 'thud') { if (clean) { if (!cleanPlay('fail')) sadTrombone(t, false); } else fartPlay(t); return; }
    if (kind === 'lose') { if (clean) { if (!cleanPlay('fail', 0.9)) sadTrombone(t, true); } else fartPlay(t, FART_LONG); return; }
    var o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(OUT);
    if (kind === 'land') { o.type = 'triangle'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(880, t + .08); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); o.start(t); o.stop(t + .36); }
    else if (kind === 'cap') { [523, 659, 784, 1046].forEach(function (f, i) { var o2 = AC.createOscillator(), g2 = AC.createGain(); o2.type = 'square'; o2.frequency.value = f; o2.connect(g2); g2.connect(OUT); g2.gain.setValueAtTime(.08, t + i * .09); g2.gain.exponentialRampToValueAtTime(.001, t + i * .09 + .3); o2.start(t + i * .09); o2.stop(t + i * .09 + .32); }); o.frequency.value = 1; g.gain.value = 0; o.start(t); o.stop(t + .01); }
    else if (kind === 'splash') {
      /* softer, less hissy: band-passed noise sweeping down, plus a low bloop and a thump */
      var nb = AC.createBuffer(1, AC.sampleRate * 0.7, AC.sampleRate), nd = nb.getChannelData(0); for (var ni = 0; ni < nd.length; ni++) nd[ni] = (Math.random() * 2 - 1) * Math.pow(1 - ni / nd.length, 2);
      var ns = AC.createBufferSource(), nf = AC.createBiquadFilter(), ng = AC.createGain(); ns.buffer = nb; nf.type = 'bandpass'; nf.Q.value = 0.8; nf.frequency.setValueAtTime(1800, t); nf.frequency.exponentialRampToValueAtTime(300, t + .6);
      ns.connect(nf); nf.connect(ng); ng.connect(OUT); ng.gain.setValueAtTime(.32, t); ng.gain.exponentialRampToValueAtTime(.001, t + .7); ns.start(t);
      o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + .25); g.gain.setValueAtTime(.3, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.start(t); o.stop(t + .32);
    }
    else if (kind === 'snip') {
      /* chainsaw bite: low saw through a lowpass, revving up and down */
      var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; o.disconnect(); o.connect(lp); lp.connect(g);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(130, t + .25); o.frequency.linearRampToValueAtTime(60, t + .6);
      g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .62); o.start(t); o.stop(t + .63);
    }
    else if (kind === 'clink') {
      /* cap-to-cap: two bright glass-like pings and a small riser */
      [1760, 2637].forEach(function (f, i) { var o2 = AC.createOscillator(), g2 = AC.createGain(); o2.type = 'sine'; o2.frequency.value = f; o2.connect(g2); g2.connect(OUT); g2.gain.setValueAtTime(.1, t + i * .05); g2.gain.exponentialRampToValueAtTime(.001, t + i * .05 + .45); o2.start(t + i * .05); o2.stop(t + i * .05 + .47); });
      o.type = 'triangle'; o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(900, t + .2); g.gain.setValueAtTime(.06, t); g.gain.exponentialRampToValueAtTime(.001, t + .22); o.start(t); o.stop(t + .23);
    }
    else if (kind === 'tick') { o.type = 'triangle'; o.frequency.value = 880; g.gain.setValueAtTime(.09, t); g.gain.exponentialRampToValueAtTime(.001, t + .06); o.start(t); o.stop(t + .07); }
    else if (kind === 'tap') { o.type = 'sine'; o.frequency.value = 700; g.gain.setValueAtTime(.06, t); g.gain.exponentialRampToValueAtTime(.001, t + .08); o.start(t); o.stop(t + .09); }
    else if (kind === 'win') { [392, 523, 659, 784].forEach(function (f, i) { var o2 = AC.createOscillator(), g2 = AC.createGain(); o2.type = 'triangle'; o2.frequency.value = f; o2.connect(g2); g2.connect(OUT); g2.gain.setValueAtTime(.12, t + i * .12); g2.gain.exponentialRampToValueAtTime(.001, t + i * .12 + .4); o2.start(t + i * .12); o2.stop(t + i * .12 + .42); }); o.frequency.value = 1; g.gain.value = 0; o.start(t); o.stop(t + .01); if (clean) { if (!cleanPlay('nice')) niceVoice(); } }
  } catch (e) {}
}
/* clean-mode sounds: classic sad-trombone wah-wah on fail, speechSynthesis "nice!" on win */
function sadTrombone(t, long) {
  var notes = long ? [392, 349, 311, 277, 247, 220, 196, 175] : [392, 349, 311, 247];
  var step = long ? 0.18 : 0.15;
  notes.forEach(function (f, i) {
    var o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
    o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.9;
    var tt = t + i * step;
    o.frequency.setValueAtTime(f, tt);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, tt + step * 0.95);
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(0.14, tt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, tt + step * 1.1);
    o.connect(lp); lp.connect(g); g.connect(OUT);
    o.start(tt); o.stop(tt + step * 1.2);
  });
}
function niceVoice() {
  try {
    if (!window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance('nice'); u.rate = 1.05; u.pitch = 1.25; u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

/* Fart synthesis shared by the page and the offline preview.
   A fart is a flutter: a train of pulses at 15-40 per second whose rate drifts, each pulse a short resonant burst with
   a puff of noise, run through a soft clip and the body's resonance. kind 0 = quick, 1 = ripper, 2 = squeaker. */
function fartPlan(rnd) {
  var r = rnd(), kind = r < .3 ? 0 : r < .85 ? 1 : 2;
  var dur = kind === 0 ? .26 + rnd() * .16 : kind === 1 ? .7 + rnd() * .45 : .5 + rnd() * .3;
  var r0 = kind === 2 ? 55 + rnd() * 35 : 24 + rnd() * 14;
  var r1 = kind === 0 ? r0 * (1 + rnd() * .35) : kind === 1 ? r0 * (.32 + rnd() * .25) : r0 * (.6 + rnd() * .3);
  var f0 = kind === 2 ? 420 + rnd() * 260 : 92 + rnd() * 75;
  return { kind: kind, dur: dur, r0: r0, r1: r1, f0: f0, wob: 2.2 + rnd() * 3.5, drop: kind === 1 ? .55 + rnd() * .3 : 1 };
}
function fartSamples(sr, p, rnd) {
  var N = Math.floor(sr * p.dur), d = new Float32Array(N), phase = 0, tp = 1, pAmp = 0, pF = p.f0, nAmp = 0, walk = 1, pulseDecay = p.kind === 2 ? 110 : 48, noiseDecay = p.kind === 2 ? 400 : 150;
  for (var i = 0; i < N; i++) {
    var u = i / N, time = i / sr;
    var rate = (p.r0 + (p.r1 - p.r0) * u) * (1 + .1 * Math.sin(6.2832 * p.wob * time) + .04 * Math.sin(6.2832 * 13 * time + 1));
    phase += rate / sr;
    if (phase >= 1) { phase -= 1; tp = 0; var skip = rnd() < .1; pAmp = (skip ? .15 : .65) + rnd() * .35; pF = p.f0 * (1 + (u * (p.drop - 1))) * (.92 + rnd() * .18); nAmp = (skip ? .2 : .5) + rnd() * .5; }
    tp += 1 / sr;
    var pulse = pAmp * Math.exp(-tp * pulseDecay) * Math.sin(6.2832 * pF * tp) + nAmp * (rnd() * 2 - 1) * Math.exp(-tp * noiseDecay) * (p.kind === 2 ? .3 : .6);
    var env = Math.min(1, time / .01);
    var tail = p.kind === 0 ? .6 : .55; if (u > tail) { var v = (u - tail) / (1 - tail); env *= Math.pow(1 - v, p.kind === 2 ? 1.8 : 1.2); }
    if ((i & 2047) === 0) walk = Math.max(.3, Math.min(1, walk + (rnd() - .5) * .4));
    env *= (u > .3 ? walk : 1);
    d[i] = Math.tanh(pulse * env * 1.9);
  }
  return d;
}
/* Real fart recordings (ten of them, from fartscroll.js by The Onion, MIT), embedded as mp3. The synth above is only the fallback if decoding fails. */
/* FART_B64 lives in js/farts.js */
var FART_GAIN = [0.97, 1.04, 0.77, 0.97, 1.0, 0.65, 0.64, 1.16, 1.56, 1.34], FART_LONG = 5, fartBufs = [];
function fartDecode(i, cb) {
  if (fartBufs[i]) { if (cb) cb(fartBufs[i]); return; }
  try {
    var bin = atob(FART_B64[i]), u = new Uint8Array(bin.length); for (var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    var r = AC.decodeAudioData(u.buffer, function (buf) { fartBufs[i] = buf; if (cb) cb(buf); }, function () { if (cb) cb(null); });
    if (r && r.catch) r.catch(function () {});
  } catch (e) { if (cb) cb(null); }
}
function fartPreload() { for (var i = 0; i < FART_B64.length; i++) fartDecode(i); }
function fartPlay(t, which) {
  var i = typeof which === 'number' ? which : Math.floor(Math.random() * FART_B64.length);
  fartDecode(i, function (buf) {
    if (!buf) { fartSynth(AC.currentTime); return; }
    var src = AC.createBufferSource(); src.buffer = buf; src.playbackRate.value = which === FART_LONG ? 1 : 0.92 + Math.random() * 0.16;
    var g = AC.createGain(); g.gain.value = FART_GAIN[i]; src.connect(g); g.connect(OUT); src.start(AC.currentTime);
  });
}
function fartSynth(t) {
  var p = fartPlan(Math.random), d = fartSamples(AC.sampleRate, p, Math.random), buf = AC.createBuffer(1, d.length, AC.sampleRate);
  buf.getChannelData(0).set(d);
  var src = AC.createBufferSource(); src.buffer = buf;
  var bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.kind === 2 ? p.f0 : 190; bp.Q.value = p.kind === 2 ? 2.5 : .7;
  var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.kind === 2 ? 2000 : 1200; lp.Q.value = .8;
  var g = AC.createGain(); g.gain.value = .9; src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(OUT);
  src.start(t);
}
/* seeded noise for the AI kids */
function gauss() { var u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function $(id) { return document.getElementById(id); }
/* player names come from the network: escape before they go into innerHTML */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
