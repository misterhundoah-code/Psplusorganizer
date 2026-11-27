// Wall of PS Plus: walk-through store preview, version 2. Source for store/store.js (see tools/store/README.md).
// One aisle, two shelves of real games in portrait boxes, and a CRT at the end of the aisle that plays a
// game's trailer: pick up a box, press Watch on the TV, and the box goes on the counter while you step up to it.
import * as THREE from "three/webgpu";

const $ = (id) => document.getElementById(id);
const CALM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BLUE = "#1E3A9E", YELLOW = "#FFC925", INK = "#141a33";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hrs = (h) => (h ? (h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)) + " h" : "");
const plat = (g) => g.sys || (g.p || []).join(", ");

// ---------- canvas-drawn textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(/\s+/);
  let line = "", n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      n++;
      if (n === maxLines) { ctx.fillText(line.replace(/[,.;:]?$/, "…"), x, y); return y + lh; }
      ctx.fillText(line, x, y); y += lh; line = words[i];
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
const carpet = () => canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = "#1a2350"; x.fillRect(0, 0, w, h);
  const cols = [YELLOW, "#4FA3FF", "#FF5C7A", "#7CE0B5"];
  let s = 7;
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
  x.font = `${sub ? 104 : 124}px Bungee, "Arial Black", sans-serif`;
  x.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 6);
  if (sub) { x.font = `600 40px Archivo, system-ui, sans-serif`; x.fillStyle = YELLOW; x.fillText(sub, w / 2, h * 0.78); }
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
    x.fillStyle = BLUE; x.font = "24px Bungee, sans-serif"; x.textAlign = "right";
    x.fillText("WALL OF PS PLUS", w - 24, h - 56);
  });
}

// ---------- layout ----------
const LEN = 7.6, Z0 = 3.2, Z1 = Z0 - LEN, AISLE = 1.45, COLS = 8, ROWS = 3;
const BW = 0.3, BH = 0.4;                   // PlayStation case shape
const SHELF_Y = [0.4, 0.98, 1.56];
const TVZ = Z1 - 0.55, STAND_H = 0.78, SW = 0.78, SH = 0.585, SCREEN_Y = STAND_H + 0.06 + 0.66 / 2;

async function start() {
  const data = await (await fetch("aisle.json")).json();
  try { await Promise.all(["104px Bungee", "800 38px Archivo", "44px 'Permanent Marker'", "40px VT323"].map((f) => document.fonts.load(f))); } catch (e) {}

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: location.hash === "#webgl" });
  await renderer.init();
  const gpu = !!(renderer.backend && renderer.backend.isWebGPUBackend);
  $("engine").textContent = gpu ? "Drawn with WebGPU" : "Drawn with WebGL (WebGPU isn't available on this device)";
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  $("stage").appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d1230");
  scene.fog = new THREE.Fog("#0d1230", 7, 16);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 40);

  scene.add(new THREE.HemisphereLight("#fff6e8", "#24305e", 1.25));
  const key = new THREE.DirectionalLight("#ffffff", 1.0); key.position.set(0.6, 3, 2); scene.add(key);
  for (let z = Z0 - 0.8; z > Z1; z -= 2.4) { const p = new THREE.PointLight("#fff4dc", 2.6, 5, 1.6); p.position.set(0, 2.55, z); scene.add(p); }

  // room
  const floorTex = carpet(); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 9);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 16), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -1; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 16), new THREE.MeshStandardMaterial({ color: "#1b2040", roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 2.8, -1); scene.add(ceil);
  const sideMat = new THREE.MeshStandardMaterial({ color: "#182457", roughness: 0.95 });
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.8), sideMat); w.position.set(sx * 2.2, 1.4, -1); w.rotation.y = -sx * Math.PI / 2; scene.add(w); }
  const stripMat = new THREE.MeshBasicMaterial({ color: "#fffbe8" });
  for (let z = Z0; z > Z1 - 1; z -= 1.2) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.9), stripMat); s.position.set(0, 2.78, z); scene.add(s); }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.8), new THREE.MeshStandardMaterial({ color: "#20306f", roughness: 0.9 }));
  wall.position.set(0, 1.4, Z1 - 1.1); scene.add(wall);
  const shop = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: sign("WALL OF PS PLUS", "Rentals and recommendations") }));
  shop.position.set(0, 2.28, Z1 - 1.08); scene.add(shop);

  // the TV on its stand at the end of the aisle
  const tvStatic = document.createElement("canvas"); tvStatic.width = 160; tvStatic.height = 120;
  const tvTex = new THREE.CanvasTexture(tvStatic); tvTex.colorSpace = THREE.SRGBColorSpace;
  const tvCtx = tvStatic.getContext("2d");
  let tvLabel = ["CH 3", "PICK UP A BOX"];
  function drawStatic(t) {
    const img = tvCtx.createImageData(160, 120), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = 40 + Math.random() * 120; d[i] = v * 0.85; d[i + 1] = v * 0.9; d[i + 2] = v; d[i + 3] = 255; }
    tvCtx.putImageData(img, 0, 0);
    tvCtx.fillStyle = "rgba(0,0,0,.35)"; for (let y = 0; y < 120; y += 3) tvCtx.fillRect(0, y, 160, 1);
    tvCtx.fillStyle = "#b8ffb0"; tvCtx.font = "20px VT323, monospace"; tvCtx.textBaseline = "top";
    tvCtx.fillText(tvLabel[0], 8, 6);
    tvCtx.textAlign = "center"; tvCtx.fillText(tvLabel[1], 80, 92); tvCtx.textAlign = "left";
    tvTex.needsUpdate = true;
  }
  drawStatic();
  const standMat = new THREE.MeshStandardMaterial({ color: "#2a3a8a", roughness: 0.7 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.7, STAND_H, 0.6), standMat); stand.position.set(0, STAND_H / 2, TVZ); scene.add(stand);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.03, 0.64), new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.5 })); top.position.set(0, STAND_H + 0.015, TVZ); scene.add(top);
  const tvBody = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.78, 0.55), new THREE.MeshStandardMaterial({ color: "#2b2b30", roughness: 0.45 }));
  tvBody.position.set(0, STAND_H + 0.03 + 0.39, TVZ - 0.02); scene.add(tvBody);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.68, 0.02), new THREE.MeshStandardMaterial({ color: "#141418", roughness: 0.3 }));
  bezel.position.set(0, SCREEN_Y, TVZ + 0.26); scene.add(bezel);
  const screenMat = new THREE.MeshBasicMaterial({ map: tvTex });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMat);
  screen.position.set(0, SCREEN_Y, TVZ + 0.275); scene.add(screen);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), new THREE.MeshStandardMaterial({ color: "#888", metalness: 0.6, roughness: 0.3 }));
  knob.rotation.x = Math.PI / 2; knob.position.set(0.44, STAND_H + 0.12, TVZ + 0.26); scene.add(knob);
  const nowSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), new THREE.MeshBasicMaterial({ map: canvasTex(720, 128, (x, w, h) => {
    x.fillStyle = YELLOW; x.fillRect(0, 0, w, h); x.fillStyle = INK; x.font = "64px Bungee, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("NOW SHOWING", w / 2, h / 2 + 4);
  }) }));
  nowSign.position.set(0, STAND_H - 0.14, TVZ + 0.305); scene.add(nowSign);

  // shelf units and boxes
  const wood = new THREE.MeshStandardMaterial({ color: "#2a3a8a", roughness: 0.7 });
  const edge = new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.5 });
  const plastic = new THREE.MeshStandardMaterial({ color: "#16171D", roughness: 0.35, metalness: 0.1 });
  const boxes = [];
  const loader = new THREE.TextureLoader();
  function coverTex(g) {
    const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const square = () => loader.load("../art/" + encodeURIComponent(g.id) + ".webp", (tx) => {
      t.image = tx.image; t.repeat.set(0.75, 1); t.offset.set(0.125, 0); t.needsUpdate = true;   // square art, cropped to the case
    });
    if (g.igc) loader.load("covers/" + encodeURIComponent(g.id) + ".webp", (tx) => { t.image = tx.image; t.needsUpdate = true; }, undefined, square);
    else square();
    return t;
  }
  for (const side of ["left", "right"]) {
    const sx = side === "left" ? -1 : 1, aisle = data[side];
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, LEN), wood); back.position.set(sx * (AISLE + 0.42), 1.15, Z0 - LEN / 2); scene.add(back);
    for (const end of [Z0, Z1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.3, 0.06), wood); p.position.set(sx * (AISLE + 0.2), 1.15, end); scene.add(p); }
    for (const y of [0.1, ...SHELF_Y.map((v) => v - 0.01)]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, LEN), wood); b.position.set(sx * (AISLE + 0.2), y, Z0 - LEN / 2); scene.add(b);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, LEN), edge); lip.position.set(sx * (AISLE - 0.03), y + 0.01, Z0 - LEN / 2); scene.add(lip);
    }
    const head = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: sign(aisle.name.toUpperCase(), `${aisle.games.length} on the shelf, best reviewed first`) }));
    head.position.set(sx * (AISLE - 0.02), 2.2, Z0 - LEN / 2); head.rotation.y = -sx * Math.PI / 2; scene.add(head);

    aisle.games.forEach((g, i) => {
      const row = Math.floor(i / COLS), col = i % COLS;
      const backMat = new THREE.MeshStandardMaterial({ color: "#e9ecf5", roughness: 0.6 });
      const mats = [plastic, plastic, plastic, plastic, new THREE.MeshStandardMaterial({ map: coverTex(g), roughness: 0.32 }), backMat];
      const m = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, 0.04), mats);
      const z = Z0 - 0.5 - col * ((LEN - 1) / (COLS - 1));
      m.position.set(sx * (AISLE + 0.12), SHELF_Y[ROWS - 1 - row] + BH / 2 + 0.012, z);
      m.rotation.set(0, -sx * Math.PI / 2, 0, "YXZ");
      m.rotateX(-0.1);
      m.userData = { g, home: { p: m.position.clone(), q: m.quaternion.clone() }, backMat };
      scene.add(m); boxes.push(m);
    });
  }

  // ---------- walking and looking ----------
  const st = { z: Z0 + 0.6, yaw: 0, held: null, flipped: false, watch: null };
  const ZMIN = Z1 + 0.25, ZMAX = Z0 + 0.8;
  const clampZ = (z) => Math.max(ZMIN, Math.min(ZMAX, z));
  const clampYaw = (y) => Math.max(-1.35, Math.min(1.35, y));
  const view = { x: 0, y: 1.42, z: st.z, yaw: 0, pitch: -0.06 };   // where the camera is heading
  function size() {
    const w = $("stage").clientWidth, h = $("stage").clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w < h ? 74 : 60; camera.updateProjectionMatrix();
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
    if (st.held || st.watch) return;
    st.yaw = clampYaw(st.yaw + dx * 0.005);
    st.z = clampZ(st.z + dy * 0.012);
    hideHint();
  });
  el.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const tap = drag.moved < 10; drag = null;
    if (!tap || st.watch) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(boxes, false)[0];
    if (st.held) { if (hit && hit.object === st.held) flip(); else putBack(); return; }
    if (hit) pick(hit.object);
  });
  el.addEventListener("wheel", (e) => { e.preventDefault(); if (!st.held && !st.watch) { st.z = clampZ(st.z + e.deltaY * 0.004); hideHint(); } }, { passive: false });
  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (st.watch) leaveTV(); else if (st.held) putBack(); return; }
    if (e.target.closest && e.target.closest("button,a,iframe")) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) { keys.add(e.key); e.preventDefault(); hideHint(); }
  });
  addEventListener("keyup", (e) => keys.delete(e.key));
  document.querySelectorAll("[data-walk]").forEach((b) => {
    const k = b.dataset.walk;
    const on = (e) => { e.preventDefault(); keys.add(k); hideHint(); }, off = () => keys.delete(k);
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  });
  function hideHint() { $("hint").classList.add("gone"); }

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
    if (!m.userData.backMat.map) { m.userData.backMat.map = boxBack(m.userData.g); m.userData.backMat.color.set("#ffffff"); m.userData.backMat.needsUpdate = true; }
    st.held = m; st.flipped = false;
    const { p, q } = heldPose(false); animate(m, p, q);
    showCard(m.userData.g);
    tvLabel = ["CH 3", "WATCH ON THE TV?"];
  }
  function flip() { if (!st.held) return; st.flipped = !st.flipped; const { p, q } = heldPose(st.flipped); animate(st.held, p, q, 520); $("flip").textContent = st.flipped ? "Turn to the front" : "Turn it over"; }
  function putBack() {
    const m = st.held; if (!m) return; st.held = null;
    animate(m, m.userData.home.p.clone(), m.userData.home.q.clone());
    $("card").hidden = true; tvLabel = ["CH 3", "PICK UP A BOX"];
  }
  function showCard(g) {
    $("ctitle").textContent = g.t;
    $("cmeta").textContent = [g.y, plat(g), (g.g || []).slice(0, 3).join(", ")].filter(Boolean).join(" · ");
    $("cfacts").innerHTML = [g.m ? `<span>Metascore <b>${esc(g.m)}</b></span>` : "", g.h ? `<span>Main story <b>${esc(hrs(g.h))}</b></span>` : ""].join("");
    $("cdesc").textContent = g.d || "";
    $("cwall").href = "/?q=" + encodeURIComponent(g.t);
    $("watch").hidden = !(g.v && g.v.length);
    $("flip").textContent = "Turn it over";
    $("card").hidden = false; $("tvbar").hidden = true;
  }
  $("flip").addEventListener("click", flip);
  $("putback").addEventListener("click", putBack);

  // ---------- the TV ----------
  function aimAtTV() {
    // stand back just far enough for the screen to fill most of the view, whichever is the tighter fit
    const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    const dist = Math.max((SW / 0.86) / (2 * Math.tan(h)), (SH / 0.62) / (2 * Math.tan(v)));
    Object.assign(view, { x: 0, y: SCREEN_Y + (camera.aspect < 1 ? -0.06 : -0.02), z: screen.position.z + dist, yaw: 0, pitch: 0 });
  }
  function watchTV() {
    const m = st.held; if (!m) return;
    const g = m.userData.g;
    st.held = null; st.watch = { m, g, i: 0, back: { z: st.z, yaw: st.yaw } };
    // the box stands on the counter beside the TV, front out
    animate(m, new THREE.Vector3(0.66, STAND_H + 0.03 + BH / 2, TVZ + 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, -0.25, 0)), 700);
    aimAtTV();
    tvLabel = ["CH 3", "TUNING IN…"];
    $("card").hidden = true; $("tvbar").hidden = false; hideHint();
    setTimeout(() => { if (st.watch && st.watch.g === g) play(); }, CALM ? 0 : 750);
  }
  function play() {
    const w = st.watch, v = w.g.v[w.i];
    $("tvtitle").textContent = w.g.t;
    $("tvwhat").textContent = `${v[0]}${w.g.v.length > 1 ? ` (${w.i + 1} of ${w.g.v.length})` : ""}`;
    $("tvnext").hidden = w.g.v.length < 2;
    const f = $("tvframe");
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v[1])}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    f.title = `${w.g.t}: ${v[0]}`;
    $("tv").hidden = false;
    screenMat.color.set("#000000");
  }
  function leaveTV() {
    const w = st.watch; if (!w) return;
    st.watch = null;
    $("tvframe").src = "about:blank"; $("tv").hidden = true; $("tvbar").hidden = true;
    screenMat.color.set("#ffffff"); tvLabel = ["CH 3", "PICK UP A BOX"];
    animate(w.m, w.m.userData.home.p.clone(), w.m.userData.home.q.clone(), 600);
    st.z = w.back.z; st.yaw = w.back.yaw;
  }
  $("watch").addEventListener("click", watchTV);
  $("tvnext").addEventListener("click", () => { const w = st.watch; if (!w) return; w.i = (w.i + 1) % w.g.v.length; play(); });
  $("tvleave").addEventListener("click", leaveTV);

  // keep the video exactly over the TV's screen
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * SW / 2, b * SH / 2, 0));
  const tmp = new THREE.Vector3();
  function placeVideo() {
    const r = el.getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(screen.matrixWorld).project(camera);
      const x = (tmp.x + 1) / 2 * r.width, y = (1 - tmp.y) / 2 * r.height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const s = $("tv").style;
    s.left = r.left + x0 + "px"; s.top = r.top + y0 + "px"; s.width = x1 - x0 + "px"; s.height = y1 - y0 + "px";
  }

  // ---------- frame loop ----------
  size();
  let last = performance.now(), frame = 0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  camera.position.set(0, 1.42, st.z); camera.rotation.set(-0.06, 0, 0, "YXZ");
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    if (!st.held && !st.watch) {
      if (keys.has("ArrowUp") || keys.has("w")) st.z = clampZ(st.z - dt * 1.8);
      if (keys.has("ArrowDown") || keys.has("s")) st.z = clampZ(st.z + dt * 1.8);
      if (keys.has("ArrowLeft") || keys.has("a")) st.yaw = clampYaw(st.yaw + dt * 1.3);
      if (keys.has("ArrowRight") || keys.has("d")) st.yaw = clampYaw(st.yaw - dt * 1.3);
    }
    if (!st.watch) Object.assign(view, { x: 0, y: 1.42 + (CALM ? 0 : Math.sin(now / 900) * 0.006), z: st.z, yaw: st.yaw, pitch: -0.06 });
    const k = CALM ? 1 : Math.min(1, dt * (st.watch ? 4 : 8));
    camera.position.x += (view.x - camera.position.x) * k;
    camera.position.y += (view.y - camera.position.y) * k;
    camera.position.z += (view.z - camera.position.z) * k;
    camera.rotation.set(camera.rotation.x + (view.pitch - camera.rotation.x) * k, camera.rotation.y + (view.yaw - camera.rotation.y) * k, 0, "YXZ");
    camera.updateMatrixWorld();
    for (let i = anim.length - 1; i >= 0; i--) {
      const a = anim[i]; a.t = Math.min(1, a.t + (dt * 1000) / a.dur); const e = ease(a.t);
      a.m.position.lerpVectors(a.fromP, a.toP, e);
      if (a.m === st.held && a.t > 0.2) a.m.position.y += Math.sin(e * Math.PI) * 0.06;
      a.m.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      if (a.t >= 1) anim.splice(i, 1);
    }
    if (!$("tv").hidden) placeVideo();
    else if (frame % 3 === 0 && !CALM) drawStatic();
    renderer.render(scene, camera);
  });
  $("loading").hidden = true;
}

start().catch((e) => {
  $("loading").textContent = "This preview couldn't start its 3D view on this device: " + (e && e.message ? e.message : e);
});
