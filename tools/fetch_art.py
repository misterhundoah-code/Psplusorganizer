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


def get_html(url):
    try:
        r = S.get(url, timeout=30)
        return r.text if r.status_code == 200 else None
    except Exception:
        return None


def meta(html, prop):
    m = re.search(r'<meta[^>]+property="%s"[^>]+content="([^"]+)"' % prop, html) or re.search(
        r'content="([^"]+)"[^>]+property="%s"' % prop, html)
    return m.group(1) if m else None


def image_from_store_page(cid, want_title=None):
    """Artwork from a concept page. With want_title, only if the page is for that game."""
    html = get_html(f"https://store.playstation.com/en-ca/concept/{cid}")
    if not html:
        return None
    if want_title:
        page = norm(re.sub(r"\s*\|.*$", "", meta(html, "og:title") or ""))
        want = norm(want_title)
        if not page or not (page == want or page.startswith(want) or want.startswith(page)):
            return None
    img = meta(html, "og:image")
    if img:
        return img
    m = re.search(r'https://image\.api\.playstation\.com/[^"\s]+?\.(?:png|jpg|jpeg)', html)
    return m.group(0) if m else None


def from_games_page(title):
    """For games with only a search link: playstation.com's own page for the game.
    Returns (concept id or None, image url or None), only if the page is for this game."""
    want = norm(title)
    tries = [title]
    base = re.split(r"\s*[:\-–]\s+", title)[0]
    if base != title:
        tries.append(base)
    for t in tries:
        html = get_html("https://www.playstation.com/en-ca/games/" + slug(t) + "/")
        time.sleep(0.4)
        if not html:
            continue
        page = norm(re.sub(r"\s*[-|]\s*(PS[45].*|PlayStation.*)$", "", meta(html, "og:title") or ""))
        if not page or not (page == want or want.startswith(page) or page.startswith(want)):
            continue
        ids = re.findall(r'conceptId\\?":\\?"?(\d+)', html)
        cid = max(set(ids), key=ids.count) if ids else None
        img = image_from_store_page(cid) if cid else None
        return cid, img or meta(html, "og:image")
    return None, None


def slug(title):
    t = unicodedata.normalize("NFD", str(title)).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[’'™®©.!]", "", t).replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def probe(title):
    """Print what the store's search page returns, to debug lookups."""
    from urllib.parse import quote
    for url in ("https://www.playstation.com/en-ca/games/" + slug(title) + "/",):
        try:
            r = S.get(url, timeout=30)
        except Exception as e:
            print(url, "error", e)
            continue
        h = r.text
        print(url, r.status_code, len(h))
        print("  concept links:", re.findall(r"/concept/(\d+)", h)[:8])
        print("  product links:", re.findall(r"/product/([A-Z0-9_-]+)", h)[:8])
        print("  images:", re.findall(r"https://image\.api\.playstation\.com/[^\"\s\\]+", h)[:4])
        print("  conceptId fields:", re.findall(r'conceptId\\?":\\?"?(\d+)', h)[:8])
        print("  og:image:", meta(h, "og:image"), " og:title:", meta(h, "og:title"))
        print("  store links:", re.findall(r"store\.playstation\.com/[a-z-]+/(?:concept|product)/[A-Za-z0-9_-]+", h)[:6])
        print("  has __NEXT_DATA__:", "__NEXT_DATA__" in h, " apollo:", "apolloState" in h or "__APOLLO" in h)
        print("  snippet:", re.sub(r"\s+", " ", h[:300]))


def main():
    if "--probe" in sys.argv:
        probe(sys.argv[sys.argv.index("--probe") + 1])
        return
    refresh = "--refresh" in sys.argv
    ART.mkdir(exist_ok=True)
    games = load_games()
    print(f"{len(games)} games")
    by_concept, by_title = load_feeds()
    print(f"{len(by_concept)} games with artwork in Sony's lists")
    got, missing, new, stats = [], [], 0, {}
    lp = ROOT / "data/links.json"
    links = json.loads(lp.read_text(encoding="utf-8")) if lp.exists() else {}
    tried = set(links.pop("_tried", []))
    for g in games:
        gid = g["id"]
        out = ART / f"{gid}.webp"
        if out.exists() and not refresh and (concept_of(g) or gid in links or gid in tried):
            got.append(gid)
            continue
        cid = concept_of(g)
        img = by_concept.get(cid) if cid else None
        if not img:
            hit = by_title.get(norm(g.get("t", "")))
            if hit:
                cid, img = cid or hit[0], hit[1]
        how = "list" if img else ""
        if not img and cid:
            img = image_from_store_page(cid)
            how = "page"
            time.sleep(0.4)
        if not img and not cid:
            found, img = from_games_page(g.get("t", ""))
            if found:
                links[gid] = found
            how = "games page"
        if cid and not concept_of(g):
            links[gid] = cid
        if img:
            stats[how] = stats.get(how, 0) + 1
        if not concept_of(g) and gid not in links:
            tried.add(gid)
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
    links = {k: v for k, v in sorted(links.items())}
    links["_tried"] = sorted(tried)
    lp.write_text(json.dumps(links, indent=0) + "\n", encoding="utf-8")
    (ROOT / "data/art.json").write_text(json.dumps(ids, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"artwork for {len(ids)} of {len(games)} games ({new} new; found via {stats})")
    if missing:
        print(f"no artwork found for {len(missing)}: " + "; ".join(missing[:60]) + (" ..." if len(missing) > 60 else ""))


if __name__ == "__main__":
    main()
