#!/usr/bin/env python3
"""Raw material for the PS Plus prediction list (branch `predict`, not live yet).

Saves, under data/predict-raw/:
  wiki-<n>.txt     wikitext of Wikipedia's lists of PS4 and PS5 games (skipped if already there)
  views.json       {article: page views over the last 60 days}, for every article in
                   data/predict-pool.json: a rough measure of how much people care about a game
  blog-<n>.xml     older pages of the PlayStation Blog's PlayStation Plus RSS feed, for the
                   history of Game Catalog and Monthly Games announcements
"""
import json, time
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
    if (OUT / f"wiki-{i}.txt").exists(): continue
    j = S.get(API, params={"action": "parse", "page": p, "prop": "wikitext", "format": "json", "formatversion": 2, "redirects": 1}, timeout=60).json()
    (OUT / f"wiki-{i}.txt").write_text(f"{p}\n{j['parse']['wikitext']}", encoding="utf-8"); time.sleep(1)

# Wikidata: every game released on PS4 or PS5. A light query lists them; their details
# (platforms, publishers, developers, series, genres, modes, release dates) come from
# wbgetentities, 50 at a time, and the names of those things from a second pass.
WD = "https://www.wikidata.org/w/api.php"
UAH = {"User-Agent": "PSPlusRentalWall/1.0 (https://github.com/misterhundoah-code/Psplusorganizer)", "Accept": "application/sparql-results+json"}
ids = set()
for qid in ("Q63184502", "Q5014725"):
    for attempt in range(4):
        try:
            r = requests.get("https://query.wikidata.org/sparql", params={"query": f"SELECT ?g WHERE {{ ?g wdt:P400 wd:{qid} . }}", "format": "json"}, headers=UAH, timeout=120)
            if r.status_code == 200:
                ids |= {b["g"]["value"].rsplit("/", 1)[1] for b in r.json()["results"]["bindings"]}; break
            print("sparql", qid, r.status_code)
        except Exception as e:
            print("sparql", qid, e)
        time.sleep(15)
print("wikidata games", len(ids))
PROPS = {"P400": "plat", "P123": "pub", "P178": "dev", "P179": "ser", "P136": "gen", "P404": "mode"}
FAILED = []
def wbget(batch, **kw):
    """Entities for up to 50 ids. If Wikidata rejects the batch (one bad id sinks all 50), split it."""
    for attempt in range(3):
        try:
            r = S.get(WD, params={"action": "wbgetentities", "ids": "|".join(batch), "format": "json", "maxlag": 5, **kw}, timeout=90)
            j = r.json()
            if "entities" in j: return j["entities"]
            err = j.get("error", {})
            print("wbget", len(batch), err.get("code"), str(err.get("info"))[:150])
            if err.get("code") != "maxlag": break
        except Exception as e:
            print("wbget", len(batch), e)
        time.sleep(5 * (attempt + 1))
    if len(batch) > 1:
        h = len(batch) // 2
        return {**wbget(batch[:h], **kw), **wbget(batch[h:], **kw)}
    FAILED.append(batch[0]); return {}

games, refs = [], set()
idl = sorted(ids)
for k in range(0, len(idl), 50):
    ents = wbget(idl[k:k + 50], props="labels|claims|sitelinks", languages="en", sitefilter="enwiki")
    for q, e in ents.items():
        cl = e.get("claims", {})
        def vals(p):
            out = []
            for c in cl.get(p, []):
                v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
                if isinstance(v, dict) and "id" in v: out.append(v["id"])
            return out
        dates = []
        for c in cl.get("P577", []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if isinstance(v, dict) and v.get("time") and v.get("precision", 0) >= 9: dates.append(v["time"][1:11].replace("-00", "-01"))
        g = {"q": q, "t": e.get("labels", {}).get("en", {}).get("value"), "w": e.get("sitelinks", {}).get("enwiki", {}).get("title"),
             "rel": min(dates) if dates else None}
        for p, name in PROPS.items():
            g[name] = vals(p); refs |= set(g[name])
        if g["t"]: games.append(g)
    time.sleep(1)
names = {}
rl = sorted(refs)
for k in range(0, len(rl), 50):
    for q, e in wbget(rl[k:k + 50], props="labels", languages="en").items():
        names[q] = e.get("labels", {}).get("en", {}).get("value", q)
    time.sleep(1)
for g in games:
    for name in PROPS.values(): g[name] = [names.get(x, x) for x in g[name]]
(OUT / "wikidata.json").write_text(json.dumps(games, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("wikidata saved", len(games), "of", len(ids), "; failed batches", len(FAILED))

# Page views: 50 articles per request, following redirects back to the title we asked for.
pool = json.loads((ROOT / "data" / "predict-pool.json").read_text(encoding="utf-8"))
pool += [{"w": g["w"]} for g in games if g.get("w")]
extra = json.loads((ROOT / "data" / "about.json").read_text(encoding="utf-8"))
titles = sorted({g["w"] for g in pool if g.get("w")} | {v["w"] for v in extra.values() if isinstance(v, dict) and v.get("w")})
views = {}
for k in range(0, len(titles), 50):
    batch = titles[k:k + 50]
    for attempt in range(3):
        try:
            j = S.get(API, params={"action": "query", "prop": "pageviews", "pvipdays": 60, "titles": "|".join(batch),
                                   "redirects": 1, "format": "json", "formatversion": 2}, timeout=60).json()
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
        v = sum(x or 0 for x in (pg.get("pageviews") or {}).values())
        views[back.get(pg["title"], pg["title"])] = v
        views.setdefault(pg["title"], v)
    time.sleep(0.5)
(OUT / "views.json").write_text(json.dumps(views, ensure_ascii=False), encoding="utf-8")
print("views", len(views))

# Blog archive: WordPress feeds page back with ?paged=N.
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
for n in range(1, 80):
    if (OUT / f"blog-{n:02d}.xml").exists(): continue
    try:
        r = requests.get("https://blog.playstation.com/tag/playstation-plus/feed/", params={"paged": n}, headers={"User-Agent": UA}, timeout=60)
    except Exception as e:
        print("blog", n, e); break
    print("blog", n, r.status_code, len(r.text))
    if r.status_code != 200 or "<item>" not in r.text: break
    (OUT / f"blog-{n:02d}.xml").write_text(r.text, encoding="utf-8")
    time.sleep(1)
