// Wall of PS Plus: the shop. Source for store/store.js (build: see tools/store/README.md).
// A whole rental store you can walk around: rows of double-sided shelves stocked by genre, TVs hanging from
// the ceiling, a counter by the door. Stocked with every game, or with what the wall was showing (the wall
// leaves their ids in sessionStorage). Pick up a box to read the back or watch its trailer on the nearest TV.
// After hours (the staff light switch behind the counter) it turns into a shooter: the dead clerks roam the
// aisles and you throw game cases at them, with popcorn for health and a few tapes that do odd things.
import * as THREE from "three/webgpu";

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
  const [raw, boxList, artList, VIDS] = await Promise.all([get("../data/games.json"), get("../data/box.json").catch(() => []),
    get("../data/art.json").catch(() => []), get("../data/videos.json").catch(() => ({}))]);
  const GAMES = (Array.isArray(raw) ? raw : raw.games || []).filter((g) => !g.gone && g.t);
  const BYID = new Map(GAMES.map((g) => [g.id, g]));
  const BOX = new Set(Array.isArray(boxList) ? boxList : []), ART = new Set(Array.isArray(artList) ? artList : []);
  let fromWall = null;
  try { const j = JSON.parse(sget("psplus-store") || "null"); if (j && Array.isArray(j.ids) && j.ids.length) fromWall = { ids: j.ids.filter((id) => BYID.has(id)), label: String(j.label || "") }; } catch (e) {}
  if (fromWall && !fromWall.ids.length) fromWall = null;
  try { await Promise.all(["96px Bungee", "800 38px Archivo", "44px 'Permanent Marker'", "40px VT323"].map((f) => document.fonts.load(f))); } catch (e) {}

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: location.hash.includes("webgl") });
  await renderer.init();
  $("engine").textContent = renderer.backend && renderer.backend.isWebGPUBackend ? "Drawn with WebGPU" : "Drawn with WebGL";
  renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.75 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  $("stage").appendChild(renderer.domElement);
  const el = renderer.domElement;

  const scene = new THREE.Scene();
  const BG = new THREE.Color("#0d1230"), BG_NIGHT = new THREE.Color("#07020a");
  scene.background = BG.clone(); scene.fog = new THREE.Fog("#0d1230", 10, 26);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.05, 60);
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

  // ---------- the shop (rebuilt when the stock changes) ----------
  let S = null;   // the current shop: group, boxes, obstacles, grid, tvs...
  const loader = new THREE.TextureLoader();
  function coverTex(g) {
    const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const url = BOX.has(g.id) ? `../box/${encodeURIComponent(g.id)}.webp` : ART.has(g.id) ? `../art/${encodeURIComponent(g.id)}.webp` : "";
    if (url) loader.load(url, (tx) => { t.image = tx.image; if (!BOX.has(g.id)) { t.repeat.set(0.75, 1); t.offset.set(0.125, 0); } t.needsUpdate = true; });
    return t;
  }
  function build(kind) {
    if (S) { scene.remove(S.group); S.dispose.forEach((d) => d.dispose()); S.boxes.forEach((m) => m.material.forEach((mt, k) => { if (k >= 4 && mt !== M.blank) { mt.map && mt.map.dispose(); mt.dispose(); } })); }
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
    mg.plane(M.wall, halfW * 2, CEIL, 0, CEIL / 2, zBack, 0); mg.plane(M.wall, halfW * 2, CEIL, 0, CEIL / 2, zFront, Math.PI);
    mg.plane(M.wall, zFront - zBack, CEIL, -halfW, CEIL / 2, (zBack + zFront) / 2, Math.PI / 2); mg.plane(M.wall, zFront - zBack, CEIL, halfW, CEIL / 2, (zBack + zFront) / 2, -Math.PI / 2);
    // light strips over every aisle
    for (let i = 0; i <= C; i++) { const x = (i - C / 2) * PX; for (let z = zBack + 1.5; z < zFront - 1; z += 1.6) mg.box(M.strip, 0.14, 0.03, 1.0, x, CEIL - 0.02, z); }
    // gondolas: row 0 at the front, row 1 at the back
    const gx = (i) => (i - (C - 1) / 2) * PX;
    let k = 0;
    for (let row = 0; row < 2; row++) for (let i = 0; i < C; i++) {
      const x = gx(i), z = row === 0 ? ROWZ : -ROWZ;
      mg.box(M.wood, 0.06, 2.2, GL, x, 1.1, z);
      for (const end of [-1, 1]) mg.box(M.wood, GD, 2.2, 0.06, x, 1.1, z + end * GL / 2);
      for (const y of [0.06, ...SHELF_Y.map((v) => v - 0.01)]) { mg.box(M.wood, GD, 0.04, GL, x, y, z); for (const s of [-1, 1]) mg.box(M.edge, 0.02, 0.05, GL, x + s * (GD / 2 - 0.01), y + 0.01, z); }
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
          const b = new THREE.Mesh(M.boxGeo, [M.plastic, M.plastic, M.plastic, M.plastic, M.blank, backMat]);
          // read left to right as you face the shelf
          const along = (c - (COLS - 1) / 2) * SP * (s > 0 ? -1 : 1);
          b.position.set(x + s * 0.2, SHELF_Y[ROWS - 1 - r] + BH / 2 + 0.012, z + along);
          b.rotation.set(0, s * Math.PI / 2, 0, "YXZ"); b.rotateX(-0.1);
          b.userData = { g: it.g, home: { p: b.position.clone(), q: b.quaternion.clone() }, backMat, loaded: false };
          group.add(b); boxes.push(b);
        });
      }
      // end caps say what's in the aisles on each side
      for (const end of [-1, 1]) {
        const lf = faces[faces.length - 2].names, rt = faces[faces.length - 1].names;
        const txt = [...new Set([...lf, ...rt])].slice(0, 3).join(" · ") || "Empty";
        const tx = own(sign(txt.toUpperCase(), null, 1024, 180));
        const m = new THREE.Mesh(own(new THREE.PlaneGeometry(GD + 0.3, 0.2)), own(new THREE.MeshBasicMaterial({ map: tx })));
        m.position.set(x, 2.3, z + end * (GL / 2 + 0.04)); m.rotation.y = end > 0 ? 0 : Math.PI; group.add(m);
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
    // the counter by the door, the staff light switch on the wall behind it, and the staff doors at the back
    const cx = halfW - 2.0, cz = zFront - 3.2;
    mg.box(M.counter, 2.6, 1.0, 0.7, cx - 0.4, 0.5, cz); mg.box(M.edge, 2.64, 0.04, 0.74, cx - 0.4, 1.02, cz);
    mg.box(M.counter, 0.7, 1.0, 1.6, cx + 1.25, 0.5, cz + 0.45);
    mg.box(M.tv, 0.42, 0.3, 0.34, cx - 0.9, 1.19, cz);
    obstacles.push({ x0: cx - 1.7, x1: cx + 1.6, z0: cz - 0.35, z1: cz + 1.25 });
    const sw = new THREE.Group(); sw.position.set(halfW - 0.02, 1.35, cz + 1.6); sw.rotation.y = -Math.PI / 2;
    const plate = new THREE.Mesh(own(new THREE.BoxGeometry(0.14, 0.2, 0.02)), own(new THREE.MeshStandardMaterial({ color: "#e8e4d8", roughness: 0.5 })));
    const lever = new THREE.Mesh(own(new THREE.BoxGeometry(0.035, 0.08, 0.04)), own(new THREE.MeshStandardMaterial({ color: "#f7f3e6" }))); lever.position.set(0, 0.02, 0.02);
    const staffTx = own(canvasTex(256, 96, (x, w, h) => { x.fillStyle = "#b3261e"; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.font = "30px Bungee, sans-serif"; x.textAlign = "center"; x.fillText("STAFF ONLY", w / 2, 40); x.font = "600 22px Archivo, sans-serif"; x.fillText("Lights: do not touch", w / 2, 76); }));
    const staff = new THREE.Mesh(own(new THREE.PlaneGeometry(0.36, 0.135)), own(new THREE.MeshBasicMaterial({ map: staffTx }))); staff.position.set(0, 0.22, 0.012);
    sw.add(plate, lever, staff); group.add(sw);
    const doors = [-halfW + 2.4, halfW - 2.4].map((x) => { mg.box(M.door, 1.1, 2.1, 0.06, x, 1.05, zBack + 0.03); return { x, z: zBack + 0.6 }; });
    const doorTx = own(sign("STAFF ROOM", null, 512, 128, "#5a1d24"));
    for (const d of doors) { const m = new THREE.Mesh(own(new THREE.PlaneGeometry(0.9, 0.22)), own(new THREE.MeshBasicMaterial({ map: doorTx }))); m.position.set(d.x, 2.3, zBack + 0.07); group.add(m); }
    const shopTx = own(sign("WALL OF PS PLUS", "Rentals and recommendations"));
    const shop = new THREE.Mesh(own(new THREE.PlaneGeometry(3.4, 0.85)), own(new THREE.MeshBasicMaterial({ map: shopTx }))); shop.position.set(0, 2.3, zBack + 0.03); group.add(shop);
    const outTx = own(sign("EXIT", null, 256, 96, "#1d6b3a"));
    const out = new THREE.Mesh(own(new THREE.PlaneGeometry(0.5, 0.19)), own(new THREE.MeshBasicMaterial({ map: outTx }))); out.position.set(-halfW + 2, 2.4, zFront - 0.03); out.rotation.y = Math.PI; group.add(out);
    const before = group.children.length;
    mg.build(group); group.children.slice(before).forEach((c) => dispose.push(c.geometry));
    // a few warm lights, over the aisles
    const lights = [];
    for (const [x, z] of [[gx(0) - PX / 2, 0], [0, 0], [gx(C - 1) + PX / 2, 0], [0, ROWZ], [0, -ROWZ], [cx, cz]]) { const p = new THREE.PointLight("#fff4dc", 3, 9, 1.4); p.position.set(x, CEIL - 0.3, z); group.add(p); lights.push(p); }
    scene.add(group);

    // walkable grid for the zombies
    const cell = 0.5, gw = Math.ceil((halfW * 2) / cell), gh = Math.ceil((zFront - zBack) / cell);
    const blocked = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = -halfW + (i + 0.5) * cell, z = zBack + (j + 0.5) * cell;
      if (x < -halfW + 0.35 || x > halfW - 0.35 || z < zBack + 0.35 || z > zFront - 0.35 || obstacles.some((o) => x > o.x0 - 0.3 && x < o.x1 + 0.3 && z > o.z0 - 0.3 && z < o.z1 + 0.3)) blocked[j * gw + i] = 1;
    }
    S = { group, dispose, boxes, obstacles, tvs, faces, starts, list, halfW, zBack, zFront, lights, lever, switchObjs: [plate, lever, staff], doors,
      grid: { cell, gw, gh, blocked, dist: new Int32Array(gw * gh) }, counter: { x: cx, z: cz } };
    $("secsel").innerHTML = `<option value="">Go to a section…</option>` + starts.map((s, i) => `<option value="${i}">${esc(s.name)} (${s.n})</option>`).join("");
    $("stocknote").textContent = kind === "wall" ? (fromWall.label ? `Stocked from your wall: ${fromWall.label}` : "Stocked from your wall's filters") : `Every game, ${GAMES.length} in all, shelved by genre`;
    document.querySelectorAll("[data-stock]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stock === kind)));
    P.x = C % 2 ? PX / 2 : 0; P.z = zFront - 1.6; P.yaw = 0; P.pitch = -0.05;   // start in the middle aisle, by the door
    camera.position.set(P.x, EYE, P.z);
    loadNear(true);
    if (night.on) nightLights(true);
  }
  function loadNear(all) {
    // covers load as you walk up to them; far boxes are hidden (the fog hides them anyway)
    for (const b of S.boxes) {
      const d = Math.hypot(b.position.x - P.x, b.position.z - P.z);
      b.visible = d < 19 || b === P.held;
      if (!b.userData.loaded && d < (all ? 8 : 10)) { b.userData.loaded = true; b.material = b.material.slice(); b.material[4] = new THREE.MeshStandardMaterial({ map: coverTex(b.userData.g), roughness: 0.32 }); }
    }
  }
  function goSection(i) {
    // stand in the aisle in front of the shelf where the section starts, facing it
    const s = S.starts[i]; if (!s) return;
    const face = S.faces[Math.floor(s.at / PER_FACE)];
    const c = (s.at % PER_FACE) % COLS, along = (c - (COLS - 1) / 2) * SP * (face.s > 0 ? -1 : 1);
    P.x = face.x; P.z = face.z + along; P.yaw = face.s > 0 ? Math.PI / 2 : -Math.PI / 2; P.pitch = -0.12;
    camera.position.set(P.x, EYE, P.z); hideHint(); loadNear(true);
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
    if (!blockedAt(P.x + dx, P.z)) P.x += dx;
    if (!blockedAt(P.x, P.z + dz)) P.z += dz;
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
    if (e.pointerType === "touch" && e.clientX - r.left < r.width * 0.42 && e.clientY - r.top > r.height * 0.45 && stick.id === null && !P.held && !P.watch) {
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
      const k = $("stick"); k.style.left = e.clientX - 50 + "px"; k.style.top = e.clientY - 50 + "px"; k.hidden = false; $("knob").style.transform = "";
      el.setPointerCapture(e.pointerId); return;
    }
    if (locked()) { if (night.on) shoot(); return; }
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; el.setPointerCapture(e.pointerId);
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
    if (!tap || P.watch) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (night.on) { if (!TOUCH && !locked() && !night.over) el.requestPointerLock?.(); shoot(ndc.clone()); return; }
    ray.setFromCamera(ndc, camera);
    const sw = ray.intersectObjects(S.switchObjs, false)[0];
    if (sw && sw.distance < 4) { lightsOut(); return; }
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
    if (!m.userData.loaded) { m.userData.loaded = true; m.material = m.material.slice(); m.material[4] = new THREE.MeshStandardMaterial({ map: coverTex(m.userData.g), roughness: 0.32 }); }
    if (!m.userData.backMat.map) { m.userData.backMat.map = boxBack(m.userData.g); m.userData.backMat.color.set("#ffffff"); m.userData.backMat.needsUpdate = true; }
    P.held = m; P.flipped = false;
    const { p, q } = heldPose(false); animate(m, p, q);
    showCard(m.userData.g); tvLabel = ["CH 3", "WATCH ON THE TV?"];
  }
  function flip() { if (!P.held) return; P.flipped = !P.flipped; const { p, q } = heldPose(P.flipped); animate(P.held, p, q, 520); $("flip").textContent = P.flipped ? "Turn to the front" : "Turn it over"; }
  function putBack() { const m = P.held; if (!m) return; P.held = null; animate(m, m.userData.home.p.clone(), m.userData.home.q.clone()); $("card").hidden = true; tvLabel = ["CH 3", "PICK UP A BOX"]; }
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
    P.held = null; animate(m, m.userData.home.p.clone(), m.userData.home.q.clone(), 500);
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
  function makeZombie(x, z, boss) {
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
    if (P.held) putBack();
    Object.assign(night, { on: true, over: false, t: 0, score: 0, floored: 0, hp: 10, cool: 0, hurt: 0, nextSpawn: 2.5, nextPick: 6, nextManager: 45, fx: { ff: 0, set: 0, rew: 0 } });
    S.lever.rotation.x = 0.9; nightLights(true);
    $("card").hidden = true; $("hud").hidden = false; $("over").hidden = true; document.body.classList.add("night");
    tvLabel = ["CH 13", "THEY'RE BACK"]; hideHint();
    say(TOUCH ? "The dead clerks are back. Walk with the stick, look by dragging, tap to throw a case." : "The dead clerks are back. WASD to move, click to aim with the mouse and throw. Esc lets go of the mouse.", 5000);
    hud();
  }
  function nightLights(on) {
    hemi.intensity = on ? 0.16 : 1.35; hemi.color.set(on ? "#ff8a7a" : "#fff6e8"); sun.intensity = on ? 0.12 : 0.9;
    S.lights.forEach((p, i) => { p.color.set(on ? "#ff2a2a" : "#fff4dc"); p.intensity = on ? (i % 2 ? 0.6 : 4) : 3; });
    M.strip.color.set(on ? "#2a0808" : "#fffbe8");
    scene.background.copy(on ? BG_NIGHT : BG); scene.fog.color.copy(on ? BG_NIGHT : BG); scene.fog.near = on ? 3 : 10; scene.fog.far = on ? 15 : 26;
  }
  function clearNight() {
    night.zombies.forEach((z) => scene.remove(z.g)); night.zombies = [];
    night.cases.forEach((c) => { scene.remove(c.m); c.m.material[4].dispose(); }); night.cases = [];
    night.pickups.forEach((p) => scene.remove(p.m)); night.pickups = [];
  }
  function lightsOn() {
    night.on = false; night.over = false; clearNight();
    if (locked()) document.exitPointerLock();
    S.lever.rotation.x = 0; nightLights(false);
    $("hud").hidden = true; $("over").hidden = true; $("fx").textContent = ""; document.body.classList.remove("night");
    tvLabel = ["CH 3", "PICK UP A BOX"];
  }
  const caseGeo = new THREE.BoxGeometry(BW * 0.9, BH * 0.9, 0.04);
  const caseTex = [];
  function shoot(at) {
    if (!night.on || night.over || night.t < night.cool) return;
    night.cool = night.t + (night.fx.ff > 0 ? 0.16 : 0.24);
    ray.setFromCamera(at || new THREE.Vector2(0, 0), camera);
    const spread = night.fx.set > 0 ? [-0.09, 0, 0.09] : [0];
    for (const a of spread) {
      if (caseTex.length < 24) { const g = S.list.length ? S.list[Math.floor(Math.random() * S.list.length)].g : GAMES[0]; caseTex.push(coverTex(g)); }
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
    night.over = true; if (locked()) document.exitPointerLock();
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
    night.hp--; night.hurt = night.t + 0.8; hud();
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
    if ((night.nextSpawn -= dt) <= 0 && alive < cap) {
      const doors = [...S.doors, { x: -S.halfW + 2, z: S.zFront - 0.6 }].filter((d) => Math.hypot(d.x - P.x, d.z - P.z) > 5);
      const d = doors[Math.floor(Math.random() * doors.length)] || S.doors[0];
      const boss = night.t > night.nextManager; if (boss) { night.nextManager = night.t + 45; say("The manager's here", 1800); }
      night.zombies.push(makeZombie(d.x + rnd(-0.3, 0.3), d.z, boss));
      night.nextSpawn = Math.max(0.7, 3 - night.t / 45) * rnd(0.7, 1.3);
    }
    if ((night.nextPick -= dt) <= 0 && night.pickups.length < 4) {
      const spot = freeSpot(4); if (spot) { const kinds = ["pop", "pop", "ff", "rew", "set"]; night.pickups.push(makePickup(kinds[Math.floor(Math.random() * kinds.length)], spot[0], spot[1])); }
      night.nextPick = rnd(8, 14);
    }
    const frozen = night.fx.rew > 0;
    for (const z of night.zombies) {
      if (z.dead) { z.dead += dt; z.g.rotation.x = -Math.min(Math.PI / 2, z.dead * 3); if (z.dead > 0.8) z.g.position.y -= dt * 0.5; continue; }
      if (z.rise > 0) { z.rise = Math.max(0, z.rise - dt); z.g.position.y = -z.rise * 1.2; }
      if (z.flash > 0) { z.flash -= dt; if (z.flash <= 0) z.parts.forEach((p) => { if (p.userData.mat) p.material = p.userData.mat; }); }
      if (frozen) continue;
      z.phase += dt * 3 * z.speed;
      const sw = Math.sin(z.phase);
      z.lL.rotation.x = sw * 0.5; z.lR.rotation.x = -sw * 0.5; z.aL.rotation.x = -0.1 + Math.sin(z.phase * 0.7) * 0.15; z.aR.rotation.x = -0.1 - Math.sin(z.phase * 0.7) * 0.15;
      z.head.rotation.z = Math.sin(z.phase * 0.3) * 0.25;
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
    night.zombies = night.zombies.filter((z) => { if (z.dead > 2.2) { scene.remove(z.g); return false; } return true; });
    for (let i = night.cases.length - 1; i >= 0; i--) {
      const c = night.cases[i]; c.life -= dt;
      c.vel.y -= 9.8 * 0.5 * dt; c.m.position.addScaledVector(c.vel, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      const q = c.m.position;
      let hit = null;
      for (const z of night.zombies) {
        if (z.dead || z.rise > 0.2) continue;
        const s = z.boss ? 1.25 : 1, p = z.g.position;
        if (Math.hypot(q.x - p.x, q.z - p.z) < 0.36 * s && q.y > 0.1 && q.y < 1.95 * s) { hit = z; break; }
      }
      if (hit) {
        hit.hp--; hit.flash = 0.1; hit.parts.forEach((p) => { if (p.material !== zM.eye) { p.userData.mat = p.userData.mat || p.material; p.material = zM.flash; } });
        const l = Math.hypot(c.vel.x, c.vel.z) || 1; hit.kx = c.vel.x / l; hit.kz = c.vel.z / l; hit.knock = hit.boss ? 0.4 : 1;
        night.score += 10;
        if (hit.hp <= 0) { hit.dead = 0.001; night.floored++; night.score += hit.boss ? 500 : 100; hit.parts.forEach((p) => { if (p.userData.mat) p.material = p.userData.mat; }); }
        hud();
      }
      const wall = Math.abs(q.x) > S.halfW - 0.1 || q.z < S.zBack + 0.1 || q.z > S.zFront - 0.1 || S.obstacles.some((o) => q.x > o.x0 && q.x < o.x1 && q.z > o.z0 && q.z < o.z1 && q.y < 2.2);
      if (hit || wall || c.life <= 0 || q.y < 0.03) { scene.remove(c.m); c.m.material[4].dispose(); night.cases.splice(i, 1); }
    }
    for (let i = night.pickups.length - 1; i >= 0; i--) {
      const p = night.pickups[i]; p.m.rotation.y += dt * 2; p.m.position.y = 0.55 + Math.sin((night.t - p.born) * 3) * 0.08;
      if (Math.hypot(p.m.position.x - P.x, p.m.position.z - P.z) < 0.7) {
        if (p.kind === "pop") night.hp = Math.min(10, night.hp + 3); else night.fx[p.kind] = p.kind === "rew" ? 4 : 9;
        night.score += 25; say(PICKS[p.kind].say, 1500); scene.remove(p.m); night.pickups.splice(i, 1);
      } else if (night.t - p.born > 30) { scene.remove(p.m); night.pickups.splice(i, 1); }
    }
    if (Math.floor(night.t * 4) !== Math.floor((night.t - dt) * 4)) hud();
  }

  // ---------- stock switching and sections ----------
  $("wallstock").hidden = !fromWall;
  document.querySelectorAll("[data-stock]").forEach((b) => b.addEventListener("click", () => {
    if (b.getAttribute("aria-pressed") === "true") return;
    if (P.watch) leaveTV();
    if (P.held) { P.held = null; $("card").hidden = true; }
    if (night.on) lightsOn();
    build(b.dataset.stock);
  }));
  $("secsel").addEventListener("change", (e) => { if (e.target.value !== "") { if (P.held) putBack(); goSection(+e.target.value); } e.target.value = ""; });
  if (location.hash.includes("debug")) window.__store = { P, night, lightsOut, lightsOn, shop: () => S, goSection };

  // ---------- frame loop ----------
  build(fromWall && new URLSearchParams(location.search).get("from") === "wall" ? "wall" : "all");
  size();
  camera.rotation.set(P.pitch, P.yaw, 0, "YXZ");
  let last = performance.now(), frame = 0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    if (!P.watch && !P.held && !night.over) move(dt, night.on ? (night.fx.ff > 0 ? 4.6 : 3.1) : 2.6);
    const k = CALM ? 1 : Math.min(1, dt * (P.watch ? 4 : 14));
    const walking = keys.size || stick.x || stick.y;
    const bob = CALM || !walking ? 0 : Math.sin(now / 130) * 0.018;
    camera.position.x += (P.x - camera.position.x) * k; camera.position.z += (P.z - camera.position.z) * k;
    const ty = P.watch ? TVY : EYE + bob;
    camera.position.y = P.watch || Math.abs(camera.position.y - EYE) > 0.06 ? camera.position.y + (ty - camera.position.y) * k : ty;
    let dy = P.yaw - camera.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camera.rotation.set(camera.rotation.x + (P.pitch - camera.rotation.x) * k, camera.rotation.y + dy * k, 0, "YXZ");
    camera.updateMatrixWorld();
    for (let i = anim.length - 1; i >= 0; i--) {
      const a = anim[i]; a.t = Math.min(1, a.t + (dt * 1000) / a.dur); const e = ease(a.t);
      a.m.position.lerpVectors(a.fromP, a.toP, e);
      if (a.m === P.held && a.t > 0.2) a.m.position.y += Math.sin(e * Math.PI) * 0.06;
      a.m.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      if (a.t >= 1) anim.splice(i, 1);
    }
    if (frame % 12 === 0) loadNear(false);
    if (night.on) {
      tickNight(dt);
      if (!CALM && frame % 7 === 0) S.lights.forEach((p, i) => { if (i % 2 === 0) p.intensity = Math.random() < 0.15 ? 0.5 : 4; });
    }
    if (!$("tv").hidden && watchScreen) placeVideo();
    if (frame % 3 === 0 && !CALM) drawStatic();
    renderer.render(scene, camera);
  });
  drawStatic();
  $("loading").hidden = true;
}

start().catch((e) => { $("loading").textContent = "The shop couldn't open its 3D view on this device: " + (e && e.message ? e.message : e); });
