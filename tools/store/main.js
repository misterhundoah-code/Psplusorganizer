// Wall of PS Plus: the shop. Source for store/store.js (build: see tools/store/README.md).
// A whole rental store you can walk around: rows of double-sided shelves stocked by genre, TVs hanging from
// the ceiling, a counter by the door. Stocked with every game, or with what the wall was showing (the wall
// leaves their ids in sessionStorage). Pick up a box to read the back or watch its trailer on the nearest TV.
// After hours (the staff light switch behind the counter) it turns into a shooter: the dead clerks roam the
// aisles and you throw game cases at them, with popcorn for health and a few tapes that do odd things.
// The dead clerks are Quaternius's Zombie Apocalypse Kit models (CC0), in store/models/.
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneRig } from "three/examples/jsm/utils/SkeletonUtils.js";

const $ = (id) => document.getElementById(id);
const CALM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOUCH = matchMedia("(pointer: coarse)").matches;
const BLUE = "#1E3A9E", YELLOW = "#FFC925", INK = "#141a33";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hrs = (h) => (h ? (h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)) + " h" : "");
const plat = (g) => g.sys || (g.p || []).join(", ");
const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
const sget = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- sound ----------
// Recorded effects are Kenney's CC0 packs (impact, RPG, foley, interface and retro sounds), packed into one
// file, store/sfx/sfx.mp3, with store/sfx/sfx.json giving each sound's start and length. The zombie groans,
// the shop's hum, the after-hours drone and the passing cars are made here with the Web Audio API.
const SND = { ctx: null, buf: null, map: null, on: true, master: null, amb: null, ambNight: null, loading: false };
try { SND.on = localStorage.getItem("psplus-shop-sound") !== "off"; } catch (e) {}
function audioStart() {
  if (!SND.on) return;
  if (!SND.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    SND.ctx = new AC(); SND.master = SND.ctx.createGain(); SND.master.gain.value = 0.8; SND.master.connect(SND.ctx.destination);
  }
  if (SND.ctx.state === "suspended") SND.ctx.resume();
  if (!SND.buf && !SND.loading) {
    SND.loading = true;
    Promise.all([get("sfx/sfx.json"), fetch("sfx/sfx.mp3").then((r) => r.arrayBuffer())])
      .then(([map, ab]) => new Promise((ok, no) => SND.ctx.decodeAudioData(ab, ok, no)).then((b) => { SND.map = map; SND.buf = b; }))
      .catch(() => { SND.loading = false; });
  }
  ambience();
}
function noiseBuf() {
  if (SND.noise) return SND.noise;
  const c = SND.ctx, b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // brown noise
  return (SND.noise = b);
}
// where a sound sits relative to the listener: quieter with distance, panned left or right
let EAR = { x: 0, z: 0, yaw: 0 };
function place(x, z, near = 2, far = 16) {
  if (x === undefined) return { g: 1, pan: 0 };
  const dx = x - EAR.x, dz = z - EAR.z, d = Math.hypot(dx, dz);
  const g = d <= near ? 1 : Math.max(0, 1 - (d - near) / (far - near)) ** 1.6;
  // the camera looks down -z at yaw 0; right is +x
  const rx = Math.cos(EAR.yaw) * dx - Math.sin(EAR.yaw) * dz;
  return { g, pan: d > 0.01 ? Math.max(-1, Math.min(1, rx / Math.max(d, 1.5))) * 0.8 : 0 };
}
function out(gain, pan) {
  const c = SND.ctx, g = c.createGain(); g.gain.value = gain;
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(SND.master); }
  else g.connect(SND.master);
  return g;
}
function sfx(name, vol = 1, x, z, rate = 1) {
  if (!SND.on || !SND.buf || !SND.ctx || SND.ctx.state !== "running") return;
  const names = Array.isArray(name) ? name : [name], n = names[Math.floor(Math.random() * names.length)], at = SND.map[n]; if (!at) return;
  const { g, pan } = place(x, z); if (g < 0.02) return;
  const s = SND.ctx.createBufferSource(); s.buffer = SND.buf; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
  s.connect(out(vol * g, pan)); s.start(0, at[0], at[1] + 0.02);
}
// a groan: a buzzing low voice through two vowel-ish filters, sagging in pitch
function groan(x, z, low) {
  if (!SND.on || !SND.ctx || SND.ctx.state !== "running") return;
  const { g, pan } = place(x, z, 2, 14); if (g < 0.03) return;
  const c = SND.ctx, t = c.currentTime, len = 0.7 + Math.random() * 0.9, f0 = (low ? 58 : 78) + Math.random() * 30;
  const o = c.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(f0 * 1.15, t); o.frequency.linearRampToValueAtTime(f0 * 0.82, t + len);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5 + Math.random() * 4; lg.gain.value = f0 * 0.05; lfo.connect(lg); lg.connect(o.frequency);
  const f1 = c.createBiquadFilter(); f1.type = "bandpass"; f1.Q.value = 6; f1.frequency.setValueAtTime(520 + Math.random() * 200, t); f1.frequency.linearRampToValueAtTime(380, t + len);
  const f2 = c.createBiquadFilter(); f2.type = "bandpass"; f2.Q.value = 8; f2.frequency.value = 1050 + Math.random() * 300;
  const env = c.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(1, t + 0.12); env.gain.setValueAtTime(1, t + len * 0.6); env.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const sink = out(0.55 * g, pan);
  o.connect(f1); o.connect(f2); f1.connect(env); const f2g = c.createGain(); f2g.gain.value = 0.5; f2.connect(f2g); f2g.connect(env); env.connect(sink);
  o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
}
// a car going past outside, muffled by the glass
function carBy(x, z, dir) {
  if (!SND.on || !SND.ctx || SND.ctx.state !== "running") return;
  const c = SND.ctx, t = c.currentTime, { g, pan } = place(x, z, 4, 22); if (g < 0.03) return;
  const s = c.createBufferSource(); s.buffer = noiseBuf(); s.loop = true;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(700, t + 1.1); f.frequency.linearRampToValueAtTime(250, t + 2.6);
  const env = c.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.5 * g, t + 1.1); env.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  let p = null;
  const k = 0.7 * Math.cos(EAR.yaw);   // the car crosses from one ear to the other, whichever way you face
  if (c.createStereoPanner) { p = c.createStereoPanner(); p.pan.setValueAtTime(-dir * k, t); p.pan.linearRampToValueAtTime(dir * k, t + 2.6); }
  s.connect(f); f.connect(env); if (p) { env.connect(p); p.connect(SND.master); } else env.connect(SND.master);
  s.start(t); s.stop(t + 2.7);
}
// the shop's background: a faint strip-light hum and street noise by day, a low drone after hours
function ambience() {
  if (!SND.ctx || SND.amb) return;
  const c = SND.ctx;
  const day = c.createGain(); day.gain.value = 0; day.connect(SND.master);
  const hum = c.createOscillator(); hum.frequency.value = 120; const hg = c.createGain(); hg.gain.value = 0.018; hum.connect(hg); hg.connect(day);
  const hum2 = c.createOscillator(); hum2.frequency.value = 240; const hg2 = c.createGain(); hg2.gain.value = 0.006; hum2.connect(hg2); hg2.connect(day);
  const st = c.createBufferSource(); st.buffer = noiseBuf(); st.loop = true; const sf = c.createBiquadFilter(); sf.type = "lowpass"; sf.frequency.value = 400;
  const sg = c.createGain(); sg.gain.value = 0.05; st.connect(sf); sf.connect(sg); sg.connect(day);
  const nightG = c.createGain(); nightG.gain.value = 0; nightG.connect(SND.master);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220; lp.Q.value = 4; lp.connect(nightG);
  const sweep = c.createOscillator(), sw = c.createGain(); sweep.frequency.value = 0.07; sw.gain.value = 90; sweep.connect(sw); sw.connect(lp.frequency);
  for (const f of [55, 55.6, 82.4]) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; const og = c.createGain(); og.gain.value = 0.05; o.connect(og); og.connect(lp); o.start(); }
  hum.start(); hum2.start(); st.start(); sweep.start();
  SND.amb = day; SND.ambNight = nightG;
  ambMode(document.body.classList.contains("night"));
}
function ambMode(nightOn) {
  if (!SND.amb) return;
  const t = SND.ctx.currentTime;
  SND.amb.gain.setTargetAtTime(nightOn ? 0 : 1, t, 0.6); SND.ambNight.gain.setTargetAtTime(nightOn ? 1 : 0, t, 0.6);
}
// the service bell, and a crunch for popcorn landing
function ding() {
  if (!SND.on || !SND.ctx || SND.ctx.state !== "running") return;
  const c = SND.ctx, t = c.currentTime;
  for (const [f, v] of [[2093, 0.3], [3140, 0.15], [4190, 0.07], [5270, 0.04]]) {
    const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + 1.9);
  }
}
function crunch(x, z) {
  if (!SND.on || !SND.ctx || SND.ctx.state !== "running") return;
  const c = SND.ctx, { g, pan } = place(x, z), sink = out(0.9 * g, pan);
  for (let i = 0; i < 4; i++) {
    const t = c.currentTime + i * 0.11 + Math.random() * 0.03, s = c.createBufferSource(); s.buffer = noiseBuf();
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800 + Math.random() * 1500; f.Q.value = 1.5;
    const e = c.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(f); f.connect(e); e.connect(sink); s.start(t, Math.random()); s.stop(t + 0.08);
  }
}
function setSound(on) {
  SND.on = on; try { localStorage.setItem("psplus-shop-sound", on ? "on" : "off"); } catch (e) {}
  const b = $("snd"); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Sound on" : "Sound off";
  if (on) audioStart(); else if (SND.ctx) SND.ctx.suspend();
}

const SECTIONS = [
  ["JRPGs", ["JRPG"]], ["RPGs", ["RPG"]], ["Horror", ["Horror", "Survival"]], ["Roguelikes and Metroidvanias", ["Roguelike", "Metroidvania", "Soulslike"]],
  ["Shooters", ["Shooter"]], ["Action and stealth", ["Hack & Slash", "Stealth", "Action", "Other"]], ["Fighting", ["Fighting"]],
  ["Racing", ["Racing"]], ["Sports", ["Sports"]], ["Family and party", ["Family", "Party"]], ["Platformers", ["Platformer"]],
  ["Puzzle", ["Puzzle"]], ["Strategy and sims", ["Strategy", "Simulation"]], ["Adventure and story", ["Adventure", "Narrative"]],
  ["Open world", ["Open World"]], ["Arcade", ["Arcade"]],
];
// layout, in metres
const BW = 0.3, BH = 0.4, COLS = 12, ROWS = 4, SP = 0.5, PER_FACE = COLS * ROWS;
const SHELF_Y = [0.26, 0.76, 1.26, 1.76];
const GL = 6.4, GD = 0.72, PX = 2.7, ROWZ = GL / 2 + 1.4, CEIL = 3.0, EYE = 1.5, R = 0.3;
const TVW = 0.62, TVH = 0.465, TVY = 2.32;

// ---------- small helpers ----------
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(/\s+/); let line = "", n = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      if (++n === maxLines) { ctx.fillText(line.replace(/[,.;:]?$/, "…"), x, y); return y + lh; }
      ctx.fillText(line, x, y); y += lh; line = w;
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
const sign = (text, sub, w = 1024, h = 256, bg = BLUE) => canvasTex(w, h, (x) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = YELLOW; x.fillRect(0, 0, w, 14); x.fillRect(0, h - 14, w, 14);
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  let size = sub ? 96 : 116; x.font = `${size}px Bungee, "Arial Black", sans-serif`;
  while (x.measureText(text).width > w - 50 && size > 34) { size -= 6; x.font = `${size}px Bungee, "Arial Black", sans-serif`; }
  x.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 4);
  if (sub) { x.font = `600 36px Archivo, system-ui, sans-serif`; x.fillStyle = YELLOW; x.fillText(sub, w / 2, h * 0.8); }
});
function boxBack(g) {
  return canvasTex(480, 640, (x, w, h) => {
    x.fillStyle = "#f4f6fb"; x.fillRect(0, 0, w, h);
    x.fillStyle = BLUE; x.fillRect(0, 0, w, 150);
    x.fillStyle = "#fff"; x.font = "800 38px Archivo, system-ui, sans-serif"; x.textBaseline = "top";
    wrap(x, g.t, 24, 20, w - 140, 42, 3);
    if (g.m) {
      x.fillStyle = YELLOW; x.beginPath(); x.arc(w - 58, 62, 44, 0, 6.28); x.fill();
      x.fillStyle = INK; x.font = "44px 'Permanent Marker', cursive"; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(g.m, w - 58, 66); x.textAlign = "left"; x.textBaseline = "top";
    }
    x.fillStyle = "#4a5170"; x.font = "600 23px Archivo, system-ui, sans-serif";
    x.fillText([g.y, plat(g), hrs(g.h)].filter(Boolean).join("  ·  "), 24, 170);
    x.fillStyle = INK; x.font = "23px Archivo, system-ui, sans-serif";
    wrap(x, g.d || "", 24, 214, w - 48, 31, 9);
    for (let i = 0; i < 44; i++) { x.fillStyle = i % 3 ? INK : "#f4f6fb"; x.fillRect(24 + i * 4.4, h - 74, (i * 7) % 3 + 1.5, 48); }
    x.fillStyle = BLUE; x.font = "24px Bungee, sans-serif"; x.textAlign = "right"; x.fillText("WALL OF PS PLUS", w - 24, h - 56);
  });
}
// Static scenery is merged into one mesh per material, so the whole shop is a handful of draw calls.
class Merger {
  constructor() { this.parts = new Map(); }
  box(mat, w, h, d, x, y, z, ry = 0) { this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, ry); }
  plane(mat, w, h, x, y, z, ry = 0, rx = 0) { const g = new THREE.PlaneGeometry(w, h); if (rx) g.rotateX(rx); this.add(mat, g, x, y, z, ry); }
  add(mat, g, x, y, z, ry) {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const flat = g.index ? g.toNonIndexed() : g;
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(flat);
    if (flat !== g) g.dispose();
  }
  build(group) {
    for (const [mat, gs] of this.parts) {
      let n = 0; gs.forEach((g) => (n += g.attributes.position.count));
      const out = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const size = gs[0].attributes[name].itemSize, arr = new Float32Array(n * size); let o = 0;
        gs.forEach((g) => { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; });
        out.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      gs.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(out, mat));
    }
  }
}

function shelve(games, keepOrder) {
  const buckets = SECTIONS.map(([name, gs]) => ({ name, gs, games: [] }));
  for (const g of games) (buckets.find((b) => b.gs.some((x) => (g.g || []).includes(x))) || buckets[5]).games.push(g);
  const list = [], starts = [];
  for (const b of buckets) {
    if (!b.games.length) continue;
    if (!keepOrder) b.games.sort((a, c) => (c.m || 0) - (a.m || 0) || a.t.localeCompare(c.t));
    starts.push({ name: b.name, at: list.length, n: b.games.length });
    b.games.forEach((g) => list.push({ g, sec: b.name }));
  }
  return { list, starts };
}

async function start() {
  const [raw, boxList, artList, VIDS, THUMBS] = await Promise.all([get("../data/games.json"), get("../data/box.json").catch(() => []),
    get("../data/art.json").catch(() => []), get("../data/videos.json").catch(() => ({})), get("thumbs.json").catch(() => null)]);
  const GAMES = (Array.isArray(raw) ? raw : raw.games || []).filter((g) => !g.gone && g.t);
  const BYID = new Map(GAMES.map((g) => [g.id, g]));
  const BOX = new Set(Array.isArray(boxList) ? boxList : []), ART = new Set(Array.isArray(artList) ? artList : []);
  let fromWall = null;
  try { const j = JSON.parse(sget("psplus-store") || "null"); if (j && Array.isArray(j.ids) && j.ids.length) fromWall = { ids: j.ids.filter((id) => BYID.has(id)), label: String(j.label || "") }; } catch (e) {}
  if (fromWall && !fromWall.ids.length) fromWall = null;
  try { await Promise.all(["96px Bungee", "800 38px Archivo", "44px 'Permanent Marker'", "40px VT323"].map((f) => document.fonts.load(f))); } catch (e) {}

  // Graphics quality. "lite" for phones and slower machines, "full" for the rest; "auto" picks one and steps
  // down if the frame rate struggles. The visitor can choose in the shop's menu.
  const QUALITY = {
    lite: { dpr: 1.25, cap: 120, near: 5, far: 13, fog: [7, 17], lights: 3 },
    full: { dpr: 2, cap: 320, near: 8, far: 18, fog: [10, 25], lights: 6 },
  };
  let qPick = "auto"; try { qPick = localStorage.getItem("psplus-shop-quality") || "auto"; } catch (e) {}
  const slowDevice = TOUCH || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  let qName = qPick === "auto" ? (slowDevice ? "lite" : "full") : qPick;
  let Q = QUALITY[qName];
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: location.hash.includes("webgl") });
  await renderer.init();
  $("engine").textContent = renderer.backend && renderer.backend.isWebGPUBackend ? "Drawn with WebGPU" : "Drawn with WebGL";
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr));
  renderer.toneMapping = THREE.NeutralToneMapping;
  $("stage").appendChild(renderer.domElement);
  const el = renderer.domElement;

  const scene = new THREE.Scene();
  const BG = new THREE.Color("#0d1230"), BG_NIGHT = new THREE.Color("#07020a");
  scene.background = BG.clone(); scene.fog = new THREE.Fog("#0d1230", Q.fog[0], Q.fog[1]);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 45);   // a tighter near/far range gives the depth test more precision
  const hemi = new THREE.HemisphereLight("#fff6e8", "#2a3566", 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffffff", 0.9); sun.position.set(2, 6, 3); scene.add(sun);

  const M = {
    wood: new THREE.MeshStandardMaterial({ color: "#2a3a8a", roughness: 0.7 }),
    edge: new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.5 }),
    plastic: new THREE.MeshStandardMaterial({ color: "#16171D", roughness: 0.35, metalness: 0.1 }),
    blank: new THREE.MeshStandardMaterial({ color: "#2b3350", roughness: 0.5 }),
    strip: new THREE.MeshBasicMaterial({ color: "#fffbe8" }),
    wall: new THREE.MeshStandardMaterial({ color: "#1c2a66", roughness: 0.95 }),
    ceil: new THREE.MeshStandardMaterial({ color: "#161b38", roughness: 1 }),
    tv: new THREE.MeshStandardMaterial({ color: "#2b2b30", roughness: 0.45 }),
    pole: new THREE.MeshStandardMaterial({ color: "#555a66", roughness: 0.4, metalness: 0.6 }),
    door: new THREE.MeshStandardMaterial({ color: "#5a1d24", roughness: 0.6 }),
    counter: new THREE.MeshStandardMaterial({ color: "#d7263d", roughness: 0.6 }),
    boxGeo: new THREE.BoxGeometry(BW, BH, 0.04),
  };
  const carpetTex = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = "#1a2350"; x.fillRect(0, 0, w, h);
    const cols = [YELLOW, "#4FA3FF", "#FF5C7A", "#7CE0B5"]; let s = 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 90; i++) {
      x.strokeStyle = cols[i % 4]; x.lineWidth = 5; x.lineCap = "round"; const px = r() * w, py = r() * h, rr = 10 + r() * 14, a = r() * 6.28;
      x.beginPath();
      if (i % 3 === 0) x.arc(px, py, rr * 0.5, a, a + 3.6); else if (i % 3 === 1) { x.moveTo(px, py); x.quadraticCurveTo(px + rr, py - rr, px + 2 * rr, py); }
      else { x.fillStyle = cols[i % 4]; x.arc(px, py, 4, 0, 6.28); x.fill(); continue; }
      x.stroke();
    }
  });
  carpetTex.wrapS = carpetTex.wrapT = THREE.RepeatWrapping;
  const TVTEX = (() => { const c = document.createElement("canvas"); c.width = 160; c.height = 120; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, t, ctx: c.getContext("2d") }; })();
  const tvMat = new THREE.MeshBasicMaterial({ map: TVTEX.t });
  let tvLabel = ["CH 3", "PICK UP A BOX"];

  // ---------- the shop front and the street outside ----------
  // Everything outside is unlit and ignores the fog (MeshBasicMaterial, fog off), so it costs no lights and
  // still reads through the glass from the back of the shop. The far side of the street is one painted canvas.
  let seed = 11; const srnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);   // repeatable, so the street looks the same each visit
  const facadeTex = canvasTex(2048, 768, (x, w, h) => {
    x.fillStyle = "#0b1030"; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h * 0.6); g.addColorStop(0, "#060818"); g.addColorStop(1, "#1a1f4a");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#e9ecff"; x.beginPath(); x.arc(w * 0.78, 90, 34, 0, 6.28); x.fill();
    x.fillStyle = "#060818"; x.beginPath(); x.arc(w * 0.78 + 14, 82, 30, 0, 6.28); x.fill();
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.3 + srnd() * 0.5})`; x.fillRect(srnd() * w, srnd() * h * 0.35, 2, 2); }
    const shops = [["PIZZA", "#ff5c3a"], ["LAUNDRY", "#5ce1ff"], ["NOODLES", "#ffcf3a"], ["COMICS", "#ff4fd8"], ["24 HR", "#7cff8a"], ["ARCADE", "#b48cff"], ["DINER", "#ff5c7a"], ["HARDWARE", "#ffe27a"]];
    const walls = ["#2a1d2c", "#1d2336", "#2d2320", "#24202e", "#1b2a2e"];
    const ground = 150, px = w / 48;   // 48 m across, so about 43 px to the metre
    let bx = 0, n = 0;
    while (bx < w) {
      const bw = 170 + Math.floor(srnd() * 200), bh = 330 + Math.floor(srnd() * 360), top = h - bh;
      x.fillStyle = walls[n % walls.length]; x.fillRect(bx, top, bw, bh);
      x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(bx, top, bw, 10); x.fillRect(bx + bw - 6, top, 6, bh);
      // upper windows: some lit warm, a few with a TV's blue
      for (let wy = top + 26; wy < h - ground - 40; wy += 52) for (let wx = bx + 18; wx < bx + bw - 34; wx += 42) {
        const r = srnd(); x.fillStyle = r < 0.32 ? "#ffd27a" : r < 0.4 ? "#ffefc2" : r < 0.46 ? "#7fb6ff" : "#11142a";
        x.fillRect(wx, wy, 22, 30);
        if (r < 0.46) { x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(wx, wy + 14, 22, 2); }
      }
      // ground floor shop: a lit window, an awning and a neon sign
      const [name, col] = shops[n % shops.length];
      x.fillStyle = "#151726"; x.fillRect(bx + 8, h - ground, bw - 16, ground);
      const sg = x.createLinearGradient(0, h - ground + 40, 0, h); sg.addColorStop(0, "#ffe3a6"); sg.addColorStop(1, "#a8743e");
      const sx = bx + 18, sy = h - ground + 46, sw2 = bw - 70, sh = ground - 52;
      x.fillStyle = sg; x.fillRect(sx, sy, sw2, sh);
      // shelves, stock and the odd customer inside, then a streak of reflection on the glass
      x.fillStyle = "rgba(90,60,30,0.55)"; for (let yy = sy + 22; yy < sy + sh - 8; yy += 24) x.fillRect(sx + 4, yy, sw2 - 8, 4);
      for (let yy = sy + 8; yy < sy + sh - 20; yy += 24) for (let xx = sx + 8; xx < sx + sw2 - 10; xx += 9) if (srnd() < 0.6) { x.fillStyle = ["#b0412e", "#2e6bb0", "#d9b23a", "#3d8a52", "#7a4ab0"][Math.floor(srnd() * 5)]; x.fillRect(xx, yy + 4, 6, 10); }
      if (srnd() < 0.7) { const fx = sx + 20 + srnd() * (sw2 - 50); x.fillStyle = "rgba(20,14,24,0.85)"; x.beginPath(); x.arc(fx, sy + sh - 58, 9, 0, 6.28); x.fill(); x.fillRect(fx - 11, sy + sh - 48, 22, 48); }
      x.fillStyle = "rgba(255,255,255,0.14)"; x.beginPath(); x.moveTo(sx + sw2 * 0.55, sy); x.lineTo(sx + sw2 * 0.7, sy); x.lineTo(sx + sw2 * 0.4, sy + sh); x.lineTo(sx + sw2 * 0.25, sy + sh); x.fill();
      x.fillStyle = "#3b2a1a"; x.fillRect(bx + bw - 46, h - ground + 46, 28, ground - 46);
      for (let s = 0; s < bw - 16; s += 22) { x.fillStyle = s % 44 ? "#e8e1d0" : col; x.fillRect(bx + 8 + s, h - ground + 22, 22, 18); }
      x.save(); x.shadowColor = col; x.shadowBlur = 18; x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 3;
      let fs = 30; x.font = `${fs}px Bungee, "Arial Black", sans-serif`;
      while (x.measureText(name).width > bw - 40 && fs > 16) { fs -= 2; x.font = `${fs}px Bungee, "Arial Black", sans-serif`; }
      x.textAlign = "center"; x.fillText(name, bx + bw / 2, h - ground + 8); x.restore();
      bx += bw; n++;
    }
    x.fillStyle = "#0a0b14"; x.fillRect(0, h - 6, w, 6);
  });
  const roadTex = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = "#14151c"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${srnd() * 0.05})`; x.fillRect(srnd() * w, srnd() * h, 2, 2); }
    x.fillStyle = "#d9b23a"; for (let i = 0; i < w; i += 128) x.fillRect(i + 16, h / 2 - 3, 72, 6);
  });
  roadTex.wrapS = THREE.RepeatWrapping;
  const walkTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = "#3a3d4a"; x.fillRect(0, 0, w, h); x.strokeStyle = "#2a2c36"; x.lineWidth = 4;
    for (let i = 0; i <= w; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  });
  walkTex.wrapS = walkTex.wrapT = THREE.RepeatWrapping;
  const poolTex = canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,214,140,0.55)"); g.addColorStop(1, "rgba(255,214,140,0)");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  const beamTex = canvasTex(128, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "rgba(255,248,210,0.5)"); g.addColorStop(1, "rgba(255,248,210,0)");
    x.fillStyle = g; x.beginPath(); x.moveTo(0, h * 0.42); x.lineTo(w, 0); x.lineTo(w, h); x.lineTo(0, h * 0.58); x.fill();
  });
  const OUT = {
    facade: new THREE.MeshBasicMaterial({ map: facadeTex, fog: false }),
    road: new THREE.MeshBasicMaterial({ map: roadTex, fog: false }),
    walk: new THREE.MeshBasicMaterial({ map: walkTex, fog: false }),
    curb: new THREE.MeshBasicMaterial({ color: "#5a5d6a", fog: false }),
    post: new THREE.MeshBasicMaterial({ color: "#23252e", fog: false }),
    lamp: new THREE.MeshBasicMaterial({ color: "#ffe6a8", fog: false }),
    pool: new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    beam: new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }),
    glass: new THREE.MeshBasicMaterial({ color: "#a8c8ff", transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
    head: new THREE.MeshBasicMaterial({ color: "#fff6d0", fog: false }),
    tail: new THREE.MeshBasicMaterial({ color: "#ff2a2a", fog: false }),
    carWin: new THREE.MeshBasicMaterial({ color: "#0a0d18", fog: false }),
  };
  const CAR_COLS = ["#7a1f2b", "#1f3f7a", "#d8d2c4", "#2f5a3a", "#c9a227", "#3a3d46"].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
  function makeCar() {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.8), CAR_COLS[0]);
    body.position.y = 0.55; const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.6), OUT.carWin); cab.position.set(-0.2, 1.17, 0);
    g.add(body, cab);
    for (const z of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), OUT.head); hl.position.set(2.11, 0.6, z); hl.rotation.y = Math.PI / 2; g.add(hl);
      const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), OUT.tail); tl.position.set(-2.11, 0.62, z); tl.rotation.y = -Math.PI / 2; g.add(tl);
    }
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), OUT.beam); beam.rotation.x = -Math.PI / 2; beam.position.set(5.6, 0.02, 0); g.add(beam);
    g.userData = { body, geos: [body.geometry, cab.geometry, beam.geometry, ...g.children.filter((c) => c.geometry.type === "PlaneGeometry").map((c) => c.geometry)] };
    return g;
  }
  // Builds the front wall (kick plate, glass, door, header), the window lettering and neon, and the street.
  function storefront(group, mg, own, halfW, zFront) {
    const dX = -halfW + 2, dW = 1.2, gTop = 2.5, gBot = 0.5, FL = Math.PI;
    const spans = [[-halfW, dX - dW / 2], [dX + dW / 2, halfW]];
    for (const [a, b] of spans) {
      const w = b - a, cx = (a + b) / 2;
      mg.plane(M.wall, w, gBot, cx, gBot / 2, zFront, FL);
      const glass = new THREE.Mesh(own(new THREE.PlaneGeometry(w - 0.6, gTop - gBot)), OUT.glass);
      glass.position.set(cx, (gTop + gBot) / 2, zFront); group.add(glass);
      for (const e of [a + 0.15, b - 0.15]) mg.box(M.wall, 0.3, gTop - gBot, 0.12, e, (gTop + gBot) / 2, zFront - 0.06);
      const n = Math.max(1, Math.round((w - 0.6) / 2.4));
      for (let i = 1; i < n; i++) mg.box(M.pole, 0.06, gTop - gBot, 0.08, a + 0.3 + (i * (w - 0.6)) / n, (gTop + gBot) / 2, zFront - 0.04);
      mg.box(M.pole, w - 0.6, 0.06, 0.1, cx, gBot + 0.03, zFront - 0.05); mg.box(M.pole, w - 0.6, 0.06, 0.1, cx, gTop - 0.03, zFront - 0.05);
    }
    mg.plane(M.wall, halfW * 2, CEIL - gTop, 0, (CEIL + gTop) / 2, zFront, FL);
    // the glass door under the EXIT sign
    mg.plane(M.wall, dW, gTop - 2.2, dX, 2.35, zFront - 0.001, FL);
    const door = new THREE.Mesh(own(new THREE.PlaneGeometry(dW - 0.1, 2.18)), OUT.glass); door.position.set(dX, 1.09, zFront); group.add(door);
    for (const e of [-1, 1]) mg.box(M.pole, 0.06, 2.2, 0.1, dX + e * (dW / 2 - 0.03), 1.1, zFront - 0.05);
    mg.box(M.pole, dW, 0.06, 0.1, dX, 2.2, zFront - 0.05); mg.box(M.pole, 0.5, 0.04, 0.05, dX, 1.05, zFront - 0.09);
    // lettering painted on the glass, the right way round from the street (so mirrored from inside)
    const spanR = spans[1], letW = Math.min(4, spanR[1] - spanR[0] - 3);
    const letTx = own(canvasTex(1024, 300, (x, w, h) => {
      x.translate(w, 0); x.scale(-1, 1); x.textAlign = "center"; x.fillStyle = YELLOW;
      x.font = `92px Bungee, "Arial Black", sans-serif`; x.fillText("WALL OF PS PLUS", w / 2, 120);
      x.font = `600 46px Archivo, system-ui, sans-serif`; x.fillStyle = "#fff"; x.fillText("Rentals · Recommendations · Open late", w / 2, 210);
    }));
    const letters = new THREE.Mesh(own(new THREE.PlaneGeometry(letW, letW * 0.29)), own(new THREE.MeshBasicMaterial({ map: letTx, transparent: true, depthWrite: false })));
    letters.position.set((spanR[0] + spanR[1]) / 2, 1.95, zFront - 0.015); letters.rotation.y = FL; group.add(letters);
    const neonTx = own(canvasTex(512, 200, (x, w, h) => {
      x.translate(w, 0); x.scale(-1, 1); x.strokeStyle = "#ff3355"; x.lineWidth = 8; x.shadowColor = "#ff3355"; x.shadowBlur = 26;
      x.beginPath(); x.roundRect(20, 20, w - 40, h - 40, 40); x.stroke();
      x.fillStyle = "#ff6b80"; x.font = `110px Bungee, "Arial Black", sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("OPEN", w / 2, h / 2 + 6);
    }));
    const neonMat = own(new THREE.MeshBasicMaterial({ map: neonTx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const neon = new THREE.Mesh(own(new THREE.PlaneGeometry(1.0, 0.39)), neonMat);
    neon.position.set(spanR[1] - 1.3, 1.0, zFront - 0.03); neon.rotation.y = FL; group.add(neon);

    // the street: our sidewalk, the curb, the road, the far sidewalk and the shops opposite
    const W = Math.max(48, halfW * 2 + 24), zW = zFront + 3.4, zR = zW + 7.5, zF = zR + 2.6;
    const street = new THREE.Group();
    const flat = (mat, w, d, y, z, rx, ry) => { const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, d)), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, y, z); street.add(m); return m; };
    const wt = own(walkTex.clone()); wt.repeat.set(W / 1.6, 3.4 / 1.6); wt.needsUpdate = true; const walkMat = own(new THREE.MeshBasicMaterial({ map: wt, fog: false }));
    const roadMat = own(new THREE.MeshBasicMaterial({ map: (() => { const t = own(roadTex.clone()); t.repeat.set(W / 8, 1); t.needsUpdate = true; return t; })(), fog: false }));
    flat(walkMat, W, zW - zFront, -0.01, (zFront + zW) / 2);
    flat(walkMat, W, zF - zR, -0.01, (zR + zF) / 2);
    flat(roadMat, W, zR - zW, -0.14, (zW + zR) / 2);
    for (const z of [zW, zR]) { const c = new THREE.Mesh(own(new THREE.BoxGeometry(W, 0.14, 0.18)), OUT.curb); c.position.set(0, -0.07, z); street.add(c); }
    const fac = new THREE.Mesh(own(new THREE.PlaneGeometry(48, 18)), OUT.facade); fac.scale.x = W / 48; fac.position.set(0, 9 - 0.02, zF); fac.rotation.y = Math.PI; street.add(fac);
    // the sky above the rooftops and the ends of the street, so nothing shows the void
    const skyMat = own(new THREE.MeshBasicMaterial({ color: "#060818", fog: false, side: THREE.DoubleSide }));
    for (const s of [-1, 1]) { const m = new THREE.Mesh(own(new THREE.PlaneGeometry(zF - zFront, 18)), skyMat); m.position.set(s * W / 2, 9, (zFront + zF) / 2); m.rotation.y = Math.PI / 2; street.add(m); }
    const lamps = [];
    for (let lx = -W / 2 + 4; lx < W / 2; lx += 9) {
      const post = new THREE.Mesh(own(new THREE.BoxGeometry(0.12, 4.2, 0.12)), OUT.post); post.position.set(lx, 2.1, zW - 0.4);
      const arm = new THREE.Mesh(own(new THREE.BoxGeometry(0.08, 0.08, 1.1)), OUT.post); arm.position.set(lx, 4.15, zW + 0.1);
      const head = new THREE.Mesh(own(new THREE.BoxGeometry(0.5, 0.12, 0.3)), OUT.lamp); head.position.set(lx, 4.08, zW + 0.6);
      const pool = flat(OUT.pool, 5.5, 5.5, 0.0, zW + 0.4); pool.position.x = lx;
      street.add(post, arm, head); lamps.push({ head, pool });
    }
    group.add(street);
    const cars = [0, 1].map((lane) => {
      const c = makeCar(); c.userData.geos.forEach(own);
      const z = lane ? zW + 5.4 : zW + 2.0, dir = lane ? -1 : 1;
      c.position.set(-dir * (W / 2 + 6), -0.14, z); c.rotation.y = dir > 0 ? 0 : Math.PI;
      c.visible = false; street.add(c);
      return { c, dir, wait: 2 + lane * 5 + Math.random() * 4, speed: 0, W };
    });
    return { cars, lamps, neon, neonMat, W, dim: [walkMat, roadMat, OUT.facade, OUT.curb] };
  }
  // Cars pass now and then. After hours the streetlights stutter and the OPEN sign gives up.
  function tickStreet(dt, now) {
    const st = S.street;
    for (const car of st.cars) {
      if (!car.c.visible) { car.wait -= dt; if (car.wait <= 0) { car.c.visible = true; car.heard = false; car.speed = 7 + Math.random() * 5; car.c.userData.body.material = CAR_COLS[Math.floor(Math.random() * CAR_COLS.length)]; car.c.position.x = -car.dir * (car.W / 2 + 6); } continue; }
      car.c.position.x += car.dir * car.speed * dt;
      const ahead = car.dir * (P.x - car.c.position.x);
      if (!car.heard && ahead > 0 && ahead < 11) { car.heard = true; carBy(P.x, car.c.position.z, car.dir); }
      if (Math.abs(car.c.position.x) > car.W / 2 + 6) { car.c.visible = false; car.wait = 4 + Math.random() * 10; }
    }
    if (night.on && !CALM) {
      if (frame % 9 === 0) st.lamps.forEach((l, i) => { const on = Math.random() > (i % 3 ? 0.08 : 0.4); l.head.visible = l.pool.visible = on; });
      if (frame % 5 === 0) st.neon.visible = Math.random() > 0.55;
    }
  }
  function streetNight(on) {
    if (!S || !S.street) return;
    S.street.dim.forEach((m) => m.color.set(on ? (m === OUT.facade ? "#7a5560" : "#5a3a44") : (m === OUT.curb ? "#5a5d6a" : "#ffffff")));
    S.street.lamps.forEach((l) => (l.head.visible = l.pool.visible = true));
    S.street.neon.visible = true; S.street.neonMat.color.set(on ? "#ff2a2a" : "#ffffff");
  }

  // ---------- decoration: posters, neon, a popcorn machine, the returns box and a stack of baskets ----------
  const POSTERS = [
    { bg: "#d7263d", fg: "#fff", big: "BE KIND", small: "Please rewind", icon: "tape" },
    { bg: YELLOW, fg: INK, big: "NEW RELEASES", small: "Every Tuesday", icon: "star" },
    { bg: BLUE, fg: "#fff", big: "LATE FEES?", small: "We don't talk about late fees", icon: "clock" },
    { bg: "#1d6b3a", fg: "#fff", big: "FREE POPCORN", small: "For members, while it lasts", icon: "pop" },
    { bg: "#141a33", fg: YELLOW, big: "NO SLEEPING", small: "In the aisles. Especially after closing.", icon: "moon" },
    { bg: "#7a3cff", fg: "#fff", big: "STAFF PICK", small: "Ask at the counter", icon: "cover" },
  ];
  function posterTex(pz, coverImg) {
    return canvasTex(256, 368, (x, w, h) => {
      x.fillStyle = pz.bg; x.fillRect(0, 0, w, h);
      x.strokeStyle = pz.fg; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20);
      x.fillStyle = pz.fg; x.textAlign = "center";
      let fs = 40; x.font = `${fs}px Bungee, "Arial Black", sans-serif`;
      while (x.measureText(pz.big).width > w - 40 && fs > 18) { fs -= 2; x.font = `${fs}px Bungee, "Arial Black", sans-serif`; }
      x.fillText(pz.big, w / 2, 70);
      const cy = 190;
      if (pz.icon === "tape") { x.fillRect(48, cy - 46, 160, 92); x.fillStyle = pz.bg; x.beginPath(); x.arc(96, cy, 22, 0, 6.28); x.arc(160, cy, 22, 0, 6.28); x.fill(); x.fillRect(96, cy - 8, 64, 16); }
      else if (pz.icon === "star") { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 30 : 70, a = -Math.PI / 2 + (i * Math.PI) / 5; x.lineTo(w / 2 + Math.cos(a) * r, cy + Math.sin(a) * r); } x.fill(); }
      else if (pz.icon === "clock") { x.lineWidth = 10; x.beginPath(); x.arc(w / 2, cy, 60, 0, 6.28); x.stroke(); x.beginPath(); x.moveTo(w / 2, cy); x.lineTo(w / 2, cy - 42); x.moveTo(w / 2, cy); x.lineTo(w / 2 + 30, cy + 10); x.stroke(); }
      else if (pz.icon === "pop") { x.fillStyle = "#fff"; x.beginPath(); x.moveTo(84, cy - 30); x.lineTo(172, cy - 30); x.lineTo(160, cy + 64); x.lineTo(96, cy + 64); x.fill(); x.fillStyle = "#d7263d"; for (let i = 0; i < 4; i++) x.fillRect(92 + i * 20, cy - 30, 9, 94); x.fillStyle = "#fff3c4"; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(92 + (i % 5) * 18, cy - 38 - Math.floor(i / 5) * 14, 13, 0, 6.28); x.fill(); } }
      else if (pz.icon === "moon") { x.beginPath(); x.arc(w / 2, cy, 58, 0, 6.28); x.fill(); x.fillStyle = pz.bg; x.beginPath(); x.arc(w / 2 + 26, cy - 16, 52, 0, 6.28); x.fill(); x.fillStyle = pz.fg; x.font = "28px Bungee, sans-serif"; x.fillText("Z z z", w / 2 + 36, cy + 44); }
      else if (pz.icon === "cover" && coverImg) { x.drawImage(coverImg, w / 2 - 66, cy - 88, 132, 176); x.strokeRect(w / 2 - 66, cy - 88, 132, 176); }
      x.fillStyle = pz.fg; x.font = "600 21px Archivo, system-ui, sans-serif"; wrap(x, pz.small, w / 2, 316, w - 44, 24, 2);
    });
  }
  function neonTex(text, col, w = 512, h = 160) {
    return canvasTex(w, h, (x) => {
      x.shadowColor = col; x.shadowBlur = 24; x.strokeStyle = col; x.lineWidth = 5; x.font = `${Math.floor(h * 0.55)}px Bungee, "Arial Black", sans-serif`;
      x.textAlign = "center"; x.textBaseline = "middle"; x.strokeText(text, w / 2, h / 2 + 4); x.fillStyle = "#fff"; x.globalAlpha = 0.55; x.fillText(text, w / 2, h / 2 + 4);
    });
  }
  const DM = {
    red: new THREE.MeshStandardMaterial({ color: "#c81e2e", roughness: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: "#c9ccd6", roughness: 0.25, metalness: 0.8 }),
    glassy: new THREE.MeshStandardMaterial({ color: "#ffe9a8", roughness: 0.2, transparent: true, opacity: 0.35, emissive: "#ffcc55", emissiveIntensity: 0.35 }),
    corn: new THREE.MeshStandardMaterial({ color: "#fff1b8", roughness: 0.9, emissive: "#ffcc55", emissiveIntensity: 0.25 }),
    drop: new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.6 }),
    slot: new THREE.MeshStandardMaterial({ color: "#0a0d18", roughness: 0.9 }),
    basket: new THREE.MeshStandardMaterial({ color: "#d7263d", roughness: 0.55 }),
    bell: new THREE.MeshStandardMaterial({ color: "#e4c46a", roughness: 0.25, metalness: 0.35, emissive: "#3a2a00", emissiveIntensity: 0.4 }),
  };
  function decorate(group, mg, own, obstacles, halfW, zBack, zFront, cx, cz) {
    const flatOn = (tex, w, h, x, y, z, ry, extra = {}) => {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, ...extra })));
      m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m;
    };
    // posters down both side walls, between the shelves and the front
    const spots = [[-1, zBack + 3], [1, zBack + 3], [-1, 0], [1, 0], [-1, zFront - 6.5], [1, zFront - 6.5]];
    const best = GAMES.filter((g) => g.m >= 90 && BOX.has(g.id)); const pickG = best[Math.floor(Math.random() * best.length)];
    spots.forEach(([side, z], i) => {
      const pz = POSTERS[i % POSTERS.length];
      const tex = own(posterTex(pz, null));
      flatOn(tex, 0.8, 1.15, side * (halfW - 0.01), 1.65, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (pz.icon === "cover" && pickG) { const img = new Image(); img.onload = () => { const t2 = posterTex(pz, img); tex.image = t2.image; tex.needsUpdate = true; t2.dispose(); }; img.src = coverURL(pickG); }
    });
    // neon over the back wall's staff doors and down the left wall by the door
    const nAdd = (text, col, w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), own(new THREE.MeshBasicMaterial({ map: own(neonTex(text, col)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m;
    };
    const neons = [nAdd("GAMES", "#ff4fd8", 1.5, 0.47, -halfW + 4.6, 2.55, zBack + 0.02, 0), nAdd("RENTALS", "#4fd8ff", 1.6, 0.5, halfW - 4.6, 2.55, zBack + 0.02, 0),
      nAdd("PLAY ON", "#ffcf3a", 1.4, 0.44, -halfW + 0.02, 2.45, zFront - 3.4, Math.PI / 2)];
    // the returns box by the door
    const rx = -halfW + 3.5, rz = zFront - 0.55;
    mg.box(DM.drop, 0.7, 1.05, 0.5, rx, 0.525, rz); mg.box(DM.drop, 0.74, 0.08, 0.54, rx, 1.09, rz);
    mg.box(DM.slot, 0.42, 0.06, 0.02, rx, 0.88, rz - 0.255);
    flatOn(own(sign("RETURNS", null, 512, 160)), 0.6, 0.19, rx, 0.68, rz - 0.256, Math.PI);
    obstacles.push({ x0: rx - 0.4, x1: rx + 0.4, z0: rz - 0.3, z1: rz + 0.3 });
    // a stack of baskets just inside the door
    const bx = -halfW + 0.55, bz = zFront - 1.6;
    for (let i = 0; i < 5; i++) {
      const y = 0.04 + i * 0.075;
      mg.box(DM.basket, 0.5, 0.03, 0.36, bx, y, bz);
      for (const s of [-1, 1]) { mg.box(DM.basket, 0.5, 0.2, 0.02, bx, y + 0.1, bz + s * 0.17); mg.box(DM.basket, 0.02, 0.2, 0.36, bx + s * 0.24, y + 0.1, bz); }
    }
    mg.box(DM.chrome, 0.03, 0.03, 0.4, bx, 0.6, bz);
    obstacles.push({ x0: bx - 0.3, x1: bx + 0.3, z0: bz - 0.24, z1: bz + 0.24 });
    return { neons };
  }

  // ---------- the shop (rebuilt when the stock changes) ----------
  let S = null;   // the current shop: group, boxes, obstacles, grid, tvs...
  const loader = new THREE.TextureLoader();
  const coverURL = (g) => BOX.has(g.id) ? `../box/${encodeURIComponent(g.id)}.webp` : ART.has(g.id) ? `../art/${encodeURIComponent(g.id)}.webp` : "";
  // The full-size cover, for the box in your hand.
  function coverTex(g, th, ready) {
    const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const url = coverURL(g);
    if (url) loader.load(url, (tx) => { t.image = tx.image; fit(t, th, !BOX.has(g.id)); t.needsUpdate = true; if (ready) ready(); });
    return t;
  }
  // Every cover also sits on a shared sheet (store/thumbs/), 64 to a sheet, so a whole shelf fills in from one
  // small download. Each box's front face points at its own cell on the sheet; the sharper single covers that
  // load up close are mapped back to the full face with fit().
  const TH = new Map(), sheetMats = [], NOTH = { sheet: -1, ox: 0, oy: 0, sx: 1, sy: 1 };
  if (THUMBS && THUMBS.ids) THUMBS.ids.forEach((id, i) => {
    const per = THUMBS.cols * THUMBS.rows, k = i % per, c = k % THUMBS.cols, r = Math.floor(k / THUMBS.cols), e = 0.02;
    TH.set(id, { sheet: Math.floor(i / per), ox: (c + e) / THUMBS.cols, oy: 1 - (r + 1 - e) / THUMBS.rows, sx: (1 - 2 * e) / THUMBS.cols, sy: (1 - 2 * e) / THUMBS.rows });
  });
  function fit(t, th, sq) {
    th = th || NOTH; const rx = sq ? 0.75 : 1, bx = sq ? 0.125 : 0;
    t.repeat.set(rx / th.sx, 1 / th.sy); t.offset.set(bx - (rx * th.ox) / th.sx, -th.oy / th.sy);
  }
  const sheetState = [];   // undefined: not asked for, 1: loading, 2: ready
  function loadSheets(order) {
    for (const n of order) {
      if (sheetState[n]) continue; sheetState[n] = 1;
      loader.load(`thumbs/${n}.webp?v=${THUMBS.ids.length}`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        sheetMats[n] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.32 }); sheetState[n] = 2;
        if (S) for (const b of S.boxes) if (b.userData.th.sheet === n && !b.userData.loaded) b.material[4] = sheetMats[n];
      }, undefined, () => { sheetState[n] = 0; });
    }
  }
  const faceMat = (b) => sheetMats[b.userData.th.sheet] || M.blank;
  // A small cover for the shelf: the image is drawn down to 132x176 as it arrives, so each one takes about
  // a sixth of the graphics memory of the full image. Square art is cropped to the box shape here.
  function smallTex(g) {
    const c = document.createElement("canvas"); c.width = 132; c.height = 176;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
    const url = coverURL(g); if (!url) return t;
    const img = new Image(); img.decoding = "async";
    img.onload = () => {
      if (t.userData.gone) return;
      const x = c.getContext("2d"), sq = !BOX.has(g.id), sw = sq ? img.width * 0.75 : img.width;
      x.drawImage(img, sq ? img.width * 0.125 : 0, 0, sw, img.height, 0, 0, 132, 176);
      t.needsUpdate = true; t.userData.ok = true; if (t.userData.ready) t.userData.ready();
    };
    img.src = url;
    return t;
  }
  function build(kind) {
    if (S) { scene.remove(S.group); S.dispose.forEach((d) => d.dispose()); S.boxes.forEach((b) => { setCover(b, false); b.userData.backMat.map && b.userData.backMat.map.dispose(); b.userData.backMat.dispose(); }); loaded = 0; }
    const games = kind === "wall" && fromWall ? fromWall.ids.map((id) => BYID.get(id)).filter(Boolean) : GAMES;
    const { list, starts } = shelve(games, kind === "wall");
    const G = Math.max(4, Math.ceil(list.length / (PER_FACE * 2))), C = Math.ceil(G / 2);
    const halfW = ((C - 1) / 2) * PX + GD / 2 + 2.2;
    const zBack = -ROWZ - GL / 2 - 2.4, zFront = ROWZ + GL / 2 + 5.5;
    const group = new THREE.Group(), dispose = [], mg = new Merger(), boxes = [], obstacles = [], tvs = [], faces = [];
    const own = (o) => { dispose.push(o); return o; };
    // floor, ceiling, walls
    const ft = own(carpetTex.clone()); ft.repeat.set((halfW * 2) / 1.8, (zFront - zBack) / 1.8); ft.needsUpdate = true;
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(halfW * 2, zFront - zBack)), own(new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 })));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (zBack + zFront) / 2); group.add(floor);
    mg.plane(M.ceil, halfW * 2, zFront - zBack, 0, CEIL, (zBack + zFront) / 2, 0, Math.PI / 2);
    mg.plane(M.wall, halfW * 2, CEIL, 0, CEIL / 2, zBack, 0);
    const street = storefront(group, mg, own, halfW, zFront);
    mg.plane(M.wall, zFront - zBack, CEIL, -halfW, CEIL / 2, (zBack + zFront) / 2, Math.PI / 2); mg.plane(M.wall, zFront - zBack, CEIL, halfW, CEIL / 2, (zBack + zFront) / 2, -Math.PI / 2);
    // light strips over every aisle
    for (let i = 0; i <= C; i++) { const x = (i - C / 2) * PX; for (let z = zBack + 1.5; z < zFront - 1; z += 1.6) mg.box(M.strip, 0.14, 0.03, 1.0, x, CEIL - 0.02, z); }
    // gondolas: row 0 at the front, row 1 at the back
    const gx = (i) => (i - (C - 1) / 2) * PX;
    let k = 0;
    for (let row = 0; row < 2; row++) for (let i = 0; i < C; i++) {
      const x = gx(i), z = row === 0 ? ROWZ : -ROWZ;
      mg.box(M.wood, 0.06, 2.2, GL, x, 1.1, z);
      // end panels a touch wider than the shelves, and the yellow lips just proud of the shelf edge, so no two
      // surfaces share a plane (coplanar faces flicker against each other as you move)
      for (const end of [-1, 1]) mg.box(M.wood, GD + 0.03, 2.2, 0.06, x, 1.1, z + end * (GL / 2 + 0.03));
      for (const y of [0.06, ...SHELF_Y.map((v) => v - 0.01)]) { mg.box(M.wood, GD - 0.004, 0.04, GL, x, y, z); for (const s of [-1, 1]) mg.box(M.edge, 0.024, 0.06, GL - 0.01, x + s * (GD / 2 + 0.01), y + 0.008, z); }
      obstacles.push({ x0: x - GD / 2, x1: x + GD / 2, z0: z - GL / 2, z1: z + GL / 2 });
      for (const s of [-1, 1]) {
        const items = list.slice(k * PER_FACE, (k + 1) * PER_FACE), first = k * PER_FACE; k++;
        const names = [...new Set(items.map((it) => it.sec))];
        faces.push({ x: x + s * 1.3, z, names, first, s });
        if (names.length) {
          const tx = own(sign(names.join(" / ").toUpperCase(), null, 1024, 200));
          const m = new THREE.Mesh(own(new THREE.PlaneGeometry(2.6, 0.5)), own(new THREE.MeshBasicMaterial({ map: tx })));
          m.position.set(x + s * (GD / 2 + 0.005), 2.42, z); m.rotation.y = s * Math.PI / 2; group.add(m);
        }
        items.forEach((it, j) => {
          const r = Math.floor(j / COLS), c = j % COLS;
          const backMat = new THREE.MeshStandardMaterial({ color: "#e9ecf5", roughness: 0.6 });
          const th = TH.get(it.g.id) || NOTH;
          let geo = M.boxGeo;
          if (th.sheet >= 0) {   // point the front face (vertices 16-19) at this game's cell on its sheet
            geo = own(M.boxGeo.clone()); const uv = geo.attributes.uv;
            for (let v = 16; v < 20; v++) uv.setXY(v, th.ox + uv.getX(v) * th.sx, th.oy + uv.getY(v) * th.sy);
          }
          const b = new THREE.Mesh(geo, [M.plastic, M.plastic, M.plastic, M.plastic, sheetMats[th.sheet] || M.blank, backMat]);
          // read left to right as you face the shelf
          const along = (c - (COLS - 1) / 2) * SP * (s > 0 ? -1 : 1);
          b.position.set(x + s * 0.2, SHELF_Y[ROWS - 1 - r] + BH / 2 + 0.012, z + along);
          b.rotation.set(0, s * Math.PI / 2, 0, "YXZ"); b.rotateX(-0.1);
          b.userData = { g: it.g, th, home: { p: b.position.clone(), q: b.quaternion.clone() }, backMat, loaded: false };
          group.add(b); boxes.push(b);
        });
      }
      // end caps say what's in the aisles on each side
      for (const end of [-1, 1]) {
        const lf = faces[faces.length - 2].names, rt = faces[faces.length - 1].names;
        const txt = [...new Set([...lf, ...rt])].slice(0, 3).join(" · ") || "Empty";
        const tx = own(sign(txt.toUpperCase(), null, 1024, 180));
        const m = new THREE.Mesh(own(new THREE.PlaneGeometry(GD + 0.3, 0.2)), own(new THREE.MeshBasicMaterial({ map: tx })));
        m.position.set(x, 2.3, z + end * (GL / 2 + 0.075)); m.rotation.y = end > 0 ? 0 : Math.PI; group.add(m);
      }
    }
    // TVs hang from the ceiling over the cross aisle and the front of the shop, two screens back to back
    const tvSpots = [];
    for (let i = 0; i <= C; i++) tvSpots.push([(i - C / 2) * PX, 0]);
    for (let i = 0; i < C; i += 2) tvSpots.push([gx(i) + PX / 2, ROWZ + GL / 2 + 2.2]);
    for (const [x, z] of tvSpots) {
      mg.box(M.pole, 0.04, CEIL - TVY - 0.25, 0.04, x, (CEIL + TVY + 0.25) / 2, z);
      mg.box(M.tv, 0.74, 0.58, 0.6, x, TVY, z);
      for (const f of [-1, 1]) {
        const scr = new THREE.Mesh(own(new THREE.PlaneGeometry(TVW, TVH)), tvMat);
        scr.position.set(x, TVY, z + f * 0.305); scr.rotation.y = f > 0 ? 0 : Math.PI; group.add(scr);
        tvs.push({ scr, x, z, f });
      }
    }
    // the counter by the door. Behind it, where you start: a service bell, a popcorn machine on the counter
    // and the red button that puts the lights out.
    const cx = halfW - 2.0, cz = zFront - 3.2;
    mg.box(M.counter, 2.6, 1.0, 0.7, cx - 0.4, 0.5, cz); mg.box(M.edge, 2.64, 0.04, 0.74, cx - 0.4, 1.021, cz);
    mg.box(M.counter, 0.7, 0.98, 1.6, cx + 1.25, 0.49, cz + 0.45); mg.box(M.edge, 0.74, 0.04, 1.64, cx + 1.25, 1.0, cz + 0.45);
    mg.box(M.tv, 0.36, 0.24, 0.3, cx + 1.25, 1.12, cz + 0.75);
    obstacles.push({ x0: cx - 1.7, x1: cx + 0.9, z0: cz - 0.35, z1: cz + 0.35 }, { x0: cx + 0.9, x1: cx + 1.6, z0: cz - 0.35, z1: cz + 1.25 });
    const hitBox = (w, h, d, x, y, z) => { const m = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d))); m.visible = false; m.position.set(x, y, z); group.add(m); return m; };
    // popcorn machine
    const ppx = cx - 1.1, ppz = cz, top = 1.04;
    mg.box(DM.red, 0.5, 0.12, 0.4, ppx, top + 0.06, ppz); mg.box(DM.glassy, 0.48, 0.46, 0.38, ppx, top + 0.35, ppz); mg.box(DM.red, 0.52, 0.12, 0.42, ppx, top + 0.64, ppz);
    mg.box(DM.corn, 0.44, 0.06, 0.34, ppx, top + 0.15, ppz);
    for (let i = 0; i < 70; i++) mg.box(DM.corn, 0.028, 0.028, 0.028, ppx + rnd(-0.2, 0.2), top + 0.2 + rnd(0, 0.08), ppz + rnd(-0.15, 0.15), rnd(0, 1.5));
    for (const sx of [-0.25, 0.25]) for (const sz of [-0.19, 0.19]) mg.box(DM.chrome, 0.025, 0.46, 0.025, ppx + sx, top + 0.35, ppz + sz);
    const popSign = own(sign("POPCORN", null, 512, 128, "#c81e2e"));
    for (const f of [1, -1]) { const m = new THREE.Mesh(own(new THREE.PlaneGeometry(0.5, 0.12)), own(new THREE.MeshBasicMaterial({ map: popSign }))); m.position.set(ppx, top + 0.64, ppz + f * 0.215); m.rotation.y = f > 0 ? 0 : Math.PI; group.add(m); }
    const popHit = hitBox(0.6, 0.8, 0.5, ppx, top + 0.38, ppz);
    // service bell
    const bell = new THREE.Group(); bell.position.set(cx - 0.4, top, cz + 0.1);
    const bellBase = new THREE.Mesh(own(new THREE.CylinderGeometry(0.075, 0.08, 0.025, 20)), M.plastic); bellBase.position.y = 0.0125;
    const dome = new THREE.Mesh(own(new THREE.SphereGeometry(0.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), DM.bell); dome.position.y = 0.025;
    const knob = new THREE.Mesh(own(new THREE.CylinderGeometry(0.008, 0.008, 0.025, 8)), DM.chrome); knob.position.y = 0.095;
    bell.add(bellBase, dome, knob); group.add(bell);
    const bellCard = own(canvasTex(256, 96, (x, w, h) => { x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.fillStyle = INK; x.textAlign = "center"; x.font = "26px Bungee, sans-serif"; x.fillText("RING FOR", w / 2, 40); x.fillText("SERVICE", w / 2, 78); }));
    const bc = new THREE.Mesh(own(new THREE.PlaneGeometry(0.16, 0.06)), own(new THREE.MeshStandardMaterial({ map: bellCard }))); bc.position.set(cx - 0.4, top + 0.035, cz + 0.27); bc.rotation.x = -Math.PI / 2 + 0.5; group.add(bc);
    const bellHit = hitBox(0.3, 0.25, 0.3, cx - 0.4, top + 0.1, cz + 0.12);
    // the red button: a striped plinth on the end of the counter
    const stripes = own(canvasTex(256, 256, (x, w, h) => { x.fillStyle = YELLOW; x.fillRect(0, 0, w, h); x.fillStyle = "#111"; for (let i = -h; i < w; i += 64) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 32, h); x.lineTo(i + 32 + h, 0); x.lineTo(i + h, 0); x.fill(); } }));
    const stripeMat = own(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }));
    const bx2 = cx + 0.35, bz2 = cz + 0.05;
    const plinth = new THREE.Mesh(own(new THREE.BoxGeometry(0.42, 0.16, 0.42)), stripeMat); plinth.position.set(bx2, top + 0.08, bz2); group.add(plinth);
    const ring = new THREE.Mesh(own(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24)), M.plastic); ring.position.set(bx2, top + 0.175, bz2); group.add(ring);
    const btnMat = own(new THREE.MeshStandardMaterial({ color: "#e0111f", roughness: 0.3, emissive: "#ff0010", emissiveIntensity: 0.25 }));
    const lever = new THREE.Mesh(own(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), btnMat); lever.scale.y = 0.6; lever.position.set(bx2, top + 0.19, bz2); lever.userData.y0 = lever.position.y; group.add(lever);
    const warnTx = own(canvasTex(512, 200, (x, w, h) => {
      x.fillStyle = "#111"; x.fillRect(0, 0, w, h); x.drawImage(stripes.image, 0, 0, w, 28); x.drawImage(stripes.image, 0, h - 28, w, 28);
      x.fillStyle = YELLOW; x.textAlign = "center"; x.font = "62px Bungee, sans-serif"; x.fillText("DO NOT PRESS", w / 2, 100); x.fillStyle = "#fff"; x.font = "600 30px Archivo, sans-serif"; x.fillText("Lights out. Staff only.", w / 2, 150);
    }));
    const warn = new THREE.Mesh(own(new THREE.PlaneGeometry(0.5, 0.195)), own(new THREE.MeshStandardMaterial({ map: warnTx, emissive: "#ffffff", emissiveMap: warnTx, emissiveIntensity: 0.35 })));
    warn.position.set(bx2, top + 0.42, bz2 - 0.2); group.add(warn);
    mg.box(M.pole, 0.03, 0.3, 0.03, bx2, top + 0.17, bz2 - 0.21);
    const btnHit = hitBox(0.5, 0.6, 0.5, bx2, top + 0.25, bz2 - 0.05);
    const plate = btnHit, staff = warn;
    const doors = [-halfW + 2.4, halfW - 2.4].map((x) => { mg.box(M.door, 1.1, 2.1, 0.06, x, 1.05, zBack + 0.03); return { x, z: zBack + 0.6 }; });
    const doorTx = own(sign("STAFF ROOM", null, 512, 128, "#5a1d24"));
    for (const d of doors) { const m = new THREE.Mesh(own(new THREE.PlaneGeometry(0.9, 0.22)), own(new THREE.MeshBasicMaterial({ map: doorTx }))); m.position.set(d.x, 2.3, zBack + 0.07); group.add(m); }
    const deco = decorate(group, mg, own, obstacles, halfW, zBack, zFront, cx, cz);
    const shopTx = own(sign("WALL OF PS PLUS", "Rentals and recommendations"));
    const shop = new THREE.Mesh(own(new THREE.PlaneGeometry(3.4, 0.85)), own(new THREE.MeshBasicMaterial({ map: shopTx }))); shop.position.set(0, 2.3, zBack + 0.03); group.add(shop);
    const outTx = own(sign("EXIT", null, 256, 96, "#1d6b3a"));
    const out = new THREE.Mesh(own(new THREE.PlaneGeometry(0.5, 0.19)), own(new THREE.MeshBasicMaterial({ map: outTx }))); out.position.set(-halfW + 2, 2.4, zFront - 0.03); out.rotation.y = Math.PI; group.add(out);
    const before = group.children.length;
    mg.build(group); group.children.slice(before).forEach((c) => dispose.push(c.geometry));
    // a few warm lights, over the aisles
    const lights = [];
    for (const [x, z] of [[gx(0) - PX / 2, 0], [0, 0], [gx(C - 1) + PX / 2, 0], [0, ROWZ], [0, -ROWZ], [cx, cz]]) { const p = new THREE.PointLight("#fff4dc", 3, 9, 1.4); p.position.set(x, CEIL - 0.3, z); group.add(p); lights.push(p); }
    lights.forEach((p, i) => (p.visible = i < Q.lights));
    scene.add(group);

    // walkable grid for the zombies
    const cell = 0.5, gw = Math.ceil((halfW * 2) / cell), gh = Math.ceil((zFront - zBack) / cell);
    const blocked = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = -halfW + (i + 0.5) * cell, z = zBack + (j + 0.5) * cell;
      if (x < -halfW + 0.35 || x > halfW - 0.35 || z < zBack + 0.35 || z > zFront - 0.35 || obstacles.some((o) => x > o.x0 - 0.3 && x < o.x1 + 0.3 && z > o.z0 - 0.3 && z < o.z1 + 0.3)) blocked[j * gw + i] = 1;
    }
    S = { group, dispose, boxes, obstacles, tvs, faces, starts, list, halfW, zBack, zFront, lights, lever, switchObjs: [plate, lever, staff], doors,
      grid: { cell, gw, gh, blocked, dist: new Int32Array(gw * gh) }, counter: { x: cx, z: cz }, street, deco, popHit, bell, bellHit, btnMat, staffSpot: { x: cx - 0.3, z: cz + 2.2 } };
    $("secsel").innerHTML = `<option value="">Go to a section…</option>` + starts.map((s, i) => `<option value="${i}">${esc(s.name)} (${s.n})</option>`).join("");
    $("stocknote").textContent = kind === "wall" ? (fromWall.label ? `Stocked from your wall: ${fromWall.label}` : "Stocked from your wall's filters") : `Every game, ${GAMES.length} in all, shelved by genre`;
    document.querySelectorAll("[data-stock]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stock === kind)));
    P.x = cx - 0.3; P.z = cz + 2.2; P.yaw = 0; P.pitch = -0.2;   // start behind the counter, facing the shop
    camera.position.set(P.x, EYE, P.z);
    if (THUMBS && THUMBS.ids) {   // fetch the sheets nearest the door first
      const best = new Map();
      for (const b of boxes) { const n = b.userData.th.sheet; if (n < 0) continue; const d = Math.hypot(b.position.x - P.x, b.position.z - P.z); if (!best.has(n) || d < best.get(n)) best.set(n, d); }
      loadSheets([...best].sort((a, c) => a[1] - c[1]).map(([n]) => n));
    }
    loadNear();
    if (night.on) nightLights(true); else streetNight(false);
  }
  // Covers load as you walk up to them and are let go again as you walk away, with a cap on how many are
  // held at once, so a long walk round the shop doesn't fill the phone's graphics memory. Far boxes are
  // hidden (the fog hides them anyway).
  let loaded = 0;
  function setCover(b, on) {
    const u = b.userData;
    if (on === u.loaded) return;
    if (on) {
      // the sharper cover replaces the sheet cell only once it has arrived, so the shelf never blinks blank
      u.loaded = true; loaded++; u.small = smallTex(u.g); fit(u.small, u.th, false); b.material = b.material.slice();
      u.coverMat = new THREE.MeshStandardMaterial({ map: u.small, roughness: 0.32 });
      const mine = u.coverMat; u.small.userData.ready = () => { if (u.coverMat === mine && !u.full) b.material[4] = mine; };
    }
    else { u.loaded = false; loaded--; u.small.userData.gone = true; u.small.dispose(); u.coverMat.dispose(); u.small = u.coverMat = null; b.material[4] = faceMat(b); }
  }
  function loadNear() {
    const near = [];
    for (const b of S.boxes) {
      const d = Math.hypot(b.position.x - P.x, b.position.z - P.z);
      b.visible = d < Q.far + 1 || b === P.held;
      if (b === P.held || (P.watch && b === P.watch.m)) continue;
      if (b.userData.loaded && d > Q.near + 5) setCover(b, false);
      else if (!b.userData.loaded && d < Q.near) near.push([d, b]);
    }
    near.sort((a, c) => a[0] - c[0]);
    for (const [, b] of near) { if (loaded >= Q.cap) break; setCover(b, true); }
    if (loaded > Q.cap) {   // still over: let go of the farthest
      const far = S.boxes.filter((b) => b.userData.loaded && b !== P.held).map((b) => [Math.hypot(b.position.x - P.x, b.position.z - P.z), b]).sort((a, c) => c[0] - a[0]);
      for (const [, b] of far) { if (loaded <= Q.cap) break; setCover(b, false); }
    }
  }
  function goSection(i) {
    // stand in the aisle in front of the shelf where the section starts, facing it
    const s = S.starts[i]; if (!s) return;
    const face = S.faces[Math.floor(s.at / PER_FACE)];
    const c = (s.at % PER_FACE) % COLS, along = (c - (COLS - 1) / 2) * SP * (face.s > 0 ? -1 : 1);
    P.x = face.x; P.z = face.z + along; P.yaw = face.s > 0 ? Math.PI / 2 : -Math.PI / 2; P.pitch = -0.12;
    camera.position.set(P.x, EYE, P.z); hideHint(); loadNear();
  }

  // ---------- the player ----------
  const P = { x: 0, z: 0, yaw: 0, pitch: -0.05, held: null, flipped: false, watch: null };
  const keys = new Set(), stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
  function blockedAt(x, z) {
    if (x < -S.halfW + R || x > S.halfW - R || z < S.zBack + R || z > S.zFront - R) return true;
    return S.obstacles.some((o) => x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R);
  }
  function move(dt, speed) {
    let f = 0, r = 0;
    if (keys.has("w") || keys.has("arrowup")) f += 1; if (keys.has("s") || keys.has("arrowdown")) f -= 1;
    if (keys.has("d")) r += 1; if (keys.has("a")) r -= 1;
    if (keys.has("arrowleft")) P.yaw += dt * 1.8; if (keys.has("arrowright")) P.yaw -= dt * 1.8;
    f += -stick.y; r += stick.x;
    const len = Math.hypot(f, r); if (len < 0.05) return;
    if (len > 1) { f /= len; r /= len; }
    const sx = -Math.sin(P.yaw), sz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const dx = (sx * f + rx * r) * speed * dt, dz = (sz * f + rz * r) * speed * dt;
    const ox = P.x, oz = P.z;
    if (!blockedAt(P.x + dx, P.z)) P.x += dx;
    if (!blockedAt(P.x, P.z + dz)) P.z += dz;
    P.stride = (P.stride || 0) + Math.hypot(P.x - ox, P.z - oz);
    if (P.stride > 0.75) { P.stride = 0; sfx(["step0", "step1", "step2", "step3", "step4"], 0.28); }
    hideHint();
  }
  function size() {
    const w = $("stage").clientWidth, h = $("stage").clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 78 : 66; camera.updateProjectionMatrix();
  }
  new ResizeObserver(size).observe($("stage"));

  // pointer: drag to look; a touch in the bottom-left is a walking stick; a tap picks up (or throws, after hours)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null;
  const locked = () => document.pointerLockElement === el;
  el.addEventListener("pointerdown", (e) => {
    const r = el.getBoundingClientRect();
    if (e.pointerType === "touch" && e.clientX - r.left < r.width * 0.42 && e.clientY - r.top > r.height * 0.45 && stick.id === null && !P.held && !P.watch && !(MG && MG.kind === "pop")) {
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
      const k = $("stick"); k.style.left = e.clientX - 50 + "px"; k.style.top = e.clientY - 50 + "px"; k.hidden = false; $("knob").style.transform = "";
      el.setPointerCapture(e.pointerId); return;
    }
    if (locked()) { if (night.on) shoot(); return; }
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; el.setPointerCapture(e.pointerId);
    popDown();
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy); if (l > 44) { dx *= 44 / l; dy *= 44 / l; }
      stick.x = dx / 44; stick.y = dy / 44; $("knob").style.transform = `translate(${dx}px,${dy}px)`; return;
    }
    if (locked()) { P.yaw -= e.movementX * 0.0025; P.pitch = Math.max(-1.1, Math.min(1.1, P.pitch - e.movementY * 0.0025)); return; }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (P.watch || night.over) return;
    P.yaw += dx * 0.005; P.pitch = Math.max(-1.1, Math.min(1.1, P.pitch + dy * 0.004)); hideHint();
  });
  const endPtr = (e) => {
    if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; $("stick").hidden = true; return; }
    if (!drag || drag.id !== e.pointerId) return;
    const tap = drag.moved < 10; drag = null;
    if (MG && MG.kind === "pop") {
      if (!tap) { MG.hold = null; $("mgpow").hidden = true; return; }
      const r0 = el.getBoundingClientRect(); popThrow(new THREE.Vector2(((e.clientX - r0.left) / r0.width) * 2 - 1, -((e.clientY - r0.top) / r0.height) * 2 + 1)); return;
    }
    if (!tap || P.watch) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (night.on) { if (!TOUCH && !locked() && !night.over) el.requestPointerLock?.(); shoot(ndc.clone()); return; }
    ray.setFromCamera(ndc, camera);
    const sw = ray.intersectObjects(S.switchObjs, false)[0];
    if (sw && sw.distance < 4) { lightsOut(); return; }
    const mh = ray.intersectObjects([S.popHit, S.bellHit], false)[0];
    if (mh && mh.distance < 4 && !P.held) { if (mh.object === S.popHit) startPop(); else startFind(); return; }
    const hit = ray.intersectObjects(S.boxes.filter((b) => b.visible), false)[0];
    if (P.held) { if (hit && hit.object === P.held) flip(); else putBack(); return; }
    if (hit && hit.distance < 4.5) pick(hit.object);
  };
  el.addEventListener("pointerup", endPtr); el.addEventListener("pointercancel", endPtr);
  el.addEventListener("wheel", (e) => {
    e.preventDefault(); if (P.held || P.watch) return;
    const s = -e.deltaY * 0.004, nx = P.x - Math.sin(P.yaw) * s, nz = P.z - Math.cos(P.yaw) * s;
    if (!blockedAt(nx, P.z)) P.x = nx; if (!blockedAt(P.x, nz)) P.z = nz; hideHint();
  }, { passive: false });
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "escape") { if (P.watch) leaveTV(); else if (P.held) putBack(); return; }
    if (e.target.closest && e.target.closest("select,input,iframe")) return;
    if (e.target.closest && e.target.closest("button,a") && (k === " " || k === "enter")) return;
    if (night.on && (k === " " || k === "enter" || k === "f")) { e.preventDefault(); shoot(); return; }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());
  const hideHint = () => $("hint").classList.add("gone");

  // ---------- picking a box up ----------
  const anim = [];
  function animate(m, toP, toQ, dur = 460) {
    for (let i = anim.length - 1; i >= 0; i--) if (anim[i].m === m) anim.splice(i, 1);
    anim.push({ m, fromP: m.position.clone(), fromQ: m.quaternion.clone(), toP, toQ, t: 0, dur: CALM ? 1 : dur });
  }
  function heldPose(flipped) {
    const p = (camera.aspect < 1 ? new THREE.Vector3(0, 0.12, -1.2) : new THREE.Vector3(0, -0.04, -0.72)).applyMatrix4(camera.matrixWorld);
    const q = camera.quaternion.clone();
    if (flipped) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return { p, q };
  }
  function pick(m) {
    setCover(m, true);
    const u = m.userData, full = coverTex(u.g, u.th, () => { if (u.full === full && u.coverMat) { u.coverMat.map = full; u.coverMat.needsUpdate = true; m.material[4] = u.coverMat; } }); u.full = full;
    if (!m.userData.backMat.map) { m.userData.backMat.map = boxBack(m.userData.g); m.userData.backMat.color.set("#ffffff"); m.userData.backMat.needsUpdate = true; }
    P.held = m; P.flipped = false; sfx("pick", 0.6);
    if (MG && MG.kind === "find" && !MG.done) findCheck(m.userData.g);
    const { p, q } = heldPose(false); animate(m, p, q);
    showCard(m.userData.g); tvLabel = ["CH 3", "WATCH ON THE TV?"];
  }
  function flip() { if (!P.held) return; P.flipped = !P.flipped; sfx("flip", 0.6); const { p, q } = heldPose(P.flipped); animate(P.held, p, q, 520); $("flip").textContent = P.flipped ? "Turn to the front" : "Turn it over"; }
  function dropFull(m) { const u = m.userData; if (u.full) { if (u.coverMat) { u.coverMat.map = u.small; u.coverMat.needsUpdate = true; m.material[4] = u.small.userData.ok ? u.coverMat : faceMat(m); } u.full.dispose(); u.full = null; } }
  function putBack() { const m = P.held; if (!m) return; P.held = null; sfx(["place1", "place2", "place3"], 0.6); dropFull(m); animate(m, m.userData.home.p.clone(), m.userData.home.q.clone()); $("card").hidden = true; tvLabel = ["CH 3", "PICK UP A BOX"]; }
  const vidsFor = (g) => (Array.isArray(VIDS[g.id]) ? VIDS[g.id].filter((v) => Array.isArray(v) && /^[\w-]{6,20}$/.test(v[1] || "")) : []);
  function showCard(g) {
    $("ctitle").textContent = g.t;
    $("cmeta").textContent = [g.y, plat(g), (g.g || []).slice(0, 3).join(", ")].filter(Boolean).join(" · ");
    $("cfacts").innerHTML = [g.m ? `<span>Metascore <b>${esc(g.m)}</b></span>` : "", g.h ? `<span>Main story <b>${esc(hrs(g.h))}</b></span>` : ""].join("");
    $("cdesc").textContent = g.d || "";
    $("cwall").href = "/?q=" + encodeURIComponent(g.t);
    $("watch").hidden = !vidsFor(g).length;
    $("flip").textContent = "Turn it over"; $("card").hidden = false; $("tvbar").hidden = true;
  }
  $("flip").addEventListener("click", flip);
  $("putback").addEventListener("click", putBack);

  // ---------- TVs ----------
  function drawStatic() {
    const { ctx, t } = TVTEX, img = ctx.createImageData(160, 120), d = img.data, red = night.on;
    for (let i = 0; i < d.length; i += 4) { const v = 40 + Math.random() * 120; d[i] = red ? v : v * 0.85; d[i + 1] = red ? v * 0.3 : v * 0.9; d[i + 2] = red ? v * 0.3 : v; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,.35)"; for (let y = 0; y < 120; y += 3) ctx.fillRect(0, y, 160, 1);
    ctx.fillStyle = red ? "#ffb0a0" : "#b8ffb0"; ctx.font = "20px VT323, monospace"; ctx.textBaseline = "top";
    ctx.fillText(tvLabel[0], 8, 6); ctx.textAlign = "center"; ctx.fillText(tvLabel[1], 80, 92); ctx.textAlign = "left";
    t.needsUpdate = true;
  }
  let watchScreen = null;
  const watchMat = new THREE.MeshBasicMaterial({ color: "#000000" });
  function watchTV() {
    const m = P.held; if (!m) return;
    const g = m.userData.g, list = vidsFor(g); if (!list.length) return;
    // the nearest TV whose screen faces you
    let best = null, bd = 1e9;
    for (const tv of S.tvs) { const dz = P.z - tv.z; if (Math.sign(dz) !== tv.f) continue; const d = Math.hypot(P.x - tv.x, dz); if (d < bd) { bd = d; best = tv; } }
    if (!best) best = S.tvs[0];
    P.held = null; dropFull(m); animate(m, m.userData.home.p.clone(), m.userData.home.q.clone(), 500);
    P.watch = { g, list, i: 0, back: { x: P.x, z: P.z, yaw: P.yaw, pitch: P.pitch }, tv: best };
    watchScreen = best.scr; best.scr.material = watchMat;
    // the view rises to the screen and squares up to it, far enough back that it fills most of the view
    // (looking up at it from the floor squashed the picture into a strip)
    const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    const dist = Math.max((TVW / 0.9) / (2 * Math.tan(h)), (TVH / 0.62) / (2 * Math.tan(v)));
    P.x = best.x; P.z = best.z + best.f * (dist + 0.3); P.yaw = best.f > 0 ? 0 : Math.PI; P.pitch = 0;
    $("card").hidden = true; $("tvbar").hidden = false; hideHint();
    setTimeout(() => { if (P.watch && P.watch.g === g) play(); }, CALM ? 0 : 700);
  }
  function play() {
    const w = P.watch, v = w.list[w.i];
    $("tvtitle").textContent = w.g.t;
    $("tvwhat").textContent = `${v[0]}${w.list.length > 1 ? ` (${w.i + 1} of ${w.list.length})` : ""}`;
    $("tvnext").hidden = w.list.length < 2;
    $("tvframe").src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v[1])}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    $("tvframe").title = `${w.g.t}: ${v[0]}`; $("tv").hidden = false;
  }
  function leaveTV() {
    const w = P.watch; if (!w) return; P.watch = null;
    $("tvframe").src = "about:blank"; $("tv").hidden = true; $("tvbar").hidden = true;
    if (watchScreen) { watchScreen.material = tvMat; watchScreen = null; }
    Object.assign(P, w.back); tvLabel = ["CH 3", "PICK UP A BOX"];
  }
  $("watch").addEventListener("click", watchTV);
  $("tvnext").addEventListener("click", () => { const w = P.watch; if (!w) return; w.i = (w.i + 1) % w.list.length; play(); });
  $("tvleave").addEventListener("click", leaveTV);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * TVW / 2, b * TVH / 2, 0));
  const tmp = new THREE.Vector3();
  function placeVideo() {
    const r = el.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(watchScreen.matrixWorld).project(camera);
      const x = (tmp.x + 1) / 2 * r.width, y = (1 - tmp.y) / 2 * r.height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const s = $("tv").style; s.left = r.left + x0 + "px"; s.top = r.top + y0 + "px"; s.width = x1 - x0 + "px"; s.height = y1 - y0 + "px";
  }

  // ---------- after hours ----------
  const night = { on: false, over: false, t: 0, score: 0, floored: 0, hp: 10, zombies: [], cases: [], pickups: [], cool: 0, hurt: 0, nextSpawn: 0, nextPick: 0, nextManager: 45,
    fx: { ff: 0, set: 0, rew: 0 }, flowAt: 0 };
  const NAMES = ["DOUG", "KEVIN", "TRACY", "GARY", "DENISE", "BRAD", "SHEILA", "TODD", "MARCY", "RON", "LORRAINE", "DARRYL", "BEV", "STU"];
  const zM = {
    skin: new THREE.MeshStandardMaterial({ color: "#8fae6a", roughness: 0.8, emissive: "#3d5a1e", emissiveIntensity: 0.9 }),
    shirt: new THREE.MeshStandardMaterial({ color: "#2c47b8", roughness: 0.7, emissive: "#1a2a80", emissiveIntensity: 0.7 }),
    boss: new THREE.MeshStandardMaterial({ color: "#e9e6dc", roughness: 0.7, emissive: "#4a4840", emissiveIntensity: 0.6 }),
    tie: new THREE.MeshStandardMaterial({ color: "#c81e2e", emissive: "#5a0a10", emissiveIntensity: 0.8 }),
    pants: new THREE.MeshStandardMaterial({ color: "#2a2a33", roughness: 0.8, emissive: "#15151c", emissiveIntensity: 0.6 }),
    hair: new THREE.MeshStandardMaterial({ color: "#3b2a20", roughness: 0.9, emissive: "#1c120c", emissiveIntensity: 0.6 }),
    eye: new THREE.MeshBasicMaterial({ color: "#ffe66b" }), flash: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  };
  const zG = { leg: new THREE.BoxGeometry(0.16, 0.8, 0.18), body: new THREE.BoxGeometry(0.5, 0.62, 0.28), arm: new THREE.BoxGeometry(0.13, 0.13, 0.6),
    head: new THREE.BoxGeometry(0.3, 0.32, 0.3), eye: new THREE.BoxGeometry(0.06, 0.04, 0.01), hair: new THREE.BoxGeometry(0.32, 0.08, 0.32),
    tag: new THREE.PlaneGeometry(0.2, 0.075), tie: new THREE.BoxGeometry(0.07, 0.36, 0.01) };
  const tagMats = new Map();
  function tagMat(name) {
    if (!tagMats.has(name)) tagMats.set(name, new THREE.MeshBasicMaterial({ map: canvasTex(256, 96, (x, w) => {
      x.fillStyle = YELLOW; x.fillRect(0, 0, w, 96); x.fillStyle = INK; x.font = "26px Bungee, sans-serif"; x.textAlign = "center";
      x.fillText(name === "MANAGER" ? "STORE" : "HI, I'M", w / 2, 36); x.font = "34px 'Permanent Marker', cursive"; x.fillText(name, w / 2, 78);
    }) }));
    return tagMats.get(name);
  }
  // The animated models load when the lights first go out (about 1.9 MB). Until they arrive the clerks are
  // the old box figures.
  const ZT = { loading: false, kinds: {} };
  function loadZombies() {
    if (ZT.loading) return; ZT.loading = true;
    const gl = new GLTFLoader();
    for (const k of ["basic", "arm", "ribcage", "chubby"]) gl.load(`models/zombie_${k}.glb`, (gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene), clips = {};
      gltf.animations.forEach((a) => (clips[a.name] = a));
      ZT.kinds[k] = { scene: gltf.scene, clips, h: box.max.y - box.min.y || 1.8 };
    });
  }
  const zReady = () => ZT.kinds.basic || ZT.kinds.arm || ZT.kinds.ribcage;
  function modelZombie(x, z, boss, opt = {}) {
    const pool = ["basic", "arm", "ribcage"].filter((k) => ZT.kinds[k]);
    const kind = opt.kind && ZT.kinds[opt.kind] ? opt.kind : boss && ZT.kinds.chubby ? "chubby" : pool[Math.floor(Math.random() * pool.length)], t = ZT.kinds[kind];
    const m = cloneRig(t.scene), g = new THREE.Group(), mats = [];
    m.scale.setScalar((boss ? 2.05 : 1.75) / t.h);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const mat = o.material.clone(); mat.emissive = new THREE.Color("#9fd07a"); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.38;
      o.material = mat; mats.push(mat);
    });
    g.add(m);
    // the name badge, pinned on the shirt front
    const tag = new THREE.Mesh(zG.tag, tagMat(opt.name || (boss ? "MANAGER" : NAMES[Math.floor(Math.random() * NAMES.length)])));
    tag.scale.setScalar(boss ? 1.8 : 1.6); tag.position.set(boss ? -0.2 : 0.14, boss ? 1.08 : 1.0, boss ? 0.5 : 0.33); tag.rotation.x = -0.15; g.add(tag);
    g.position.set(x, 0, z); scene.add(g);
    const mixer = new THREE.AnimationMixer(m), act = {};
    for (const [n, c] of Object.entries(t.clips)) act[n] = mixer.clipAction(c);
    for (const n of ["Death", "HitReact", "Yes", "No"]) if (act[n]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
    const crawl = !boss && !opt.upright && act.Crawl && Math.random() < 0.15;
    const sp = (boss ? 0.75 : crawl ? 0.6 : 0.95) + Math.min(1.1, night.t / 110) * (crawl ? 0.5 : 1) + rnd(0, 0.25);
    const zz = { g, m, model: true, mixer, act, cur: null, mats, parts: [], hp: boss ? 9 : 3, boss, crawl, speed: sp, phase: rnd(0, 6), flash: 0, dead: 0, knock: 0, kx: 0, kz: 0, rise: 0.6, hitT: 0, nextGroan: rnd(1, 4) };
    zAct(zz, crawl ? "Crawl" : "Walk", 0);
    mixer.update(rnd(0, 1));
    return zz;
  }
  function zAct(z, name, fade = 0.2) {
    const a = z.act[name] || z.act.Walk; if (!a || z.cur === a) return;
    a.reset().play(); if (z.cur) a.crossFadeFrom(z.cur, fade, false); z.cur = a;
  }
  function makeZombie(x, z, boss) {
    if (zReady()) return modelZombie(x, z, boss);
    const g = new THREE.Group(), shirt = boss ? zM.boss : zM.shirt, parts = [];
    const mk = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); parts.push(m); return m; };
    const lL = mk(zG.leg, zM.pants, -0.12, 0.4, 0), lR = mk(zG.leg, zM.pants, 0.12, 0.4, 0);
    mk(zG.body, shirt, 0, 1.11, 0);
    const aL = mk(zG.arm, zM.skin, -0.3, 1.3, 0.28), aR = mk(zG.arm, zM.skin, 0.3, 1.3, 0.28);
    const head = mk(zG.head, zM.skin, 0, 1.6, 0.02);
    mk(zG.hair, zM.hair, 0, 1.78, 0.02); mk(zG.eye, zM.eye, -0.07, 1.63, 0.175); mk(zG.eye, zM.eye, 0.07, 1.63, 0.175);
    if (boss) mk(zG.tie, zM.tie, 0, 1.15, 0.145);
    mk(zG.tag, tagMat(boss ? "MANAGER" : NAMES[Math.floor(Math.random() * NAMES.length)]), boss ? -0.13 : 0.12, 1.25, 0.145);
    if (boss) g.scale.setScalar(1.25);
    g.position.set(x, 0, z); scene.add(g);
    const sp = (boss ? 0.75 : 0.95) + Math.min(1.1, night.t / 110) + rnd(0, 0.25);
    return { g, parts, lL, lR, aL, aR, head, hp: boss ? 9 : 3, boss, speed: sp, phase: rnd(0, 6), flash: 0, dead: 0, knock: 0, kx: 0, kz: 0, rise: 0.6 };
  }
  function lightsOut() {
    endMG(); if (P.held) putBack();
    Object.assign(night, { on: true, over: false, t: 0, score: 0, floored: 0, hp: 10, cool: 0, hurt: 0, nextSpawn: 2.5, nextPick: 6, nextManager: 45, fx: { ff: 0, set: 0, rew: 0 } });
    S.lever.position.y = S.lever.userData.y0 - 0.035; nightLights(true); loadZombies(); sfx("switch", 0.8); ambMode(true);
    $("card").hidden = true; $("hud").hidden = false; $("over").hidden = true; document.body.classList.add("night");
    tvLabel = ["CH 13", "THEY'RE BACK"]; hideHint();
    say(TOUCH ? "The dead clerks are back. Walk with the stick, look by dragging, tap to throw a case." : "The dead clerks are back. WASD to move, click to aim with the mouse and throw. Esc lets go of the mouse.", 5000);
    hud();
  }
  function nightLights(on) {
    hemi.intensity = on ? 0.16 : 1.35; hemi.color.set(on ? "#ff8a7a" : "#fff6e8"); sun.intensity = on ? 0.12 : 0.9;
    S.lights.forEach((p, i) => { p.color.set(on ? "#ff2a2a" : "#fff4dc"); p.intensity = on ? (i % 2 ? 0.6 : 4) : 3; });
    M.strip.color.set(on ? "#2a0808" : "#fffbe8");
    streetNight(on);
    scene.background.copy(on ? BG_NIGHT : BG); scene.fog.color.copy(on ? BG_NIGHT : BG); scene.fog.near = on ? 3 : 10; scene.fog.far = on ? 15 : 26;
  }
  function clearNight() {
    night.zombies.forEach(dropZombie); night.zombies = [];
    night.cases.forEach((c) => { scene.remove(c.m); c.m.material[4].dispose(); }); night.cases = [];
    night.pickups.forEach((p) => scene.remove(p.m)); night.pickups = [];
  }
  function dropZombie(z) { scene.remove(z.g); if (z.model) { z.mixer.stopAllAction(); z.mats.forEach((m) => m.dispose()); } }
  function lightsOn() {
    night.on = false; night.over = false; clearNight();
    if (locked()) document.exitPointerLock();
    S.lever.position.y = S.lever.userData.y0; nightLights(false); sfx("switch", 0.8); ambMode(false);
    $("hud").hidden = true; $("over").hidden = true; $("fx").textContent = ""; document.body.classList.remove("night");
    tvLabel = ["CH 3", "PICK UP A BOX"];
  }
  const caseGeo = new THREE.BoxGeometry(BW * 0.9, BH * 0.9, 0.04);
  const caseTex = [];
  function shoot(at) {
    if (!night.on || night.over || night.t < night.cool) return;
    night.cool = night.t + (night.fx.ff > 0 ? 0.16 : 0.24); sfx(["throw1", "throw2", "throw3"], 0.5);
    ray.setFromCamera(at || new THREE.Vector2(0, 0), camera);
    const spread = night.fx.set > 0 ? [-0.09, 0, 0.09] : [0];
    for (const a of spread) {
      if (caseTex.length < 24) { const g = S.list.length ? S.list[Math.floor(Math.random() * S.list.length)].g : GAMES[0]; caseTex.push(smallTex(g)); }
      const front = new THREE.MeshStandardMaterial({ map: caseTex[Math.floor(Math.random() * caseTex.length)], roughness: 0.4, emissive: "#222222", emissiveIntensity: 0.4 });
      const m = new THREE.Mesh(caseGeo, [M.plastic, M.plastic, M.plastic, M.plastic, front, M.plastic]);
      const start = new THREE.Vector3(0.16, -0.18, -0.35).applyMatrix4(camera.matrixWorld);
      const dir = ray.ray.direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      const vel = dir.multiplyScalar(15); vel.y += 0.9;
      m.position.copy(start); scene.add(m);
      night.cases.push({ m, vel, spin: new THREE.Vector3(rnd(6, 16), rnd(-3, 3), rnd(0, 4)), life: 2 });
    }
  }
  function say(text, ms) { const s = $("say"); s.textContent = text; s.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => (s.hidden = true), ms); }
  function hud() {
    $("hscore").textContent = night.score; $("hfloored").textContent = night.floored;
    const t = Math.floor(night.t); $("htime").textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    $("hhp").style.setProperty("--hp", night.hp / 10); $("hhp").setAttribute("aria-label", `Health ${night.hp} of 10`);
    $("fx").textContent = [night.fx.ff > 0 ? `Fast forward ${Math.ceil(night.fx.ff)}` : "", night.fx.set > 0 ? `Box set ${Math.ceil(night.fx.set)}` : "", night.fx.rew > 0 ? `Paused ${Math.ceil(night.fx.rew)}` : ""].filter(Boolean).join("   ");
  }
  function gameOver() {
    night.over = true; if (locked()) document.exitPointerLock(); sfx("over", 0.8);
    const t = Math.floor(night.t);
    $("overtext").textContent = `You lasted ${Math.floor(t / 60)} min ${t % 60} s and floored ${night.floored} ${night.floored === 1 ? "clerk" : "clerks"}. Score ${night.score}.`;
    $("over").hidden = false; $("again").focus();
  }
  $("lightson").addEventListener("click", lightsOn);
  $("lightson2").addEventListener("click", lightsOn);
  $("again").addEventListener("click", () => { clearNight(); lightsOut(); });
  $("throwbtn").addEventListener("pointerdown", (e) => { e.preventDefault(); shoot(); });

  // pickups: popcorn heals; three tapes do odd things for a few seconds
  const PICKS = {
    pop: { say: "Popcorn: +3 health" },
    ff: { say: "Fast forward: you're quicker", color: "#ffc925", label: "FF ▶▶" },
    rew: { say: "Pause: they're frozen", color: "#4fa3ff", label: "PAUSE ❚❚" },
    set: { say: "Box set: three cases a throw", color: "#ff5c7a", label: "BOX SET" },
  };
  const popTex = canvasTex(128, 128, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#fff" : "#d7263d"; x.fillRect(i * 16, 0, 16, h); } x.fillStyle = YELLOW; x.font = "26px Bungee, sans-serif"; x.textAlign = "center"; x.fillText("POP", 64, 74); });
  const popMat = new THREE.MeshStandardMaterial({ map: popTex, emissive: "#552222", emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const kernMat = new THREE.MeshStandardMaterial({ color: "#fff3c4", emissive: "#6a5a20", emissiveIntensity: 0.7 });
  const cupGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.3, 12, 1, true), kernGeo = new THREE.SphereGeometry(0.05, 6, 5), tapeGeo = new THREE.BoxGeometry(0.36, 0.2, 0.05);
  const tapeMats = {};
  function makePickup(kind, x, z) {
    const g = new THREE.Group();
    if (kind === "pop") {
      g.add(new THREE.Mesh(cupGeo, popMat));
      for (let i = 0; i < 7; i++) { const k = new THREE.Mesh(kernGeo, kernMat); k.position.set(rnd(-0.08, 0.08), 0.17 + rnd(0, 0.05), rnd(-0.08, 0.08)); g.add(k); }
    } else {
      const p = PICKS[kind];
      if (!tapeMats[kind]) tapeMats[kind] = new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (x, w, h) => { x.fillStyle = "#111"; x.fillRect(0, 0, w, h); x.fillStyle = p.color; x.fillRect(20, 24, w - 40, h - 48); x.fillStyle = INK; x.font = "30px Bungee, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(p.label, w / 2, h / 2 + 2); }), emissive: p.color, emissiveIntensity: 0.35 });
      g.add(new THREE.Mesh(tapeGeo, [M.plastic, M.plastic, M.plastic, M.plastic, tapeMats[kind], tapeMats[kind]]));
    }
    const glow = new THREE.PointLight(kind === "pop" ? "#ffdd88" : PICKS[kind].color, 1.2, 2.2, 2); glow.position.y = 0.2; g.add(glow);
    g.position.set(x, 0.55, z); scene.add(g);
    return { m: g, kind, born: night.t };
  }
  function freeSpot(minFromPlayer) {
    const { cell, gw, gh, blocked } = S.grid;
    for (let n = 0; n < 60; n++) {
      const i = Math.floor(Math.random() * gw), j = Math.floor(Math.random() * gh);
      if (blocked[j * gw + i]) continue;
      const x = -S.halfW + (i + 0.5) * cell, z = S.zBack + (j + 0.5) * cell;
      if (Math.hypot(x - P.x, z - P.z) > minFromPlayer) return [x, z];
    }
    return null;
  }
  // flow field: every walkable cell's step count to the player, so the dead find their way round the shelves
  function flow() {
    const { cell, gw, gh, blocked, dist } = S.grid;
    dist.fill(-1);
    const pi = Math.max(0, Math.min(gw - 1, Math.floor((P.x + S.halfW) / cell))), pj = Math.max(0, Math.min(gh - 1, Math.floor((P.z - S.zBack) / cell)));
    const q = new Int32Array(gw * gh); let h = 0, t = 0;
    q[t++] = pj * gw + pi; dist[pj * gw + pi] = 0;
    while (h < t) {
      const c = q[h++], i = c % gw, j = (c / gw) | 0, d = dist[c] + 1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
        const n = nj * gw + ni; if (blocked[n] || dist[n] >= 0) continue; dist[n] = d; q[t++] = n;
      }
    }
  }
  function steer(z) {
    const { cell, gw, gh, dist } = S.grid, x = z.g.position.x, zz = z.g.position.z;
    if (Math.hypot(P.x - x, P.z - zz) < 1.2) return [P.x - x, P.z - zz];
    const i = Math.floor((x + S.halfW) / cell), j = Math.floor((zz - S.zBack) / cell);
    let best = null, bd = 1e9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
      const d = dist[nj * gw + ni]; if (d < 0) continue;
      const dd = d + (di && dj ? 0.4 : 0);
      if (dd < bd) { bd = dd; best = [ni, nj]; }
    }
    if (!best) return [P.x - x, P.z - zz];
    return [-S.halfW + (best[0] + 0.5) * cell - x, S.zBack + (best[1] + 0.5) * cell - zz];
  }
  function hurt() {
    night.hp--; night.hurt = night.t + 0.8; hud(); sfx("hurt", 0.9);
    const o = $("ouch"); o.classList.remove("on"); void o.offsetWidth; o.classList.add("on");
    if (night.hp <= 0) gameOver();
  }
  function tickNight(dt) {
    if (night.over) return;
    night.t += dt;
    for (const k of Object.keys(night.fx)) night.fx[k] = Math.max(0, night.fx[k] - dt);
    if ((night.flowAt -= dt) <= 0) { flow(); night.flowAt = 0.3; }
    // spawning: faster and more of them as time goes on, and a manager now and then
    const alive = night.zombies.filter((z) => !z.dead).length, cap = Math.min(18, 4 + Math.floor(night.t / 14));
    if ((night.nextSpawn -= dt) <= 0 && alive < cap && (zReady() || night.t > 8)) {
      const doors = [...S.doors, { x: -S.halfW + 2, z: S.zFront - 0.6 }].filter((d) => Math.hypot(d.x - P.x, d.z - P.z) > 5);
      const d = doors[Math.floor(Math.random() * doors.length)] || S.doors[0];
      const boss = night.t > night.nextManager; if (boss) { night.nextManager = night.t + 45; say("The manager's here", 1800); }
      night.zombies.push(makeZombie(d.x + rnd(-0.3, 0.3), d.z, boss));
      sfx("door", 0.7, d.x, d.z); groan(d.x, d.z, boss);
      night.nextSpawn = Math.max(0.7, 3 - night.t / 45) * rnd(0.7, 1.3);
    }
    if ((night.nextPick -= dt) <= 0 && night.pickups.length < 4) {
      const spot = freeSpot(4); if (spot) { const kinds = ["pop", "pop", "ff", "rew", "set"]; night.pickups.push(makePickup(kinds[Math.floor(Math.random() * kinds.length)], spot[0], spot[1])); }
      night.nextPick = rnd(8, 14);
    }
    const frozen = night.fx.rew > 0;
    for (const z of night.zombies) {
      if (z.dead) {
        z.dead += dt;
        if (z.model) { if (!frozen) z.mixer.update(dt); if (z.dead > 1.8) z.g.position.y -= dt * 0.5; }
        else { z.g.rotation.x = -Math.min(Math.PI / 2, z.dead * 3); if (z.dead > 0.8) z.g.position.y -= dt * 0.5; }
        continue;
      }
      if (z.rise > 0) { z.rise = Math.max(0, z.rise - dt); z.g.position.y = -z.rise * 1.2; }
      if (z.flash > 0) {
        z.flash -= dt;
        if (z.flash <= 0) { if (z.model) z.mats.forEach((m) => (m.emissiveIntensity = 0.38)); else z.parts.forEach((p) => { if (p.userData.mat) p.material = p.userData.mat; }); }
      }
      if (frozen) continue;
      if ((z.nextGroan -= dt) <= 0) { groan(z.g.position.x, z.g.position.z, z.boss); z.nextGroan = rnd(3, 8); }
      if (z.model) {
        const near = Math.hypot(P.x - z.g.position.x, P.z - z.g.position.z) < 0.9;
        z.hitT = Math.max(0, z.hitT - dt);
        if (z.hitT > 0) zAct(z, "HitReact", 0.08);
        else if (z.crawl) zAct(z, "Crawl");
        else if (near) zAct(z, "Punch", 0.15);
        else zAct(z, z.speed > 1.55 ? "Run" : "Walk", 0.3);
        if (z.cur === z.act.Walk) z.cur.timeScale = z.speed * 0.95; else if (z.cur === z.act.Run) z.cur.timeScale = z.speed * 0.45; else if (z.cur === z.act.Crawl) z.cur.timeScale = z.speed * 1.2; else z.cur.timeScale = 1;
        z.mixer.update(dt);
      } else {
        z.phase += dt * 3 * z.speed;
        const sw = Math.sin(z.phase);
        z.lL.rotation.x = sw * 0.5; z.lR.rotation.x = -sw * 0.5; z.aL.rotation.x = -0.1 + Math.sin(z.phase * 0.7) * 0.15; z.aR.rotation.x = -0.1 - Math.sin(z.phase * 0.7) * 0.15;
        z.head.rotation.z = Math.sin(z.phase * 0.3) * 0.25;
      }
      let [vx, vz] = steer(z); const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l;
      for (const o of night.zombies) { if (o === z || o.dead) continue; const dx = z.g.position.x - o.g.position.x, dz = z.g.position.z - o.g.position.z, d = Math.hypot(dx, dz); if (d < 0.55 && d > 0.001) { vx += (dx / d) * 0.6; vz += (dz / d) * 0.6; } }
      const pd = Math.hypot(P.x - z.g.position.x, P.z - z.g.position.z);
      let mx = vx * z.speed * dt, mz = vz * z.speed * dt;
      if (z.knock > 0) { mx = z.kx * z.knock * dt * 4; mz = z.kz * z.knock * dt * 4; z.knock = Math.max(0, z.knock - dt * 4); }
      if (pd < 0.6 && z.knock <= 0) { mx = mz = 0; if (night.t > night.hurt) { hurt(); if (night.over) return; } }
      const nx = z.g.position.x + mx, nz = z.g.position.z + mz;
      if (!S.obstacles.some((o) => nx > o.x0 - 0.25 && nx < o.x1 + 0.25 && nz > o.z0 - 0.25 && nz < o.z1 + 0.25)) {
        z.g.position.x = Math.max(-S.halfW + 0.3, Math.min(S.halfW - 0.3, nx)); z.g.position.z = Math.max(S.zBack + 0.3, Math.min(S.zFront - 0.3, nz));
      }
      z.g.rotation.y = Math.atan2(P.x - z.g.position.x, P.z - z.g.position.z);
    }
    night.zombies = night.zombies.filter((z) => { if (z.dead > (z.model ? 3.2 : 2.2)) { dropZombie(z); return false; } return true; });
    for (let i = night.cases.length - 1; i >= 0; i--) {
      const c = night.cases[i]; c.life -= dt;
      c.vel.y -= 9.8 * 0.5 * dt; c.m.position.addScaledVector(c.vel, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      const q = c.m.position;
      let hit = null;
      for (const z of night.zombies) {
        if (z.dead || z.rise > 0.2) continue;
        const s = z.boss ? 1.25 : 1, p = z.g.position;
        if (Math.hypot(q.x - p.x, q.z - p.z) < 0.36 * s && q.y > 0.05 && q.y < (z.crawl ? 0.75 : 1.95 * s)) { hit = z; break; }
      }
      if (hit) {
        hit.hp--; hit.flash = 0.1;
        if (hit.model) { hit.mats.forEach((m) => (m.emissiveIntensity = 3)); hit.hitT = hit.boss ? 0.2 : 0.4; }
        else hit.parts.forEach((p) => { if (p.material !== zM.eye) { p.userData.mat = p.userData.mat || p.material; p.material = zM.flash; } });
        sfx(["hit0", "hit1", "hit2"], 0.9, q.x, q.z);
        const l = Math.hypot(c.vel.x, c.vel.z) || 1; hit.kx = c.vel.x / l; hit.kz = c.vel.z / l; hit.knock = hit.boss ? 0.4 : 1;
        night.score += 10;
        if (hit.hp <= 0) {
          hit.dead = 0.001; night.floored++; night.score += hit.boss ? 500 : 100; hit.parts.forEach((p) => { if (p.userData.mat) p.material = p.userData.mat; });
          if (hit.model) { hit.mats.forEach((m) => (m.emissiveIntensity = 0.38)); if (hit.act.Death) { hit.cur = null; hit.mixer.stopAllAction(); hit.act.Death.reset().play(); } }
          sfx("floored", 1, q.x, q.z); groan(q.x, q.z, true);
        }
        hud();
      }
      const wall = Math.abs(q.x) > S.halfW - 0.1 || q.z < S.zBack + 0.1 || q.z > S.zFront - 0.1 || S.obstacles.some((o) => q.x > o.x0 && q.x < o.x1 && q.z > o.z0 && q.z < o.z1 && q.y < 2.2);
      if (!hit && wall) sfx(q.z > S.zFront - 0.1 ? "glass" : ["wall0", "wall1", "wall2"], 0.6, q.x, q.z);
      if (hit || wall || c.life <= 0 || q.y < 0.03) { scene.remove(c.m); c.m.material[4].dispose(); night.cases.splice(i, 1); }
    }
    for (let i = night.pickups.length - 1; i >= 0; i--) {
      const p = night.pickups[i]; p.m.rotation.y += dt * 2; p.m.position.y = 0.55 + Math.sin((night.t - p.born) * 3) * 0.08;
      if (Math.hypot(p.m.position.x - P.x, p.m.position.z - P.z) < 0.7) {
        if (p.kind === "pop") { night.hp = Math.min(10, night.hp + 3); sfx("popcorn", 0.8); } else { night.fx[p.kind] = p.kind === "rew" ? 4 : 9; sfx("power", 0.8); }
        night.score += 25; say(PICKS[p.kind].say, 1500); scene.remove(p.m); night.pickups.splice(i, 1);
      } else if (night.t - p.born > 30) { scene.remove(p.m); night.pickups.splice(i, 1); }
    }
    if (Math.floor(night.t * 4) !== Math.floor((night.t - dt) * 4)) hud();
  }

  // ---------- minigames behind the counter ----------
  // Feed the clerk: lob popcorn into a dead clerk's mouth (the popcorn machine). Find the game: a customer
  // describes a game without its name and you fetch the box (the service bell).
  let MG = null;
  const mgBest = (k) => { try { return +localStorage.getItem("psplus-shop-" + k) || 0; } catch (e) { return 0; } };
  const mgSave = (k, v) => { try { localStorage.setItem("psplus-shop-" + k, String(v)); } catch (e) {} };
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function mgShow(title, html, stats, acts) {
    $("mg").hidden = false; $("mgtitle").textContent = title; $("mgtext").innerHTML = html; $("mgstats").innerHTML = stats || "";
    $("mgacts").innerHTML = "";
    (acts || []).forEach(([label, fn]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", fn); $("mgacts").append(b); });
  }
  function mgOver(title, text, againLabel, again) {
    $("mgovertitle").textContent = title; $("mgovertext").textContent = text; $("mgagain").textContent = againLabel;
    MG.again = again; $("mgover").hidden = false; $("mgagain").focus();
  }
  function endMG() {
    if (!MG) return;
    if (MG.clerk) scene.remove(MG.clerk.g);
    if (MG.kernels) MG.kernels.forEach((k) => scene.remove(k.m));
    if (MG.customer) scene.remove(MG.customer.g);
    MG = null; $("mg").hidden = true; $("mgpow").hidden = true; $("mgover").hidden = true;
    document.body.classList.remove("mg", "mgpop");
  }
  $("mgstop").addEventListener("click", endMG);
  $("mgdone").addEventListener("click", endMG);
  $("mgagain").addEventListener("click", () => { const f = MG && MG.again; $("mgover").hidden = true; if (f) f(); });

  // Feed the clerk
  const kernMat2 = new THREE.MeshStandardMaterial({ color: "#fff3c4", roughness: 0.8, emissive: "#ffcc55", emissiveIntensity: 0.35 });
  const kernGeo2 = new THREE.IcosahedronGeometry(0.04, 0), tmpV = new THREE.Vector3();
  function startPop() {
    endMG(); if (P.held) putBack(); if (P.watch) leaveTV();
    loadHuman("clerk");
    MG = { kind: "pop", t: 0, left: 45, score: 0, streak: 0, best: 0, caught: 0, kernels: [], clerk: null, hold: null, x0: S.counter.x - 0.45, z: S.counter.z - 2.0, sway: 0 };
    document.body.classList.add("mg", "mgpop");
    P.x = S.staffSpot.x; P.z = S.staffSpot.z; P.yaw = 0; P.pitch = -0.02; hideHint();
    mgShow("Feed the clerk", (TOUCH ? "Press and hold to wind up, then let go to lob." : "Press and hold the mouse to wind up, then let go to lob.") + " Gary's on his break. Land the popcorn in his mouth. The more you get in a row, the more he moves.", "", []);
  }
  function popStats() { if (MG) $("mgstats").innerHTML = `<span>Score<b>${MG.score}</b></span><span>In a row<b>${MG.streak}</b></span><span>Time<b>${Math.max(0, Math.ceil(MG.left))}</b></span>`; }
  function mouthOf(c) {
    // the head bone, nudged forward to where the mouth hangs open
    if (c.head === undefined) { c.head = null; c.m.traverse((o) => { if (!c.head && o.isBone && /head/i.test(o.name)) c.head = o; }); }
    if (c.head) c.head.getWorldPosition(tmpV); else tmpV.set(c.g.position.x, 1.45, c.g.position.z);
    const f = c.g.rotation.y; tmpV.x += Math.sin(f) * MOUTH.f; tmpV.z += Math.cos(f) * MOUTH.f; tmpV.y += MOUTH.y;
    return tmpV;
  }
  const MOUTH = { f: 0.17, y: 0.22, r: 0.2 };
  const popPower = () => Math.min(1, (performance.now() - MG.hold) / 900);
  function popDown() { if (!MG || MG.kind !== "pop" || MG.over || !MG.clerk) return; MG.hold = performance.now(); $("mgpow").hidden = false; }
  function popThrow(at) {
    if (!MG || MG.kind !== "pop" || !MG.hold) return;
    const p = popPower(); MG.hold = null; $("mgpow").hidden = true; $("mgpow").style.setProperty("--p", "0");
    ray.setFromCamera(at || new THREE.Vector2(0, 0), camera);
    const m = new THREE.Mesh(kernGeo2, kernMat2);
    m.position.copy(new THREE.Vector3(0.1, -0.12, -0.3).applyMatrix4(camera.matrixWorld)); scene.add(m);
    const vel = ray.ray.direction.clone().multiplyScalar(3.5 + p * 6.5); vel.y += 2.4;
    MG.kernels.push({ m, vel, age: 0 }); sfx(["throw1", "throw2", "throw3"], 0.25, undefined, undefined, 1.5);
  }
  function popMiss(k) {
    if (k.missed) return; k.missed = true;
    if (MG.streak >= 3) say("Streak's over", 900);
    MG.streak = 0; popStats();
  }
  function tickPop(dt) {
    if (!MG.clerk) {
      if (!humanReady("clerk")) return;
      MG.clerk = spawnHuman("clerk", MG.x0, MG.z, "GARY", 1.9); MG.clerk.hitT = 0; gesture(MG.clerk, "Wave"); MG.clerk.hitT = 1.2; popStats(); return;
    }
    const c = MG.clerk;
    if (MG.over) { c.mixer.update(dt); return; }
    MG.t += dt; MG.left -= dt;
    const lvl = Math.min(10, MG.streak), amp = Math.min(0.72, 0.08 + lvl * 0.08);   // he stays between the popcorn machine and the button
    MG.sway += dt * (0.7 + lvl * 0.16);
    const nx = MG.x0 + Math.sin(MG.sway) * amp, moving = Math.abs(nx - c.g.position.x) / Math.max(dt, 1e-3) > 0.25;
    c.g.position.x = nx; c.g.rotation.y = Math.atan2(P.x - nx, P.z - c.g.position.z);
    c.hitT = Math.max(0, c.hitT - dt);
    if (c.hitT <= 0) { zAct(c, moving ? "Walk" : "Idle", 0.3); if (c.cur === c.act.Walk) c.cur.timeScale = 0.8; }
    c.mixer.update(dt);
    if (MG.hold) $("mgpow").style.setProperty("--p", popPower().toFixed(3));
    const mouth = mouthOf(c);
    for (let i = MG.kernels.length - 1; i >= 0; i--) {
      const k = MG.kernels[i];
      if (k.rest !== undefined) { if ((k.rest += dt) > 2.5) { scene.remove(k.m); MG.kernels.splice(i, 1); } continue; }
      k.age += dt; k.vel.y -= 9.8 * dt; k.m.position.addScaledVector(k.vel, dt); k.m.rotation.x += dt * 9; k.m.rotation.z += dt * 6;
      const q = k.m.position;
      if (!k.missed && q.distanceTo(mouth) < MOUTH.r) {
        scene.remove(k.m); MG.kernels.splice(i, 1);
        MG.streak++; MG.caught++; MG.score += 10 + (MG.streak - 1) * 5; MG.best = Math.max(MG.best, MG.streak);
        c.hitT = 1; if (c.act.Yes) { c.cur = null; zAct(c, "Yes", 0.1); }
        crunch(q.x, q.z); if (MG.streak % 5 === 0) say(`${MG.streak} in a row`, 1100);
        popStats(); continue;
      }
      const cp = c.g.position;
      if (!k.missed && Math.hypot(q.x - cp.x, q.z - cp.z) < 0.32 && q.y < 1.8) { popMiss(k); k.vel.set(-k.vel.x * 0.15, 0, -k.vel.z * 0.15); }
      const onCounter = q.x > S.counter.x - 1.7 && q.x < S.counter.x + 1.6 && q.z > S.counter.z - 0.35 && q.z < S.counter.z + 0.35 && q.y < 1.07;
      if (q.y < 0.03 || onCounter) { q.y = onCounter ? 1.07 : 0.03; k.rest = 0; popMiss(k); }
      else if (k.age > 3) { scene.remove(k.m); MG.kernels.splice(i, 1); popMiss(k); }
    }
    if (MG.left <= 0) {
      MG.over = true; MG.hold = null; $("mgpow").hidden = true; popStats();
      const best = mgBest("popcorn"); if (MG.score > best) mgSave("popcorn", MG.score);
      const n = MG.caught;
      mgOver(n ? "Gary's full" : "Gary's still hungry",
        `${n} ${n === 1 ? "piece" : "pieces"} caught, ${MG.best} in a row at best, for a score of ${MG.score}.` + (MG.score > best && best ? " That's a new best." : best ? ` Your best is ${best}.` : ""),
        "Play again", startPop);
    }
  }

  // Find the game
  // people (not zombies): the customer and Gary behind the popcorn, from the same CC0 kit
  const HUM = {};
  function loadHuman(file) {
    if (HUM[file]) return; HUM[file] = { t: null };
    new GLTFLoader().load(`models/${file}.glb`, (gl) => { const b = new THREE.Box3().setFromObject(gl.scene); HUM[file].t = { scene: gl.scene, clips: gl.animations, h: b.max.y - b.min.y || 1.8 }; });
  }
  const humanReady = (file) => HUM[file] && HUM[file].t;
  function spawnHuman(file, x, z, name, tall = 1.72) {
    const T = HUM[file].t, m = cloneRig(T.scene), g = new THREE.Group();
    m.scale.setScalar(tall / T.h); m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); g.add(m);
    if (name) { const tag = new THREE.Mesh(zG.tag, tagMat(name)); tag.scale.setScalar(1.3); tag.position.set(0.13, 0.88, 0.22); g.add(tag); }
    g.position.set(x, 0, z); scene.add(g);
    const mixer = new THREE.AnimationMixer(m), act = {}; T.clips.forEach((c) => (act[c.name] = mixer.clipAction(c)));
    for (const n of ["Wave", "Yes", "No"]) if (act[n]) { act[n].setLoop(THREE.LoopOnce, 1); act[n].clampWhenFinished = true; }
    const c = { g, m, mixer, act, cur: null, back: 0, human: true };
    zAct(c, "Idle", 0);
    return c;
  }
  function spawnCustomer() { const c = spawnHuman("customer", S.counter.x - 0.4, S.counter.z - 0.75); gesture(c, "Wave"); return c; }
  function gesture(c, name) { if (!c || !c.act[name]) return; c.cur = null; zAct(c, name, 0.15); c.back = c.act[name].getClip().duration * 0.9; }
  const STOPW = new Set(["the", "and", "edition", "remastered", "remaster", "definitive", "deluxe", "complete", "collection", "game", "year", "goty", "for", "with", "from"]);
  function vague(g) {
    let d = g.d || "";
    const words = (g.t || "").split(/[^A-Za-z0-9]+/).filter((w) => w.length > 2 && !STOPW.has(w.toLowerCase()));
    for (const w of words) d = d.replace(new RegExp(`\\b${w}\\w*`, "gi"), "____");
    return d;
  }
  const findStats = () => `<span>Time<b>${mmss(MG.t)}</b></span><span>Wrong picks<b>${MG.wrong}</b></span>`;
  function startFind() {
    endMG(); if (P.held) putBack();
    const ok = (it) => it.g.d && it.g.d.length > 60 && vague(it.g).split("____").join("").split(/\s+/).length > 8;
    let pool = S.list.filter((it) => ok(it) && (it.g.m || 0) >= 72); if (pool.length < 5) pool = S.list.filter(ok);
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (!it) { say("Nobody's waiting right now", 1500); return; }
    ding(); loadHuman("customer");
    MG = { kind: "find", g: it.g, sec: it.sec, t: 0, wrong: 0, hints: 0, done: false, customer: null };
    document.body.classList.add("mg"); hideHint(); findText();
  }
  function findText() {
    const g = MG.g, hints = [];
    if (MG.hints > 0 && g.y) hints.push(`It came out in ${g.y}.`);
    if (MG.hints > 1) hints.push(`It's in the ${MG.sec} section.`);
    if (MG.hints > 2) hints.push(`The title starts with ${g.t[0]}.`);
    mgShow("Find the game", `A customer can't remember the name. Here's how they describe it: <q>${esc(vague(g))}</q>` +
      (hints.length ? `<small>${esc(hints.join(" "))}</small>` : `<small>Pick up the box when you find it.</small>`), findStats(), [["Give up", findGiveUp]]);
  }
  function tickFind(dt) {
    const c = MG.customer;
    if (!c && humanReady("customer")) MG.customer = spawnCustomer();
    if (c) { c.mixer.update(dt); if (c.back > 0 && (c.back -= dt) <= 0) zAct(c, "Idle", 0.3); }
    if (MG.done) return;
    const before = Math.floor(MG.t); MG.t += dt;
    const at = [25, 50, 80];
    if (MG.hints < 3 && MG.t > at[MG.hints]) { MG.hints++; findText(); say("Here's another clue", 1200); }
    else if (Math.floor(MG.t) !== before) $("mgstats").innerHTML = findStats();
  }
  function findCheck(g) {
    if (g.id === MG.g.id) {
      MG.done = true; ding(); sfx("power", 0.6); gesture(MG.customer, "Yes");
      const score = Math.max(100, 1000 - Math.floor(MG.t) * 6 - MG.wrong * 100 - MG.hints * 100), best = mgBest("find");
      if (score > best) mgSave("find", score);
      $("mg").hidden = true;
      mgOver("That's the one", `${g.t}, found in ${mmss(MG.t)}${MG.wrong ? ` after ${MG.wrong} wrong ${MG.wrong === 1 ? "pick" : "picks"}` : ""}. Score ${score}.` + (score > best && best ? " That's a new best." : best ? ` Your best is ${best}.` : ""),
        "Serve another", startFind);
    } else { MG.wrong++; say("Not that one", 1000); gesture(MG.customer, "No"); $("mgstats").innerHTML = findStats(); }
  }
  function findGiveUp() {
    MG.done = true; const i = S.starts.findIndex((s) => s.name === MG.sec);
    mgShow("Find the game", `It was <b>${esc(MG.g.t)}</b>, in the ${esc(MG.sec)} section.`, "", [["Show me", () => { if (i >= 0) goSection(i); }], ["Serve another", startFind], ["Done", endMG]]);
  }
  function tickMG(dt) { if (MG) (MG.kind === "pop" ? tickPop : tickFind)(dt); }

  // ---------- stock switching and sections ----------
  $("wallstock").hidden = !fromWall;
  document.querySelectorAll("[data-stock]").forEach((b) => b.addEventListener("click", () => {
    if (b.getAttribute("aria-pressed") === "true") return;
    if (P.watch) leaveTV();
    if (P.held) { P.held = null; $("card").hidden = true; }
    endMG(); if (night.on) lightsOn();
    build(b.dataset.stock);
  }));
  function setQuality(name, auto) {
    qName = name; Q = QUALITY[name];
    renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr)); size();
    if (!night.on) { scene.fog.near = Q.fog[0]; scene.fog.far = Q.fog[1]; }
    S.lights.forEach((p, i) => (p.visible = i < Q.lights));
    loadNear();
    if (auto) say("Switched to lighter graphics so it moves smoothly", 2200);
  }
  $("qualsel").value = qPick;
  // browsers only allow sound after a tap or key press, so the first one starts it
  for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, audioStart, true);
  $("snd").addEventListener("click", () => setSound(!SND.on));
  setSound(SND.on);
  $("qualsel").addEventListener("change", (e) => {
    qPick = e.target.value; try { localStorage.setItem("psplus-shop-quality", qPick); } catch (x) {}
    setQuality(qPick === "auto" ? (slowDevice ? "lite" : "full") : qPick);
  });
  $("secsel").addEventListener("change", (e) => { if (e.target.value !== "") { if (P.held) putBack(); goSection(+e.target.value); } e.target.value = ""; });
  if (location.hash.includes("debug")) window.__store = { P, night, ZT, SND, cam: camera, V2: THREE.Vector2, V3: THREE.Vector3, mg: () => MG, pick, mouth: () => (MG && MG.clerk ? mouthOf(MG.clerk).toArray() : null), mark: (x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: "#ff00ff", depthTest: false })); m.renderOrder = 9; m.position.set(x, y, z); scene.add(m); return m; }, startPop, startFind, MOUTH, popDown, popThrow, spawn: (x, z, b) => night.zombies.push(makeZombie(x, z, b)), shoot, lightsOut, lightsOn, shop: () => S, goSection, mem: () => ({ loaded, q: qName, tex: renderer.info.memory.textures, sheets: sheetState.filter((x) => x === 2).length, filled: S.boxes.filter((b) => b.material[4] !== M.blank).length, boxes: S.boxes.length }) };

  // ---------- frame loop ----------
  build(fromWall && new URLSearchParams(location.search).get("from") === "wall" ? "wall" : "all");
  size();
  camera.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  let last = performance.now(), frame = 0;
  const perf = { t: 0, n: 0 };
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    if (!P.watch && !P.held && !night.over && !(MG && MG.kind === "pop")) move(dt, night.on ? (night.fx.ff > 0 ? 4.6 : 3.1) : 2.6);
    const k = CALM ? 1 : Math.min(1, dt * (P.watch ? 4 : 14));
    const walking = keys.size || stick.x || stick.y;
    const bob = CALM || !walking ? 0 : Math.sin(now / 130) * 0.018;
    camera.position.x += (P.x - camera.position.x) * k; camera.position.z += (P.z - camera.position.z) * k;
    const ty = P.watch ? TVY : EYE + bob;
    camera.position.y = P.watch || Math.abs(camera.position.y - EYE) > 0.06 ? camera.position.y + (ty - camera.position.y) * k : ty;
    let dy = P.yaw - camera.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camera.rotation.set(camera.rotation.x + (P.pitch - camera.rotation.x) * k, camera.rotation.y + dy * k, 0, "YXZ");
    camera.updateMatrixWorld();
    EAR.x = camera.position.x; EAR.z = camera.position.z; EAR.yaw = camera.rotation.y;
    for (let i = anim.length - 1; i >= 0; i--) {
      const a = anim[i]; a.t = Math.min(1, a.t + (dt * 1000) / a.dur); const e = ease(a.t);
      a.m.position.lerpVectors(a.fromP, a.toP, e);
      if (a.m === P.held && a.t > 0.2) a.m.position.y += Math.sin(e * Math.PI) * 0.06;
      a.m.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      if (a.t >= 1) anim.splice(i, 1);
    }
    if (frame % 12 === 0) loadNear();
    // auto quality: if the frame rate struggles for a few seconds on "full", step down to "lite"
    if (qPick === "auto" && qName === "full") {
      perf.t += dt; perf.n++;
      if (perf.t > 4) { if (perf.t / perf.n > 1 / 30) setQuality("lite", true); perf.t = perf.n = 0; }
    }
    if (night.on) {
      tickNight(dt);
      if (!CALM && frame % 7 === 0) S.lights.forEach((p, i) => { if (i % 2 === 0) p.intensity = Math.random() < 0.15 ? 0.5 : 4; });
    }
    tickStreet(dt, now); tickMG(dt);
    if (document.body.classList.contains("held") !== !!P.held) document.body.classList.toggle("held", !!P.held);
    S.btnMat.emissiveIntensity = night.on && !CALM ? 0.55 + 0.45 * Math.sin(now / 160) : 0.25;
    if (!$("tv").hidden && watchScreen) placeVideo();
    if (frame % 3 === 0 && !CALM) drawStatic();
    renderer.render(scene, camera);
  });
  drawStatic();
  $("loading").hidden = true;
}

start().catch((e) => { $("loading").textContent = "The shop couldn't open its 3D view on this device: " + (e && e.message ? e.message : e); });
