#!/usr/bin/env python3
"""Raw material for the PS Plus prediction list (lists/coming-to-ps-plus). Run weekly by
.github/workflows/predict.yml; nothing here is committed except what tools/predict/history.py and
tools/predict/model.py make from it.

Saves, under data/predict-raw/:
  wiki-<n>.txt     wikitext of Wikipedia's lists of PS4 and PS5 games
  wikidata.json    every PS4 and PS5 game on Wikidata, with platforms, publishers, developers, series
  views.json       {article: page views over the last 60 days}, for every article in
                   data/predict-pool.json: a rough measure of how much people care about a game
  blog-<n>.xml     older pages of the PlayStation Blog's PlayStation Plus RSS feed, for the
                   history of Game Catalog and Monthly Games announcements
"""
import json, re, time
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "predict-raw"
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({"User-Agent": "PSPlusRentalWall/1.0 (https://github.com/misterhundoah-code/Psplusorganizer)"})
API = "https://en.wikipedia.org/w/api.php"

PAGES = ["List of PlayStation 5 games", "List of PlayStation 4 games (A–L)", "List of PlayStation 4 games (M–Z)"]
for i, p in enumerate(PAGES):
    j = S.get(API, params={"action": "parse", "page": p, "prop": "wikitext", "format": "json", "formatversion": 2, "redirects": 1}, timeout=60).json()
    (OUT / f"wiki-{i}.txt").write_text(f"{p}\n{j['parse']['wikitext']}", encoding="utf-8"); time.sleep(1)

# Wikidata: every game released on PS4 or PS5, built from one small query per property
# (a single grouped query times out), with labels in English.
UAH = {"User-Agent": "PSPlusRentalWall/1.0 (https://github.com/misterhundoah-code/Psplusorganizer)", "Accept": "application/sparql-results+json"}
def sparql(q):
    for attempt in range(4):
        try:
            r = requests.get("https://query.wikidata.org/sparql", params={"query": q, "format": "json"}, headers=UAH, timeout=120)
            if r.status_code == 200: return r.json()["results"]["bindings"]
            print("sparql", r.status_code, r.text[:120].replace("\n", " "))
        except Exception as e:
            print("sparql", e)
        time.sleep(20 * (attempt + 1))
    return None
games = {}
PROPS = {"plat": "P400", "pub": "P123", "dev": "P178", "ser": "P179", "gen": "P136", "mode": "P404"}
for qid in ("Q63184502", "Q5014725"):
    rows = sparql(f"""SELECT ?g ?t ?w WHERE {{ ?g wdt:P400 wd:{qid} . OPTIONAL {{ ?g rdfs:label ?t . FILTER(LANG(?t) = "en") }}
      OPTIONAL {{ ?a schema:about ?g ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?w }} }}""") or []
    print("games", qid, len(rows))
    for b in rows:
        q = b["g"]["value"].rsplit("/", 1)[1]
        g = games.setdefault(q, {"q": q, "t": None, "w": None, "rel": None, **{k: [] for k in PROPS}})
        g["t"] = g["t"] or b.get("t", {}).get("value"); g["w"] = g["w"] or b.get("w", {}).get("value")
    time.sleep(3)
    rows = sparql(f"""SELECT ?g (MIN(?d) AS ?rel) WHERE {{ ?g wdt:P400 wd:{qid} ; p:P577/psv:P577 ?dv . ?dv wikibase:timeValue ?d ;
      wikibase:timePrecision ?pr . FILTER(?pr >= 10) }} GROUP BY ?g""") or []
    print("dates", qid, len(rows))
    for b in rows:
        g = games.get(b["g"]["value"].rsplit("/", 1)[1])
        if g: d = b["rel"]["value"][:10]; g["rel"] = min(filter(None, [g["rel"], d]))
    time.sleep(3)
    for name, prop in PROPS.items():
        if name == "plat":   # the console items have no English label on Wikidata, so keep their ids
            rows = sparql(f"""SELECT ?g ?l WHERE {{ ?g wdt:P400 wd:{qid} ; wdt:P400 ?x . BIND(STRAFTER(STR(?x), "entity/") AS ?l) }}""") or []
        else:
            rows = sparql(f"""SELECT ?g ?l WHERE {{ ?g wdt:P400 wd:{qid} ; wdt:{prop} ?x . ?x rdfs:label ?l . FILTER(LANG(?l) = "en") }}""") or []
        print(name, qid, len(rows))
        for b in rows:
            g = games.get(b["g"]["value"].rsplit("/", 1)[1])
            if g and b["l"]["value"] not in g[name]: g[name].append(b["l"]["value"])
        time.sleep(3)
    # Metacritic: the score (review score P444 given by Metacritic, preferring the PS5 or PS4 one when a game
    # has one per platform) and the game's Metacritic id (P12054) for a link to its reviews.
    rows = sparql(f"""SELECT ?g ?s ?pl WHERE {{ ?g wdt:P400 wd:{qid} ; p:P444 ?st . ?st ps:P444 ?s ; pq:P447 ?by .
      ?by rdfs:label "Metacritic"@en . OPTIONAL {{ ?st pq:P400 ?x . BIND(STRAFTER(STR(?x), "entity/") AS ?pl) }} }}""") or []
    print("metacritic", qid, len(rows))
    for b in rows:
        g = games.get(b["g"]["value"].rsplit("/", 1)[1]); m = re.match(r"\s*(\d{1,3})\s*(?:/\s*100)?\s*$", b["s"]["value"])
        if not g or not m or int(m.group(1)) > 100: continue
        rank = 2 if b.get("pl", {}).get("value") in ("Q63184502", "Q5014725") else 1
        if rank >= g.get("_mcr", 0): g["mc"], g["_mcr"] = int(m.group(1)), rank
    time.sleep(3)
    rows = sparql(f"""SELECT ?g ?id WHERE {{ ?g wdt:P400 wd:{qid} ; wdt:P12054 ?id }}""") or []
    print("metacritic ids", qid, len(rows))
    for b in rows:
        g = games.get(b["g"]["value"].rsplit("/", 1)[1])
        if g: g["mcid"] = g.get("mcid") or b["id"]["value"]
    time.sleep(3)
for g in games.values(): g.pop("_mcr", None)
games = [g for g in games.values() if g["t"]]
(OUT / "wikidata.json").write_text(json.dumps(games, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("wikidata saved", len(games))

# Wikipedia's lists, parsed into data/predict-pool.json (needed for the page views below).
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_lists import build_pool
build_pool()

# Page views: 50 articles per request, following redirects back to the title we asked for.
pool = json.loads((ROOT / "data" / "predict-pool.json").read_text(encoding="utf-8"))
pool += [{"w": g["w"]} for g in games if g.get("w")]
extra = json.loads((ROOT / "data" / "about.json").read_text(encoding="utf-8"))
titles = sorted({g["w"] for g in pool if g.get("w")} | {v["w"] for v in extra.values() if isinstance(v, dict) and v.get("w")})
def fetch_views(batch):
    """60 days of views for up to 50 articles, following the API's continuation (it can return some pages'
    views only on a later request) and redirects back to the title we asked for."""
    out, cont = {}, {}
    for _ in range(10):
        for attempt in range(4):
            try:
                r = S.get(API, params={"action": "query", "prop": "pageviews", "pvipdays": 60, "titles": "|".join(batch),
                                       "redirects": 1, "format": "json", "formatversion": 2, **cont}, timeout=60)
                j = r.json()
                if "error" not in j: break
                print("views error", j["error"].get("code")); time.sleep(10 * (attempt + 1))
            except Exception as e:
                print("retry", e); time.sleep(10 * (attempt + 1))
        else:
            return out
        q = j.get("query", {})
        back = {}
        for n in q.get("normalized", []): back[n["to"]] = n["from"]
        for rd in q.get("redirects", []): back[rd["to"]] = back.get(rd["from"], rd["from"])
        for pg in q.get("pages", []):
            if pg.get("pageviews") is None: continue          # not filled in yet: comes back on a continuation
            v = sum(x or 0 for x in pg["pageviews"].values())
            out[back.get(pg["title"], pg["title"])] = v
            out.setdefault(pg["title"], v)
        if "continue" not in j: return out
        cont = j["continue"]; time.sleep(1)
    return out

views = {}
for k in range(0, len(titles), 50):
    views.update(fetch_views(titles[k:k + 50]))
    time.sleep(1)
# Wikipedia sometimes throttles these lookups and hands back empty counts. Popularity is the model's strongest
# signal, so a run that lost most of it would reshuffle the page: stop here instead, and the page keeps the last good run.
seen = sum(1 for v in views.values() if v)
print("views", len(views), "with any", seen)
if seen < 0.6 * len(titles):
    sys.exit(f"::error::Only {seen} of {len(titles)} articles came back with page views; not publishing this run.")
(OUT / "views.json").write_text(json.dumps(views, ensure_ascii=False), encoding="utf-8")

# Metascores from each article's review table (Wikidata has very few): 50 articles' text per request.
from metacritic import score as mc_score
mc = {}
for k in range(0, len(titles), 50):
    batch = titles[k:k + 50]
    for attempt in range(3):
        try:
            j = S.get(API, params={"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                                   "titles": "|".join(batch), "redirects": 1, "format": "json", "formatversion": 2}, timeout=90).json()
            break
        except Exception as e:
            print("retry", e); time.sleep(5)
    else:
        continue
    q = j.get("query", {})
    back = {}
    for n in q.get("normalized", []): back[n["to"]] = n["from"]
    for r in q.get("redirects", []): back[r["to"]] = back.get(r["from"], r["from"])
    for pg in q.get("pages", []):
        revs = pg.get("revisions") or []
        v = mc_score(((revs[0].get("slots") or {}).get("main") or {}).get("content", "")) if revs else None
        if v is not None:
            mc[back.get(pg["title"], pg["title"])] = v
    time.sleep(0.5)
(OUT / "metacritic.json").write_text(json.dumps(mc, ensure_ascii=False), encoding="utf-8")
print("metascores from Wikipedia", len(mc))

# Blog archive: WordPress feeds page back with ?paged=N.
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
# The first run reads the whole archive; after that the history is kept in data/predict-history.json
# and only the newest few pages are needed.
pages = 4 if (ROOT / "data" / "predict-history.json").exists() else 80
for n in range(1, pages + 1):
    try:
        r = requests.get("https://blog.playstation.com/tag/playstation-plus/feed/", params={"paged": n}, headers={"User-Agent": UA}, timeout=60)
    except Exception as e:
        print("blog", n, e); break
    print("blog", n, r.status_code, len(r.text))
    if r.status_code != 200 or "<item>" not in r.text: break
    (OUT / f"blog-{n:02d}.xml").write_text(r.text, encoding="utf-8")
    time.sleep(1)
