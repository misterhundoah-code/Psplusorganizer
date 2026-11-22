#!/usr/bin/env python3
"""Games coming to PS Plus soon, from Sony's announcements on the PlayStation Blog.

Runs daily in GitHub Actions (see .github/workflows/coming.yml). Sony posts two announcements a month,
in the same format each time:

  "PlayStation Plus Monthly Games for <Month>: ..."  (Essential; usually the last Wednesday of the month)
  "PlayStation Plus Game Catalog for <Month>: ..."   (Extra and Premium; about a week before they arrive)

Each game in a post is a bold "Name | PS5, PS4" line under a heading that says which tier it's for, and
the opening paragraph says when the lineup arrives ("available to play from November 17"). A line like
"X will be available November 24" overrides the date for that game.

The script reads the blog's RSS feeds, parses every announcement it finds, and writes data/coming.json:

  {"asOf": "2026-11-22",
   "posts": [{"url", "title", "kind": "monthly"|"catalog", "month": "2026-12", "date": "2026-12-02"}],
   "games": [{"t": "Death Stranding 2: On the Beach", "p": ["PS5"], "tier": "Extra"|"Premium"|"Essential",
              "date": "2026-11-17", "id": "death-stranding-2-on-the-beach" or null, "post": <index>,
              "img": Sony's promo image on the blog, or null}]}

Only games arriving today or later are kept, so the file empties itself once a lineup has arrived (by
then Sony's own lists, read by fetch_regions.py, carry them). data/coming-manual.json, if present, is a
list in the same shape as "games" that's added to the result: a way to fill in by hand if Sony changes the
post format. If nothing parses, the existing file is left alone.
"""
import html
import json
import re
import sys
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_art import S, load_games, norm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FEEDS = [
    "https://blog.playstation.com/feed/",
    "https://blog.playstation.com/tag/playstation-plus/feed/",
    "https://blog.playstation.com/?s=PlayStation+Plus&orderby=date&order=DESC&feed=rss2",
]
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                      "September", "October", "November", "December"], 1)}
TITLE_RE = re.compile(r"^PlayStation Plus (Monthly Games|Game Catalog)(?: and Game Catalog)?(?: lineup)? for (\w+)", re.I)
# "<strong>Name | PS5, PS4</strong>", or with the platforms after the bold name ("<strong>Name</strong> | PS5").
GAME_RE = re.compile(r"<strong>\s*([^<|]{2,120}?)\s*(?:</strong>\s*)?\|\s*((?:PS5|PS4|PS VR2|PS VR|PC)(?:\s*(?:,|&amp;|&|and)\s*(?:PS5|PS4|PS VR2|PS VR|PC))*)", re.I)
HEAD_RE = re.compile(r"<h[23](?![^>]*screen-reader-text)[^>]*>(.*?)</h[23]>", re.S)   # skips the image pop-ups' hidden headings
DATE_RE = re.compile(r"\b(?:from|on|starting)\s+(?:\w+day,?\s+)?(" + "|".join(MONTHS) + r")\s+(\d{1,2})")
LATE_RE = re.compile(r"(?:will be|is) available (?:to play )?(?:from |on )?(" + "|".join(MONTHS) + r")\s+(\d{1,2})")


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).replace("\xa0", " ").strip()


def feed_items():
    seen = {}
    for url in FEEDS:
        try:
            r = S.get(url, timeout=60)
            r.raise_for_status()
        except Exception as e:
            print(f"Couldn't read {url}: {e}")
            continue
        for it in re.findall(r"<item>(.*?)</item>", r.text, re.S):
            link = re.search(r"<link>(.*?)</link>", it)
            title = re.search(r"<title>(.*?)</title>", it, re.S)
            body = re.search(r"<content:encoded><!\[CDATA\[(.*?)\]\]></content:encoded>", it, re.S)
            pub = re.search(r"<pubDate>(.*?)</pubDate>", it)
            if link and title and body and pub:
                seen[link.group(1).strip()] = (text(title.group(1)), body.group(1), parsedate_to_datetime(pub.group(1)).date())
    return seen


def year_for(month, posted):
    """The month named in the title is this month or next; December posts can announce January."""
    return posted.year + 1 if month < posted.month - 6 else posted.year


def parse_post(url, title, body, posted):
    m = TITLE_RE.match(title)
    if not m or m.group(2).capitalize() not in MONTHS or "Southeast Asia" in title:
        return None
    kind = "monthly" if m.group(1).lower().startswith("monthly") else "catalog"
    month = MONTHS[m.group(2).capitalize()]
    year = year_for(month, posted)
    intro = text(body[:6000])
    d = DATE_RE.search(intro)
    start = date(year_for(MONTHS[d.group(1)], posted), MONTHS[d.group(1)], int(d.group(2))) if d else None
    games = []
    heads = [(h.start(), text(h.group(1))) for h in HEAD_RE.finditer(body)]
    found = list(GAME_RE.finditer(body))
    for n, g in enumerate(found):
        name = text(g.group(1)).strip(" –-:")
        if not name or len(name) > 100:
            continue
        head = next((h for pos, h in reversed(heads) if pos < g.start()), "")
        if kind == "monthly":
            tier = "Essential"
        elif "premium" in head.lower() and "extra" not in head.lower():
            tier = "Premium"
        else:
            tier = "Extra"
        plats = sorted({p.upper().replace("PS VR2", "PS VR2") for p in re.split(r"\s*(?:,|&amp;|&|and)\s*", g.group(2)) if p})
        # A later date for this game is noted in its own write-up, before the next game starts.
        until = found[n + 1].start() if n + 1 < len(found) else g.end() + 4000
        late = LATE_RE.search(text(body[g.end():until]))
        when = start
        if late and late.group(1) in MONTHS:
            nd = date(year_for(MONTHS[late.group(1)], posted), MONTHS[late.group(1)], int(late.group(2)))
            if start is None or nd > start:
                when = nd
        # Sony's promo image for the game sits just before its name. Kept for games the site doesn't know yet.
        prev_end = found[n - 1].end() if n else 0
        imgs = re.findall(r'<img[^>]+src="(https://blog\.playstation\.com/tachyon/[^"?]+)', body[prev_end:g.start()])
        games.append({"t": name, "p": plats, "tier": tier, "date": when.isoformat() if when else None,
                      "img": (imgs[-1] + "?fit=480%2C270") if imgs else None})
    if not games:
        return None
    return {"url": url, "title": title, "kind": kind, "month": f"{year}-{month:02d}",
            "date": start.isoformat() if start else None, "games": games}


def main():
    items = feed_items()
    posts = [p for p in (parse_post(u, t, b, d) for u, (t, b, d) in items.items()) if p]
    print(f"{len(items)} feed items; {len(posts)} PS Plus announcements parsed.")
    for p in sorted(posts, key=lambda p: p["month"])[-4:]:
        print(f"  {p['month']} {p['kind']}: {len(p['games'])} games from {p['date']}")

    by_title = {}
    for g in load_games():
        by_title.setdefault(norm(g["t"]), g["id"])
    today = date.today().isoformat()
    out_posts, games, seen = [], [], set()
    for p in sorted(posts, key=lambda p: (p["month"], p["kind"])):
        upcoming = [g for g in p["games"] if (g["date"] or p["date"] or "") >= today]
        if not upcoming:
            continue
        idx = len(out_posts)
        out_posts.append({k: p[k] for k in ("url", "title", "kind", "month", "date")})
        for g in upcoming:
            key = (norm(g["t"]), g["tier"])
            if key in seen:
                continue
            seen.add(key)
            games.append({**g, "id": by_title.get(norm(g["t"])), "post": idx})
    manual = ROOT / "data/coming-manual.json"
    if manual.exists():
        for g in json.loads(manual.read_text(encoding="utf-8")):
            if (g.get("date") or "") >= today and (norm(g["t"]), g.get("tier")) not in seen:
                games.append({"id": by_title.get(norm(g["t"])), "post": None, **g})
    if not posts and (ROOT / "data/coming.json").exists():
        sys.exit("No announcements parsed (has the blog's format changed?); leaving data/coming.json alone.")
    games.sort(key=lambda g: (g.get("date") or "9999", {"Essential": 0, "Extra": 1, "Premium": 2}.get(g["tier"], 3), g["t"].lower()))
    (ROOT / "data/coming.json").write_text(json.dumps(
        {"asOf": today, "posts": out_posts, "games": games}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(games)} games coming: " + ", ".join(f"{g['t']} ({g['tier']}, {g['date']})" for g in games[:12]))


if __name__ == "__main__":
    main()
