#!/usr/bin/env python3
"""Work out which Game Catalogue and Classics games each country gets.

Runs in GitHub Actions (see .github/workflows/regions.yml), which can reach Sony's
servers. For every store region the site offers, it downloads Sony's own PS Plus
lists (the ones behind the game finder on playstation.com), matches each entry to
a game in data/games.json, and writes data/regions.json:

  {
    "asOf": "2026-11-20",
    "regions": {
      "pt-br": {"cat": [ids in the Game Catalogue], "cl": [ids in the Classics],
                "stream": false,      # top tier is Deluxe: no cloud streaming, so no PS3 games
                "from": "es-ar",      # Sony has no list for Brazil; this region's list stands in
                "extra": [entries for games the site doesn't list yet]},
      ...
    }
  }

A region whose lists can't be downloaded is left out, and the site then shows
the full list for it. Sony doesn't publish its PS3 streaming list, so the only
thing recorded about PS3 streaming is whether the region has it at all: regions
whose top tier is Deluxe rather than Premium have no cloud streaming.
"""
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_art import S, concept_of, load_games, norm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FEEDS = {"cat": "plus-games-list", "cl": "plus-classics-list"}
# Regions Sony publishes no list for, and the region whose list is used instead.
STAND_IN = {"pt-br": "es-ar"}


def site_regions():
    """The region codes offered in the site's region menu, so the two never drift apart."""
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    line = re.search(r"const REGIONS=\[(.*?)\];", html).group(1)
    return re.findall(r'\["([a-z]{2}-[a-z]{2})"', line)


def fetch(loc, feed):
    url = f"https://www.playstation.com/bin/imagic/gameslist?locale={loc}&categoryList={feed}"
    for attempt in range(3):
        try:
            r = S.get(url, timeout=40)
            r.raise_for_status()
            data = r.json()
            return [g for grp in (data if isinstance(data, list) else []) for g in grp.get("games", []) or []]
        except Exception as e:
            print(f"  {loc}/{feed}: attempt {attempt + 1} failed: {e}")
            time.sleep(3)
    return None


def top_tier(loc):
    """'deluxe' or 'premium', read from the region's PS Plus page. Returns None if unsure."""
    try:
        r = S.get(f"https://www.playstation.com/{loc}/ps-plus/", timeout=40)
        r.raise_for_status()
        html = r.text
    except Exception as e:
        print(f"  {loc}: couldn't read the PS Plus page: {e}")
        return None
    # Japanese and Korean pages write the tier names in their own scripts.
    deluxe = len(re.findall(r"(?:PlayStation|PS)\s*Plus\s+(?:Deluxe|デラックス|디럭스)", html))
    premium = len(re.findall(r"(?:PlayStation|PS)\s*Plus\s+(?:Premium|プレミアム|프리미엄)", html))
    print(f"  {loc}: page mentions Deluxe {deluxe}x, Premium {premium}x")
    if deluxe > premium:
        return "deluxe"
    if premium > deluxe:
        return "premium"
    return None


def platforms(g):
    dev = g.get("device") or []
    if isinstance(dev, str):
        dev = [dev]
    out = []
    for d in dev:
        d = str(d).upper().replace(" ", "")
        for p in ("PS5", "PS4", "PS3", "PS2", "PS1", "PSP", "PSVR2", "PSVR"):
            if p in d and p not in out:
                out.append(p)
    return out


def main():
    games = load_games()
    links = json.loads((ROOT / "data/links.json").read_text(encoding="utf-8")) if (ROOT / "data/links.json").exists() else {}
    by_cid, by_title = {}, {}
    for g in games:
        for cid in (concept_of(g), links.get(g["id"])):
            if cid and re.fullmatch(r"\d+", str(cid)):
                by_cid.setdefault(str(cid), []).append(g)
        by_title.setdefault(norm(g["t"]), []).append(g)

    def match(entry, kind):
        """Find the site's game for a feed entry, preferring one already flagged for this list."""
        # 1. Exact title. Editions of one game often share a store id (Death Stranding and its
        #    Director's Cut, Uncharted 4 and The Lost Legacy), so the title comes first.
        names = [n for n in (entry.get("nameEn"), entry.get("name")) if n]
        cands = next((by_title[norm(n)] for n in names if norm(n) in by_title), [])
        # 2. Store id.
        if not cands:
            cands = by_cid.get(str(entry.get("conceptId") or ""), [])
        # 3. Sony's name starts with the site's title ("Cricket 26 - The Official Game of the Ashes").
        if not cands:
            for n in map(norm, names):
                hits = [t for t in by_title if len(t) >= 8 and n.startswith(t)]
                if hits:
                    cands = by_title[max(hits, key=len)]
                    break
        if not cands:
            return None
        flag = (lambda x: x.get("cat")) if kind == "cat" else (lambda x: x.get("cl") and x.get("sys") != "PS3")
        best = [c for c in cands if flag(c)] or cands
        return best[0]["id"]

    out = {"asOf": date.today().isoformat(), "regions": {}}
    for loc in site_regions():
        reg, ok = {"cat": [], "cl": [], "extra": []}, True
        src = STAND_IN.get(loc, loc)
        if src != loc:
            reg["from"] = src
        tier = top_tier(loc)
        if tier:
            reg["stream"] = tier == "premium"
        for kind, feed in FEEDS.items():
            entries = fetch(src, feed)
            if entries is None:
                ok = False
                break
            seen = set()
            for e in entries:
                gid = match(e, kind)
                if gid:
                    if gid not in seen:
                        seen.add(gid)
                        reg[kind].append(gid)
                else:
                    reg["extra"].append({
                        "t": e.get("nameEn") or e.get("name") or "",
                        "name": e.get("name") or "",
                        "cid": str(e.get("conceptId") or ""),
                        "p": platforms(e),
                        "list": kind,
                    })
            time.sleep(0.4)
        if not ok or not (reg["cat"] or reg["cl"]):
            print(f"{loc}: skipped (lists unavailable)")
            continue
        reg["cat"].sort()
        reg["cl"].sort()
        out["regions"][loc] = reg
        print(f"{loc}: {len(reg['cat'])} catalogue, {len(reg['cl'])} classics matched; {len(reg['extra'])} not on the site")

    if not out["regions"]:
        sys.exit("No region lists could be downloaded; leaving data/regions.json alone.")
    (ROOT / "data/regions.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
