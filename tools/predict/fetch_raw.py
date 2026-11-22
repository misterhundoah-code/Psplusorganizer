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

# Page views: 50 articles per request, following redirects back to the title we asked for.
pool = json.loads((ROOT / "data" / "predict-pool.json").read_text(encoding="utf-8"))
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
    try:
        r = requests.get("https://blog.playstation.com/tag/playstation-plus/feed/", params={"paged": n}, headers={"User-Agent": UA}, timeout=60)
    except Exception as e:
        print("blog", n, e); break
    print("blog", n, r.status_code, len(r.text))
    if r.status_code != 200 or "<item>" not in r.text: break
    (OUT / f"blog-{n:02d}.xml").write_text(r.text, encoding="utf-8")
    time.sleep(1)
