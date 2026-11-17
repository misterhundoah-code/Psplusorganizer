// Reads a PlayStation Store page and pulls out a basic listing:
// title, platforms, genres, release year and the store ids.
// The store's markup changes from time to time, so every field has several
// fallbacks and anything that can't be found is simply left empty.

const HOST = /^store\.playstation\.com$/i;
const PATH = /^\/(?:([a-z]{2}-[a-z]{2})\/)?(concept|product)\/([A-Za-z0-9_-]{1,64})\/?$/i;

/** Validate and normalise a store link. Returns null for anything that isn't a store concept or product page. */
export function parseStoreUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  if (u.protocol !== "https:" || !HOST.test(u.hostname) || u.username || u.password || u.port) return null;
  const m = u.pathname.match(PATH);
  if (!m) return null;
  const locale = (m[1] || "en-ca").toLowerCase();
  const kind = m[2].toLowerCase();
  const id = m[3];
  return { kind, id, locale, url: `https://store.playstation.com/${locale}/${kind}/${id}` };
}

/** PS5 product ids contain PPSA, PS4 ones CUSA. */
export function platformsFromProductId(id) {
  const out = [];
  if (/PPSA\d/i.test(id)) out.push("PS5");
  if (/CUSA\d/i.test(id)) out.push("PS4");
  return out;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (all, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

export function cleanTitle(t) {
  if (!t) return null;
  let s = decodeEntities(String(t)).replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
  s = s.split(/\s+[|]\s+/)[0];                                   // "Game | PlayStation Store"
  s = s.replace(/\s+-\s+PS[45](?:\s*&\s*PS[45])?\s+Games?.*$/i, "");// "Game - PS4 & PS5 Games | ..."
  s = s.replace(/\s+(?:for\s+)?PS[45](?:\s*(?:&|and|\/)\s*PS[45])?$/i, ""); // "Game PS4 & PS5"
  s = s.replace(/\s+-\s*$/, "").trim();
  return s ? s.slice(0, 120) : null;
}

function* jsonScripts(html) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (!/type\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs)) continue;
    const body = m[2].trim();
    if (!body || body.length > 3_000_000) continue;
    try { yield { ld: /ld\+json/i.test(attrs), data: JSON.parse(body) }; } catch { /* not JSON, skip */ }
  }
}

/** Walk a parsed JSON value, calling visit(obj) on every object. Bounded so a huge page can't stall the worker. */
function walk(root, visit) {
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 300_000) {
    const v = stack.pop();
    seen++;
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x === "object") stack.push(x); }
    else if (v && typeof v === "object") {
      visit(v);
      for (const k in v) { const x = v[k]; if (x && typeof x === "object") stack.push(x); }
    }
  }
}

const PLATFORM_WORD = /^PS[45]$/;
function addPlatforms(set, val) {
  const list = Array.isArray(val) ? val : typeof val === "string" ? val.split(/[,/&]| and /) : [];
  for (let p of list) {
    if (p && typeof p === "object") p = p.value || p.name || "";
    p = String(p).trim().toUpperCase().replace(/^PLAYSTATION\s*/, "PS").replace(/\s+/g, "");
    if (PLATFORM_WORD.test(p)) set.add(p);
  }
}
function addGenres(set, val) {
  const list = Array.isArray(val) ? val : typeof val === "string" ? val.split(",") : [];
  for (let g of list) {
    if (g && typeof g === "object") g = g.value || g.name || "";
    g = String(g).trim();
    if (g && g.length <= 40) set.add(g);
  }
}
function yearFrom(v) {
  if (!v) return null;
  if (typeof v === "object") v = v.value || v.date || "";
  const m = String(v).match(/\b(19[7-9]\d|20\d\d)\b/);
  return m ? Number(m[1]) : null;
}

/** Pull a basic listing out of a store page's HTML. */
export function parseStorePage(html, link) {
  const out = { title: null, platforms: [], genres: [], year: null, conceptId: null, productId: null, url: link.url };
  if (link.kind === "concept") out.conceptId = link.id; else out.productId = link.id;
  const plats = new Set(), genres = new Set();
  let ldName = null, appName = null;

  for (const { ld, data } of jsonScripts(html)) {
    walk(data, (o) => {
      const type = String(o["@type"] || o.__typename || "");
      if (ld && /Product|VideoGame|SoftwareApplication/i.test(type)) {
        if (!ldName && typeof o.name === "string") ldName = o.name;
        addPlatforms(plats, o.gamePlatform || o.operatingSystem);
        addGenres(genres, o.genre);
        out.year ??= yearFrom(o.releaseDate || o.datePublished);
      }
      if (!ld && /^(Concept|Product|GameCTA|Game)$/i.test(type)) {
        if (!appName && typeof o.name === "string" && o.name.length < 200) appName = o.name;
        if (o.platforms) addPlatforms(plats, o.platforms);
        if (o.genres) addGenres(genres, o.genres);
        if (o.localizedGenres) addGenres(genres, o.localizedGenres);
        out.year ??= yearFrom(o.releaseDate);
        if (!out.conceptId && /^Concept$/i.test(type) && /^\d+$/.test(String(o.id || ""))) out.conceptId = String(o.id);
        if (!out.productId && /^Product$/i.test(type) && typeof o.id === "string" && /^[A-Z]{2}\d{4}-/.test(o.id)) out.productId = o.id;
      }
    });
  }

  // Plain-text fallbacks for pages whose data blocks we couldn't read.
  if (!plats.size) {
    const m = html.match(/"platforms"\s*:\s*\[([^\]]{0,200})\]/);
    if (m) addPlatforms(plats, m[1].replace(/"/g, "").split(","));
  }
  if (!genres.size) {
    const m = html.match(/"genres"\s*:\s*\[([^\]]{0,400})\]/);
    if (m) addGenres(genres, m[1].replace(/"/g, "").split(","));
  }
  if (!out.year) {
    const m = html.match(/"releaseDate"\s*:\s*(?:\{[^}]{0,120}?"value"\s*:\s*)?"(\d{4})/);
    if (m) out.year = Number(m[1]);
  }
  for (const p of platformsFromProductId(out.productId || "")) plats.add(p);

  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const tt = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  out.title = cleanTitle(appName) || cleanTitle(ldName) || cleanTitle(og && og[1]) || cleanTitle(tt && tt[1]);

  out.platforms = ["PS4", "PS5"].filter((p) => plats.has(p));
  out.genres = [...genres].slice(0, 8);
  if (out.year && (out.year < 1970 || out.year > 2100)) out.year = null;
  return out;
}
