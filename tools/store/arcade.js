// The arcade corner: three small games drawn on a 320x240 canvas and scaled up, like a cabinet screen.
//   dash   - Aisle Dash: an endless runner into the screen. Change lanes, jump crates, slide under signs.
//   cruise - Midnight Cruise: a pseudo-3D road racer at night. Beat the clock to each checkpoint.
//   tape   - Tape Force: a side-scrolling shooter with auto fire, power-up capsules and a boss.
// Keyboard on a computer, touch on a phone. Each keeps a best score in localStorage.
// attract() draws the little demo loop shown on each cabinet's screen in the shop.

export const GAMES = {
  dash: { title: "AISLE DASH", col: "#ffc925", blurb: "Run the aisles after closing" },
  cruise: { title: "MIDNIGHT CRUISE", col: "#ff4fd8", blurb: "Beat the clock to each checkpoint" },
  tape: { title: "TAPE FORCE", col: "#4fd8ff", blurb: "Auto fire. Grab the capsules." },
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
  const LANES = [-1.3, 0, 1.3], CAMH = 1.25, F = 150, HZ = 92;
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
      while (S.next < 70) spawn();
      S.next -= d;
      for (const o of S.obs) o.z -= d;
      for (const o of S.obs) {
        if (o.hit || o.z > 2.6 || o.z < 1.6 || Math.abs(LANES[o.lane] - S.lx) > 0.65) continue;
        if (o.kind === "coin") { o.hit = true; S.coins++; sfx.tone(1320, 0.06, "square", 0.05, 1760); continue; }
        const clear = (o.kind === "crate" && S.y > 0.75) || (o.kind === "bar" && S.slide > 0);
        if (!clear) { S.dead = 0.001; sfx.noise(0.4, 0.2); sfx.tone(180, 0.5, "sawtooth", 0.08, 60); }
      }
      S.obs = S.obs.filter((o) => o.z > 0.4 && !(o.hit && o.kind === "coin"));
      return null;
    },
    score() { return Math.floor(S.dist) + S.coins * 25; },
    draw(x) {
      // night-time video shop aisle: ceiling strip lights, shelves of boxes, a lino floor
      x.fillStyle = "#0c1030"; x.fillRect(0, 0, W, HZ);
      x.fillStyle = "#121a44"; x.fillRect(0, HZ, W, H - HZ);
      const off = S.dist % 2;
      for (let i = 30; i > 0; i--) {
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
      const pz = 2.2, b = proj(S.lx, S.y, pz), sc = b.s / 48, sl = S.slide > 0, leg = Math.sin(S.run * 2.2) * 6 * sc;
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

// ---------------------------------------------------------------- Midnight Cruise
function makeCruise(sfx) {
  const SEG = 200, RW = 2000, LANES = 3, CAMH = 1000, DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180), DRAW = 120, MAXV = SEG * 60, PZ = CAMH * DEPTH;
  const segs = []; let lastY = 0;
  const ease = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
  function addRoad(enter, hold, leave, curve, hill) {
    const startY = lastY, endY = startY + hill * SEG, n = enter + hold + leave;
    for (let i = 0; i < n; i++) {
      const c = i < enter ? ease(0, curve, i / enter) : i < enter + hold ? curve : ease(curve, 0, (i - enter - hold) / leave);
      const y = ease(startY, endY, i / n), k = segs.length;
      segs.push({ i: k, curve: c, y1: k ? segs[k - 1].y2 : 0, y2: y, sprites: [], cars: [], check: false });
    }
    lastY = endY;
  }
  function more() {
    for (let k = 0; k < 6; k++) {
      const r = Math.random();
      if (r < 0.25) addRoad(25, 50, 25, 0, rnd(-20, 20));
      else if (r < 0.6) addRoad(30, 60, 30, rnd(2, 6) * (Math.random() < 0.5 ? -1 : 1), rnd(-30, 30));
      else addRoad(20, 30, 20, rnd(1, 4) * (Math.random() < 0.5 ? -1 : 1), rnd(-60, 60));
    }
    for (let i = Math.max(0, segs.length - 900); i < segs.length; i++) {
      const s = segs[i]; if (s.decor) continue; s.decor = true;
      if (i % 8 === 0) s.sprites.push({ kind: "lamp", off: -1.25 }, { kind: "lamp", off: 1.25 });
      if (i % 23 === 5) s.sprites.push({ kind: "palm", off: Math.random() < 0.5 ? -1.7 : 1.7 });
      if (i % 61 === 11) s.sprites.push({ kind: "sign", off: Math.random() < 0.5 ? -1.6 : 1.6 });
    }
  }
  addRoad(10, 40, 10, 0, 0); more();
  const S = { pos: 0, x: 0, v: 0, time: 45, dist: 0, t: 0, next: 2, steer: 0, brake: false, cars: [], over: 0, bump: 0, msg: "", msgT: 0, checks: 0 };
  for (let i = 0; i < 18; i++) S.cars.push({ z: rnd(40, 900) * SEG, off: rnd(-0.8, 0.8), v: rnd(0.25, 0.55) * MAXV, col: ["#4fd8ff", "#ffc925", "#7cff8a", "#ffffff", "#b48cff"][i % 5] });
  const seg = (z) => { while (Math.floor(z / SEG) >= segs.length - DRAW - 5) more(); return segs[Math.floor(z / SEG) % segs.length]; };
  const keys = { left: false, right: false, down: false };
  return {
    key(k, down) { if (k in keys) keys[k] = down; },
    hold(zone) { keys.left = zone === "left"; keys.right = zone === "right"; keys.down = zone === "mid"; },
    tap() {},
    update(dt) {
      if (S.over) { S.over += dt; return S.over > 1.5 ? "over" : null; }
      S.t += dt; S.time -= dt; S.msgT = Math.max(0, S.msgT - dt);
      const s = seg(S.pos + PZ), speedPct = S.v / MAXV;
      const accel = keys.down ? -MAXV : MAXV / 4.5;
      S.v = clamp(S.v + accel * dt, 0, MAXV);
      const steer = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      S.x += steer * dt * 2.2 * speedPct; S.x -= dt * 2.2 * speedPct * speedPct * s.curve * 0.3;
      if (Math.abs(S.x) > 1) { S.v = Math.max(S.v - MAXV * dt * 1.2, MAXV / 4); S.bump += dt; } else S.bump = 0;
      S.x = clamp(S.x, -2.2, 2.2);
      for (const c of S.cars) {
        c.z += c.v * dt; if (c.z < S.pos - SEG * 5) { c.z = S.pos + rnd(60, 140) * SEG; c.off = rnd(-0.8, 0.8); }
        const rel = c.z - (S.pos + PZ);
        if (rel > -SEG * 0.6 && rel < SEG * 0.6 && Math.abs(c.off - S.x) < 0.38 && S.v > c.v) { S.v = c.v * 0.6; S.x += S.x < c.off ? -0.25 : 0.25; sfx.noise(0.25, 0.15); sfx.tone(110, 0.25, "square", 0.06, 60); }
      }
      S.pos += S.v * dt; S.dist += (S.v * dt) / 200000;   // top speed is about 0.06 km a second, 216 km/h
      if (S.dist > S.next) { S.next += 2 + S.checks * 0.25; S.checks++; S.time += 30; S.msg = "CHECKPOINT +30"; S.msgT = 2; sfx.tone(880, 0.12, "square", 0.06, 1320); sfx.tone(1320, 0.2, "square", 0.05); }
      if (S.time <= 0) { S.time = 0; S.over = 0.001; S.msg = "TIME UP"; S.msgT = 9; sfx.tone(440, 0.6, "triangle", 0.08, 110); }
      sfx.engine(0.2 + speedPct * 0.8, S.bump > 0);
      return null;
    },
    score() { return Math.floor(S.dist * 1000); },
    stop() { sfx.engine(0); },
    draw(x) {
      const sky = x.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, "#05061a"); sky.addColorStop(1, "#5a1f6a");
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      x.fillStyle = "#ff7ad9"; x.beginPath(); x.arc(W / 2, 108, 34, Math.PI, 0); x.fill();
      x.fillStyle = "#5a1f6a"; for (let i = 0; i < 6; i++) x.fillRect(W / 2 - 36, 80 + i * 5, 72, 1 + i * 0.4);
      const base = seg(S.pos), skyOff = (S.pos / SEG) * base.curve * 0.002;
      x.fillStyle = "#14103a"; for (let i = 0; i < 18; i++) { const bx = ((i * 37 - skyOff * 200) % (W + 40) + W + 40) % (W + 40) - 20, bh = 18 + ((i * 53) % 30); x.fillRect(bx, 112 - bh, 26, bh); }
      x.fillStyle = "#ffd27a"; for (let i = 0; i < 18; i++) { const bx = ((i * 37 - skyOff * 200) % (W + 40) + W + 40) % (W + 40) - 20; for (let k = 0; k < 4; k++) if ((i * 7 + k) % 3 === 0) x.fillRect(bx + 4 + (k % 2) * 10, 112 - 14 - Math.floor(k / 2) * 7, 3, 3); }
      const baseI = Math.floor(S.pos / SEG), pct = (S.pos % SEG) / SEG, camY = CAMH + ease(base.y1, base.y2, pct);
      let dx = -(base.curve * pct), xx = 0, maxy = H; const drawn = [];
      for (let n = 0; n < DRAW; n++) {
        const s = seg(S.pos + n * SEG), z0 = n * SEG - (S.pos % SEG), z1 = z0 + SEG;
        const cx = S.x * RW;
        const p1 = { x: (W / 2) + ((xx - cx) * DEPTH / Math.max(z0, 1)) * (W / 2), y: (H / 2) - ((s.y1 - camY) * DEPTH / Math.max(z0, 1)) * (H / 2), w: (RW * DEPTH / Math.max(z0, 1)) * (W / 2) };
        xx += dx; dx += s.curve;
        const p2 = { x: (W / 2) + ((xx - cx) * DEPTH / z1) * (W / 2), y: (H / 2) - ((s.y2 - camY) * DEPTH / z1) * (H / 2), w: (RW * DEPTH / z1) * (W / 2) };
        drawn.push({ s, p: p1, n, z: z0 });
        if (z0 <= 0 || p2.y >= maxy || p2.y >= p1.y) continue;
        const odd = Math.floor((baseI + n) / 3) % 2;
        x.fillStyle = odd ? "#10142e" : "#141a3a"; x.fillRect(0, p2.y, W, p1.y - p2.y);
        const quad = (a, aw, b, bw, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(a.x - aw, a.y); x.lineTo(a.x + aw, a.y); x.lineTo(b.x + bw, b.y); x.lineTo(b.x - bw, b.y); x.fill(); };
        quad(p1, p1.w * 1.12, p2, p2.w * 1.12, odd ? "#ff2a6d" : "#f4f4f4");
        quad(p1, p1.w, p2, p2.w, odd ? "#2a2d44" : "#30344d");
        if (odd) for (let l = 1; l < LANES; l++) { const f = -1 + (2 * l) / LANES; quad({ x: p1.x + p1.w * f, y: p1.y }, p1.w * 0.02, { x: p2.x + p2.w * f, y: p2.y }, p2.w * 0.02, "#ffc925"); }
        maxy = p2.y;
      }
      // roadside things and other cars, far to near
      for (let k = drawn.length - 1; k > 0; k--) {
        const d = drawn[k]; if (d.z <= 10) continue; const sc = d.p.w / RW;
        for (const sp of d.s.sprites) {
          const X = d.p.x + sp.off * d.p.w, Y = d.p.y;
          if (sp.kind === "lamp") { const h = 1500 * sc; x.fillStyle = "#2a2d44"; x.fillRect(X - 30 * sc, Y - h, 60 * sc + 0.5, h); x.fillStyle = "#ffe6a8"; x.fillRect(X - (sp.off < 0 ? 0 : 200 * sc), Y - h, 200 * sc + 1, 50 * sc + 1); }
          if (sp.kind === "palm") { const h = 2200 * sc; x.fillStyle = "#3b2a1a"; x.fillRect(X - 50 * sc, Y - h, 100 * sc + 0.5, h); x.fillStyle = "#1d6b3a"; for (let a = 0; a < 5; a++) { x.beginPath(); x.ellipse(X + Math.cos(a * 1.3) * 300 * sc, Y - h + Math.sin(a * 1.3) * 80 * sc, 380 * sc, 90 * sc, a * 1.3, 0, 6.3); x.fill(); } }
          if (sp.kind === "sign") { const h = 1700 * sc; x.fillStyle = "#2a2d44"; x.fillRect(X - 20 * sc, Y - h, 40 * sc + 0.5, h); x.fillStyle = "#1f2e7a"; x.fillRect(X - 700 * sc, Y - h - 500 * sc, 1400 * sc, 520 * sc); if (sc > 0.008) text(x, "WALL OF PS PLUS", X, Y - h - 240 * sc, "#ffc925", Math.max(4, Math.floor(160 * sc)), "center"); }
        }
        for (const c of S.cars) {
          const n = Math.floor((c.z - S.pos) / SEG);
          if (n !== d.n) continue;
          const X = d.p.x + c.off * d.p.w, w = 500 * sc, h = 260 * sc;
          x.fillStyle = c.col; x.fillRect(X - w / 2, d.p.y - h, w, h * 0.7); x.fillStyle = "#111"; x.fillRect(X - w * 0.35, d.p.y - h, w * 0.7, h * 0.3);
          x.fillStyle = "#ff2a2a"; x.fillRect(X - w / 2, d.p.y - h * 0.55, w * 0.18, h * 0.14); x.fillRect(X + w * 0.32, d.p.y - h * 0.55, w * 0.18, h * 0.14);
          x.fillStyle = "#000"; x.fillRect(X - w / 2, d.p.y - h * 0.3, w * 0.2, h * 0.3); x.fillRect(X + w * 0.3, d.p.y - h * 0.3, w * 0.2, h * 0.3);
        }
      }
      // our car: a red convertible from behind
      const bob = S.bump > 0 ? Math.sin(S.t * 60) * 1.5 : 0, steer = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      x.save(); x.translate(W / 2, H - 22 + bob); x.transform(1, 0, steer * -0.12, 1, 0, 0);
      x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(-36, 10, 72, 6);
      x.fillStyle = "#111"; x.fillRect(-34, -2, 14, 14); x.fillRect(20, -2, 14, 14);
      x.fillStyle = "#d7263d"; x.fillRect(-32, -14, 64, 18); x.fillStyle = "#a01428"; x.fillRect(-26, -22, 52, 9);
      x.fillStyle = "#ff2a2a"; x.fillRect(-30, -10, 10, 4); x.fillRect(20, -10, 10, 4);
      x.fillStyle = "#5a3a22"; x.fillRect(-12, -30, 9, 9); x.fillStyle = "#ffc925"; x.fillRect(3, -31, 9, 10);
      x.restore();
      text(x, `TIME ${Math.ceil(S.time)}`, W / 2, 12, S.time < 10 ? "#ff4f6a" : "#ffc925", 11);
      text(x, `${Math.floor(S.v / MAXV * 216)} KM/H`, W - 8, 12, "#fff", 8, "right"); text(x, `${S.dist.toFixed(2)} KM`, 8, 12, "#fff", 8, "left"); text(x, `NEXT ${Math.max(0, S.next - S.dist).toFixed(2)}`, 8, 24, "#7cff8a", 7, "left");
      if (S.msgT > 0) text(x, S.msg, W / 2, 60, "#7cff8a", 14);
      if (S.t < 3) text(x, "HOLD LEFT OR RIGHT TO STEER, MIDDLE TO BRAKE", W / 2, H - 6, "#fff", 6);
    },
  };
}

// ---------------------------------------------------------------- Tape Force
function makeTape(sfx) {
  const S = { x: 40, y: H / 2, lives: 3, power: 0, shots: [], foes: [], bullets: [], caps: [], fx: [], t: 0, fire: 0, score: 0, wave: 0, nextWave: 1, inv: 2, boss: null, loop: 1, over: 0, stars: [] };
  for (let i = 0; i < 60; i++) S.stars.push({ x: rnd(0, W), y: rnd(0, H), v: rnd(10, 60) });
  const keys = { left: false, right: false, up: false, down: false };
  let drag = null;
  const POW = ["SPEED", "DOUBLE", "WIDE", "OPTION", "OPTION", "SHIELD"];
  const opts = []; const trail = [];
  function wave() {
    S.wave++;
    if (S.wave % 8 === 0) { S.boss = { x: W + 60, y: H / 2, hp: 60 + 30 * S.loop, max: 60 + 30 * S.loop, t: 0 }; sfx.tone(110, 1, "sawtooth", 0.08, 55); return; }
    const k = S.wave % 3, y0 = rnd(40, H - 40);
    const group = { left: 5, cap: true };
    for (let i = 0; i < 5; i++) {
      if (k === 0) S.foes.push({ kind: "sine", x: W + 10 + i * 18, y: y0, y0, hp: 1, t: -i * 0.15, g: group });
      else if (k === 1) S.foes.push({ kind: "dive", x: W + 10 + i * 22, y: i % 2 ? 30 : H - 30, hp: 1, t: 0, g: group });
      else S.foes.push({ kind: "rock", x: W + 10 + i * 40, y: rnd(20, H - 20), hp: 4, t: 0, g: group, r: rnd(7, 11) });
    }
  }
  const hitR = (a, b, r) => Math.abs(a.x - b.x) < r && Math.abs(a.y - b.y) < r;
  function boom(x0, y0, big) { for (let i = 0; i < (big ? 30 : 10); i++) S.fx.push({ x: x0, y: y0, vx: rnd(-80, 80), vy: rnd(-80, 80), t: rnd(0.2, 0.6) }); sfx.noise(big ? 0.5 : 0.15, big ? 0.2 : 0.08); }
  function hurt() {
    if (S.inv > 0 || S.over) return;
    if (S.power >= 6) { S.power = 5; S.inv = 1; sfx.tone(300, 0.2, "square", 0.06); return; }
    S.lives--; boom(S.x, S.y, true); S.inv = 2.5; S.power = Math.max(0, S.power - 2); opts.length = Math.min(opts.length, Math.max(0, S.power - 3));
    if (S.lives <= 0) S.over = 0.001;
  }
  return {
    key(k, down) { if (k in keys) keys[k] = down; },
    drag(dx, dy, start) { if (start) drag = { x: S.x, y: S.y }; if (drag) { S.x = clamp(drag.x + dx * 1.3, 8, W - 8); S.y = clamp(drag.y + dy * 1.3, 8, H - 8); } },
    tap() {},
    update(dt) {
      if (S.over) { S.over += dt; for (const f of S.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.t -= dt; } return S.over > 1.6 ? "over" : null; }
      S.t += dt; S.inv = Math.max(0, S.inv - dt);
      const sp = 95 + (S.power >= 1 ? 45 : 0);
      S.x = clamp(S.x + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * sp * dt, 8, W - 8);
      S.y = clamp(S.y + ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * sp * dt, 8, H - 8);
      trail.unshift({ x: S.x, y: S.y }); trail.length = 40;
      const nOpt = Math.max(0, Math.min(2, S.power - 3)); while (opts.length < nOpt) opts.push(0);
      // auto fire
      if ((S.fire -= dt) <= 0) {
        S.fire = 0.11; sfx.tone(1100, 0.03, "square", 0.02, 700);
        const guns = [{ x: S.x, y: S.y }]; opts.forEach((_, i) => { const p = trail[(i + 1) * 14] || trail[trail.length - 1]; if (p) guns.push(p); });
        for (const g of guns) {
          S.shots.push({ x: g.x + 8, y: g.y, vx: 320, vy: 0 });
          if (S.power >= 2) S.shots.push({ x: g.x + 6, y: g.y, vx: 260, vy: -160 });
          if (S.power >= 3) S.shots.push({ x: g.x + 6, y: g.y, vx: 260, vy: 160 });
        }
      }
      for (const s of S.stars) { s.x -= s.v * dt; if (s.x < 0) { s.x = W; s.y = rnd(0, H); } }
      if (!S.boss && S.foes.length === 0 && (S.nextWave -= dt) <= 0) { wave(); S.nextWave = Math.max(0.6, 1.6 - S.loop * 0.2); }
      const spd = 1 + (S.loop - 1) * 0.25;
      for (const f of S.foes) {
        f.t += dt;
        if (f.kind === "sine") { f.x -= 70 * spd * dt; f.y = f.y0 + Math.sin(f.t * 3) * 40; }
        if (f.kind === "dive") { f.x -= 60 * spd * dt; if (f.t > 0.6) f.y += Math.sign(S.y - f.y) * 50 * spd * dt; if (f.t > 1 && !f.shot && Math.random() < 0.02) { f.shot = 1; const a = Math.atan2(S.y - f.y, S.x - f.x); S.bullets.push({ x: f.x, y: f.y, vx: Math.cos(a) * 90 * spd, vy: Math.sin(a) * 90 * spd }); } }
        if (f.kind === "rock") { f.x -= 45 * spd * dt; }
      }
      if (S.boss) {
        const b = S.boss; b.t += dt; b.x += ((W - 60) - b.x) * Math.min(1, dt * 0.8); b.y = H / 2 + Math.sin(b.t * 0.9) * 70;
        if (b.t % 1.4 < dt) for (let a = -2; a <= 2; a++) { const ang = Math.PI + a * 0.25; S.bullets.push({ x: b.x - 20, y: b.y, vx: Math.cos(ang) * 110 * spd, vy: Math.sin(ang) * 110 * spd }); }
      }
      for (const s of S.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
      for (const s of S.bullets) { s.x += s.vx * dt; s.y += s.vy * dt; }
      for (const c of S.caps) c.x -= 40 * dt;
      for (const f of S.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.t -= dt; }
      for (const s of S.shots) {
        for (const f of S.foes) if (f.hp > 0 && hitR(s, f, f.kind === "rock" ? f.r : 7)) {
          s.dead = 1; f.hp--;
          if (f.hp <= 0) { boom(f.x, f.y); S.score += f.kind === "rock" ? 150 : 100; f.g.left--; if (f.g.left === 0 && f.g.cap) S.caps.push({ x: f.x, y: f.y }); }
          break;
        }
        if (!s.dead && S.boss && hitR(s, S.boss, 18)) { s.dead = 1; S.boss.hp--; sfx.tone(200, 0.02, "square", 0.02); if (S.boss.hp <= 0) { boom(S.boss.x, S.boss.y, true); boom(S.boss.x - 15, S.boss.y + 10, true); S.score += 5000; S.boss = null; S.loop++; S.foes.length = 0; S.bullets.length = 0; S.caps.push({ x: W - 60, y: H / 2 }); } }
      }
      for (const f of S.foes) if (f.hp > 0 && hitR(f, S, f.kind === "rock" ? f.r : 7)) { f.hp = 0; boom(f.x, f.y); hurt(); }
      for (const b of S.bullets) if (hitR(b, S, 4)) { b.dead = 1; hurt(); }
      if (S.boss && hitR(S.boss, S, 22)) hurt();
      for (const c of S.caps) if (hitR(c, S, 10)) { c.dead = 1; S.power = Math.min(6, S.power + 1); S.score += 300; sfx.tone(660, 0.08, "square", 0.05, 1320); sfx.tone(990, 0.15, "square", 0.04); S.msg = POW[S.power - 1]; S.msgT = 1.2; }
      S.msgT = Math.max(0, (S.msgT || 0) - dt);
      S.shots = S.shots.filter((s) => !s.dead && s.x < W + 10 && s.y > -10 && s.y < H + 10);
      S.bullets = S.bullets.filter((s) => !s.dead && s.x > -10 && s.x < W + 10 && s.y > -10 && s.y < H + 10);
      S.foes = S.foes.filter((f) => f.hp > 0 && f.x > -20);
      S.caps = S.caps.filter((c) => !c.dead && c.x > -10);
      S.fx = S.fx.filter((f) => f.t > 0);
      return null;
    },
    score() { return S.score; },
    draw(x) {
      x.fillStyle = "#04051a"; x.fillRect(0, 0, W, H);
      for (const s of S.stars) { x.fillStyle = s.v > 40 ? "#fff" : "#6a74b8"; x.fillRect(s.x, s.y, s.v > 40 ? 2 : 1, 1); }
      x.fillStyle = "#1a1f4a"; for (let i = 0; i < 12; i++) { const bx = ((i * 40 - S.t * 30) % (W + 40) + W + 40) % (W + 40) - 20, h = 10 + ((i * 17) % 22); x.fillRect(bx, H - h, 40, h); x.fillRect(bx + 8, 0, 24, 6 + ((i * 11) % 14)); }
      for (const c of S.caps) { x.fillStyle = "#ff7a1a"; x.fillRect(c.x - 6, c.y - 4, 12, 8); x.fillStyle = "#ffc925"; x.fillRect(c.x - 4, c.y - 2, 8, 4); }
      for (const f of S.foes) {
        if (f.kind === "rock") { x.fillStyle = "#6a5a4a"; x.beginPath(); x.arc(f.x, f.y, f.r, 0, 6.3); x.fill(); x.fillStyle = "#8a7a6a"; x.fillRect(f.x - f.r / 2, f.y - f.r / 2, f.r / 2, f.r / 3); continue; }
        // a spinning cassette
        x.fillStyle = f.kind === "dive" ? "#ff4f6a" : "#b48cff"; x.fillRect(f.x - 8, f.y - 5, 16, 10);
        x.fillStyle = "#111"; x.fillRect(f.x - 5, f.y - 2, 10, 4); x.fillStyle = "#fff"; const a = S.t * 10; x.fillRect(f.x - 4 + Math.cos(a), f.y - 1, 2, 2); x.fillRect(f.x + 2 + Math.cos(a), f.y - 1, 2, 2);
      }
      if (S.boss) {
        const b = S.boss; x.fillStyle = "#2b3570"; x.fillRect(b.x - 30, b.y - 30, 60, 60); x.fillStyle = "#4fd8ff"; x.fillRect(b.x - 26, b.y - 26, 52, 52);
        x.fillStyle = "#111"; x.fillRect(b.x - 20, b.y - 8, 40, 16); x.fillStyle = (S.t * 4) % 1 > 0.5 ? "#ff2a2a" : "#ffc925"; x.beginPath(); x.arc(b.x - 22, b.y, 7, 0, 6.3); x.fill();
        x.fillStyle = "#ff2a2a"; x.fillRect(W / 2 - 60, 18, 120 * (b.hp / b.max), 4); x.strokeStyle = "#fff"; x.strokeRect(W / 2 - 60, 18, 120, 4);
      }
      x.fillStyle = "#ffe27a"; for (const s of S.shots) x.fillRect(s.x - 3, s.y - 1, 6, 2);
      x.fillStyle = "#ff4fd8"; for (const s of S.bullets) x.fillRect(s.x - 2, s.y - 2, 4, 4);
      for (const f of S.fx) { x.fillStyle = f.t > 0.3 ? "#ffc925" : "#ff4f2a"; x.fillRect(f.x, f.y, 2, 2); }
      opts.forEach((_, i) => { const p = trail[(i + 1) * 14] || trail[trail.length - 1]; if (!p) return; x.fillStyle = "#ff7a1a"; x.beginPath(); x.arc(p.x, p.y, 4, 0, 6.3); x.fill(); });
      if (!(S.inv > 0 && Math.floor(S.t * 12) % 2) && !(S.over && S.lives <= 0)) {
        x.fillStyle = "#e9ecff"; x.beginPath(); x.moveTo(S.x + 10, S.y); x.lineTo(S.x - 8, S.y - 6); x.lineTo(S.x - 4, S.y); x.lineTo(S.x - 8, S.y + 6); x.fill();
        x.fillStyle = "#4fd8ff"; x.fillRect(S.x - 2, S.y - 2, 5, 3); x.fillStyle = (S.t * 20) % 1 > 0.5 ? "#ff7a1a" : "#ffc925"; x.fillRect(S.x - 11, S.y - 1, 3, 2);
        if (S.power >= 6) { x.strokeStyle = "#4fd8ff"; x.beginPath(); x.arc(S.x, S.y, 12, 0, 6.3); x.stroke(); }
      }
      text(x, String(S.score).padStart(7, "0"), W - 8, 9, "#fff", 8, "right");
      text(x, "♥".repeat(Math.max(0, S.lives)), 8, 9, "#ff4f6a", 8, "left");
      for (let i = 0; i < 6; i++) { x.fillStyle = i < S.power ? "#ff7a1a" : "#2b3570"; x.fillRect(60 + i * 30, H - 9, 28, 6); }
      text(x, S.power < 6 ? "NEXT: " + POW[S.power] : "MAX", 60 + 6 * 30 + 6, H - 6, "#ffc925", 6, "left");
      if (S.msgT > 0) text(x, S.msg, S.x, S.y - 16, "#ffc925", 8);
      if (S.t < 3) text(x, "AUTO FIRE IS ON. DRAG OR USE ARROWS TO FLY.", W / 2, H - 22, "#fff", 6);
    },
  };
}

const MAKERS = { dash: makeDash, cruise: makeCruise, tape: makeTape };

// The little loop on each cabinet's screen in the shop.
export function attract(kind, x, t, w, h) {
  const g = GAMES[kind]; x.save(); x.scale(w / W, h / H);
  x.fillStyle = "#05061a"; x.fillRect(0, 0, W, H);
  if (kind === "dash") { for (let i = 0; i < 8; i++) { const y = 120 + ((i * 20 + t * 60) % 120); x.fillStyle = i % 2 ? "#2b3570" : "#232c5e"; x.fillRect(160 - (y - 100) * 1.2, y, (y - 100) * 2.4, 12); } }
  if (kind === "cruise") { x.fillStyle = "#5a1f6a"; x.fillRect(0, 100, W, 30); x.fillStyle = "#ff7ad9"; x.beginPath(); x.arc(160, 120, 40, Math.PI, 0); x.fill(); x.fillStyle = "#2a2d44"; x.beginPath(); x.moveTo(150, 120); x.lineTo(170, 120); x.lineTo(300, 240); x.lineTo(20, 240); x.fill(); x.fillStyle = "#ffc925"; for (let i = 0; i < 5; i++) { const y = 130 + ((i * 25 + t * 80) % 110); x.fillRect(158, y, 4, 6 + (y - 120) * 0.1); } }
  if (kind === "tape") { for (let i = 0; i < 40; i++) { x.fillStyle = "#fff"; x.fillRect((i * 53 - t * 80 * (1 + (i % 3))) % W + W * ((i * 53 - t * 80) % W < 0), (i * 37) % H, 2, 1); } x.fillStyle = "#e9ecff"; const y = 130 + Math.sin(t * 2) * 30; x.beginPath(); x.moveTo(80, y); x.lineTo(60, y - 8); x.lineTo(64, y); x.lineTo(60, y + 8); x.fill(); x.fillStyle = "#ffe27a"; for (let i = 0; i < 6; i++) x.fillRect(90 + ((t * 300 + i * 40) % 230), y, 6, 2); }
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
  function start() { game = MAKERS[kind](sfx); state = "play"; t = 0; sfx.tone(523, 0.08, "square", 0.05); sfx.tone(784, 0.12, "square", 0.05); }
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
  const KEYMAP = { arrowleft: "left", a: "left", arrowright: "right", d: "right", arrowup: "up", w: "up", arrowdown: "down", s: "down", " ": "fire", enter: "fire" };
  function kd(e) {
    const k = e.key.toLowerCase();
    if (k === "escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    const m = KEYMAP[k]; if (!m && k !== "enter") return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat && kind === "dash") return;
    if (state !== "play") { if (m === "fire") press(); return; }
    game.key(m, true);
  }
  function ku(e) { const m = KEYMAP[e.key.toLowerCase()]; if (!m) return; e.stopImmediatePropagation(); if (state === "play") game.key(m, false); }
  // touch: swipes for the runner, held zones for the racer, relative drag for the shooter
  let tp = null;
  function pd(e) {
    if (e.target.closest("button")) return; e.preventDefault();
    if (state !== "play") { press(); return; }
    const r = cv.getBoundingClientRect(); tp = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: W / r.width, swiped: false };
    try { root.setPointerCapture(e.pointerId); } catch (er) {}
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
    if (!tp || e.pointerId !== tp.id) return;
    if (state === "play") { if (kind === "cruise") game.hold(null); if (kind === "dash" && !tp.swiped) game.tap(); }
    tp = null;
  }
  addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
  root.addEventListener("pointerdown", pd); root.addEventListener("pointermove", pm); root.addEventListener("pointerup", pu); root.addEventListener("pointercancel", pu);
  const closeBtn = document.getElementById("arcclose"); closeBtn.onclick = close;
  const hint = document.getElementById("archint");
  hint.textContent = { dash: "Arrows or WASD: left and right to change lanes, up to jump, down to slide. On a phone, swipe.", cruise: "Left and right to steer, down to brake. On a phone, hold the left or right side to steer and the middle to brake.", tape: "It fires on its own. Arrows or WASD to fly. On a phone, drag anywhere." }[kind];
  raf = requestAnimationFrame(frame);
  function close() {
    cancelAnimationFrame(raf); if (game && game.stop) game.stop();
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true);
    root.removeEventListener("pointerdown", pd); root.removeEventListener("pointermove", pm); root.removeEventListener("pointerup", pu); root.removeEventListener("pointercancel", pu);
    root.hidden = true; host.onClose();
  }
  return { close };
}
