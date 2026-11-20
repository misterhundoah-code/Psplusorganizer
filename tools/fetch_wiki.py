#!/usr/bin/env python3
"""Longer descriptions, and covers for games Sony has no artwork for, from Wikipedia.

Runs in GitHub Actions (see .github/workflows/wiki.yml). For each game in
data/games.json it finds the game's English Wikipedia article and saves:

  data/about.json        {id: {"x": first paragraph or two, "w": article title}}
                         shown in the game pop-up, credited to Wikipedia (CC BY-SA 4.0)
  art/<id>.webp          the article's main image (normally the box art), letterboxed
                         to a square, for games without Sony artwork or whose Sony
                         artwork is listed as wrong in data/art-overrides.json
  data/art-sources.json  {id: article title} for every cover that came from Wikipedia,
                         so tools/fetch_art.py leaves those alone
  data/art.json          the list of games with artwork, updated to include them

Articles are matched carefully: the article must exist under the game's own title
(optionally with "(video game)" or "(YEAR video game)"), and its Wikipedia short
description must say it's a game. Games that can't be matched that way get nothing,
rather than the wrong article.
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art"
API = "https://en.wikipedia.org/w/api.php"
SIZE = 256
BG = (22, 23, 29)  # the site's blank-tape black, behind letterboxed covers
S = requests.Session()
S.headers.update({"User-Agent": "PSPlusRentalWall/1.0 (https://github.com/misterhundoah-code/Psplusorganizer)"})

# Edition words dropped to find the article for the base game.
EDITION = re.compile(
    r"\s*(?:[:\-–]\s*)?(?:\((?:PS1|PS2|PS3|PSP|Classic|expansion|\d{4}(?: remake)?)\)"
    r"|(?:the\s+)?(?:Remastered|Remaster|Director'?s Cut|Definitive Edition|Complete Edition|Enhanced Edition|"
    r"Game of the Year Edition|GOTY Edition|Collector'?s Edition|Console Edition|Deluxe Edition|Standard Edition|"
    r"Ultimate Edition|Special Edition|Gold Edition|Full Time Edition|Anniversary Edition|Classic Edition|"
    r"Champion Edition|Elite Edition|Legendary Edition|Revival Edition|Enhanced|Redux|Reforged|Ultimate))\s*$",
    re.I,
)


def load_games():
    out = []
    for line in (ROOT / "data/games.json").read_text(encoding="utf-8").splitlines():
        line = line.strip().rstrip(",")
        if line.startswith("{"):
            out.append(json.loads(line))
    return out


def api(**params):
    params.update(format="json", formatversion=2, maxlag=5)
    for attempt in range(4):
        r = S.get(API, params=params, timeout=40)
        if r.status_code == 200 and "error" not in r.json():
            return r.json()
        time.sleep(2 + attempt * 3)
    r.raise_for_status()
    return r.json()


def base_title(t):
    prev = None
    while prev != t:
        prev, t = t, EDITION.sub("", t).strip()
    return t


def candidates(g):
    t, y = g["t"].replace("’", "'"), g.get("y")
    out = []
    for name in dict.fromkeys([t, base_title(t)]):
        if y:
            out.append(f"{name} ({y} video game)")
        out += [f"{name} (video game)", name]
    return out


def is_game(page):
    """The article is about one game: not a company, a series, a person or a disambiguation page."""
    d = (page.get("description") or "").lower()
    if page.get("missing") or not d or "disambiguation" in d:
        return False
    if re.search(r"\b(company|developer|publisher|studio|corporation|character|person|engine|console)\b", d):
        return False
    if re.search(r"\b(?:game|video game) (?:series|franchise)\b|^(?:media )?franchise|^series\b", d):
        return False
    return "video game" in d or re.search(r"\bgame\b", d)


def resolve(games):
    """Map game id -> Wikipedia page (with description and image), trying each candidate title in order."""
    want = {g["id"]: candidates(g) for g in games}
    titles = sorted({c for cs in want.values() for c in cs})
    pages, redirect = {}, {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        data = api(action="query", titles="|".join(chunk), redirects=1, prop="description|pageimages",
                   piprop="thumbnail|original", pithumbsize=500, pilicense="any")
        q = data.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        # A redirect to a section of another article ("Secret Neighbor" -> "Hello Neighbor#...") is a
        # different game's page, so it doesn't count.
        redir = {r["from"]: (None if r.get("tofragment") else r["to"]) for r in q.get("redirects", [])}
        by_title = {p["title"]: p for p in q.get("pages", [])}
        for c in chunk:
            t = norm.get(c, c)
            if t in redir and redir[t] is None:
                continue
            t = redir.get(t, t)
            if t in by_title:
                pages[c] = by_title[t]
                redirect[c] = t
        time.sleep(0.3)
    found = {}
    for g in games:
        for c in want[g["id"]]:
            p = pages.get(c)
            if p and is_game(p):
                # A plain-title match whose description names a year far from the game's own is
                # probably a different game of the same name (unless ours is a remaster or remake).
                years = [int(m) for m in re.findall(r"\b(19\d{2}|20\d{2})\b", p.get("description") or "")]
                remake = re.search(r"remaster|remake|collection|edition|redux|\(", g["t"], re.I)
                if g.get("y") and years and not c.endswith("video game)") and not remake \
                        and min(abs(int(g["y"]) - yy) for yy in years) > 3:
                    continue
                found[g["id"]] = p
                break
    return found


def clean(text):
    text = re.sub(r"\s*\((?:[^()]*?(?:Japanese|Korean|Chinese|lit\.|pronounced|stylized|stylised|abbreviated)[^()]*|[^()]*[぀-ヿ一-鿿가-힯][^()]*)\)", "", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    out = ""
    for p in paras:
        if len(out) + len(p) > 900 and out:
            break
        out = (out + "\n\n" + p).strip()
    if len(out) > 900:
        cut = out[:900]
        out = cut[: cut.rfind(". ") + 1] if ". " in cut else cut
    return out


def extracts(titles):
    out = {}
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        data = api(action="query", titles="|".join(chunk), prop="extracts", exintro=1, explaintext=1, exlimit=20)
        for p in data.get("query", {}).get("pages", []):
            if p.get("extract"):
                out[p["title"]] = clean(p["extract"])
        time.sleep(0.3)
    return out


def get_image(url):
    """Download politely: Wikimedia's image servers rate-limit, so wait when asked and retry."""
    for attempt in range(5):
        r = S.get(url, timeout=40)
        if r.status_code == 429:
            wait = int(r.headers.get("Retry-After", "0") or 0) or 20 * (attempt + 1)
            print(f"  rate-limited; waiting {wait}s")
            time.sleep(min(wait, 120))
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()
    return r


def save_cover(url, out):
    r = get_image(url)
    im = Image.open(io.BytesIO(r.content))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, BG + (255,))
        bg.alpha_composite(im)
        im = bg
    im = im.convert("RGB")
    w, h = im.size
    if w < 120 or h < 120:
        raise ValueError("image too small")
    scale = SIZE / max(w, h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    sq = Image.new("RGB", (SIZE, SIZE), BG)
    sq.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    sq.save(out, "WEBP", quality=80, method=6)


def main():
    games = load_games()
    ids = {g["id"] for g in games}
    art = set(json.loads((ROOT / "data/art.json").read_text(encoding="utf-8")))
    ov_path = ROOT / "data/art-overrides.json"
    blocked = set(json.loads(ov_path.read_text(encoding="utf-8")).get("block", [])) if ov_path.exists() else set()
    src_path = ROOT / "data/art-sources.json"
    sources = json.loads(src_path.read_text(encoding="utf-8")) if src_path.exists() else {}

    skip = set(json.loads(ov_path.read_text(encoding="utf-8")).get("wiki_skip", [])) if ov_path.exists() else set()
    found = {k: v for k, v in resolve(games).items() if k not in skip}
    print(f"matched {len(found)} of {len(games)} games to Wikipedia articles")

    ex = extracts(sorted({p["title"] for p in found.values()}))
    about = {}
    for gid, p in sorted(found.items()):
        if ex.get(p["title"]):
            about[gid] = {"x": ex[p["title"]], "w": p["title"]}
    (ROOT / "data/about.json").write_text(json.dumps(about, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"descriptions for {len(about)} games")

    ART.mkdir(exist_ok=True)
    # A cover taken from an article that no longer matches the game is removed.
    for gid, title in list(sources.items()):
        if gid not in ids or (found.get(gid) or {}).get("title") != title:
            (ART / f"{gid}.webp").unlink(missing_ok=True)
            art.discard(gid)
            del sources[gid]
    new, failed = 0, []
    for g in games:
        gid = g["id"]
        if gid in art and gid not in blocked:
            continue
        if gid in sources and (ART / f"{gid}.webp").exists():
            art.add(gid)
            continue
        p = found.get(gid)
        img = p and ((p.get("thumbnail") or {}).get("source") or (p.get("original") or {}).get("source"))
        if not img or img.lower().endswith(".svg"):
            if gid in blocked:
                (ART / f"{gid}.webp").unlink(missing_ok=True)
                art.discard(gid)
            failed.append(g["t"])
            continue
        try:
            save_cover(img, ART / f"{gid}.webp")
            sources[gid] = p["title"]
            art.add(gid)
            new += 1
        except Exception as e:
            print(f"  {gid}: {e}")
            failed.append(g["t"])
        time.sleep(1.2)
    for gid in blocked - set(sources):
        (ART / f"{gid}.webp").unlink(missing_ok=True)
        art.discard(gid)
    src_path.write_text(json.dumps(dict(sorted(sources.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    (ROOT / "data/art.json").write_text(json.dumps(sorted(art & ids), separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{new} covers added from Wikipedia; artwork now for {len(art & ids)} of {len(games)} games")
    if failed:
        print(f"still no cover for {len(failed)}: " + "; ".join(failed[:80]))


if __name__ == "__main__":
    sys.exit(main())
