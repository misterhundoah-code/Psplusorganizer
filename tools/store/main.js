// Wall of PS Plus: walk the aisles. Source for store/store.js (build: see tools/store/README.md).
// The shop is stocked from data/games.json, one aisle at a time: either every game in fixed genre aisles,
// or the games the wall was showing (the wall leaves their ids in sessionStorage when you switch to the store).
// Pick up a box to read the back or watch its trailer on the TV. And after hours, the clerks come back.
import * as THREE from "three/webgpu";

const $ = (id) => document.getElementById(id);
const CALM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BLUE = "#1E3A9E", YELLOW = "#FFC925", INK = "#141a33";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hrs = (h) => (h ? (h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)) + " h" : "");
const plat = (g) => g.sys || (g.p || []).join(", ");
const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
const store = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };

// Aisles: a game goes in the first aisle whose genres it has. Big aisles are split into parts.
const AISLES = [
  ["JRPGs", ["JRPG"]], ["Horror", ["Horror", "Survival"]], ["Roguelikes and Metroidvanias", ["Roguelike", "Metroidvania", "Soulslike"]],
  ["Fighting", ["Fighting"]], ["Racing", ["Racing"]], ["Sports", ["Sports"]], ["Family and party", ["Family", "Party"]],
  ["Shooters", ["Shooter"]], ["Strategy and sims", ["Strategy", "Simulation"]], ["Puzzle", ["Puzzle"]], ["Platformers", ["Platformer"]],
  ["RPGs", ["RPG"]], ["Adventure and story", ["Adventure", "Narrative"]], ["Open world", ["Open World"]], ["Arcade", ["Arcade"]],
  ["Action and stealth", ["Hack & Slash", "Stealth", "Action", "Other"]],
];
const COLS_MAX = 12, ROWS = 4, PER_AISLE = COLS_MAX * ROWS * 2;
const BW = 0.3, BH = 0.4, SPACING = 0.52, AISLE = 1.45;
const SHELF_Y = [0.26, 0.76, 1.26, 1.76];
const STAND_H = 0.78, SW = 0.78, SH = 0.585, SCREEN_Y = STAND_H + 0.06 + 0.33;

// ---------- canvas textures ----------
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
const carpet = () => canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = "#1a2350"; x.fillRect(0, 0, w, h);
  const cols = [YELLOW, "#4FA3FF", "#FF5C7A", "#7CE0B5"]; let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = cols[i % 4]; x.lineWidth = 5; x.lineCap = "round";
    const px = rnd() * w, py = rnd() * h, r = 10 + rnd() * 14, a = rnd() * 6.28;
    x.beginPath();
    if (i % 3 === 0) x.arc(px, py, r * 0.5, a, a + 3.6);
    else if (i % 3 === 1) { x.moveTo(px, py); x.quadraticCurveTo(px + r, py - r, px + 2 * r, py); }
    else { x.fillStyle = cols[i % 4]; x.arc(px, py, 4, 0, 6.28); x.fill(); continue; }
    x.stroke();
  }
});
const sign = (text, sub, w = 1024, h = 256) => canvasTex(w, h, (x) => {
  x.fillStyle = BLUE; x.fillRect(0, 0, w, h);
  x.fillStyle = YELLOW; x.fillRect(0, 0, w, 18); x.fillRect(0, h - 18, w, 18);
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  let size = sub ? 100 : 120; x.font = `${size}px Bungee, "Arial Black", sans-serif`;
  while (x.measureText(text).width > w - 60 && size > 40) { size -= 6; x.font = `${size}px Bungee, "Arial Black", sans-serif`; }
  x.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 6);
  if (sub) { x.font = `600 38px Archivo, system-ui, sans-serif`; x.fillStyle = YELLOW; x.fillText(sub, w / 2, h * 0.78); }
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
const tag = (text) => canvasTex(256, 96, (x, w, h) => {
  x.fillStyle = YELLOW; x.fillRect(0, 0, w, h); x.fillStyle = INK; x.font = "26px Bungee, sans-serif"; x.textAlign = "center";
  x.fillText("HI, I'M", w / 2, 36); x.font = "34px 'Permanent Marker', cursive"; x.fillText(text, w / 2, 78);
});

// ---------- stock ----------
function shelve(games, keepOrder) {
  const buckets = AISLES.map(([name, gs]) => ({ name, gs, games: [] }));
  for (const g of games) {
    const b = buckets.find((b) => b.gs.some((x) => (g.g || []).includes(x))) || buckets[buckets.length - 1];
    b.games.push(g);
  }
  const out = [];
  for (const b of buckets) {
    if (!b.games.length) continue;
    if (!keepOrder) b.games.sort((a, c) => (c.m || 0) - (a.m || 0) || a.t.localeCompare(c.t));
    const parts = Math.ceil(b.games.length / PER_AISLE);
    for (let i = 0; i < parts; i++)
      out.push({ name: b.name, part: parts > 1 ? `${i + 1} of ${parts}` : "", games: b.games.slice(i * PER_AISLE, (i + 1) * PER_AISLE), total: b.games.length });
  }
  return out;
}

async function start() {
  const [raw, boxList, artList] = await Promise.all([get("../data/games.json"), get("../data/box.json").catch(() => []), get("../data/art.json").catch(() => [])]);
  const VIDS = await get("../data/videos.json").catch(() => ({}));
  const GAMES = (Array.isArray(raw) ? raw : raw.games || []).filter((g) => !g.gone && g.t);
  const BYID = new Map(GAMES.map((g) => [g.id, g]));
  const BOX = new Set(Array.isArray(boxList) ? boxList : []), ART = new Set(Array.isArray(artList) ? artList : []);
  let fromWall = null;
  try { const j = JSON.parse(store("psplus-store") || "null"); if (j && Array.isArray(j.ids) && j.ids.length) fromWall = { ids: j.ids.filter((id) => BYID.has(id)), label: String(j.label || "") }; } catch (e) {}
  const mode = { stock: fromWall && new URLSearchParams(location.search).get("from") === "wall" ? "wall" : "all" };
  try { await Promise.all(["100px Bungee", "800 38px Archivo", "44px 'Permanent Marker'", "40px VT323"].map((f) => document.fonts.load(f))); } catch (e) {}

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: location.hash === "#webgl" });
  await renderer.init();
  const gpu = !!(renderer.backend && renderer.backend.isWebGPUBackend);
  $("engine").textContent = gpu ? "Drawn with WebGPU" : "Drawn with WebGL";
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  $("stage").appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const BG = new THREE.Color("#0d1230"), BG_NIGHT = new THREE.Color("#0a0306");
  scene.background = BG.clone();
  scene.fog = new THREE.Fog("#0d1230", 8, 22);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60);

  const hemi = new THREE.HemisphereLight("#fff6e8", "#24305e", 1.25); scene.add(hemi);
  const key = new THREE.DirectionalLight("#ffffff", 1.0); key.position.set(0.6, 3, 2); scene.add(key);
  const shared = {
    wood: new THREE.MeshStandardMaterial({ color: "#2a3a8a", roughness: 0.7 }),
    edge: new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.5 }),
    plastic: new THREE.MeshStandardMaterial({ color: "#16171D", roughness: 0.35, metalness: 0.1 }),
    blank: new THREE.MeshStandardMaterial({ color: "#2b3350", roughness: 0.5 }),
    strip: new THREE.MeshBasicMaterial({ color: "#fffbe8" }),
    side: new THREE.MeshStandardMaterial({ color: "#182457", roughness: 0.95 }),
    boxGeo: new THREE.BoxGeometry(BW, BH, 0.04),
  };
  const floorTex = carpet(); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;

  // ---------- the aisle (rebuilt whenever you change aisle) ----------
  let aisles = [], ai = 0, A = null;   // A: the aisle being shown
  const loader = new THREE.TextureLoader();
  function coverTex(g) {
    const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const url = BOX.has(g.id) ? `../box/${encodeURIComponent(g.id)}.webp` : ART.has(g.id) ? `../art/${encodeURIComponent(g.id)}.webp` : "";
    if (url) loader.load(url, (tx) => { t.image = tx.image; if (!BOX.has(g.id)) { t.repeat.set(0.75, 1); t.offset.set(0.125, 0); } t.needsUpdate = true; });
    return t;
  }
  function buildAisle(i, keepPlace) {
    if (A) { scene.remove(A.group); A.boxes.forEach((m) => { m.material.forEach((mt, k) => { if (k >= 4 && mt !== shared.blank) { mt.map && mt.map.dispose(); mt.dispose(); } }); }); A.dispose.forEach((d) => d.dispose()); }
    ai = (i + aisles.length) % aisles.length;
    const a = aisles[ai], cols = Math.max(4, Math.ceil(a.games.length / (ROWS * 2)));
    const LEN = cols * SPACING + 1.0, Z0 = 3.2, Z1 = Z0 - LEN;
    const group = new THREE.Group(), dispose = [];
    const add = (m) => { group.add(m); return m; };
    const plane = (w, h, mat) => { const g = new THREE.PlaneGeometry(w, h); dispose.push(g); return new THREE.Mesh(g, mat); };
    const box = (w, h, d, mat) => { const g = new THREE.BoxGeometry(w, h, d); dispose.push(g); return new THREE.Mesh(g, mat); };
    const FL = LEN + 6;
    const ft = floorTex.clone(); ft.repeat.set(3, FL / 1.8); ft.needsUpdate = true; dispose.push(ft);
    const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 }); dispose.push(fm);
    const floor = add(plane(4.4, FL, fm)); floor.rotation.x = -Math.PI / 2; floor.position.z = (Z0 + Z1) / 2 - 1;
    const ceil = add(plane(4.4, FL, new THREE.MeshStandardMaterial({ color: "#1b2040", roughness: 1 }))); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 2.8, floor.position.z);
    for (const sx of [-1, 1]) { const w = add(plane(FL, 2.8, shared.side)); w.position.set(sx * 2.2, 1.4, floor.position.z); w.rotation.y = -sx * Math.PI / 2; }
    const lights = [];
    for (let z = Z0; z > Z1 - 1; z -= 1.2) { const s = add(box(0.16, 0.03, 0.9, shared.strip)); s.position.set(0, 2.78, z); }
    for (let z = Z0 - 0.8; z > Z1; z -= 2.6) { const p = new THREE.PointLight("#fff4dc", 2.6, 5, 1.6); p.position.set(0, 2.55, z); add(p); lights.push(p); }
    const wall = add(plane(4.4, 2.8, new THREE.MeshStandardMaterial({ color: "#20306f", roughness: 0.9 }))); wall.position.set(0, 1.4, Z1 - 1.1);
    const entry = add(plane(4.4, 2.8, new THREE.MeshStandardMaterial({ color: "#20306f", roughness: 0.9 }))); entry.position.set(0, 1.4, Z0 + 3); entry.rotation.y = Math.PI;
    const shopTex = sign("WALL OF PS PLUS", "Rentals and recommendations"); dispose.push(shopTex);
    const shop = add(plane(2.6, 0.65, new THREE.MeshBasicMaterial({ map: shopTex }))); shop.position.set(0, 2.28, Z1 - 1.08);

    // counter, TV and the staff light switch
    const TVZ = Z1 - 0.55;
    const stand = add(box(1.7, STAND_H, 0.6, shared.wood)); stand.position.set(0, STAND_H / 2, TVZ);
    const top = add(box(1.74, 0.03, 0.64, shared.edge)); top.position.set(0, STAND_H + 0.015, TVZ);
    const tvBody = add(box(0.98, 0.78, 0.55, new THREE.MeshStandardMaterial({ color: "#2b2b30", roughness: 0.45 }))); tvBody.position.set(0, STAND_H + 0.42, TVZ - 0.02);
    const bezel = add(box(0.9, 0.68, 0.02, new THREE.MeshStandardMaterial({ color: "#141418", roughness: 0.3 }))); bezel.position.set(0, SCREEN_Y, TVZ + 0.26);
    const screen = add(plane(SW, SH, TV.mat)); screen.position.set(0, SCREEN_Y, TVZ + 0.275);
    const nowTex = canvasTex(720, 128, (x, w, h) => { x.fillStyle = YELLOW; x.fillRect(0, 0, w, h); x.fillStyle = INK; x.font = "64px Bungee, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("NOW SHOWING", w / 2, h / 2 + 4); }); dispose.push(nowTex);
    const now = add(plane(0.9, 0.16, new THREE.MeshBasicMaterial({ map: nowTex }))); now.position.set(0, STAND_H - 0.14, TVZ + 0.305);
    const plate = add(box(0.12, 0.18, 0.02, new THREE.MeshStandardMaterial({ color: "#e8e4d8", roughness: 0.5 }))); plate.position.set(1.55, 1.3, Z1 - 1.08);
    const lever = add(box(0.03, 0.07, 0.03, new THREE.MeshStandardMaterial({ color: "#f7f3e6", roughness: 0.4 }))); lever.position.set(1.55, 1.32, Z1 - 1.06);
    const staffTex = canvasTex(256, 96, (x, w, h) => { x.fillStyle = "#b3261e"; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.font = "30px Bungee, sans-serif"; x.textAlign = "center"; x.fillText("STAFF ONLY", w / 2, 40); x.font = "600 22px Archivo, sans-serif"; x.fillText("Lights: do not touch", w / 2, 76); }); dispose.push(staffTex);
    const staff = add(plane(0.3, 0.11, new THREE.MeshBasicMaterial({ map: staffTex }))); staff.position.set(1.55, 1.5, Z1 - 1.085);
    plate.userData.switch = lever.userData.switch = true;

    // shelves
    const boxes = [];
    for (const sx of [-1, 1]) {
      const back = add(box(0.06, 2.3, LEN, shared.wood)); back.position.set(sx * (AISLE + 0.42), 1.15, Z0 - LEN / 2);
      for (const end of [Z0, Z1]) { const p = add(box(0.46, 2.3, 0.06, shared.wood)); p.position.set(sx * (AISLE + 0.2), 1.15, end); }
      for (const y of [0.06, ...SHELF_Y.map((v) => v - 0.01)]) {
        const b = add(box(0.46, 0.04, LEN, shared.wood)); b.position.set(sx * (AISLE + 0.2), y, Z0 - LEN / 2);
        const lip = add(box(0.02, 0.05, LEN, shared.edge)); lip.position.set(sx * (AISLE - 0.03), y + 0.01, Z0 - LEN / 2);
      }
      const headTex = sign(a.name.toUpperCase(), a.part ? `Part ${a.part} · ${a.total} games` : `${a.games.length} ${a.games.length === 1 ? "game" : "games"}`); dispose.push(headTex);
      const head = add(plane(2.4, 0.6, new THREE.MeshBasicMaterial({ map: headTex }))); head.position.set(sx * (AISLE - 0.02), 2.42, Z0 - Math.min(LEN / 2, 2.2)); head.rotation.y = -sx * Math.PI / 2;
    }
    a.games.forEach((g, i) => {
      // fill the left shelf top to bottom, then the right
      const side = i < cols * ROWS ? -1 : 1, j = side < 0 ? i : i - cols * ROWS;
      const row = Math.floor(j / cols), col = j % cols;
      const backMat = new THREE.MeshStandardMaterial({ color: "#e9ecf5", roughness: 0.6 });
      const m = new THREE.Mesh(shared.boxGeo, [shared.plastic, shared.plastic, shared.plastic, shared.plastic, shared.blank, backMat]);
      m.position.set(side * (AISLE + 0.12), SHELF_Y[ROWS - 1 - row] + BH / 2 + 0.012, Z0 - 0.5 - col * SPACING);
      m.rotation.set(0, -side * Math.PI / 2, 0, "YXZ"); m.rotateX(-0.1);
      m.userData = { g, home: { p: m.position.clone(), q: m.quaternion.clone() }, backMat, loaded: false };
      add(m); boxes.push(m);
    });
    scene.add(group);
    A = { a, group, dispose, boxes, Z0, Z1, LEN, TVZ, screen, lights, switchObjs: [plate, lever], lever };
    st.z = keepPlace ? Math.min(st.z, Z0 + 0.8) : Z0 + 0.6; st.yaw = keepPlace ? st.yaw : 0;
    camera.position.z = st.z;
    $("aislename").textContent = a.name + (a.part ? ` (${a.part})` : "");
    $("aislecount").textContent = `Aisle ${ai + 1} of ${aisles.length}`;
    $("aislesel").value = String(ai);
    loadNear(true);
    if (night.on) nightLights(true);
  }
  function loadNear(all) {
    // covers are fetched as you approach them, so a long aisle doesn't load every box at once
    for (const m of A.boxes) {
      if (m.userData.loaded) continue;
      if (all ? Math.abs(m.position.z - st.z) > 7 : Math.abs(m.position.z - camera.position.z) > 9) continue;
      m.userData.loaded = true;
      m.material = m.material.slice(); m.material[4] = new THREE.MeshStandardMaterial({ map: coverTex(m.userData.g), roughness: 0.32 });
    }
  }
  function stock(kind) {
    mode.stock = kind;
    const games = kind === "wall" && fromWall ? fromWall.ids.map((id) => BYID.get(id)).filter(Boolean) : GAMES;
    aisles = shelve(games, kind === "wall");
    $("aislesel").innerHTML = aisles.map((a, i) => `<option value="${i}">${esc(a.name)}${a.part ? ` (${esc(a.part)})` : ""}: ${a.games.length}</option>`).join("");
    document.querySelectorAll("[data-stock]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stock === kind)));
    $("stocknote").textContent = kind === "wall" ? (fromWall.label ? `Stocked from your wall: ${fromWall.label}` : "Stocked from your wall's filters") : `Every game, ${GAMES.length} in all, by genre`;
    if (st.held || st.watch) { st.held = null; st.watch = null; closeTV(true); $("card").hidden = true; }
    buildAisle(0);
  }
  $("wallstock").hidden = !fromWall;
  document.querySelectorAll("[data-stock]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.stock !== mode.stock) stock(b.dataset.stock); }));
  $("aislesel").addEventListener("change", (e) => buildAisle(+e.target.value));
  $("prevaisle").addEventListener("click", () => buildAisle(ai - 1));
  $("nextaisle").addEventListener("click", () => buildAisle(ai + 1));

  // ---------- the TV ----------
  const tvCanvas = document.createElement("canvas"); tvCanvas.width = 160; tvCanvas.height = 120;
  const tvTex = new THREE.CanvasTexture(tvCanvas); tvTex.colorSpace = THREE.SRGBColorSpace;
  const TV = { mat: new THREE.MeshBasicMaterial({ map: tvTex }), label: ["CH 3", "PICK UP A BOX"] };
  const tvc = tvCanvas.getContext("2d");
  function drawStatic() {
    const img = tvc.createImageData(160, 120), d = img.data, red = night.on;
    for (let i = 0; i < d.length; i += 4) { const v = 40 + Math.random() * 120; d[i] = red ? v : v * 0.85; d[i + 1] = red ? v * 0.3 : v * 0.9; d[i + 2] = red ? v * 0.3 : v; d[i + 3] = 255; }
    tvc.putImageData(img, 0, 0);
    tvc.fillStyle = "rgba(0,0,0,.35)"; for (let y = 0; y < 120; y += 3) tvc.fillRect(0, y, 160, 1);
    tvc.fillStyle = red ? "#ffb0a0" : "#b8ffb0"; tvc.font = "20px VT323, monospace"; tvc.textBaseline = "top";
    tvc.fillText(TV.label[0], 8, 6); tvc.textAlign = "center"; tvc.fillText(TV.label[1], 80, 92); tvc.textAlign = "left";
    tvTex.needsUpdate = true;
  }

  // ---------- walking ----------
  const st = { z: 3.8, yaw: 0, held: null, flipped: false, watch: null };
  const clampZ = (z) => Math.max(A.Z1 + 0.25, Math.min(A.Z0 + 0.8, z));
  const clampYaw = (y) => Math.max(-1.35, Math.min(1.35, y));
  const view = { x: 0, y: 1.42, z: st.z, yaw: 0, pitch: -0.06 };
  function size() {
    const w = $("stage").clientWidth, h = $("stage").clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 74 : 60; camera.updateProjectionMatrix();
    if (st.watch) aimAtTV();
  }
  new ResizeObserver(size).observe($("stage"));

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (st.held || st.watch || night.over) return;
    st.yaw = clampYaw(st.yaw + dx * 0.005); st.z = clampZ(st.z + dy * 0.012); hideHint();
  });
  el.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const tap = drag.moved < 10; drag = null;
    if (!tap || st.watch) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (night.on) { throwCase(ray); return; }
    if (ray.intersectObjects(A.switchObjs, false)[0]) { lightsOut(); return; }
    const hit = ray.intersectObjects(A.boxes, false)[0];
    if (st.held) { if (hit && hit.object === st.held) flip(); else putBack(); return; }
    if (hit) pick(hit.object);
  });
  el.addEventListener("wheel", (e) => { e.preventDefault(); if (!st.held && !st.watch) { st.z = clampZ(st.z + e.deltaY * 0.004); hideHint(); } }, { passive: false });
  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (st.watch) leaveTV(); else if (st.held) putBack(); return; }
    if (e.target.closest && e.target.closest("select,input,iframe")) return;
    if (e.target.closest && e.target.closest("button,a") && (e.key === " " || e.key === "Enter")) return;
    if (night.on && (e.key === " " || e.key === "Enter")) { e.preventDefault(); ray.setFromCamera(ndc.set(0, 0), camera); throwCase(ray); return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) { keys.add(e.key); e.preventDefault(); hideHint(); }
  });
  addEventListener("keyup", (e) => keys.delete(e.key));
  document.querySelectorAll("[data-walk]").forEach((b) => {
    const k = b.dataset.walk, on = (e) => { e.preventDefault(); keys.add(k); hideHint(); }, off = () => keys.delete(k);
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  });
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
    st.held = m; st.flipped = false;
    const { p, q } = heldPose(false); animate(m, p, q);
    showCard(m.userData.g); TV.label = ["CH 3", "WATCH ON THE TV?"];
  }
  function flip() { if (!st.held) return; st.flipped = !st.flipped; const { p, q } = heldPose(st.flipped); animate(st.held, p, q, 520); $("flip").textContent = st.flipped ? "Turn to the front" : "Turn it over"; }
  function putBack() { const m = st.held; if (!m) return; st.held = null; animate(m, m.userData.home.p.clone(), m.userData.home.q.clone()); $("card").hidden = true; TV.label = ["CH 3", "PICK UP A BOX"]; }
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

  function aimAtTV() {
    const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    const dist = Math.max((SW / 0.86) / (2 * Math.tan(h)), (SH / 0.62) / (2 * Math.tan(v)));
    Object.assign(view, { x: 0, y: SCREEN_Y + (camera.aspect < 1 ? -0.06 : -0.02), z: A.screen.position.z + dist, yaw: 0, pitch: 0 });
  }
  function watchTV() {
    const m = st.held; if (!m) return;
    const g = m.userData.g, list = vidsFor(g); if (!list.length) return;
    st.held = null; st.watch = { m, g, list, i: 0, back: { z: st.z, yaw: st.yaw } };
    animate(m, new THREE.Vector3(0.66, STAND_H + 0.03 + BH / 2, A.TVZ + 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, -0.25, 0)), 700);
    aimAtTV(); TV.label = ["CH 3", "TUNING IN…"];
    $("card").hidden = true; $("tvbar").hidden = false; hideHint();
    setTimeout(() => { if (st.watch && st.watch.g === g) play(); }, CALM ? 0 : 750);
  }
  function play() {
    const w = st.watch, v = w.list[w.i];
    $("tvtitle").textContent = w.g.t;
    $("tvwhat").textContent = `${v[0]}${w.list.length > 1 ? ` (${w.i + 1} of ${w.list.length})` : ""}`;
    $("tvnext").hidden = w.list.length < 2;
    $("tvframe").src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v[1])}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    $("tvframe").title = `${w.g.t}: ${v[0]}`;
    $("tv").hidden = false; TV.mat.color.set("#000000");
  }
  function closeTV(silent) { $("tvframe").src = "about:blank"; $("tv").hidden = true; $("tvbar").hidden = true; TV.mat.color.set("#ffffff"); TV.label = ["CH 3", "PICK UP A BOX"]; }
  function leaveTV() {
    const w = st.watch; if (!w) return; st.watch = null; closeTV();
    animate(w.m, w.m.userData.home.p.clone(), w.m.userData.home.q.clone(), 600);
    st.z = w.back.z; st.yaw = w.back.yaw;
  }
  $("watch").addEventListener("click", watchTV);
  $("tvnext").addEventListener("click", () => { const w = st.watch; if (!w) return; w.i = (w.i + 1) % w.list.length; play(); });
  $("tvleave").addEventListener("click", leaveTV);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * SW / 2, b * SH / 2, 0));
  const tmp = new THREE.Vector3();
  function placeVideo() {
    const r = el.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(A.screen.matrixWorld).project(camera);
      const x = (tmp.x + 1) / 2 * r.width, y = (1 - tmp.y) / 2 * r.height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const s = $("tv").style; s.left = r.left + x0 + "px"; s.top = r.top + y0 + "px"; s.width = x1 - x0 + "px"; s.height = y1 - y0 + "px";
  }

  // ---------- after hours ----------
  const night = { on: false, over: false, wave: 0, score: 0, floored: 0, hp: 5, zombies: [], cases: [], cool: 0, hurt: 0, nextWave: 0 };
  const NAMES = ["DOUG", "KEVIN", "TRACY", "GARY", "DENISE", "BRAD", "SHEILA", "TODD", "MARCY", "RON", "LORRAINE", "DARRYL"];
  const zMats = {
    // a little glow of their own, so they read in the dark
    skin: new THREE.MeshStandardMaterial({ color: "#8fae6a", roughness: 0.8, emissive: "#3d5a1e", emissiveIntensity: 0.9 }),
    shirt: new THREE.MeshStandardMaterial({ color: "#2c47b8", roughness: 0.7, emissive: "#1a2a80", emissiveIntensity: 0.7 }),
    pants: new THREE.MeshStandardMaterial({ color: "#2a2a33", roughness: 0.8, emissive: "#15151c", emissiveIntensity: 0.6 }),
    eye: new THREE.MeshBasicMaterial({ color: "#ffe66b" }),
    hair: new THREE.MeshStandardMaterial({ color: "#3b2a20", roughness: 0.9, emissive: "#1c120c", emissiveIntensity: 0.6 }),
  };
  const zGeo = { leg: new THREE.BoxGeometry(0.16, 0.8, 0.18), body: new THREE.BoxGeometry(0.5, 0.62, 0.28), arm: new THREE.BoxGeometry(0.13, 0.13, 0.6),
    head: new THREE.BoxGeometry(0.3, 0.32, 0.3), eye: new THREE.BoxGeometry(0.06, 0.04, 0.01), hair: new THREE.BoxGeometry(0.32, 0.08, 0.32), tag: new THREE.PlaneGeometry(0.2, 0.075) };
  const tagTex = new Map();
  function makeZombie(z, x) {
    const g = new THREE.Group();
    const mk = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
    const lL = mk(zGeo.leg, zMats.pants, -0.12, 0.4, 0), lR = mk(zGeo.leg, zMats.pants, 0.12, 0.4, 0);
    const body = mk(zGeo.body, zMats.shirt, 0, 1.11, 0);
    const aL = mk(zGeo.arm, zMats.skin, -0.3, 1.3, 0.28), aR = mk(zGeo.arm, zMats.skin, 0.3, 1.3, 0.28);
    const head = mk(zGeo.head, zMats.skin, 0, 1.6, 0.02);
    mk(zGeo.hair, zMats.hair, 0, 1.78, 0.02);
    mk(zGeo.eye, zMats.eye, -0.07, 1.63, 0.175); mk(zGeo.eye, zMats.eye, 0.07, 1.63, 0.175);
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    if (!tagTex.has(name)) tagTex.set(name, new THREE.MeshBasicMaterial({ map: tag(name) }));
    mk(zGeo.tag, tagTex.get(name), 0.12, 1.25, 0.145);
    g.position.set(x, 0, z); g.rotation.y = Math.PI; // walk towards the entrance (+z)
    scene.add(g);
    return { g, lL, lR, aL, aR, head, hp: 3, speed: 0.7 + Math.min(night.wave, 8) * 0.09 + Math.random() * 0.2, phase: Math.random() * 6, flash: 0, dead: 0, knock: 0, dir: 1 };
  }
  function lightsOut() {
    if (st.held) putBack();
    night.on = true; night.over = false; night.wave = 0; night.score = 0; night.floored = 0; night.hp = 5;
    A.lever.rotation.x = 0.9; A.lever.position.y = 1.28;
    nightLights(true);
    $("card").hidden = true; $("hud").hidden = false; $("over").hidden = true; document.body.classList.add("night");
    TV.label = ["CH 13", "THEY'RE BACK"]; hideHint();
    say("The lights are out and the staff are back from the dead. Tap to throw a case. Don't let them reach you.", 3800);
    night.nextWave = performance.now() + 1500;
    hud();
  }
  function nightLights(on) {
    hemi.intensity = on ? 0.18 : 1.25; hemi.color.set(on ? "#ff8a7a" : "#fff6e8"); key.intensity = on ? 0.15 : 1.0;
    A.lights.forEach((p, i) => { p.color.set(on ? "#ff2a2a" : "#fff4dc"); p.intensity = on ? (i % 2 ? 0 : 3.2) : 2.6; });
    shared.strip.color.set(on ? "#3a1010" : "#fffbe8");
    scene.background.copy(on ? BG_NIGHT : BG); scene.fog.color.copy(on ? BG_NIGHT : BG); scene.fog.near = on ? 3 : 8; scene.fog.far = on ? 13 : 22;
  }
  function lightsOn() {
    night.on = false; night.over = false;
    night.zombies.forEach((z) => scene.remove(z.g)); night.zombies = [];
    night.cases.forEach((c) => { scene.remove(c.m); c.m.material.forEach((m, k) => k === 4 && m.dispose()); }); night.cases = [];
    A.lever.rotation.x = 0; A.lever.position.y = 1.32;
    nightLights(false);
    $("hud").hidden = true; $("over").hidden = true; document.body.classList.remove("night");
    TV.label = ["CH 3", "PICK UP A BOX"];
  }
  function spawnWave() {
    night.wave++;
    const n = 2 + night.wave * 2;
    for (let i = 0; i < n; i++) {
      const behind = night.wave >= 3 && i % 4 === 3;   // from wave 3, some come in through the entrance behind you
      // they shuffle out from behind the counter at the far end
      const zz = makeZombie(behind ? A.Z0 + 2.6 : A.Z1 + 0.35 + (i % 3) * 0.2, (Math.random() - 0.5) * 1.3);
      if (behind) { zz.dir = -1; zz.g.rotation.y = 0; }
      zz.delay = i * 0.6; zz.g.visible = false;
      night.zombies.push(zz);
    }
    say(`Wave ${night.wave}`, 1400); hud();
  }
  const caseGeo = new THREE.BoxGeometry(BW * 0.9, BH * 0.9, 0.04);
  function throwCase(r) {
    if (night.over || performance.now() < night.cool) return;
    night.cool = performance.now() + 260;
    const g = A.a.games[Math.floor(Math.random() * A.a.games.length)];
    const front = new THREE.MeshStandardMaterial({ map: coverTex(g), roughness: 0.4 });
    const m = new THREE.Mesh(caseGeo, [shared.plastic, shared.plastic, shared.plastic, shared.plastic, front, shared.plastic]);
    const start = new THREE.Vector3(0.18, -0.2, -0.3).applyMatrix4(camera.matrixWorld);
    const target = r.ray.origin.clone().add(r.ray.direction.clone().multiplyScalar(7));
    const vel = target.sub(start).normalize().multiplyScalar(13); vel.y += 1.2;
    m.position.copy(start); scene.add(m);
    night.cases.push({ m, vel, spin: new THREE.Vector3(Math.random() * 10 + 6, Math.random() * 6 - 3, Math.random() * 4), life: 2.2 });
  }
  function say(text, ms) { const s = $("say"); s.textContent = text; s.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => (s.hidden = true), ms); }
  function hud() { $("hscore").textContent = night.score; $("hwave").textContent = night.wave || 1; $("hhp").textContent = "♥".repeat(Math.max(0, night.hp)) + "♡".repeat(Math.max(0, 5 - night.hp)); }
  function gameOver() {
    night.over = true;
    $("overtext").textContent = `You held out for ${night.wave} ${night.wave === 1 ? "wave" : "waves"} and floored ${night.floored} ${night.floored === 1 ? "clerk" : "clerks"}. Score ${night.score}.`;
    $("over").hidden = false; $("again").focus();
  }
  $("lightson").addEventListener("click", lightsOn);
  $("lightson2").addEventListener("click", lightsOn);
  $("again").addEventListener("click", () => { night.zombies.forEach((z) => scene.remove(z.g)); night.zombies = []; lightsOut(); });
  $("throwbtn").addEventListener("click", () => { ray.setFromCamera(ndc.set(0, 0.05), camera); throwCase(ray); });

  function tickNight(dt, now) {
    if (!night.over && !night.zombies.some((z) => !z.dead) && now > night.nextWave) { spawnWave(); night.nextWave = Infinity; }
    if (!night.over && night.nextWave === Infinity && night.zombies.length && night.zombies.every((z) => z.dead > 1.2)) {
      night.zombies.forEach((z) => scene.remove(z.g)); night.zombies = []; night.score += 250 * night.wave; hud();
      say(`Wave ${night.wave} cleared`, 1500); night.nextWave = now + 2200;
    }
    const cz = camera.position.z;
    for (const z of night.zombies) {
      if (z.delay > 0) { z.delay -= dt; if (z.delay <= 0) z.g.visible = true; continue; }
      if (z.dead) { z.dead += dt; z.g.rotation.x = Math.max(-Math.PI / 2, -z.dead * 3) * z.dir; z.g.position.y = Math.max(-0.4, z.g.position.y - (z.dead > 0.6 ? dt * 0.4 : 0)); continue; }
      z.phase += dt * 5 * z.speed;
      const sw = Math.sin(z.phase);
      z.lL.rotation.x = sw * 0.5; z.lR.rotation.x = -sw * 0.5; z.aL.rotation.x = -0.1 + Math.sin(z.phase * 0.7) * 0.15; z.aR.rotation.x = -0.1 - Math.sin(z.phase * 0.7) * 0.15;
      z.g.rotation.z = Math.sin(z.phase * 0.5) * 0.08; z.head.rotation.z = Math.sin(z.phase * 0.3) * 0.25;
      if (z.knock > 0) { z.g.position.z -= z.dir * dt * 3 * z.knock; z.knock = Math.max(0, z.knock - dt * 4); }
      else if (!night.over) {
        const dz = cz - z.g.position.z;
        z.dir = Math.sign(dz) || 1; z.g.rotation.y = z.dir > 0 ? 0 : Math.PI;
        if (Math.abs(dz) > 0.55) z.g.position.z += z.dir * z.speed * dt;
        else if (now > night.hurt) { night.hp--; night.hurt = now + 900; hud(); $("ouch").classList.remove("on"); void $("ouch").offsetWidth; $("ouch").classList.add("on"); if (night.hp <= 0) gameOver(); }
        z.g.position.x += (camera.position.x - z.g.position.x) * dt * 0.15;
      }
      if (z.flash > 0) { z.flash -= dt; z.g.traverse((o) => o.isMesh && o.material === zMats.shirt && (o.material = z.flashMat || (z.flashMat = new THREE.MeshBasicMaterial({ color: "#ffffff" })))); }
      else if (z.flashMat) z.g.traverse((o) => o.isMesh && o.material === z.flashMat && (o.material = zMats.shirt));
    }
    for (let i = night.cases.length - 1; i >= 0; i--) {
      const c = night.cases[i]; c.life -= dt;
      c.vel.y -= 9.8 * 0.55 * dt; c.m.position.addScaledVector(c.vel, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      let hit = null;
      for (const z of night.zombies) {
        if (z.dead || z.delay > 0) continue;
        const p = z.g.position, q = c.m.position;
        if (Math.abs(q.x - p.x) < 0.38 && Math.abs(q.z - p.z) < 0.32 && q.y > 0.1 && q.y < 1.95) { hit = z; break; }
      }
      if (hit) {
        hit.hp--; hit.flash = 0.12; hit.knock = 1; night.score += 50;
        if (hit.hp <= 0) { hit.dead = 0.001; night.floored++; night.score += 100; }
        hud();
      }
      if (hit || c.life <= 0 || c.m.position.y < 0.03 || Math.abs(c.m.position.x) > 1.6) { scene.remove(c.m); c.m.material[4].dispose(); night.cases.splice(i, 1); }
    }
  }

  if (location.hash.includes("debug")) window.__store = { lightsOut, lightsOn, night, st, aisle: () => A };
  // ---------- frame loop ----------
  stock(mode.stock);
  size();
  camera.position.set(0, 1.42, st.z); camera.rotation.set(-0.06, 0, 0, "YXZ");
  let last = performance.now(), frame = 0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    if (!st.held && !st.watch && !night.over) {
      const sp = night.on ? 2.2 : 2.4;
      if (keys.has("ArrowUp") || keys.has("w")) st.z = clampZ(st.z - dt * sp);
      if (keys.has("ArrowDown") || keys.has("s")) st.z = clampZ(st.z + dt * sp);
      if (keys.has("ArrowLeft") || keys.has("a")) st.yaw = clampYaw(st.yaw + dt * 1.4);
      if (keys.has("ArrowRight") || keys.has("d")) st.yaw = clampYaw(st.yaw - dt * 1.4);
    }
    if (!st.watch) Object.assign(view, { x: 0, y: 1.42 + (CALM ? 0 : Math.sin(now / (night.on ? 400 : 900)) * (night.on ? 0.012 : 0.006)), z: st.z, yaw: st.yaw, pitch: -0.06 });
    const k = CALM ? 1 : Math.min(1, dt * (st.watch ? 4 : 8));
    camera.position.x += (view.x - camera.position.x) * k; camera.position.y += (view.y - camera.position.y) * k; camera.position.z += (view.z - camera.position.z) * k;
    camera.rotation.set(camera.rotation.x + (view.pitch - camera.rotation.x) * k, camera.rotation.y + (view.yaw - camera.rotation.y) * k, 0, "YXZ");
    camera.updateMatrixWorld();
    for (let i = anim.length - 1; i >= 0; i--) {
      const a = anim[i]; a.t = Math.min(1, a.t + (dt * 1000) / a.dur); const e = ease(a.t);
      a.m.position.lerpVectors(a.fromP, a.toP, e);
      if (a.m === st.held && a.t > 0.2) a.m.position.y += Math.sin(e * Math.PI) * 0.06;
      a.m.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      if (a.t >= 1) anim.splice(i, 1);
    }
    if (frame % 10 === 0) loadNear(false);
    if (night.on) {
      tickNight(dt, now);
      if (!CALM && frame % 7 === 0) A.lights.forEach((p, i) => { if (i % 2 === 0) p.intensity = Math.random() < 0.15 ? 0.4 : 3.2; });
    }
    if (!$("tv").hidden) placeVideo();
    else if (frame % 3 === 0 && !CALM) drawStatic();
    renderer.render(scene, camera);
  });
  drawStatic();
  $("loading").hidden = true;
}

start().catch((e) => { $("loading").textContent = "The shop couldn't open its 3D view on this device: " + (e && e.message ? e.message : e); });
