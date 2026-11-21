#!/usr/bin/env python3
"""Which games let PlayStation players play with Xbox or PC players.

Runs in GitHub Actions (see .github/workflows/crossplay.yml). Reads Wikipedia's
"List of video games that support cross-platform play" (CC BY-SA 4.0), matches its
rows to the games in data/games.json, and writes data/crossplay.json:

  {
    "asOf": "2026-11-21",
    "source": "https://en.wikipedia.org/wiki/List_of_video_games_that_support_cross-platform_play",
    "games": {"rocket-league": {"x": ["PS4", "PS5"], "p": ["PS4", "PS5"]}, ...}
  }

"x" lists the PlayStation versions that play with Xbox players, "p" those that play
with PC players. Each row of Wikipedia's table is one group of platforms that play
together; a game with several rows has separate groups (Battlefield 2042: PS4 with
Xbox One, PS5 with Xbox Series and PC), so a PlayStation version only counts when it
shares a row with Xbox or PC. Games the list doesn't mention are left out: that means
"not listed", not "no crossplay", and the site says so.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

import mwparserfromhell as mw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_art import S, load_games, norm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PAGE = "List_of_video_games_that_support_cross-platform_play"
SOURCE = "https://en.wikipedia.org/wiki/" + PAGE
# Column order of the "Games which currently support cross-platform play" table.
COLS = ["title", "linux", "mac", "gog", "steam", "xboxpc", "otherpc", "ios", "android",
        "ps4", "xbo", "switch", "ps5", "xbs", "others", "ref"]
PS = {"ps4": "PS4", "ps5": "PS5"}
XBOX = {"xbo", "xbs"}
PC = {"linux", "mac", "gog", "steam", "xboxpc", "otherpc"}
# Wikipedia title -> the site's title, where the two differ.
ALIASES = {
    "Black Desert Online": "Black Desert",
    "Helldivers": "Helldivers: Democracy Strikes Back Edition",
    "Tetris Effect": "Tetris Effect: Connected",
}
EXPECTED_HEADERS = ["Linux", "Mac", "GOG", "Steam", "PS4", "XBO", "Switch", "PS5"]


def wikitext():
    r = S.get("https://en.wikipedia.org/w/api.php", params={
        "action": "parse", "page": PAGE, "prop": "wikitext", "format": "json", "formatversion": "2"}, timeout=60)
    r.raise_for_status()
    return r.json()["parse"]["wikitext"]


def rows_of(table):
    """The table's data rows as lists of cell wikitext, one per COLS entry, with rowspan and colspan filled in."""
    carry, out = {}, []
    for tr in table.contents.filter_tags(recursive=False):
        if tr.tag != "tr":
            continue
        cells = [c for c in tr.contents.filter_tags(recursive=False) if c.tag in ("td", "th")]
        if not cells or any(c.tag == "th" for c in cells):
            continue
        row, col = [None] * len(COLS), 0
        while col < len(COLS):
            if carry.get(col, (0,))[0] > 0:
                left, val = carry[col]
                row[col] = val
                carry[col] = (left - 1, val)
                col += 1
                continue
            if not cells:
                break
            c = cells.pop(0)
            span = int(str(c.get("colspan").value).strip().strip('"')) if c.has("colspan") else 1
            rs = int(str(c.get("rowspan").value).strip().strip('"')) if c.has("rowspan") else 1
            for _ in range(span):
                if col < len(COLS):
                    row[col] = str(c.contents)
                    if rs > 1:
                        carry[col] = (rs - 1, row[col])
                    col += 1
        out.append(row)
    return out


def ticked(cell):
    return bool(cell) and bool(re.search(r"\{\{\s*(yes|partial|included)\b", cell, re.I))


def title_of(cell):
    cell = re.sub(r"<ref.*?(</ref>|/>)", "", cell or "", flags=re.S)
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cell)
    text = (m.group(2) or m.group(1)) if m else cell
    return re.sub(r"''+|\{\{[^}]*\}\}", "", text).strip()


def main():
    text = wikitext()
    head = text[:text.find("|-\n|")]
    missing = [h for h in EXPECTED_HEADERS if h not in head]
    if missing:
        sys.exit(f"Wikipedia's table layout has changed (missing {missing}); leaving data/crossplay.json alone.")
    tables = [t for t in mw.parse(text).filter_tags() if t.tag == "table"]
    if not tables:
        sys.exit("No table found; leaving data/crossplay.json alone.")

    groups = {}
    for row in rows_of(tables[0]):   # the first table is "currently support"; later ones are former support
        if not row[0]:
            continue
        on = {c for c, v in zip(COLS, row) if c not in ("title", "others", "ref") and ticked(v)}
        groups.setdefault(title_of(row[0]), []).append(on)

    by_title = {}
    for g in load_games():
        by_title.setdefault(norm(g["t"]), []).append(g["id"])

    out, unmatched = {}, 0
    for title, gs in groups.items():
        ids = by_title.get(norm(ALIASES.get(title, title)))
        if not ids:
            unmatched += 1
            continue
        x = sorted({PS[p] for g in gs if g & XBOX for p in g & PS.keys()})
        p = sorted({PS[q] for g in gs if g & PC for q in g & PS.keys()})
        if x or p:
            for gid in ids:
                out[gid] = {k: v for k, v in (("x", x), ("p", p)) if v}
    if len(out) < 10:
        sys.exit(f"Only {len(out)} matches; something is wrong. Leaving data/crossplay.json alone.")
    (ROOT / "data/crossplay.json").write_text(json.dumps(
        {"asOf": date.today().isoformat(), "source": SOURCE, "games": dict(sorted(out.items()))},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    xb = sum(1 for v in out.values() if "x" in v)
    pc = sum(1 for v in out.values() if "p" in v)
    print(f"{len(groups)} games on Wikipedia's list; {len(out)} on the site cross-play with Xbox or PC "
          f"({xb} with Xbox, {pc} with PC); {unmatched} listed games aren't on the site.")


if __name__ == "__main__":
    main()
