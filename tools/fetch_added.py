#!/usr/bin/env python3
"""When each game joined the PS Plus catalogue (Extra, Premium and Classics), for "recently added" on the wall.

Runs in GitHub Actions (see .github/workflows/added.yml). Writes data/added.json:

  {"asOf": "2026-11-28",
   "d": {wall id: "2024-05-21"},   the date the game (most recently) joined, or "2024-05" when only the month is known
   "src": {wall id: "blog"|"seen"}, where the date came from
   "seen": [every wall id the script has ever seen]}

Two ways of knowing:
  * Sony's announcements. With --backfill the script reads every "PlayStation Plus Game Catalog" post on the
    PlayStation Blog since PS Plus Extra launched in June 2022 (and the earlier combined "Monthly Games and Game
    Catalog" posts), finds each game's "Name | PS5, PS4" line under a catalogue heading, and takes the date the
    post says it arrives. A game announced more than once (it left and came back) keeps its latest arrival.
  * Watching the list. Every run, any wall id it hasn't seen before is stamped with today's date, unless an
    announcement already dated it. So from now on every arrival gets a date even if Sony's post is missed.

Games that were already in the catalogue at the June 2022 launch, or that Sony never announced, have no date.
"""
import argparse
import html
import json
import re
import sys
import time
from datetime import date
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_art import S, load_games, norm  # noqa: E402
from fetch_coming import GAME_RE, HEAD_RE, MONTHS, feed_items, text  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/added.json"
START = "2022-05-01"
AVAIL_RE = re.compile(r"\b(?:available|from|on|starting|arrives?|joins?)\s+(?:to play\s+)?(?:from\s+|on\s+)?(?:\w+day,?\s+)?(" + "|".join(MONTHS) + r")\s+(\d{1,2})", re.I)
TITLE_OK = re.compile(r"PlayStation Plus.*(Game Catalog|Extra|Premium)", re.I)
EDITION = re.compile(r"\b(remastered|remaster|edition|deluxe|definitive|complete|ultimate|gold|goty|game of the year|director'?s cut)\b", re.I)


def load():
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8"))
    return {"d": {}, "src": {}, "seen": []}


def posts_rest():
    """Every matching post through WordPress's own API, newest first."""
    out, page = [], 1
    while page < 40:
        try:
            r = S.get("https://blog.playstation.com/wp-json/wp/v2/posts", timeout=60, params={
                "search": "PlayStation Plus", "after": START + "T00:00:00", "per_page": 100, "page": page,
                "_fields": "link,date,title,content"})
        except Exception as e:
            print(f"REST page {page}: {e}"); break
        if r.status_code == 400:   # past the last page
            break
        if r.status_code != 200:
            print(f"REST page {page}: HTTP {r.status_code}"); return None if page == 1 else out
        batch = r.json()
        if not batch:
            break
        for p in batch:
            out.append((p["link"], text(p["title"]["rendered"]), p["content"]["rendered"], date.fromisoformat(p["date"][:10])))
        page += 1
        time.sleep(0.5)
    return out


def posts_rss():
    """The same through the blog's search feed, a page of ten at a time, if the API is closed."""
    out, seen = [], set()
    for q in ("Game Catalog", "PlayStation Plus Extra"):
        for page in range(1, 60):
            try:
                r = S.get("https://blog.playstation.com/", timeout=60, params={"s": q, "feed": "rss2", "paged": page})
            except Exception as e:
                print(f"feed {q} {page}: {e}"); break
            items = re.findall(r"<item>(.*?)</item>", r.text, re.S) if r.status_code == 200 else []
            if not items:
                break
            old = False
            for it in items:
                link = re.search(r"<link>(.*?)</link>", it); title = re.search(r"<title>(.*?)</title>", it, re.S)
                body = re.search(r"<content:encoded><!\[CDATA\[(.*?)\]\]></content:encoded>", it, re.S)
                pub = re.search(r"<pubDate>(.*?)</pubDate>", it)
                if not (link and title and body and pub):
                    continue
                d = parsedate_to_datetime(pub.group(1)).date()
                if d.isoformat() < START:
                    old = True; continue
                if link.group(1) not in seen:
                    seen.add(link.group(1)); out.append((link.group(1).strip(), text(title.group(1)), body.group(1), d))
            if old:
                break
            time.sleep(0.5)
    return out


def year_for(month, posted):
    return posted.year + 1 if month < posted.month - 6 else posted.year


def catalog_games(title, body, posted):
    """(name, date) for each game a post adds to the catalogue; monthly (Essential) games are skipped."""
    if not TITLE_OK.search(title) or "Southeast Asia" in title or "Days of Play" in title:
        return []
    heads = [(h.start(), text(h.group(1))) for h in HEAD_RE.finditer(body)]
    found = list(GAME_RE.finditer(body))
    intro = AVAIL_RE.search(text(body[:6000]))
    out = []
    for n, g in enumerate(found):
        name = text(g.group(1)).strip(" –-:")
        if not name or len(name) > 100:
            continue
        pos, head = next(((p, h) for p, h in reversed(heads) if p < g.start()), (0, ""))
        hl = head.lower()
        if ("monthly" in hl or "essential" in hl) and "catalog" not in hl:
            continue
        if "game catalog" not in title.lower() and "catalog" not in hl and "extra" not in hl and "premium" not in hl and "classic" not in hl:
            continue
        # the arrival date: in the game's own write-up, else its heading ("... | Available September 20"), else the intro
        until = found[n + 1].start() if n + 1 < len(found) else g.end() + 3000
        m = AVAIL_RE.search(text(body[g.end():until])) or AVAIL_RE.search(head) or intro
        if m and m.group(1).capitalize() in MONTHS:
            mo = MONTHS[m.group(1).capitalize()]
            when = date(year_for(mo, posted), mo, int(m.group(2))).isoformat()
        else:
            when = posted.isoformat()[:7]
        out.append((name, when))
    return out


def match_index(games):
    idx = {}
    for g in games:
        idx.setdefault(norm(g["t"]), g["id"])
        base = norm(EDITION.sub(" ", re.sub(r"\s*\([^)]*\)\s*$", "", g["t"])))
        idx.setdefault(base, g["id"])
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="read every catalogue announcement since June 2022")
    a = ap.parse_args()
    games = load_games()
    ids = [g["id"] for g in games]
    data = load()
    today = date.today().isoformat()
    first_run = not data["seen"]
    posts = [(u, t, b, d) for u, (t, b, d) in feed_items().items()]   # the latest few announcements, every run
    if a.backfill:
        more = posts_rest()
        if more is None:
            print("The blog's API isn't open; reading its search feed instead.")
            more = posts_rss()
        posts += more
    if posts:
        idx = match_index(games)
        found, missed = {}, []
        for url, title, body, posted in sorted(posts, key=lambda p: p[3]):
            for name, when in catalog_games(title, body, posted):
                wid = idx.get(norm(name)) or idx.get(norm(EDITION.sub(" ", name)))
                if not wid:
                    missed.append(name); continue
                if when <= today and (wid not in found or when > found[wid]):
                    found[wid] = when
        print(f"{len(posts)} posts read; {len(found)} games dated; {len(set(missed))} announced games aren't on the wall "
              f"(gone since, or named differently), e.g. {sorted(set(missed))[:8]}")
        for wid, when in found.items():
            if when >= data["d"].get(wid, ""):
                data["d"][wid] = when; data["src"][wid] = "blog"
    if not first_run:
        for wid in ids:
            if wid not in data["seen"] and wid not in data["d"]:
                data["d"][wid] = today; data["src"][wid] = "seen"
    data["seen"] = sorted(set(data["seen"]) | set(ids))
    data["asOf"] = today
    # keep only games still on the wall in the dates, but remember everything seen
    data["d"] = {k: v for k, v in sorted(data["d"].items()) if k in set(ids)}
    data["src"] = {k: v for k, v in sorted(data["src"].items()) if k in data["d"]}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(data['d'])} of {len(ids)} games on the wall have a date added.")


if __name__ == "__main__":
    main()
