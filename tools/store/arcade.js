// The arcade corner: three small games drawn on a 320x240 canvas and scaled up, like a cabinet screen.
//   dash   - Aisle Dash: an endless runner into the screen. Change lanes, jump crates, slide under signs.
//   cruise - Coast Cruise: a sunny pseudo-3D road racer. Beat the clock to each checkpoint.
//   tape   - Tape Force: a side-scrolling shooter through a living tunnel. You fire; capsules power you up.
// Keyboard on a computer, touch on a phone. Each keeps a best score in localStorage.
// attract() draws the little demo loop shown on each cabinet's screen in the shop.

export const GAMES = {
  dash: { title: "AISLE DASH", col: "#ffc925", blurb: "Run the aisles after closing" },
  cruise: { title: "COAST CRUISE", col: "#ffe14a", blurb: "Beat the clock to each checkpoint" },
  tape: { title: "TAPE FORCE", col: "#c8395a", blurb: "The tapes have grown flesh" },
};
const W = 320, H = 240;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const best = (k) => { try { return +localStorage.getItem("psplus-arcade-" + k) || 0; } catch (e) { return 0; } };
const saveBest = (k, v) => { try { localStorage.setItem("psplus-arcade-" + k, String(v)); } catch (e) {} };

function text(x, s, X, Y, col = "#fff", size = 8, align = "center") {
  x.font = `bold ${size}px "Courier New", monospace`; x.textAlign = align; x.textBaseline = "middle";
  x.fillStyle = "#000"; x.fillText(s, X + 1, Y + 1); x.fillStyle = col; x.fillText(s, X, Y);
}

// ---------------------------------------------------------------- Aisle Dash
function makeDash(sfx) {
  const LANES = [-1.3, 0, 1.3], CAMH = 2.5, F = 175, HZ = 58, PZ = 4.2;   // a high camera well behind the runner, so you can see what's coming
  const S = { lane: 1, lx: 0, y: 0, vy: 0, slide: 0, speed: 9, dist: 0, coins: 0, obs: [], next: 18, t: 0, dead: 0, run: 0 };
  const proj = (x, y, z) => ({ x: W / 2 + (x * F) / z, y: HZ + ((CAMH - y) * F) / z, s: F / z });
  function spawn() {
    const free = Math.floor(Math.random() * 3), kinds = ["crate", "bar", "wall"];
    for (let l = 0; l < 3; l++) {
      if (l === free) { if (Math.random() < 0.6) for (let i = 0; i < 4; i++) S.obs.push({ z: S.next + i * 1.6, lane: l, kind: "coin" }); continue; }
      if (Math.random() < 0.55) S.obs.push({ z: S.next, lane: l, kind: kinds[Math.floor(Math.random() * (S.dist > 300 ? 3 : 2))] });
    }
    S.next += rnd(9, 15) * (1 + S.speed / 40);
  }
  return {
    key(k, down) {
      if (!down || S.dead) return;
      if (k === "left") { S.lane = Math.max(0, S.lane - 1); sfx.tone(520, 0.05, "square", 0.05); }
      if (k === "right") { S.lane = Math.min(2, S.lane + 1); sfx.tone(520, 0.05, "square", 0.05); }
      if ((k === "up" || k === "fire") && S.y <= 0.001) { S.vy = 6.2; S.slide = 0; sfx.tone(330, 0.12, "square", 0.06, 660); }
      if (k === "down") { S.slide = 0.65; if (S.y > 0) S.vy = -9; sfx.tone(200, 0.1, "sawtooth", 0.04, 120); }
    },
    swipe(dir) { this.key(dir, true); },
    tap() { this.key("up", true); },
    update(dt) {
      if (S.dead) { S.dead += dt; return S.dead > 1.2 ? "over" : null; }
      S.t += dt; S.speed = Math.min(26, 9 + S.t * 0.22); const d = S.speed * dt; S.dist += d; S.run += dt * S.speed * 0.6;
      S.lx += (LANES[S.lane] - S.lx) * Math.min(1, dt * 14);
      S.vy -= 18 * dt; S.y = Math.max(0, S.y + S.vy * dt); if (S.y === 0) S.vy = Math.max(0, S.vy);
      S.slide = Math.max(0, S.slide - dt);
      while (S.next < 80) spawn();
      S.next -= d;
      for (const o of S.obs) o.z -= d;
      for (const o of S.obs) {
        if (o.hit || o.z > PZ + 0.45 || o.z < PZ - 0.45 || Math.abs(LANES[o.lane] - S.lx) > 0.65) continue;
        if (o.kind === "coin") { o.hit = true; S.coins++; sfx.tone(1320, 0.06, "square", 0.05, 1760); continue; }
        const clear = (o.kind === "crate" && S.y > 0.75) || (o.kind === "bar" && S.slide > 0);
        if (!clear) { S.dead = 0.001; sfx.noise(0.4, 0.2); sfx.tone(180, 0.5, "sawtooth", 0.08, 60); }
      }
      S.obs = S.obs.filter((o) => o.z > 0.6 && !(o.hit && o.kind === "coin"));
      return null;
    },
    score() { return Math.floor(S.dist) + S.coins * 25; },
    draw(x) {
      // night-time video shop aisle: ceiling strip lights, shelves of boxes, a lino floor
      x.fillStyle = "#0c1030"; x.fillRect(0, 0, W, HZ);
      x.fillStyle = "#121a44"; x.fillRect(0, HZ, W, H - HZ);
      const off = S.dist % 2;
      for (let i = 40; i > 0; i--) {
        const z1 = i * 2 - off, z0 = z1 - 2; if (z0 <= 0.3) continue;
        const a = proj(-2.1, 0, z1), b = proj(2.1, 0, z1), c = proj(2.1, 0, z0), e = proj(-2.1, 0, z0);
        x.fillStyle = i % 2 ? "#2b3570" : "#232c5e"; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(c.x, c.y); x.lineTo(e.x, e.y); x.fill();
        for (const side of [-1, 1]) {   // shelves
          const p = proj(side * 2.1, 0, z1), q = proj(side * 2.1, 2.6, z1), r = proj(side * 2.1, 2.6, z0), s = proj(side * 2.1, 0, z0);
          x.fillStyle = i % 2 ? "#1d2a6b" : "#18225a"; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.lineTo(r.x, r.y); x.lineTo(s.x, s.y); x.fill();
          for (let k = 0; k < 4; k++) {
            const y0 = 0.3 + k * 0.6, cols = ["#ffc925", "#ff4f6a", "#4fd8ff", "#7cff8a", "#b48cff"];
            const m = proj(side * 2.08, y0 + 0.45, (z0 + z1) / 2), n = proj(side * 2.08, y0, (z0 + z1) / 2);
            x.fillStyle = cols[(i * 3 + k + (side > 0 ? 2 : 0)) % 5]; x.fillRect(m.x - (side > 0 ? 0 : m.s * 0.5), m.y, m.s * 0.5, n.y - m.y);
          }
        }
        if (i % 3 === 0) { const l = proj(0, 3, z1); x.fillStyle = "#e9f0ff"; x.fillRect(l.x - l.s * 0.6, l.y - 1, l.s * 1.2, Math.max(1, l.s * 0.08)); }
      }
      // obstacles, far to near
      const list = S.obs.filter((o) => !o.hit).sort((a, b) => b.z - a.z);
      for (const o of list) {
        const X = LANES[o.lane], p = proj(X, 0, o.z);
        if (o.kind === "coin") { const q = proj(X, 0.6, o.z); x.fillStyle = "#ffc925"; x.beginPath(); x.ellipse(q.x, q.y, q.s * 0.18 * Math.abs(Math.sin(S.t * 5 + o.z)) + 1, q.s * 0.2, 0, 0, 6.3); x.fill(); continue; }
        if (o.kind === "crate") { const q = proj(X, 0.8, o.z); const w = p.s * 0.9; x.fillStyle = "#b5753a"; x.fillRect(p.x - w / 2, q.y, w, p.y - q.y); x.strokeStyle = "#6b3f17"; x.lineWidth = Math.max(1, p.s * 0.06); x.strokeRect(p.x - w / 2, q.y, w, p.y - q.y); x.beginPath(); x.moveTo(p.x - w / 2, q.y); x.lineTo(p.x + w / 2, p.y); x.moveTo(p.x + w / 2, q.y); x.lineTo(p.x - w / 2, p.y); x.stroke(); }
        if (o.kind === "bar") { const q = proj(X, 1.75, o.z), r = proj(X, 1.0, o.z), w = p.s * 1.1; x.fillStyle = "#555"; x.fillRect(p.x - w / 2, q.y, p.s * 0.06, p.y - q.y); x.fillRect(p.x + w / 2 - p.s * 0.06, q.y, p.s * 0.06, p.y - q.y); x.fillStyle = "#ffc925"; x.fillRect(p.x - w / 2, q.y, w, r.y - q.y); for (let k = 0; k < 4; k++) { x.fillStyle = "#111"; x.fillRect(p.x - w / 2 + (k * w) / 4, q.y, w / 8, r.y - q.y); } }
        if (o.kind === "wall") { const q = proj(X, 2.4, o.z), w = p.s * 1.15; x.fillStyle = "#c81e2e"; x.fillRect(p.x - w / 2, q.y, w, p.y - q.y); x.fillStyle = "#fff"; x.font = `bold ${Math.max(4, Math.floor(p.s * 0.28))}px monospace`; x.textAlign = "center"; x.fillText("SALE", p.x, (p.y + q.y) / 2); }
      }
      // the runner: a clerk in a blue shirt, seen from behind
      const pz = PZ, b = proj(S.lx, S.y, pz), sc = b.s / 62, sl = S.slide > 0, leg = Math.sin(S.run * 2.2) * 6 * sc;
      x.save(); x.translate(b.x, b.y); x.scale(sc, sc);
      x.fillStyle = "rgba(0,0,0,.35)"; x.beginPath(); x.ellipse(0, (proj(S.lx, 0, pz).y - b.y) / sc, 16, 5, 0, 0, 6.3); x.fill();
      if (sl) { x.fillStyle = "#1f2e7a"; x.fillRect(-14, -16, 28, 14); x.fillStyle = "#f0b48a"; x.fillRect(-7, -28, 14, 12); x.fillStyle = "#222"; x.fillRect(-8, -30, 16, 6); }
      else {
        x.fillStyle = "#222"; x.fillRect(-9, -20 + (S.y > 0 ? -4 : 0), 7, 20 + leg / sc * 0); x.fillRect(2, -20, 7, 20);
        x.fillStyle = "#333"; x.fillRect(-9, -22 + leg / sc, 7, 22); x.fillRect(2, -22 - leg / sc, 7, 22);
        x.fillStyle = "#2b49c9"; x.fillRect(-12, -48, 24, 28); x.fillStyle = "#ffc925"; x.fillRect(-12, -30, 24, 3);
        x.fillStyle = "#f0b48a"; x.fillRect(-17, -46 - leg / sc, 5, 18); x.fillRect(12, -46 + leg / sc, 5, 18);
        x.fillStyle = "#5a3a22"; x.fillRect(-8, -62, 16, 15);
      }
      x.restore();
      text(x, `${this.score()}`, W - 8, 10, "#ffc925", 10, "right"); text(x, `TAPES ${S.coins}`, 8, 10, "#fff", 8, "left");
      if (S.t < 3) text(x, "SWIPE OR ARROWS: DODGE, JUMP, SLIDE", W / 2, H - 14, "#fff", 7);
    },
  };
}

// ---------------------------------------------------------------- Midnight Cruise (now a sunny coast road)
// A sprite: a tiny canvas drawn pixel by pixel, scaled up later with smoothing off.
function sprite(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); draw(x, (col, X, Y, ww = 1, hh = 1) => { x.fillStyle = col; x.fillRect(X, Y, ww, hh); }); return c; }
let SPR = null;
function cruiseSprites() {
  if (SPR) return SPR;
  const palm = sprite(28, 48, (x, p) => {
    for (let i = 0; i < 34; i++) { const cx = 13 + Math.round(Math.sin(i / 11) * 3); p(i % 4 < 2 ? "#8a5a2b" : "#6b4220", cx, 47 - i, 3, 1); }
    const fr = [[-12, 4], [-9, -2], [-4, -6], [4, -6], [9, -2], [12, 4], [0, -7]];
    for (const [dx, dy] of fr) for (let k = 0; k < 9; k++) { const t = k / 8, X = 15 + Math.round(dx * t), Y = 13 + Math.round(dy * t + 5 * t * t); p(k % 2 ? "#1f8a3a" : "#2fb04a", X - 1, Y, 3, 2); }
    p("#5a3a12", 13, 12, 4, 3);
  });
  const bush = sprite(22, 10, (x, p) => { for (let i = 0; i < 26; i++) p(["#2fb04a", "#1f8a3a", "#58c95a"][i % 3], 2 + ((i * 7) % 18), 2 + ((i * 3) % 7), 3, 3); });
  const rock = sprite(18, 12, (x, p) => { p("#9a8a7a", 2, 4, 14, 8); p("#b8a898", 4, 2, 9, 4); p("#7a6a5a", 3, 9, 13, 3); });
  const board = sprite(56, 30, (x, p) => { p("#555", 8, 20, 3, 10); p("#555", 45, 20, 3, 10); p("#1f2e7a", 0, 0, 56, 21); p("#ffc925", 1, 1, 54, 2); p("#ffc925", 1, 18, 54, 2); x.fillStyle = "#fff"; x.font = "bold 7px monospace"; x.textAlign = "center"; x.fillText("WALL OF", 28, 9); x.fillStyle = "#ffc925"; x.fillText("PS PLUS", 28, 16); });
  const car = (body, dark) => sprite(30, 18, (x, p) => {
    p("#111", 2, 13, 6, 5); p("#111", 22, 13, 6, 5);
    p(body, 1, 6, 28, 9); p(dark, 1, 13, 28, 2); p(body, 5, 2, 20, 5); p("#20304a", 7, 3, 16, 4); p("#89a8d8", 8, 3, 6, 1);
    p("#ff2a2a", 2, 8, 5, 2); p("#ff2a2a", 23, 8, 5, 2); p("#eee", 12, 10, 6, 2);
  });
  const cars = [car("#2f6bd8", "#1f4a9a"), car("#ffc925", "#c99a10"), car("#f4f4f4", "#b8b8b8"), car("#2fb04a", "#1f8a3a"), car("#8a3ad8", "#5a1fa0")];
  const truck = sprite(34, 26, (x, p) => { p("#111", 3, 21, 7, 5); p("#111", 24, 21, 7, 5); p("#e8e0d0", 1, 1, 32, 21); p("#c8c0b0", 1, 18, 32, 3); p("#ff2a2a", 2, 16, 4, 2); p("#ff2a2a", 28, 16, 4, 2); p("#d7263d", 4, 6, 26, 6); });
  const me = (lean) => sprite(48, 26, (x, p) => {
    const sh = (y) => Math.round(lean * (14 - y) * 0.12);
    p("#111", 2, 18, 9, 8); p("#111", 37, 18, 9, 8);
    for (let y = 9; y < 21; y++) p(y > 18 ? "#9a1428" : "#d7263d", 1 + sh(y), y, 46, 1);
    p("#ff4a2a", 3 + sh(13), 12, 9, 3); p("#ff4a2a", 36 + sh(13), 12, 9, 3); p("#ffd27a", 19 + sh(16), 15, 10, 3);
    p("#1a1a1a", 6 + sh(7), 7, 36, 3);
    p("#5a3a22", 13 + sh(3), 1, 8, 7); p("#f0b48a", 14 + sh(6), 6, 6, 2);
    p("#ffd84a", 27 + sh(3), 0, 9, 8); p("#ffd84a", 26 + sh(5), 4, 2, 6);
    p("#89a8d8", 9 + sh(6), 5, 30, 2);
  });
  const cloud = sprite(40, 14, (x, p) => { p("#fff", 6, 6, 28, 7); p("#fff", 12, 2, 12, 6); p("#fff", 22, 3, 10, 5); p("#dceeff", 6, 11, 28, 2); });
  SPR = { palm, bush, rock, board, cars, truck, me: [me(-1), me(0), me(1)], cloud };
  return SPR;
}
function makeCruise(sfx) {
  const SP = cruiseSprites();
  const SEG = 200, RW = 1000, CAMH = 1060, DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180), DRAW = 130, MAXV = SEG * 60, PZ = CAMH * DEPTH;
  const CW = 0.42;   // a car is this wide, in half-road widths; ours and theirs alike
  const segs = []; let lastY = 0;
  const ease = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
  function addRoad(enter, hold, leave, curve, hill) {
    const startY = lastY, endY = startY + hill * SEG, n = enter + hold + leave;
    for (let i = 0; i < n; i++) {
      const c = i < enter ? ease(0, curve, i / enter) : i < enter + hold ? curve : ease(curve, 0, (i - enter - hold) / leave);
      const k = segs.length; segs.push({ i: k, curve: c, y1: k ? segs[k - 1].y2 : 0, y2: ease(startY, endY, (i + 1) / n), sprites: [] });
    }
    lastY = endY;
  }
  function more() {
    const from = segs.length;
    for (let k = 0; k < 6; k++) {
      const r = Math.random(), dir = Math.random() < 0.5 ? -1 : 1;
      if (r < 0.25) addRoad(25, 50, 25, 0, rnd(-25, 25));
      else if (r < 0.65) addRoad(30, 60, 30, rnd(2, 5) * dir, rnd(-35, 35));
      else addRoad(20, 35, 20, rnd(4, 7) * dir, rnd(-50, 50));
    }
    for (let i = from; i < segs.length; i++) {
      const s = segs[i];
      if (i % 6 === 0) s.sprites.push({ img: SP.palm, off: -1.5 - Math.random() * 0.4, w: 1.3, solid: true });
      if (i % 6 === 3) s.sprites.push({ img: SP.palm, off: 1.5 + Math.random() * 0.4, w: 1.3, solid: true });
      if (i % 9 === 1) s.sprites.push({ img: SP.bush, off: (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random()), w: 0.9 });
      if (i % 17 === 8) s.sprites.push({ img: SP.rock, off: (Math.random() < 0.5 ? -1 : 1) * (1.35 + Math.random() * 0.3), w: 0.7, solid: true });
      if (i % 97 === 40) s.sprites.push({ img: SP.board, off: (Math.random() < 0.5 ? -1.9 : 1.9), w: 2.2, solid: true });
    }
  }
  addRoad(10, 60, 10, 0, 0); more();
  const S = { pos: 0, x: 0, v: 0, time: 50, dist: 0, t: 0, next: 2, cars: [], over: 0, spin: 0, shake: 0, msg: "", msgT: 0, checks: 0, lean: 0 };
  for (let i = 0; i < 16; i++) S.cars.push(newCar(rnd(30, 700) * SEG));
  function newCar(z) { const big = Math.random() < 0.15; return { z, off: [-0.6, 0, 0.6][Math.floor(Math.random() * 3)] + rnd(-0.1, 0.1), v: rnd(0.3, 0.6) * MAXV, img: big ? SP.truck : SP.cars[Math.floor(Math.random() * SP.cars.length)], w: big ? CW * 1.15 : CW }; }
  const seg = (z) => { while (Math.floor(z / SEG) >= segs.length - DRAW - 5) more(); return segs[Math.floor(z / SEG)]; };
  const keys = { left: false, right: false, down: false };
  function crash(hard) { S.spin = hard ? 1.1 : 0.5; S.shake = 0.4; sfx.noise(hard ? 0.6 : 0.3, 0.2); sfx.tone(120, 0.4, "square", 0.06, 50); }
  return {
    key(k, down) { if (k in keys) keys[k] = down; },
    hold(zone) { keys.left = zone === "left"; keys.right = zone === "right"; keys.down = zone === "mid"; },
    tap() {},
    update(dt) {
      if (S.over) { S.over += dt; S.v = Math.max(0, S.v - MAXV * dt); S.pos += S.v * dt; return S.over > 2 ? "over" : null; }
      S.t += dt; S.time -= dt; S.msgT = Math.max(0, S.msgT - dt); S.shake = Math.max(0, S.shake - dt);
      const s = seg(S.pos + PZ), pct = S.v / MAXV;
      if (S.spin > 0) { S.spin -= dt; S.v = Math.max(0, S.v - MAXV * 1.4 * dt); }
      else {
        // pull hard from a standstill, ease off near the top, brake hard
        const accel = keys.down ? -MAXV * 1.1 : MAXV * (0.45 * (1 - pct) + 0.08);
        S.v = clamp(S.v + accel * dt, 0, MAXV);
      }
      const steer = S.spin > 0 ? 0 : (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      S.lean += (steer - S.lean) * Math.min(1, dt * 8);
      // steering grips better at low speed; corners push you outward with speed squared
      S.x += S.lean * dt * (1.6 + 0.9 * pct) * Math.min(1, pct * 3);
      S.x -= dt * pct * pct * s.curve * 0.34;
      const off = Math.abs(S.x) > 1;
      if (off) S.v = Math.max(S.v - MAXV * dt * 0.9, Math.min(S.v, MAXV * 0.35));
      if (off && pct > 0.2 && Math.random() < 0.3) sfx.noise(0.05, 0.03);
      if (Math.abs(S.lean) > 0.6 && pct > 0.75 && Math.abs(s.curve) > 3 && Math.random() < 0.12) sfx.tone(1400 + Math.random() * 300, 0.06, "sawtooth", 0.015);
      S.x = clamp(S.x, -2.6, 2.6);
      // roadside things: palms, rocks and billboards stop you dead
      if (off && S.spin <= 0) for (const sp of s.sprites) if (sp.solid && Math.abs(sp.off - S.x) < (sp.w * 0.35 + CW * 0.5) && Math.sign(sp.off) === Math.sign(S.x)) { crash(true); S.v = 0; S.x = Math.sign(S.x) * 0.9; break; }
      // traffic: same width as us, about a car length long
      const me = S.pos + PZ;
      for (const c of S.cars) {
        c.z += c.v * dt;
        if (c.z < S.pos - SEG * 4) Object.assign(c, newCar(S.pos + rnd(90, 150) * SEG));
        const dz = c.z - me;
        if (S.spin <= 0 && dz > -SEG * 0.5 && dz < SEG * 0.9 && Math.abs(c.off - S.x) < (c.w + CW) * 0.45) { crash(false); S.v = c.v * 0.55; S.x += S.x < c.off ? -0.18 : 0.18; c.z = me + SEG * 1.2; }
      }
      S.pos += S.v * dt; S.dist += (S.v * dt) / 200000;
      if (S.dist > S.next) { S.next += 2.2 + S.checks * 0.3; S.checks++; S.time += 28; S.msg = "CHECKPOINT"; S.msgT = 2; sfx.tone(880, 0.12, "square", 0.06, 1320); sfx.tone(1320, 0.25, "square", 0.05); }
      if (S.time <= 0) { S.time = 0; S.over = 0.001; S.msg = "TIME UP"; S.msgT = 9; sfx.tone(440, 0.6, "triangle", 0.08, 110); }
      sfx.engine(0.15 + pct * 0.85, off);
      return null;
    },
    score() { return Math.floor(S.dist * 1000); },
    stop() { sfx.engine(0); },
    draw(x) {
      const base = seg(S.pos), sway = (S.pos / SEG) * 0.6;
      // sky, sun, clouds, sea and the hills beyond
      const sky = x.createLinearGradient(0, 0, 0, 120); sky.addColorStop(0, "#2a7ae8"); sky.addColorStop(1, "#bfe6ff");
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      x.fillStyle = "#fff6c4"; x.beginPath(); x.arc(250, 36, 14, 0, 6.3); x.fill(); x.fillStyle = "rgba(255,246,196,.35)"; x.beginPath(); x.arc(250, 36, 22, 0, 6.3); x.fill();
      S.skyX = (S.skyX || 0) + base.curve * (S.v / MAXV) * 0.5;
      for (let i = 0; i < 5; i++) { const cx = ((i * 90 - S.skyX * 0.3) % (W + 60) + W + 60) % (W + 60) - 40; x.drawImage(SP.cloud, cx, 14 + (i % 3) * 16, 48, 17); }
      x.fillStyle = "#1f6ad0"; x.fillRect(0, 98, W, 22); x.fillStyle = "#7ec8ff"; for (let i = 0; i < 20; i++) x.fillRect(((i * 41 + S.t * 8) % W), 102 + (i % 4) * 4, 8, 1);
      x.fillStyle = "#4a8a5a"; for (let i = 0; i < 10; i++) { const hx = ((i * 60 - S.skyX * 0.8) % (W + 80) + W + 80) % (W + 80) - 40; x.beginPath(); x.moveTo(hx - 40, 118); x.lineTo(hx, 92 + (i % 3) * 5); x.lineTo(hx + 40, 118); x.fill(); }
      const baseI = Math.floor(S.pos / SEG), pct = (S.pos % SEG) / SEG, camY = CAMH + ease(base.y1, base.y2, pct);
      const shakeX = S.shake > 0 ? Math.sin(S.t * 90) * 3 : 0;
      let dx = -(base.curve * pct), xx = 0, maxy = H; const drawn = [];
      for (let n = 0; n < DRAW; n++) {
        const s = seg(S.pos + n * SEG), z0 = n * SEG - (S.pos % SEG), z1 = z0 + SEG, cx = S.x * RW;
        const p1 = { x: W / 2 + shakeX + ((xx - cx) * DEPTH / Math.max(z0, 1)) * (W / 2), y: H / 2 - ((s.y1 - camY) * DEPTH / Math.max(z0, 1)) * (H / 2), w: (RW * DEPTH / Math.max(z0, 1)) * (W / 2) };
        xx += dx; dx += s.curve;
        const p2 = { x: W / 2 + shakeX + ((xx - cx) * DEPTH / z1) * (W / 2), y: H / 2 - ((s.y2 - camY) * DEPTH / z1) * (H / 2), w: (RW * DEPTH / z1) * (W / 2) };
        drawn.push({ s, p: p1, n, z: z0, clip: maxy });
        if (z0 <= 0 || p2.y >= maxy || p2.y >= p1.y) continue;
        const odd = Math.floor((baseI + n) / 3) % 2;
        x.fillStyle = odd ? "#e8d29a" : "#f2deaa"; x.fillRect(0, p2.y, W, Math.ceil(p1.y - p2.y));
        const quad = (a, aw, b, bw, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(a.x - aw, a.y); x.lineTo(a.x + aw, a.y); x.lineTo(b.x + bw, b.y); x.lineTo(b.x - bw, b.y); x.fill(); };
        quad(p1, p1.w * 1.15, p2, p2.w * 1.15, odd ? "#e8262d" : "#ffffff");
        quad(p1, p1.w, p2, p2.w, odd ? "#8a8a96" : "#94949f");
        if (odd) for (const f of [-1 / 3, 1 / 3]) quad({ x: p1.x + p1.w * f, y: p1.y }, p1.w * 0.025, { x: p2.x + p2.w * f, y: p2.y }, p2.w * 0.025, "#ffffff");
        maxy = p2.y;
      }
      // roadside sprites and traffic, far to near, sized by the same rule as the road
      const sprW = (p, w) => w * p.w;
      for (let k = drawn.length - 1; k > 0; k--) {
        const d = drawn[k]; if (d.z <= 20) continue;
        const items = [];
        for (const sp of d.s.sprites) items.push({ img: sp.img, off: sp.off, w: sp.w });
        for (const c of S.cars) if (Math.floor((c.z - S.pos) / SEG) === d.n) items.push({ img: c.img, off: c.off, w: c.w });
        for (const it of items) {
          const w = sprW(d.p, it.w); if (w < 1) continue;
          const h = (w * it.img.height) / it.img.width, X = d.p.x + it.off * d.p.w - w / 2, Y = d.p.y - h;
          if (Y > d.clip) continue;
          const vis = Math.min(h, d.clip - Y); x.drawImage(it.img, 0, 0, it.img.width, it.img.height * (vis / h), X, Y, w, vis);
        }
      }
      // our car, sized exactly like the traffic at our distance
      const pw = (RW * DEPTH / PZ) * (W / 2), cw = CW * pw, ch = (cw * 26) / 48;
      const lean = S.spin > 0 ? Math.round(Math.sin(S.spin * 20)) : Math.round(S.lean), bob = Math.abs(S.x) > 1 && S.v > 0 ? Math.sin(S.t * 50) : 0;
      x.drawImage(SP.me[lean + 1], W / 2 - cw / 2, H - ch - 6 + bob, cw, ch);
      text(x, `TIME ${Math.ceil(S.time)}`, W / 2, 12, S.time < 10 ? "#ff2a2a" : "#ffe14a", 12);
      text(x, `${Math.floor((S.v / MAXV) * 290)} KM/H`, W - 8, 12, "#fff", 8, "right");
      text(x, `${S.dist.toFixed(2)} KM`, 8, 12, "#fff", 8, "left"); text(x, `NEXT ${Math.max(0, S.next - S.dist).toFixed(2)}`, 8, 24, "#ffe14a", 7, "left");
      if (S.msgT > 0) text(x, S.msg, W / 2, 60, S.msg === "TIME UP" ? "#ff2a2a" : "#ffe14a", 16);
      if (S.t < 3) text(x, "HOLD LEFT OR RIGHT TO STEER, MIDDLE TO BRAKE", W / 2, H - 4, "#fff", 6);
    },
  };
}

// ---------------------------------------------------------------- Tape Force (the tapes have grown flesh)
// You fire yourself now: hold fire for a steady stream, or tap fast for a quicker one. The level is a living
// tunnel of flesh and bone that you mustn't touch, full of biomechanical things.
function makeTape(sfx) {
  const S = { x: 50, y: H / 2, lives: 3, power: 0, shots: [], foes: [], bullets: [], caps: [], fx: [], t: 0, cool: 0, score: 0, wave: 0, nextWave: 1.5, inv: 2, boss: null, loop: 1, over: 0, scroll: 0, fireHeld: false, lastTap: 0, msg: "", msgT: 0 };
  const keys = { left: false, right: false, up: false, down: false };
  let drag = null;
  const POW = ["SPEED", "TWIN", "SPREAD", "SYMBIOTE", "SYMBIOTE", "CARAPACE"];
  const opts = [], trail = [];
  // the tunnel: flesh above and below, breathing in and out
  const wall = (X, top) => { const u = (X + S.scroll) * 0.02; const n = Math.sin(u) * 10 + Math.sin(u * 2.3 + 1) * 6 + Math.sin(u * 0.37 + (top ? 0 : 2)) * 14; const breathe = Math.sin(S.t * 1.6 + X * 0.01) * 3; return top ? 26 + n + breathe + Math.min(30, S.loop * 4) : H - 26 - n - breathe - Math.min(30, S.loop * 4); };
  function wave() {
    S.wave++;
    if (S.wave % 7 === 0) { const hp = 140 + 60 * S.loop; S.boss = { x: W + 80, y: H / 2, hp, max: hp, t: 0, open: 0 }; S.msg = "SOMETHING IS GROWING"; S.msgT = 2.5; sfx.tone(70, 1.5, "sawtooth", 0.09, 40); return; }
    const k = S.wave % 4, g = { left: 0 };
    const add = (f) => { S.foes.push(Object.assign({ t: 0, g, hp: 1, r: 7 }, f)); g.left++; };
    if (k === 1) for (let i = 0; i < 6; i++) add({ kind: "polyp", x: W + 12 + i * 20, y0: rnd(70, H - 70), hp: 2, t: -i * 0.2 });
    if (k === 2) { add({ kind: "worm", x: W + 20, y: rnd(70, H - 70), hp: 8, r: 8, seg: [] }); add({ kind: "pod", x: W + 60, top: true, hp: 5, r: 9 }); add({ kind: "pod", x: W + 140, top: false, hp: 5, r: 9 }); }
    if (k === 3) for (let i = 0; i < 8; i++) add({ kind: "fly", x: W + 10 + i * 14, y: i % 2 ? 60 : H - 60, hp: 1, r: 5 });
    if (k === 0) { add({ kind: "eye", x: W + 30, y: H / 2, hp: 14 + S.loop * 4, r: 14 }); for (let i = 0; i < 4; i++) add({ kind: "polyp", x: W + 60 + i * 24, y0: rnd(70, H - 70), hp: 2, t: -i * 0.2 }); }
    g.cap = true;
  }
  const near = (a, b, r) => Math.abs(a.x - b.x) < r && Math.abs(a.y - b.y) < r;
  function splat(x0, y0, big, col) { for (let i = 0; i < (big ? 40 : 12); i++) S.fx.push({ x: x0, y: y0, vx: rnd(-90, 90), vy: rnd(-90, 90), t: rnd(0.3, 0.8), col: col || (Math.random() < 0.5 ? "#c8395a" : "#e8d8c0") }); sfx.noise(big ? 0.6 : 0.18, big ? 0.22 : 0.09); sfx.tone(big ? 90 : 160, big ? 0.5 : 0.12, "sawtooth", 0.05, 40); }
  function shoot(f, ang, spd) { S.bullets.push({ x: f.x, y: f.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd }); }
  const aim = (f) => Math.atan2(S.y - f.y, S.x - f.x);
  function hurt() {
    if (S.inv > 0 || S.over) return;
    if (S.power >= 6) { S.power = 5; S.inv = 1; sfx.tone(300, 0.2, "square", 0.06); return; }
    S.lives--; splat(S.x, S.y, true, "#4fd8ff"); S.inv = 2.5; S.power = Math.max(0, S.power - 2); opts.length = Math.min(opts.length, Math.max(0, S.power - 3));
    if (S.lives <= 0) S.over = 0.001;
  }
  function fire() {
    const guns = [{ x: S.x, y: S.y }]; opts.forEach((_, i) => { const p = trail[(i + 1) * 14] || trail[trail.length - 1]; if (p) guns.push(p); });
    for (const g of guns) {
      S.shots.push({ x: g.x + 8, y: g.y, vx: 340, vy: 0 });
      if (S.power >= 2) S.shots.push({ x: g.x + 8, y: g.y - 4, vx: 340, vy: 0 });
      if (S.power >= 3) { S.shots.push({ x: g.x + 6, y: g.y, vx: 300, vy: -110 }); S.shots.push({ x: g.x + 6, y: g.y, vx: 300, vy: 110 }); }
    }
    sfx.tone(900, 0.04, "square", 0.025, 500);
  }
  return {
    key(k, down) {
      if (k === "fire") { if (down && !S.fireHeld && S.cool <= 0.06) { fire(); S.cool = 0.09; } S.fireHeld = down; return; }
      if (k in keys) keys[k] = down;
    },
    drag(dx, dy, start) { if (start) drag = { x: S.x, y: S.y }; if (drag) { S.x = clamp(drag.x + dx * 1.3, 8, W - 8); S.y = clamp(drag.y + dy * 1.3, 8, H - 8); } },
    fireHold(on) { this.key("fire", on); },
    tap() {},
    update(dt) {
      for (const f of S.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 60 * dt; f.t -= dt; }
      S.fx = S.fx.filter((f) => f.t > 0);
      if (S.over) { S.over += dt; return S.over > 1.8 ? "over" : null; }
      S.t += dt; S.inv = Math.max(0, S.inv - dt); S.msgT = Math.max(0, S.msgT - dt); S.scroll += dt * (40 + S.loop * 6);
      const sp = 85 + (S.power >= 1 ? 40 : 0);
      S.x = clamp(S.x + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * sp * dt, 8, W - 8);
      S.y = clamp(S.y + ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * sp * dt, 8, H - 8);
      trail.unshift({ x: S.x, y: S.y }); trail.length = 40;
      const nOpt = Math.max(0, Math.min(2, S.power - 3)); while (opts.length < nOpt) opts.push(0);
      S.cool -= dt; if (S.fireHeld && S.cool <= 0) { fire(); S.cool = 0.17; }
      // touching the tunnel walls hurts
      if (S.y < wall(S.x, true) + 4 || S.y > wall(S.x, false) - 4) hurt();
      if (!S.boss && S.foes.length === 0 && (S.nextWave -= dt) <= 0) { wave(); S.nextWave = Math.max(0.5, 1.4 - S.loop * 0.2); }
      const spd = 1 + (S.loop - 1) * 0.3, rate = 1 + (S.loop - 1) * 0.5;
      for (const f of S.foes) {
        f.t += dt;
        if (f.kind === "polyp") { f.x -= 55 * spd * dt; f.y = f.y0 + Math.sin(f.t * 2.4) * 38; if (f.t > 0.5 && Math.random() < 0.006 * rate) shoot(f, aim(f), 85 * spd); }
        if (f.kind === "fly") { f.x -= 95 * spd * dt; if (f.t > 0.5) f.y += Math.sign(S.y - f.y) * 70 * spd * dt; }
        if (f.kind === "pod") { f.x -= 40 * dt; f.y = f.top ? wall(f.x, true) + 8 : wall(f.x, false) - 8; if (f.t % (2.2 / rate) < dt && f.x < W - 10) for (const a of [-0.35, 0, 0.35]) shoot(f, aim(f) + a, 70 * spd); }
        if (f.kind === "eye") { f.x += ((W - 70) - f.x) * Math.min(1, dt * 0.6); f.y += (S.y - f.y) * dt * 0.5; if (f.t % (1.6 / rate) < dt) for (let i = 0; i < 3; i++) setTimeout(() => { if (f.hp > 0 && !S.over) shoot(f, aim(f), 110 * spd); }, i * 120); if (f.t > 14) f.x -= 80 * dt; }
        if (f.kind === "worm") {
          f.x -= 45 * spd * dt; f.y += Math.cos(f.t * 2) * 60 * dt; f.y = clamp(f.y, wall(f.x, true) + 14, wall(f.x, false) - 14);
          f.seg.unshift({ x: f.x, y: f.y }); f.seg.length = 70;
          for (let i = 8; i < 70; i += 8) { const p = f.seg[i]; if (p && near(p, S, 7)) hurt(); }
        }
      }
      if (S.boss) {
        const b = S.boss; b.t += dt; b.x += ((W - 70) - b.x) * Math.min(1, dt * 0.6); b.y = H / 2 + Math.sin(b.t * 0.7) * 50;
        b.open = (b.t % 5) > 3 ? 1 : 0;   // the eye at its heart opens for two seconds in every five
        if (b.t % (1.2 / rate) < dt) for (let a = -3; a <= 3; a++) shoot({ x: b.x - 30, y: b.y }, Math.PI + a * 0.22 + Math.sin(b.t) * 0.2, 95 * spd);
        if (b.t % 4 < dt && S.foes.length < 6) S.foes.push({ kind: "polyp", x: b.x - 20, y0: b.y, y: b.y, hp: 2, r: 7, t: 0, g: { left: 1 } });
      }
      for (const s of S.shots) { s.x += s.vx * dt; s.y += s.vy * dt; if (s.y < wall(s.x, true) || s.y > wall(s.x, false)) s.dead = 1; }
      for (const s of S.bullets) { s.x += s.vx * dt; s.y += s.vy * dt; }
      for (const c of S.caps) c.x -= 35 * dt;
      for (const s of S.shots) {
        if (s.dead) continue;
        for (const f of S.foes) if (f.hp > 0 && near(s, f, f.r + 2)) {
          s.dead = 1; f.hp--; f.flash = 0.06;
          if (f.hp <= 0) { splat(f.x, f.y, f.kind === "eye" || f.kind === "worm"); S.score += { polyp: 120, fly: 80, pod: 300, eye: 1500, worm: 800 }[f.kind] || 100; f.g.left--; if (f.g.left === 0 && f.g.cap) S.caps.push({ x: f.x, y: f.y }); }
          break;
        }
        if (!s.dead && S.boss && near(s, S.boss, 30)) {
          s.dead = 1;
          if (S.boss.open) { S.boss.hp--; S.boss.flash = 0.05; sfx.tone(160, 0.03, "sawtooth", 0.03); }
          else sfx.tone(2400, 0.02, "square", 0.01);   // bone; it bounces off
          if (S.boss.hp <= 0) { const b = S.boss; for (let i = 0; i < 4; i++) splat(b.x + rnd(-30, 30), b.y + rnd(-30, 30), true); S.score += 10000 * S.loop; S.boss = null; S.loop++; S.foes.length = 0; S.bullets.length = 0; S.caps.push({ x: W - 70, y: H / 2 }); S.msg = "IT'S DEAD. FOR NOW."; S.msgT = 2.5; }
        }
      }
      for (const f of S.foes) if (f.hp > 0 && near(f, S, f.r)) { if (f.kind !== "eye") { f.hp = 0; splat(f.x, f.y); } hurt(); }
      for (const b of S.bullets) if (near(b, S, 3.5)) { b.dead = 1; hurt(); }
      if (S.boss && near(S.boss, S, 34)) hurt();
      for (const c of S.caps) if (near(c, S, 10)) { c.dead = 1; S.power = Math.min(6, S.power + 1); S.score += 500; sfx.tone(440, 0.1, "triangle", 0.06, 880); sfx.tone(660, 0.2, "triangle", 0.05, 1320); S.msg = POW[S.power - 1]; S.msgT = 1.2; }
      S.shots = S.shots.filter((s) => !s.dead && s.x < W + 10 && s.y > -10 && s.y < H + 10);
      S.bullets = S.bullets.filter((s) => !s.dead && s.x > -10 && s.x < W + 10 && s.y > -10 && s.y < H + 10);
      S.foes = S.foes.filter((f) => f.hp > 0 && f.x > -60);
      S.caps = S.caps.filter((c) => !c.dead && c.x > -10);
      return null;
    },
    score() { return S.score; },
    _S: S,
    draw(x) {
      // the inside of something: wet dark walls, ribs, veins, all scrolling past
      x.fillStyle = "#0a0608"; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 9; i++) { const rx = ((i * 44 - S.scroll * 0.4) % (W + 44) + W + 44) % (W + 44) - 22; x.strokeStyle = "#1c1216"; x.lineWidth = 5; x.beginPath(); x.ellipse(rx, H / 2, 30, 110, 0, 0, 6.3); x.stroke(); }
      for (const top of [true, false]) {
        x.beginPath(); x.moveTo(0, top ? 0 : H);
        for (let X = 0; X <= W; X += 4) x.lineTo(X, wall(X, top));
        x.lineTo(W, top ? 0 : H); x.closePath();
        const gr = x.createLinearGradient(0, top ? 0 : H, 0, top ? 70 : H - 70); gr.addColorStop(0, "#2a1418"); gr.addColorStop(1, "#7a2a3a"); x.fillStyle = gr; x.fill();
        // vertebrae along the edge, bone-white
        for (let X = -((S.scroll) % 16); X < W; X += 16) { const Y = wall(X, top); x.fillStyle = "#cfc0a8"; x.fillRect(X, top ? Y - 6 : Y, 10, 6); x.fillStyle = "#6a5a4a"; x.fillRect(X + 3, top ? Y - 4 : Y + 2, 4, 2); }
        x.strokeStyle = "#a0304a"; x.lineWidth = 1; for (let k = 0; k < 4; k++) { x.beginPath(); for (let X = 0; X <= W; X += 8) { const Y = wall(X, top) + (top ? -10 - k * 7 : 10 + k * 7) + Math.sin((X + S.scroll) * 0.08 + k) * 3; X ? x.lineTo(X, Y) : x.moveTo(X, Y); } x.stroke(); }
      }
      for (const c of S.caps) { const p = 1 + Math.sin(S.t * 10) * 0.2; x.fillStyle = "#c8395a"; x.beginPath(); x.ellipse(c.x, c.y, 7 * p, 5 * p, 0, 0, 6.3); x.fill(); x.fillStyle = "#ffb0c0"; x.fillRect(c.x - 2, c.y - 2, 4, 2); }
      for (const f of S.foes) {
        const fl = f.flash > 0 ? ((f.flash -= 1 / 60), true) : false;
        if (f.kind === "polyp") { const p = 1 + Math.sin(S.t * 8 + f.y0) * 0.15; x.fillStyle = fl ? "#fff" : "#b8506a"; x.beginPath(); x.ellipse(f.x, f.y, 8 * p, 7, 0, 0, 6.3); x.fill(); x.fillStyle = "#e8d8c0"; x.beginPath(); x.arc(f.x - 2, f.y, 3, 0, 6.3); x.fill(); x.fillStyle = "#200"; x.fillRect(f.x - 3 + Math.sign(S.x - f.x), f.y - 1, 2, 2); x.strokeStyle = "#6a2a3a"; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(f.x + 6, f.y - 3 + k * 3); x.lineTo(f.x + 12 + Math.sin(S.t * 9 + k) * 2, f.y - 4 + k * 4); x.stroke(); } }
        if (f.kind === "fly") { x.fillStyle = fl ? "#fff" : "#3a3a44"; x.fillRect(f.x - 5, f.y - 2, 10, 4); x.fillStyle = "#8a8a9a"; x.fillRect(f.x - 6, f.y - 1, 2, 2); x.fillStyle = "rgba(200,220,255,.5)"; const w = Math.sin(S.t * 40) > 0 ? 5 : 2; x.fillRect(f.x - 2, f.y - 2 - w, 5, w); x.fillStyle = "#c8395a"; x.fillRect(f.x - 6, f.y, 2, 1); }
        if (f.kind === "pod") { const open = (f.t % 2.2) > 1.6; x.fillStyle = fl ? "#fff" : "#5a3a2a"; x.beginPath(); x.ellipse(f.x, f.y, 10, 8, 0, 0, 6.3); x.fill(); x.fillStyle = open ? "#ffd27a" : "#2a1418"; x.beginPath(); x.ellipse(f.x - 3, f.y + (f.top ? 3 : -3), open ? 5 : 3, open ? 3 : 1, 0, 0, 6.3); x.fill(); }
        if (f.kind === "eye") {
          x.fillStyle = "#3a2a30"; for (let k = 0; k < 6; k++) { x.save(); x.translate(f.x, f.y); x.rotate(k * 1.05 + Math.sin(S.t * 2 + k) * 0.2); x.fillRect(12, -1, 10, 3); x.restore(); }
          x.fillStyle = fl ? "#fff" : "#e8dcc8"; x.beginPath(); x.arc(f.x, f.y, 13, 0, 6.3); x.fill();
          x.strokeStyle = "#c8395a"; x.lineWidth = 1; for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(f.x + Math.cos(k) * 13, f.y + Math.sin(k) * 13); x.lineTo(f.x + Math.cos(k) * 6, f.y + Math.sin(k * 1.3) * 6); x.stroke(); }
          const a = aim(f); x.fillStyle = "#7a1a2a"; x.beginPath(); x.arc(f.x + Math.cos(a) * 5, f.y + Math.sin(a) * 5, 6, 0, 6.3); x.fill(); x.fillStyle = "#000"; x.beginPath(); x.ellipse(f.x + Math.cos(a) * 6, f.y + Math.sin(a) * 6, 2, 4, 0, 0, 6.3); x.fill();
        }
        if (f.kind === "worm") {
          for (let i = 66; i >= 0; i -= 6) { const p = f.seg[i]; if (!p) continue; x.fillStyle = i % 12 ? "#cfc0a8" : "#9a8a78"; x.fillRect(p.x - 5, p.y - 6, 10, 12); x.fillStyle = "#4a3a30"; x.fillRect(p.x - 1, p.y - 6, 2, 12); }
          x.fillStyle = fl ? "#fff" : "#b8506a"; x.beginPath(); x.arc(f.x, f.y, 9, 0, 6.3); x.fill(); x.fillStyle = "#200"; x.beginPath(); x.arc(f.x - 4, f.y, 5, 0, 6.3); x.fill(); x.fillStyle = "#e8d8c0"; for (let k = 0; k < 5; k++) x.fillRect(f.x - 8 + (k % 2), f.y - 4 + k * 2, 3, 1);
        }
      }
      if (S.boss) {
        const b = S.boss, fl = b.flash > 0 ? ((b.flash -= 1 / 60), true) : false;
        // a cassette that has grown a ribcage and a heart, plugged in by tubes
        x.strokeStyle = "#3a3440"; x.lineWidth = 4; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(b.x + 30, b.y - 20 + k * 13); x.bezierCurveTo(b.x + 60, b.y - 40 + k * 20, W - 10, b.y + 20 - k * 10, W + 10, 20 + k * 60); x.stroke(); }
        x.fillStyle = "#2a2830"; x.fillRect(b.x - 34, b.y - 30, 68, 60); x.fillStyle = "#4a4650"; x.fillRect(b.x - 30, b.y - 26, 60, 52);
        x.strokeStyle = "#cfc0a8"; x.lineWidth = 3; for (let k = -2; k <= 2; k++) { x.beginPath(); x.ellipse(b.x - 6, b.y + k * 9, 30, 6, 0, Math.PI * 0.55, Math.PI * 1.45); x.stroke(); }
        const beat = 1 + Math.abs(Math.sin(b.t * 3)) * 0.15;
        x.fillStyle = b.open ? (fl ? "#fff" : "#e8dcc8") : "#7a2a3a"; x.beginPath(); x.ellipse(b.x - 22, b.y, 12 * beat, (b.open ? 11 : 3) * beat, 0, 0, 6.3); x.fill();
        if (b.open) { x.fillStyle = "#c81e2e"; x.beginPath(); x.arc(b.x - 25, b.y, 5, 0, 6.3); x.fill(); x.fillStyle = "#000"; x.fillRect(b.x - 26, b.y - 3, 2, 6); }
        x.fillStyle = "#c8395a"; x.fillRect(W / 2 - 60, 16, 120 * (b.hp / b.max), 4); x.strokeStyle = "#cfc0a8"; x.lineWidth = 1; x.strokeRect(W / 2 - 60, 16, 120, 4);
        if (!b.open && Math.floor(S.t * 2) % 2) text(x, "WAIT FOR THE EYE", W / 2, 28, "#cfc0a8", 6);
      }
      x.fillStyle = "#9fe8ff"; for (const s of S.shots) x.fillRect(s.x - 3, s.y - 1, 6, 2);
      for (const s of S.bullets) { x.fillStyle = "#ffd27a"; x.beginPath(); x.arc(s.x, s.y, 2.5, 0, 6.3); x.fill(); x.fillStyle = "#c8395a"; x.fillRect(s.x - 1, s.y - 1, 2, 2); }
      for (const f of S.fx) { x.fillStyle = f.col; x.fillRect(f.x, f.y, 2, 2); }
      opts.forEach((_, i) => { const p = trail[(i + 1) * 14] || trail[trail.length - 1]; if (!p) return; x.fillStyle = "#b8506a"; x.beginPath(); x.arc(p.x, p.y, 4 + Math.sin(S.t * 8) * 0.8, 0, 6.3); x.fill(); x.fillStyle = "#e8d8c0"; x.fillRect(p.x - 1, p.y - 1, 2, 2); });
      if (!(S.inv > 0 && Math.floor(S.t * 12) % 2) && !(S.over && S.lives <= 0)) {
        x.fillStyle = "#e9ecff"; x.beginPath(); x.moveTo(S.x + 10, S.y); x.lineTo(S.x - 8, S.y - 6); x.lineTo(S.x - 4, S.y); x.lineTo(S.x - 8, S.y + 6); x.fill();
        x.fillStyle = "#4fd8ff"; x.fillRect(S.x - 2, S.y - 2, 5, 3); x.fillStyle = (S.t * 20) % 1 > 0.5 ? "#ff7a1a" : "#ffc925"; x.fillRect(S.x - 11, S.y - 1, 3, 2);
        if (S.power >= 6) { x.strokeStyle = "#cfc0a8"; x.beginPath(); x.arc(S.x, S.y, 12, -1.2, 1.2); x.stroke(); }
      }
      text(x, String(S.score).padStart(7, "0"), W - 8, 8, "#e8d8c0", 8, "right");
      text(x, "♥".repeat(Math.max(0, S.lives)), 8, 8, "#c8395a", 8, "left");
      for (let i = 0; i < 6; i++) { x.fillStyle = i < S.power ? "#c8395a" : "#2a1418"; x.fillRect(60 + i * 30, H - 8, 28, 5); }
      text(x, S.power < 6 ? "NEXT: " + POW[S.power] : "MAX", 60 + 6 * 30 + 6, H - 6, "#e8d8c0", 6, "left");
      if (S.msgT > 0) text(x, S.msg, W / 2, 46, "#e8d8c0", 10);
      if (S.t < 4) text(x, "HOLD FIRE OR TAP IT FAST. DON'T TOUCH THE WALLS.", W / 2, H - 20, "#fff", 6);
    },
  };
}

const MAKERS = { dash: makeDash, cruise: makeCruise, tape: makeTape };

// The little loop on each cabinet's screen in the shop.
export function attract(kind, x, t, w, h) {
  const g = GAMES[kind]; x.save(); x.scale(w / W, h / H);
  x.fillStyle = "#05061a"; x.fillRect(0, 0, W, H);
  if (kind === "dash") { for (let i = 0; i < 8; i++) { const y = 120 + ((i * 20 + t * 60) % 120); x.fillStyle = i % 2 ? "#2b3570" : "#232c5e"; x.fillRect(160 - (y - 100) * 1.2, y, (y - 100) * 2.4, 12); } }
  if (kind === "cruise") {
    const sky = x.createLinearGradient(0, 0, 0, 120); sky.addColorStop(0, "#2a7ae8"); sky.addColorStop(1, "#bfe6ff"); x.fillStyle = sky; x.fillRect(0, 0, W, 120);
    x.fillStyle = "#1f6ad0"; x.fillRect(0, 100, W, 20); x.fillStyle = "#f2deaa"; x.fillRect(0, 120, W, 120);
    x.fillStyle = "#94949f"; x.beginPath(); x.moveTo(150, 120); x.lineTo(170, 120); x.lineTo(300, 240); x.lineTo(20, 240); x.fill();
    x.fillStyle = "#fff"; for (let i = 0; i < 5; i++) { const y = 125 + ((i * 25 + t * 90) % 115); x.fillRect(159, y, 3, 4 + (y - 120) * 0.12); }
    const P = cruiseSprites(); for (const sx of [-1, 1]) { const y = 120 + ((t * 70) % 120), sc = (y - 115) / 60; x.drawImage(P.palm, 160 + sx * (20 + (y - 120) * 1.3) - 14 * sc, y - 48 * sc, 28 * sc, 48 * sc); }
    x.drawImage(P.me[1], 136, 200, 48, 26);
  }
  if (kind === "tape") {
    x.fillStyle = "#0a0608"; x.fillRect(0, 0, W, H);
    for (const top of [true, false]) { x.fillStyle = "#7a2a3a"; x.beginPath(); x.moveTo(0, top ? 0 : H); for (let X = 0; X <= W; X += 8) x.lineTo(X, top ? 30 + Math.sin(X * 0.03 + t * 2) * 10 : H - 30 - Math.sin(X * 0.03 + t * 2 + 2) * 10); x.lineTo(W, top ? 0 : H); x.fill(); }
    const ey = 140 + Math.sin(t * 1.3) * 20; x.fillStyle = "#e8dcc8"; x.beginPath(); x.arc(230, ey, 22, 0, 6.3); x.fill(); x.fillStyle = "#7a1a2a"; x.beginPath(); x.arc(222, ey, 10, 0, 6.3); x.fill(); x.fillStyle = "#000"; x.fillRect(220, ey - 6, 4, 12);
    x.fillStyle = "#e9ecff"; const y = 130 + Math.sin(t * 2) * 30; x.beginPath(); x.moveTo(80, y); x.lineTo(60, y - 8); x.lineTo(64, y); x.lineTo(60, y + 8); x.fill();
  }
  text(x, g.title, W / 2, 50, g.col, 26);
  if (Math.floor(t * 2) % 2) text(x, "PRESS START", W / 2, 200, "#fff", 16);
  x.restore();
}

// ---------------------------------------------------------------- the cabinet overlay
// host: { sfx: { tone, noise, engine }, onClose() }
export function openArcade(kind, host) {
  const info = GAMES[kind], root = document.getElementById("arcade"), cv = document.getElementById("arcv"), x = cv.getContext("2d");
  x.imageSmoothingEnabled = false;
  root.hidden = false; root.dataset.game = kind; document.getElementById("arctitle").textContent = info.title;
  let game = null, state = "title", t = 0, last = performance.now(), raf = 0, acc = 0, finalScore = 0, newBest = false;
  const sfx = host.sfx;
  function start() { game = MAKERS[kind](sfx); if (location.hash.includes("debug")) window.__arc = game; state = "play"; t = 0; sfx.tone(523, 0.08, "square", 0.05); sfx.tone(784, 0.12, "square", 0.05); }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (state === "play") {
      acc += dt;
      while (acc >= 1 / 60) { acc -= 1 / 60; const r = game.update(1 / 60); if (r === "over") { over(); break; } }
      if (game) game.draw(x);
    } else if (state === "title") {
      attract(kind, x, t, W, H);
      text(x, info.blurb.toUpperCase(), W / 2, 80, "#fff", 8);
      text(x, `BEST ${best(kind)}`, W / 2, 230, "#ffc925", 8);
    } else if (state === "over") {
      game.draw(x); x.fillStyle = "rgba(4,5,26,.75)"; x.fillRect(0, 70, W, 100);
      text(x, "GAME OVER", W / 2, 92, "#ff4f6a", 20);
      text(x, `SCORE ${finalScore}`, W / 2, 118, "#fff", 10);
      text(x, newBest ? "NEW BEST!" : `BEST ${best(kind)}`, W / 2, 134, "#ffc925", 9);
      if (t > 1 && Math.floor(t * 2) % 2) text(x, "PRESS START TO PLAY AGAIN", W / 2, 156, "#fff", 8);
    }
  }
  function over() {
    state = "over"; t = 0; finalScore = game.score(); if (game.stop) game.stop();
    newBest = finalScore > best(kind); if (newBest) saveBest(kind, finalScore);
  }
  function press() { if (state === "title" || (state === "over" && t > 1)) start(); }
  const KEYMAP = { arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "up", w: "up", arrowdown: "down", s: "down", " ": "fire", enter: "fire", z: "fire", j: "fire" };
  function kd(e) {
    const k = e.key.toLowerCase();
    if (k === "escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    const m = KEYMAP[k]; if (!m && k !== "enter") return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat && (kind === "dash" || m === "fire")) return;
    if (state !== "play") { if (m === "fire") press(); return; }
    game.key(m, true);
  }
  function ku(e) { const m = KEYMAP[e.key.toLowerCase()]; if (!m) return; e.stopImmediatePropagation(); if (state === "play") game.key(m, false); }
  // touch: swipes for the runner, held zones for the racer, relative drag for the shooter
  let tp = null, fp = null;
  function pd(e) {
    if (e.target.closest("button")) return; e.preventDefault();
    if (state !== "play") { press(); return; }
    try { root.setPointerCapture(e.pointerId); } catch (er) {}
    // Tape Force on a phone: the right half of the screen is the fire button, the left half steers
    if (kind === "tape" && e.clientX > innerWidth / 2) { fp = e.pointerId; game.fireHold(true); return; }
    if (tp) return;
    const r = cv.getBoundingClientRect(); tp = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: W / r.width, swiped: false };
    if (kind === "cruise") game.hold(zone(e.clientX));
    if (kind === "tape") game.drag(0, 0, true);
  }
  const zone = (cx) => (cx < innerWidth / 3 ? "left" : cx > (innerWidth * 2) / 3 ? "right" : "mid");
  function pm(e) {
    if (!tp || e.pointerId !== tp.id || state !== "play") return;
    const dx = e.clientX - tp.x, dy = e.clientY - tp.y;
    if (kind === "tape") game.drag(dx * tp.sx, dy * tp.sx);
    if (kind === "cruise") game.hold(zone(e.clientX));
    if (kind === "dash" && !tp.swiped && Math.hypot(dx, dy) > 28) { tp.swiped = true; game.swipe(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down"); }
  }
  function pu(e) {
    if (e.pointerId === fp) { fp = null; if (state === "play") game.fireHold(false); return; }
    if (!tp || e.pointerId !== tp.id) return;
    if (state === "play") { if (kind === "cruise") game.hold(null); if (kind === "dash" && !tp.swiped) game.tap(); }
    tp = null;
  }
  addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
  root.addEventListener("pointerdown", pd); root.addEventListener("pointermove", pm); root.addEventListener("pointerup", pu); root.addEventListener("pointercancel", pu);
  const closeBtn = document.getElementById("arcclose"); closeBtn.onclick = close;
  const hint = document.getElementById("archint");
  hint.textContent = { dash: "Arrows or WASD: left and right to change lanes, up to jump, down to slide. On a phone, swipe.", cruise: "Left and right to steer, down to brake. It accelerates on its own. On a phone, hold the left or right side to steer and the middle to brake.", tape: "Arrows or WASD to fly, space or Z to fire (hold it, or tap fast for quicker shots). On a phone, drag on the left half to fly and hold the right half to fire." }[kind];
  raf = requestAnimationFrame(frame);
  function close() {
    cancelAnimationFrame(raf); if (game && game.stop) game.stop();
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true);
    root.removeEventListener("pointerdown", pd); root.removeEventListener("pointermove", pm); root.removeEventListener("pointerup", pu); root.removeEventListener("pointercancel", pu);
    root.hidden = true; host.onClose();
  }
  return { close };
}
