#!/usr/bin/env python3
"""Download game artwork into art/ and list what is there in data/art.json.

Runs in GitHub Actions (see .github/workflows/artwork.yml), which can reach Sony's
servers. For each game in data/games.json and the "added" list in data/catalogue.json:

1. Find its PlayStation Store concept id: from its store link, or by matching its
   title against Sony's PS Plus game lists.
2. Find the artwork address: from those lists, or failing that from the game's
   store page.
3. Download it, crop it square, shrink it to 256 x 256 and save art/<game id>.webp.

Games that already have a file are skipped, so each run only fetches new games.
Pass --refresh to download everything again.
"""
import io
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art"
SIZE = 256
FEEDS = ["plus-games-list", "plus-classics-list", "plus-monthly-games-list"]
LOCALES = ["en-ca", "en-us", "en-gb"]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9"})


def norm(t):
    t = unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[™®©]", "", t)
    t = re.sub(r"\b(ps4 (?:&|and) ps5|ps5 (?:&|and) ps4|ps4|ps5)\b", " ", t)
    t = t.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "", t)


def load_games():
    games = []
    for line in (ROOT / "data/games.json").read_text(encoding="utf-8").splitlines():
        line = line.strip().rstrip(",")
        if line.startswith("{"):
            games.append(json.loads(line))
    cat = json.loads((ROOT / "data/catalogue.json").read_text(encoding="utf-8"))
    games += [g for g in cat.get("added", []) if isinstance(g, dict) and g.get("id")]
    return games


def load_feeds():
    by_concept, by_title = {}, {}
    for loc in LOCALES:
        for feed in FEEDS:
            url = f"https://www.playstation.com/bin/imagic/gameslist?locale={loc}&categoryList={feed}"
            try:
                r = S.get(url, timeout=40)
                r.raise_for_status()
                data = r.json()
            except Exception as e:  # a missing list is fine; the others still help
                print(f"  feed {loc}/{feed}: {e}")
                continue
            n = 0
            for group in data if isinstance(data, list) else []:
                for g in group.get("games", []) or []:
                    cid, img = g.get("conceptId"), g.get("imageUrl")
                    if not cid or not img:
                        continue
                    cid = str(cid)
                    by_concept.setdefault(cid, img)
                    for name in (g.get("name"), g.get("nameEn")):
                        if name:
                            by_title.setdefault(norm(name), (cid, img))
                    n += 1
            print(f"  feed {loc}/{feed}: {n} games")
            time.sleep(0.5)
    return by_concept, by_title


def concept_of(g):
    m = re.search(r"/concept/(\d+)", g.get("u") or "")
    return m.group(1) if m else None


def image_from_store_page(cid):
    try:
        r = S.get(f"https://store.playstation.com/en-ca/concept/{cid}", timeout=30)
        if r.status_code != 200:
            return None
        html = r.text
    except Exception:
        return None
    m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html) or re.search(
        r'content="([^"]+)"[^>]+property="og:image"', html)
    if m:
        return m.group(1)
    m = re.search(r'https://image\.api\.playstation\.com/[^"\s]+?\.(?:png|jpg|jpeg)', html)
    return m.group(0) if m else None


def save(img_url, out):
    sep = "&" if "?" in img_url else "?"
    r = S.get(img_url + sep + "w=440", timeout=40)
    if r.status_code != 200:
        r = S.get(img_url, timeout=40)
    r.raise_for_status()
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(out, "WEBP", quality=78, method=6)


def main():
    refresh = "--refresh" in sys.argv
    ART.mkdir(exist_ok=True)
    games = load_games()
    print(f"{len(games)} games")
    by_concept, by_title = load_feeds()
    print(f"{len(by_concept)} games with artwork in Sony's lists")
    got, missing, new = [], [], 0
    for g in games:
        gid = g["id"]
        out = ART / f"{gid}.webp"
        if out.exists() and not refresh:
            got.append(gid)
            continue
        cid = concept_of(g)
        img = by_concept.get(cid) if cid else None
        if not img:
            hit = by_title.get(norm(g.get("t", "")))
            if hit:
                cid, img = cid or hit[0], hit[1]
        if not img and cid:
            img = image_from_store_page(cid)
            time.sleep(0.4)
        if not img:
            missing.append(g.get("t", gid))
            continue
        try:
            save(img, out)
            got.append(gid)
            new += 1
        except Exception as e:
            print(f"  {gid}: {e}")
            missing.append(g.get("t", gid))
        time.sleep(0.15)
    ids = sorted(set(got) & {g["id"] for g in games})
    (ROOT / "data/art.json").write_text(json.dumps(ids, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"artwork for {len(ids)} of {len(games)} games ({new} new)")
    if missing:
        print(f"no artwork found for {len(missing)}: " + "; ".join(missing[:60]) + (" ..." if len(missing) > 60 else ""))


if __name__ == "__main__":
    main()
