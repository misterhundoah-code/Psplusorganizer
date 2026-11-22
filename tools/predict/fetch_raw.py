#!/usr/bin/env python3
"""Raw material for the PS Plus prediction list (branch `predict`, not live yet).

Saves, under data/predict-raw/:
  wiki-<n>.txt       wikitext of Wikipedia's lists of PS4 and PS5 games
  blog-<n>.json      PlayStation Blog posts announcing PS Plus Game Catalog lineups
                     (WordPress REST search), for when each catalogue game was added
"""
import json, time
from pathlib import Path
import requests

OUT = Path(__file__).resolve().parents[2] / "data" / "predict-raw"
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({"User-Agent": "PSPlusRentalWall/1.0 (https://github.com/misterhundoah-code/Psplusorganizer)"})

PAGES = ["List of PlayStation 5 games", "List of PlayStation 4 games (A–L)", "List of PlayStation 4 games (M–Z)"]
for i, p in enumerate(PAGES):
    r = S.get("https://en.wikipedia.org/w/api.php", params={"action": "parse", "page": p, "prop": "wikitext",
              "format": "json", "formatversion": 2, "redirects": 1}, timeout=60)
    j = r.json()
    txt = j.get("parse", {}).get("wikitext", "") or json.dumps(j)[:2000]
    (OUT / f"wiki-{i}.txt").write_text(f"{p}\n{txt}", encoding="utf-8")
    print(p, len(txt))
    time.sleep(1)

n = 0
for q in ["PlayStation Plus Game Catalog", "PlayStation Plus Monthly Games"]:
    for page in range(1, 6):
        r = S.get("https://blog.playstation.com/wp-json/wp/v2/posts", params={"search": q, "per_page": 100, "page": page,
                  "_fields": "date,link,title,content"}, timeout=60)
        print(q, page, r.status_code, len(r.text))
        if r.status_code != 200:
            (OUT / f"blog-err-{n}.txt").write_text(r.text[:3000]); n += 1; break
        posts = r.json()
        if not posts: break
        (OUT / f"blog-{n}.json").write_text(json.dumps(posts), encoding="utf-8"); n += 1
        time.sleep(1)
