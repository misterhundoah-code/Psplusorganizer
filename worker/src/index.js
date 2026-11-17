// PS Plus Catalogue Sorter API (Cloudflare Worker + D1).
//
// What it stores, per account: a random-looking id, a hash of a login token, and one
// encrypted blob. The browser derives the id, the token and the encryption key from the
// username and password, so the username, the password and the person's marks never
// reach this server in readable form. There are no emails, names or IP addresses here.
//
// Routes
//   GET  /api/health
//   POST /api/account/create  {uid, auth}
//   POST /api/data/get        {uid, auth}            -> {ver, ct, iv}
//   POST /api/data/put        {uid, auth, ct, iv, base} -> {ver}   (409 + current copy if base is stale)
//   POST /api/account/delete  {uid, auth}
//   GET  /api/store?url=https://store.playstation.com/...  -> basic listing

import { parseStoreUrl, parseStorePage } from "./store.js";

const HEX64 = /^[0-9a-f]{64}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_BODY = 1_000_000;      // bytes per request
const MAX_CT = 800_000;          // characters of encrypted data per account
const LOCK_AFTER = 5;            // failed sign-ins before a cool-down starts

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    if (origin && !cors) return json({ error: "origin_not_allowed" }, 403);

    const url = new URL(request.url);
    try {
      let res;
      if (url.pathname === "/api/health" && request.method === "GET") res = json({ ok: true });
      else if (url.pathname === "/api/store" && request.method === "GET") res = await storeLookup(url, ctx);
      else if (request.method === "POST" && url.pathname.startsWith("/api/")) {
        const body = await readJson(request);
        if (!body) res = json({ error: "bad_request" }, 400);
        else if (url.pathname === "/api/account/create") res = await createAccount(body, env);
        else if (url.pathname === "/api/data/get") res = await getData(body, env);
        else if (url.pathname === "/api/data/put") res = await putData(body, env);
        else if (url.pathname === "/api/account/delete") res = await deleteAccount(body, env);
        else res = json({ error: "not_found" }, 404);
      } else res = json({ error: "not_found" }, 404);
      return withHeaders(res, cors);
    } catch (e) {
      return withHeaders(json({ error: "server_error" }, 500), cors);
    }
  },
};

/* ---------------- helpers ---------------- */

function corsHeaders(origin, env) {
  if (!origin) return null;
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  const local = env.ALLOW_LOCALHOST === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!local && !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function withHeaders(res, cors) {
  const h = new Headers(res.headers);
  if (cors) for (const [k, v] of Object.entries(cors)) h.set(k, v);
  h.set("Cache-Control", h.get("Cache-Control") || "no-store");
  h.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, { status: res.status, headers: h });
}
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}
async function readJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try { const v = JSON.parse(text); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameHex(a, b) { // constant-time compare of two equal-length hex strings
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const now = () => Math.floor(Date.now() / 1000);
const validIds = (b) => HEX64.test(String(b.uid || "")) && HEX64.test(String(b.auth || ""));

/** Check a login. Returns the row on success, or a Response to send back. */
async function authorise(body, env) {
  if (!validIds(body)) return json({ error: "bad_request" }, 400);
  const row = await env.DB.prepare("SELECT uid, auth_hash, ct, iv, ver, fails, lock_until FROM users WHERE uid = ?").bind(body.uid).first();
  const t = now();
  if (!row) return json({ error: "unauthorised" }, 401); // same answer as a wrong password
  if (row.lock_until > t) return json({ error: "locked", retryAfter: row.lock_until - t }, 429, { "Retry-After": String(row.lock_until - t) });
  if (!sameHex(await sha256hex(body.auth), row.auth_hash)) {
    const fails = row.fails + 1;
    const lock = fails >= LOCK_AFTER ? t + Math.min(3600, 30 * 2 ** (fails - LOCK_AFTER)) : 0;
    await env.DB.prepare("UPDATE users SET fails = ?, lock_until = ? WHERE uid = ?").bind(fails, lock, body.uid).run();
    return json({ error: "unauthorised" }, 401);
  }
  if (row.fails) await env.DB.prepare("UPDATE users SET fails = 0, lock_until = 0 WHERE uid = ?").bind(body.uid).run();
  return row;
}

/* ---------------- accounts ---------------- */

async function createAccount(body, env) {
  if (!validIds(body)) return json({ error: "bad_request" }, 400);
  const cap = Number(env.MAX_NEW_ACCOUNTS_PER_DAY || 500);
  const day = new Date().toISOString().slice(0, 10);
  const c = await env.DB.prepare("SELECT n FROM signups WHERE day = ?").bind(day).first();
  if (c && c.n >= cap) return json({ error: "busy" }, 503);
  const r = await env.DB.prepare("INSERT OR IGNORE INTO users (uid, auth_hash, ver, created) VALUES (?, ?, 0, ?)")
    .bind(body.uid, await sha256hex(body.auth), now()).run();
  if (!r.meta || r.meta.changes === 0) return json({ error: "taken" }, 409);
  await env.DB.prepare("INSERT INTO signups (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1").bind(day).run();
  await env.DB.prepare("DELETE FROM signups WHERE day < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).run();
  return json({ ver: 0 }, 201);
}

async function getData(body, env) {
  const row = await authorise(body, env);
  if (row instanceof Response) return row;
  return json({ ver: row.ver, ct: row.ct, iv: row.iv });
}

async function putData(body, env) {
  const row = await authorise(body, env);
  if (row instanceof Response) return row;
  const { ct, iv } = body;
  const base = Number(body.base);
  if (typeof ct !== "string" || typeof iv !== "string" || !B64.test(ct) || !B64.test(iv) || iv.length > 32 || !Number.isInteger(base))
    return json({ error: "bad_request" }, 400);
  if (ct.length > MAX_CT) return json({ error: "too_large" }, 413);
  const r = await env.DB.prepare("UPDATE users SET ct = ?, iv = ?, ver = ver + 1, updated = ? WHERE uid = ? AND ver = ?")
    .bind(ct, iv, now(), body.uid, base).run();
  if (!r.meta || r.meta.changes === 0) {
    const cur = await env.DB.prepare("SELECT ver, ct, iv FROM users WHERE uid = ?").bind(body.uid).first();
    return json({ error: "conflict", ver: cur.ver, ct: cur.ct, iv: cur.iv }, 409);
  }
  return json({ ver: base + 1 });
}

async function deleteAccount(body, env) {
  const row = await authorise(body, env);
  if (row instanceof Response) return row;
  await env.DB.prepare("DELETE FROM users WHERE uid = ?").bind(body.uid).run();
  return json({ ok: true });
}

/* ---------------- PlayStation Store lookup ---------------- */

async function storeLookup(url, ctx) {
  const link = parseStoreUrl(url.searchParams.get("url") || "");
  if (!link) return json({ error: "not_a_store_link" }, 400);
  const cache = caches.default;
  const key = new Request("https://psplus-sorter.cache/store/" + link.locale + "/" + link.kind + "/" + link.id);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, hit);

  let page;
  try {
    page = await fetch(link.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": link.locale.replace(/-(\w+)$/, (m, c) => "-" + c.toUpperCase()) + ",en;q=0.8",
      },
      redirect: "follow",
      cf: { cacheTtl: 3600 },
    });
  } catch { return json({ error: "store_unreachable" }, 502); }
  if (page.status === 404) return json({ error: "not_found" }, 404);
  if (!page.ok) return json({ error: "store_unreachable", status: page.status }, 502);
  const finalHost = new URL(page.url || link.url).hostname;
  if (finalHost !== "store.playstation.com") return json({ error: "store_unreachable" }, 502);
  const html = (await page.text()).slice(0, 4_000_000);
  const listing = parseStorePage(html, link);
  if (!listing.title) return json({ error: "no_listing", url: link.url }, 422);
  const res = json(listing, 200, { "Cache-Control": "public, max-age=86400" });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
