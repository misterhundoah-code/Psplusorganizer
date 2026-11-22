#!/usr/bin/env python3
"""Every PS Plus Game Catalog and Monthly Games announcement in the blog archive
(data/predict-raw/blog-*.xml), parsed with tools/fetch_coming.py, written to
data/predict-history.json as [{kind, month, date, games: [{t, tier, p}]}]."""
import json, re, sys
from email.utils import parsedate_to_datetime
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import fetch_coming as fc

HIST = ROOT / "data" / "predict-history.json"
posts = {p["kind"] + p["month"]: p for p in (json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else [])}
for f in sorted((ROOT / "data" / "predict-raw").glob("blog-*.xml")):
    for it in re.findall(r"<item>(.*?)</item>", f.read_text(encoding="utf-8"), re.S):
        link = re.search(r"<link>(.*?)</link>", it); title = re.search(r"<title>(.*?)</title>", it, re.S)
        body = re.search(r"<content:encoded><!\[CDATA\[(.*?)\]\]></content:encoded>", it, re.S); pub = re.search(r"<pubDate>(.*?)</pubDate>", it)
        if not (link and title and body and pub): continue
        try: p = fc.parse_post(link.group(1).strip(), fc.text(title.group(1)), body.group(1), parsedate_to_datetime(pub.group(1)).date())
        except Exception as e: print("skip", title.group(1)[:60], e); continue
        if p: posts[p["kind"] + p["month"]] = {k: p[k] for k in ("url", "kind", "month", "date", "title")} | {"games": [{"t": g["t"], "tier": g["tier"], "p": g["p"]} for g in p["games"]]}
out = sorted(posts.values(), key=lambda p: (p["month"], p["kind"]))
HIST.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
print(len(out), "posts,", sum(len(p["games"]) for p in out), "games;", out[0]["month"], "to", out[-1]["month"])
print(sum(1 for p in out if p["kind"]=="catalog"), "catalog;", sum(1 for p in out if p["kind"]=="monthly"), "monthly")
for p in out[-3:]: print(p["kind"], p["month"], [g["t"] for g in p["games"]][:8])
