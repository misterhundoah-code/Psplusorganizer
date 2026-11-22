#!/usr/bin/env python3
"""Builds the plain-HTML pages that search engines read.

Runs in GitHub Actions after the game data changes (see .github/workflows/pages.yml) and can be run
locally with `python3 tools/build_pages.py`. It needs nothing but the data files. It writes:

  lists/<slug>.html   one page per list in LISTS: the games as a real HTML table, sorted, with a
                      button that opens the same filters on the interactive wall (/?players=c&...)
  lists/index.html    all the lists
  index.html          the block between <!-- guides:start --> and <!-- guides:end --> (leaving soon,
                      the lists, and the FAQ) and the structured data between <!-- ld:start --> and
                      <!-- ld:end --> in <head>
  sitemap.xml         the home page, the lists and the legal pages

Every number on these pages is computed from the data each run, so nothing goes stale. Availability is
for Canada and the US (the site's base data); each page says so and the wall shows other countries.
"""
import html
import json
import re
import urllib.parse
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://wallofpsplus.com"


def load(name, default=None):
    try:
        return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


RAW = load("games.json")
GAMES = RAW if isinstance(RAW, list) else RAW["games"]
CAT = load("catalogue.json", {})
FACTS = load("facts.json", {})
FACTS = FACTS.get("games", FACTS) if isinstance(FACTS, dict) else {}
XPLAY = (load("crossplay.json", {}) or {}).get("games", {})
PREDICT = load("predict-page.json")
WRITEUPS = load("writeups.json", {}) or {}      # id -> a few sentences, written by hand, reused on every list
COPY = load("list-copy.json", {}) or {}         # slug -> title, intro, how many to feature, FAQ
WIDE = {p.stem for p in (ROOT / "art" / "wide").glob("*.webp")} if (ROOT / "art" / "wide").exists() else set()     # from tools/predict/model.py; the page is skipped until it exists
RATINGS = (load("ratings/en-ca.json", {}) or {}).get("games", {})
ART = set(load("art.json", []) or [])
LEAVING = CAT.get("leaving", {}) or {}
COMING = load("coming.json", {}) or {}
TODAY = date.today()

esc = html.escape


def modes(g):
    return (FACTS.get(g["id"]) or {}).get("modes", "")


def available(g):
    """In the Game Catalogue (Extra) or the Classics (Premium) for Canada and the US."""
    return bool(g.get("cat") or g.get("cl"))


def tier(g):
    return "Extra" if g.get("cat") else "Premium"


WD_ESRB = {"Everyone": 6, "Kids to Adults": 6, "Everyone 10+": 10, "Teen": 13, "Mature 17+": 17, "Adults Only 18+": 18}


def age(g):
    """Minimum age, the same way the wall works it out: Sony's rating for Canada, else Wikidata's ESRB."""
    r = RATINGS.get(g["id"])
    if isinstance(r, list) and len(r) > 1:
        return r[1]
    return WD_ESRB.get((FACTS.get(g["id"]) or {}).get("esrb"))


def by_score(gs):
    return sorted(gs, key=lambda g: (-(g.get("m") or 0), g["t"].lower()))


def nice_date(d):
    d = date.fromisoformat(d)
    return f"{d.day} {d.strftime('%B %Y')}"


def short_date(d):
    d = date.fromisoformat(d)
    return f"{d.day} {d.strftime('%b')}"


def hours(v):
    if v is None:
        return ""
    return f"{v:.0f} h" if v >= 10 else f"{v:.1f} h".replace(".0 h", " h")


# slug, title (also the <h1>), description, intro, filter function, wall link query, row limit
LISTS = [
    ("best-ps-plus-extra-games", "The best PS Plus Extra games, by Metascore",
     "Every game in the PS Plus Extra Game Catalogue ranked by Metascore, with completion times from HowLongToBeat.",
     "The highest-rated games in the PS Plus Game Catalogue right now, ranked by Metascore.",
     lambda g: g.get("cat"), "src=c&sort=m", 60),
    ("best-ps-plus-premium-classics", "The best PS Plus Premium Classics",
     "The highest-rated PS1, PS2 and PSP Classics and PS4 remasters in PS Plus Premium, ranked by Metascore.",
     "The top-rated PS1, PS2 and PSP Classics and PS4 remasters that come with PS Plus Premium.",
     lambda g: g.get("cl"), "src=cl&sort=m", 60),
    ("ps-plus-co-op-games", "PS Plus co-op games",
     "PS Plus Extra and Premium games you can play co-op, ranked by Metascore, with completion times.",
     "Games in PS Plus Extra and Premium that support co-op play, from Wikidata's game modes, ranked by Metascore.",
     lambda g: available(g) and "c" in modes(g), "src=plus&players=c&sort=m", 80),
    ("ps-plus-crossplay-games", "PS Plus games with Xbox and PC crossplay",
     "PS Plus games you can play with friends on Xbox or PC, from Wikipedia's crossplay list.",
     "PS Plus games that let you play with friends on Xbox or PC, according to Wikipedia's list of games with "
     "cross-platform play. The list is incomplete, so a game that isn't here may still have crossplay.",
     lambda g: g["id"] in XPLAY and available(g), "src=plus&players=xp&sort=m", None),
    ("short-ps-plus-games", "Short PS Plus games you can finish in under 10 hours",
     "The best PS Plus Extra and Premium games with a main story under 10 hours, from HowLongToBeat.",
     "Games in PS Plus Extra and Premium whose main story takes under 10 hours on HowLongToBeat, best-rated first.",
     lambda g: available(g) and g.get("h") is not None and g["h"] < 10, "src=plus&tlen=0-10&sort=m", 80),
    ("long-ps-plus-games", "Long PS Plus games: 40 hours and up",
     "The best big PS Plus games with a main story of 40 hours or more, from HowLongToBeat.",
     "PS Plus Extra and Premium games whose main story alone takes 40 hours or more, best-rated first.",
     lambda g: available(g) and (g.get("h") or 0) >= 40, "src=plus&tlen=40-9999&sort=m", 60),
    ("ps-plus-ps5-games", "The best PS5 games on PS Plus",
     "The highest-rated PS5 games in the PS Plus Extra Game Catalogue, ranked by Metascore.",
     "The best-rated PS5 games in the PS Plus Game Catalogue.",
     lambda g: g.get("cat") and "PS5" in (g.get("p") or []), "src=c&plat=PS5&sort=m", 60),
    ("ps-plus-rpgs", "The best RPGs on PS Plus", "The best role-playing games in PS Plus Extra and Premium, ranked by Metascore.",
     "Role-playing games in PS Plus Extra and Premium, best-rated first.",
     lambda g: available(g) and "RPG" in (g.get("g") or []), "src=plus&styles=RPG&sort=m", 60),
    ("ps-plus-horror-games", "The best horror games on PS Plus", "The best horror games in PS Plus Extra and Premium, ranked by Metascore.",
     "Horror games in PS Plus Extra and Premium, best-rated first.",
     lambda g: available(g) and "Horror" in (g.get("g") or []), "src=plus&styles=Horror&sort=m", 60),
    ("ps-plus-shooters", "The best shooters on PS Plus", "The best shooters in PS Plus Extra and Premium, ranked by Metascore.",
     "Shooters in PS Plus Extra and Premium, best-rated first.",
     lambda g: available(g) and "Shooter" in (g.get("g") or []), "src=plus&styles=Shooter&sort=m", 60),
    ("ps-plus-open-world-games", "The best open-world games on PS Plus",
     "The best open-world games in PS Plus Extra and Premium, ranked by Metascore.",
     "Open-world games in PS Plus Extra and Premium, best-rated first.",
     lambda g: available(g) and "Open World" in (g.get("g") or []), "src=plus&styles=Open%20World&sort=m", 60),
    ("ps-plus-games-for-kids", "PS Plus games for kids and families",
     "PS Plus Extra and Premium games rated E or E10+ by the ESRB, ranked by Metascore.",
     "PS Plus Extra and Premium games rated E (Everyone) or E10+ by the ESRB, best-rated first. Ratings are "
     "from the PlayStation Store for Canada and the US.",
     lambda g: available(g) and age(g) is not None and age(g) <= 10, "src=plus&age=12&sort=m", 80),
]


CSS_LINK = '<link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/lists/lists.css">'
ICONS = '<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'
ANALYTICS = ""
try:  # reuse the site's own analytics snippet, so list pages are counted the same way
    m = re.search(r"<script[^>]+cloudflareinsights\.com/beacon\.min\.js[^>]*></script>", (ROOT / "index.html").read_text())
    ANALYTICS = m.group(0) if m else ""
except FileNotFoundError:
    pass


def page(slug, title, desc, body, canonical):
    return f"""<!DOCTYPE html>
<!-- Generated by tools/build_pages.py from the data files. Don't edit by hand: changes are overwritten. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} | PS Plus Rental Wall</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PS Plus Rental Wall">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canonical}"><meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#FFC925">
{ICONS}{CSS_LINK}
</head><body>
<header class="sign"><a class="home" href="/">PS Plus<br>Rental Wall</a><nav><a href="/lists/">All lists</a><a href="/">Open the wall</a></nav></header>
<main>
{body}
</main>
<footer>
<p>PS Plus Rental Wall is a free, independent fan-made tool for sorting the PS Plus catalogue. It isn't affiliated with Sony;
PlayStation and PS Plus are trademarks of Sony Interactive Entertainment. Metascores are from Metacritic, completion times from
HowLongToBeat, age ratings and availability from the PlayStation Store, and game modes and crossplay from Wikidata and Wikipedia.
Cover art belongs to Sony and the games' publishers. The short synopses were drafted with Claude and haven't all been checked by hand.</p>
<p><a href="/">Open the wall</a> · <a href="/lists/">All lists</a> · <a href="/privacy.html">Privacy</a> ·
<a href="https://github.com/misterhundoah-code/Psplusorganizer/issues/new/choose" rel="noopener">Report a problem</a></p>
</footer>
{ANALYTICS}
</body></html>
"""


def table(gs, numbered=True, show_leave=True):
    rows = []
    for i, g in enumerate(gs, 1):
        cover = (f'<img src="/art/{g["id"]}.webp" alt="" width="60" height="75" loading="lazy" decoding="async">'
                 if g["id"] in ART else '<span class="nocover" aria-hidden="true"></span>')
        plat = " / ".join(g.get("p") or []) or ("Classic" if g.get("cl") else "")
        tags = ", ".join((g.get("g") or [])[:3])
        bits = [b for b in (plat, tier(g), str(g.get("y") or ""), tags) if b]
        lv = LEAVING.get(g["id"])
        leave = f'<span class="leave">Leaving {esc(short_date(lv))}</span>' if lv and show_leave else ""
        synopsis = f'<span class="d">{esc(g["d"])}</span>' if g.get("d") else ""
        rows.append(
            f'<tr><td class="n">{i if numbered else ""}</td><td class="cv">{cover}</td>'
            f'<td class="t"><b>{esc(g["t"])}</b>{leave}<span class="meta">{esc(" · ".join(bits))}</span>{synopsis}</td>'
            f'<td class="m">{g.get("m") or "–"}</td><td class="h">{hours(g.get("h")) or "–"}</td></tr>')
    return ('<table><thead><tr><th class="n"><span class="vh">Rank</span></th><th class="cv"><span class="vh">Cover</span></th>'
            '<th>Game</th><th class="m">Metascore</th><th class="h">Main story</th></tr></thead><tbody>'
            + "".join(rows) + "</tbody></table>")


EDITION = re.compile(r"\b(ultimate|deluxe|digital deluxe|complete|definitive|gold|game of the year|goty|standard|remastered|"
                     r"director'?s cut|ps4 (and|&) ps5|edition)\b")
def edition_key(t):
    """One key per game across its editions: Persona 5 Royal and its Ultimate Edition, The Last of Us Part II and its remaster."""
    t = re.sub(r"[’'™®©]", "", t.lower())
    t = re.sub(r"\(.*?\)", " ", t)
    t = EDITION.sub(" ", re.split(r"\s[–—-]\s", t)[0])
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def one_per_game(gs):
    """Keeps the best entry for each game: the one with a write-up, else the newest."""
    best = {}
    for g in gs:
        k = edition_key(g["t"])
        cur = best.get(k)
        if cur is None or ((g["id"] in WRITEUPS) > (cur["id"] in WRITEUPS)) or (
                (g["id"] in WRITEUPS) == (cur["id"] in WRITEUPS) and (g.get("y") or 0) > (cur.get("y") or 0)):
            best[k] = g
    keep = {id(g) for g in best.values()}
    return [g for g in gs if id(g) in keep]


def mc_url(g):
    t = re.sub(r"\s*\((?:PS\d|PSP|Classic|\d{4})\)\s*$", "", re.sub(r"[®™]", "", g["t"]))
    return "https://www.metacritic.com/search/" + urllib.parse.quote(t) + "/?category=13"


def yt_url(g):
    plat = "PS5" if "PS5" in (g.get("p") or []) else ((g.get("p") or ["PlayStation"])[0])
    return "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(f"{g['t']} {plat} trailer")


def picks(gs, n):
    """The featured cards at the top of a list: art, write-up and links for the first n games."""
    out = []
    for i, g in enumerate(gs[:n], 1):
        if g["id"] in WIDE:
            art = f'<img src="/art/wide/{g["id"]}.webp" alt="" width="960" height="540" loading="{"eager" if i < 3 else "lazy"}" decoding="async">'
            cls = "art wide"
        elif g["id"] in ART:
            art = f'<img src="/art/{g["id"]}.webp" alt="" width="256" height="256" loading="lazy" decoding="async"><img class="bg" src="/art/{g["id"]}.webp" alt="" aria-hidden="true">'
            cls = "art cover"
        else:
            art, cls = "", "art none"
        plat = " / ".join(g.get("p") or [])
        bits = [b for b in (plat, f"Metascore {g['m']}" if g.get("m") else "", f"about {hours(g.get('h'))} main story" if g.get("h") else "") if b]
        lv = LEAVING.get(g["id"])
        leave = f'<span class="leave">Leaving {esc(short_date(lv))}</span>' if lv else ""
        text = WRITEUPS.get(g["id"]) or g.get("d") or ""
        links = [f'<a href="{esc(g["u"])}" rel="noopener">PlayStation Store</a>' if g.get("u") else "",
                 f'<a href="{esc(mc_url(g))}" rel="noopener">Metacritic</a>',
                 f'<a href="{esc(yt_url(g))}" rel="noopener">Trailers on YouTube</a>',
                 f'<a href="/?q={urllib.parse.quote(g["t"])}">Open on the wall</a>']
        out.append(f'<article class="pick"><div class="{cls}">{art}<span class="rank">{i}</span></div><div class="pbody">'
                   f'<h2>{esc(g["t"])}</h2>{leave}<p class="meta">{esc(" · ".join(bits))}</p><p>{esc(text)}</p>'
                   f'<p class="plinks">{"".join(l for l in links if l)}</p></div></article>')
    return '<div class="picks">' + "".join(out) + "</div>"


def fill(text, vals):
    return re.sub(r"\{(\w+)\}", lambda m: str(vals.get(m.group(1), m.group(0))), text)


def faq_html(faq, vals):
    qa = [(fill(q, vals), fill(a, vals)) for q, a in faq]
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", a)}} for q, a in qa]}
    return ('<h2>Questions</h2><div class="faq">' + "".join(f"<h3>{esc(q)}</h3><p>{a}</p>" for q, a in qa) + "</div>"
            + f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>')


def list_nav(current=None):
    items = "".join(f'<li><a href="/lists/{s}"{" aria-current=page" if s == current else ""}>{esc(t)}</a></li>'
                    for s, t, *_ in LISTS)
    lv = f'<li><a href="/lists/leaving-ps-plus"{" aria-current=page" if current == "leaving-ps-plus" else ""}>Games leaving PS Plus soon</a></li>'
    pr = (f'<li><a href="/lists/coming-to-ps-plus"{" aria-current=page" if current == "coming-to-ps-plus" else ""}>Likely to join PS Plus next: predictions</a></li>'
          if PREDICT else "")
    nw = f'<li><a href="/lists/new-on-ps-plus"{" aria-current=page" if current == "new-on-ps-plus" else ""}>New on PS Plus: coming soon</a></li>'
    return f'<ul class="lists">{nw}{lv}{pr}{items}</ul>'


def predict_page():
    """Which games are likely to join PS Plus next (data/predict-page.json, from tools/predict/model.py). The top 25
    Game Catalog picks are in the HTML; lists/predict.js loads the rest, the tabs, search and the month-by-month charts."""
    d = PREDICT["extra"]
    start = date.fromisoformat(d["start"] + "-01")
    mon = start.strftime("%B %Y")
    pct = lambda p: f"{round(p * 100)}%" if p >= 0.1 else (f"{p * 100:.1f}%" if p >= 0.001 else "<0.1%")
    items = []
    for n, (t, p, y, pub, why, _) in enumerate(d["rows"][:25], 1):
        chips = "".join(f'<li class="{"up" if sg > 0 else "down"}">{esc(w)}</li>' for sg, w in why)
        items.append(f'<li class="g" data-n="{n}"><span class="n">{n}</span><div class="t"><b>{esc(t)}</b><span class="meta">{esc(" · ".join(b for b in (y, pub) if b))}</span></div>'
                     f'<div class="pc"><b>{pct(p)}</b><span>1 in {round(1 / p) if p else "–"}</span></div><ul class="why">{chips}</ul></li>')
    top3 = ", ".join(r[0] for r in d["rows"][:3])
    bt = d["backtest"]; tot = sum(r["added"] for r in bt); hit = sum(r["top50"] for r in bt)
    rows = "".join(f'<tr><td>{date.fromisoformat(r["month"] + "-01").strftime("%B %Y")}</td><td class="num">{r["added"]}</td>'
                   f'<td class="num">{r["top50"]}</td><td>{esc(", ".join(r["found"])) or "None"}</td></tr>' for r in reversed(bt))
    title = f"Which games are coming to PS Plus? Predictions from {mon}"
    desc = (f"Every PS4 and PS5 game ranked by its chance of joining the PS Plus Game Catalog or the monthly games in the next three months. "
            f"Top picks right now: {top3}.")
    body = f"""<h1>Which games are coming to PS Plus next?</h1>
<p class="note"><b>A note on accuracy:</b> these are educated guesses, not inside information. The model catches a fair share of each
month's additions but misses plenty, and the game details it learns from, like publishers and release dates, come from Wikipedia and
Wikidata and are sometimes wrong. We're always refining it and checking the data, so if you spot something off,
<a href="https://github.com/misterhundoah-code/Psplusorganizer/issues/new/choose" rel="noopener">let us know</a>.</p>
<p class="intro">Every PS4 and PS5 game that isn't on PS Plus yet, ranked by how likely it is to join in the next three months. The odds come from a
model trained on every lineup Sony has announced since PS Plus Extra launched in 2022, so treat this as a watchlist rather than a promise.
Open any game to see how its chances change month by month.</p>
<p class="small">Updated {esc(date.fromisoformat(PREDICT["asof"]).strftime("%-d %B %Y"))}. <span id="pwhen">Chances are for the three months from {esc(mon)}.</span></p>
<div class="ptabs" id="ptabs" role="tablist" hidden><button type="button" role="tab" data-k="extra" aria-selected="true">Game Catalog (Extra)</button><button type="button" role="tab" data-k="essential" aria-selected="false">Monthly games (Essential)</button></div>
<form class="pfind" id="pfind" hidden><label for="pq" class="vh">Look up a game</label><input id="pq" type="search" placeholder="Look up a game, like Elden Ring or Ghost of Yōtei" autocomplete="off"></form>
<ol class="plist" id="plist">{"".join(items)}</ol>
<button type="button" class="pmore" id="pmore" hidden>Show the next 50</button>
<h2>How it works</h2>
<p class="small">For every month since PS Plus Extra launched (and since 2019 for the monthly games), each PS4 and PS5 game that could have been
added is one example, and the games Sony actually added are the hits. The model learns how much each signal mattered. The bars show how
strongly each one pushes a game up or down.</p>
<div class="psig" id="psig"></div>
<details class="small"><summary>Rules and limits</summary><ul>
<li>The year's biggest launches are held back: nothing anywhere near as big as GTA VI has ever joined in its first year, so those wait until the year is up.</li>
<li>Free-to-play games are left out, since they don't need PS Plus.</li>
<li>Popularity is how often the game's Wikipedia article was read in the last 60 days: a good guide to interest today, but not to how big a game was at launch.</li>
<li>Deals between Sony and publishers are invisible to the model, so surprise launch-day indies will always catch it out.</li>
<li>Games without a Wikipedia or Wikidata entry are missing, or the model knows less about them.</li></ul>
<p>Sources: Wikidata and Wikipedia (CC BY-SA) for games, publishers, release dates and page views; the PlayStation Blog for past lineups.</p></details>
<section id="plive" hidden><h2>Our record so far</h2><p class="small">Each month we save our top 50 before Sony announces the lineup, then count how many we had.</p>
<table><thead><tr><th>Month</th><th class="num">Added</th><th class="num">In our top 50</th><th>Ones we had</th></tr></thead><tbody id="plivebody"></tbody></table></section>
<h2>How it did on months it hadn't seen</h2>
<p class="small" id="pbtnote">We trained the model without the last 12 months, then had it rank each of them. Of the {tot} games Sony added
that we could match, {hit} ({round(hit / max(tot, 1) * 100)}%) were in that month's top 50. Picking 50 at random would catch less than 1%.</p>
<table><thead><tr><th>Month</th><th class="num">Added</th><th class="num">In our top 50</th><th>Ones we had in the top 50</th></tr></thead><tbody id="pbt">{rows}</tbody></table>
<h2>More PS Plus lists</h2>{list_nav("coming-to-ps-plus")}
<script src="/lists/predict.js" defer></script>"""
    return page("coming-to-ps-plus", title, desc, body, f"{SITE}/lists/coming-to-ps-plus")


def leaving_games():
    out = [g for g in GAMES if g["id"] in LEAVING]
    return sorted(out, key=lambda g: (LEAVING[g["id"]], g["t"].lower()))


def build():
    (ROOT / "lists").mkdir(exist_ok=True)
    asof = CAT.get("asOf") or TODAY.isoformat()
    written = {}
    for slug, title, desc, intro, keep, query, limit in LISTS:
        gs = by_score([g for g in GAMES if keep(g)])
        cp = COPY.get(slug)
        if cp:
            gs = one_per_game(gs)
            total = len(gs)
            vals = {"month": TODAY.strftime("%B %Y"), "count": total, "count_floor": total // 50 * 50,
                    "top": gs[0]["t"] if gs else "", "top_score": gs[0].get("m") if gs else ""}
            n = cp.get("featured", 10)
            shown = gs[:limit] if limit else gs
            q = esc(query)
            body = (f'<h1>{esc(fill(cp.get("h1", title), vals))}</h1><p class="intro">{esc(fill(cp["intro"], vals))}</p>'
                    + picks(gs, n)
                    + f'<h2>The full list</h2><p class="intro">The top {len(shown)} of {total}, as of {esc(asof)}. Availability is for Canada and the US;'
                    f' <a href="/?{q}">open the wall</a> to pick your own country and hide what you\'ve played.</p>'
                    f'<p><a class="btn" href="/?{q}">Open these on the wall</a></p>'
                    + table(shown) + (faq_html(cp["faq"], vals) if cp.get("faq") else "") + f'<h2>More PS Plus lists</h2>{list_nav(slug)}')
            written[slug] = page(slug, fill(cp.get("title", title), vals), fill(cp.get("desc", desc), vals), body, f"{SITE}/lists/{slug}")
            continue
        total = len(gs)
        shown = gs[:limit] if limit else gs
        more = (f"Showing the top {len(shown)} of {total}. The wall has all {total}, and lets you hide what you've played."
                if limit and total > limit else f"All {total} games, as of {esc(asof)}.")
        q = esc(query)
        body = (f'<h1>{esc(title)}</h1><p class="intro">{esc(intro)} {more} Availability is for Canada and the US;'
                f' <a href="/?{q}">open the wall</a> to pick your own country.</p>'
                f'<p><a class="btn" href="/?{q}">Open these on the wall</a></p>'
                + table(shown) + f'<h2>More PS Plus lists</h2>{list_nav(slug)}')
        written[slug] = page(slug, title, desc, body, f"{SITE}/lists/{slug}")

    lv = leaving_games()
    when = sorted(set(LEAVING.values()))
    when_txt = " and ".join(nice_date(d) for d in when) if when else ""
    title = f"Games leaving PS Plus{(' on ' + when_txt) if when_txt else ''}"
    desc = (f"The {len(lv)} games Sony has confirmed are leaving the PS Plus Game Catalogue{(' on ' + when_txt) if when_txt else ''}, "
            "with Metascores and completion times.") if lv else "Games confirmed to be leaving the PS Plus Game Catalogue."
    body = (f"<h1>{esc(title)}</h1>"
            + (f'<p class="intro">{esc(CAT.get("leaveNote") or "")} Main story times are from HowLongToBeat, so you can see what you '
               f'still have time to finish.</p><p><a class="btn" href="/?onlyleave=1&amp;sort=time&amp;desc=0">Open these on the wall</a></p>'
               + table(lv, numbered=False, show_leave=False) if lv else '<p class="intro">Sony hasn\'t announced the next games to leave yet. '
               'This page updates when it does.</p>')
            + f"<h2>More PS Plus lists</h2>{list_nav('leaving-ps-plus')}")
    written["leaving-ps-plus"] = page("leaving-ps-plus", title, desc, body, f"{SITE}/lists/leaving-ps-plus")

    cg = [x for x in COMING.get("games", []) if (x.get("date") or "") >= TODAY.isoformat()]
    byid = {g["id"]: g for g in GAMES}
    months = sorted({x["date"][:7] for x in cg})
    mname = " and ".join(date.fromisoformat(m + "-01").strftime("%B") for m in months)
    title = f"New on PS Plus{(' in ' + mname) if mname else ''}: games coming soon"
    desc = (f"The {len(cg)} games Sony has announced for PS Plus Essential, Extra and Premium that haven't arrived yet, with "
            "arrival dates.") if cg else "Games Sony has announced for PS Plus that haven't arrived yet."
    rows = []
    for x in cg:
        g = byid.get(x.get("id") or "")
        cover = (f'<img src="/art/{g["id"]}.webp" alt="" width="60" height="75" loading="lazy">' if g and g["id"] in ART
                 else '<span class="nocover" aria-hidden="true"></span>')
        plats = ", ".join(x.get("p") or [])
        score = (g or {}).get("m")
        rows.append(f'<tr><td class="n"></td><td class="cv">{cover}</td><td class="t"><b>{esc(x["t"])}</b>'
                    f'<span class="leave" style="background:var(--blue)">Arrives {esc(short_date(x["date"]))}</span>'
                    f'<span class="meta">{esc(" · ".join(b for b in (x.get("tier"), plats) if b))}</span></td>'
                    f'<td class="m">{score or "–"}</td><td class="h">{hours((g or {}).get("h")) or "–"}</td></tr>')
    srcs = "".join(f'<li><a href="{esc(p["url"])}" rel="noopener">{esc(p["title"])}</a></li>' for p in COMING.get("posts", [])
                   if str(p.get("url", "")).startswith("https://blog.playstation.com/"))
    body = (f"<h1>{esc(title)}</h1>"
            + (f'<p class="intro">Games Sony has announced for PS Plus that arrive soon, in order of arrival. '
               f'Dates are from Sony\'s announcements on the PlayStation Blog; a few vary by country.</p>'
               '<table><thead><tr><th class="n"><span class="vh">#</span></th><th class="cv"><span class="vh">Cover</span></th>'
               '<th>Game</th><th class="m">Metascore</th><th class="h">Main story</th></tr></thead><tbody>' + "".join(rows)
               + f"</tbody></table><h2>Sony's announcements</h2><ul>{srcs}</ul>" if cg else
               '<p class="intro">Nothing announced right now. Sony announces the monthly games near the end of each month and '
               'the Extra and Premium additions about a week before they arrive; this page updates the same day.</p>')
            + f"<h2>More PS Plus lists</h2>{list_nav('new-on-ps-plus')}")
    written["new-on-ps-plus"] = page("new-on-ps-plus", title, desc, body, f"{SITE}/lists/new-on-ps-plus")

    if PREDICT:
        written["coming-to-ps-plus"] = predict_page()

    body = ('<h1>PS Plus lists</h1><p class="intro">Ready-made lists from the PS Plus Rental Wall, updated whenever the catalogue '
            'changes. Each one opens on the interactive wall, where you can filter further and keep track of what you\'ve played.</p>'
            + list_nav())
    written["index"] = page("index", "PS Plus lists", "Ready-made lists of PS Plus Extra and Premium games: best-rated, co-op, crossplay, short, for kids, leaving soon and more.",
                            body, f"{SITE}/lists/")

    for slug, text in written.items():
        p = ROOT / "lists" / f"{slug}.html"
        if not p.exists() or p.read_text(encoding="utf-8") != text:
            p.write_text(text, encoding="utf-8")
    for old in (ROOT / "lists").glob("*.html"):   # a list removed from LISTS shouldn't linger
        if old.stem not in written:
            old.unlink()

    update_index(lv, when_txt)
    urls = [f"{SITE}/", f"{SITE}/lists/", f"{SITE}/lists/new-on-ps-plus", f"{SITE}/lists/leaving-ps-plus"] + ([f"{SITE}/lists/coming-to-ps-plus"] if PREDICT else []) + [f"{SITE}/lists/{s}" for s, *_ in LISTS]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += [f"  <url><loc>{u}</loc><changefreq>weekly</changefreq></url>" for u in urls]
    sm += [f"  <url><loc>{SITE}/{p}</loc><changefreq>yearly</changefreq></url>" for p in ("privacy.html", "terms.html")]
    (ROOT / "sitemap.xml").write_text("\n".join(sm + ["</urlset>", ""]), encoding="utf-8")
    print(f"Wrote {len(written)} list pages; {len(lv)} games leaving.")


FAQ = [
    ("How do I sort PS Plus Extra games by Metacritic score or length?",
     "Choose Metacritic score or Completion time under Sort, and narrow it down with the Length, Platform, Players and style "
     "filters. Your choices are remembered next time."),
    ("Which games are leaving PS Plus this month?", None),   # filled in from the data
    ("Do I need to sign in with my PSN account?",
     "No. The site never asks for your PlayStation account. Your marks and ratings are saved in your browser. A free, optional "
     "account (a made-up username and a password, no email) syncs them between devices, encrypted so only your password unlocks them."),
    ("Does it show the catalogue for my country?",
     "Yes. Pick your country at the top of the filters and the wall shows that country's Game Catalogue, Classics and age ratings, "
     "from Sony's own lists."),
    ("Is this site made by Sony or does it use AI?",
     "It's an independent fan-made tool, not affiliated with Sony. It was built with the help of Claude, Anthropic's AI model; "
     "no AI runs while you use it, and your data is never sent to an AI service. The AI disclosure link at the top has the details."),
]


def update_index(lv, when_txt):
    p = ROOT / "index.html"
    s = p.read_text(encoding="utf-8")
    leave_answer = ((f"Sony has confirmed {len(lv)} games leaving the Game Catalogue on {when_txt}: "
                     + ", ".join(g["t"] for g in lv) + ".") if lv else
                    "Sony hasn't announced the next games to leave yet.")
    faq = [(q, a or leave_answer) for q, a in FAQ]
    leave_html = ("".join(f'<li><a href="/lists/leaving-ps-plus">{esc(g["t"])}</a> <span>{esc(nice_date(LEAVING[g["id"]]))}'
                          f'{(" · " + hours(g.get("h"))) if g.get("h") else ""}</span></li>' for g in lv)
                  or "<li>Nothing confirmed yet.</li>")
    block = f"""<!-- guides:start (generated by tools/build_pages.py; edit the script, not this block) -->
    <section class="guides" aria-labelledby="guidesttl">
      <h2 id="guidesttl">Sort and filter the whole PS Plus catalogue</h2>
      <p>PS Plus Rental Wall puts every game in PS Plus Extra and Premium on one wall: the Game Catalogue, the Classics, PS3 streaming and every monthly game since 2013. Sort by Metascore or completion time, filter by length, genre, co-op, crossplay and age rating, and mark what you've played so the wall learns what to put out front. Free, no PSN login, nothing to install.</p>
      <div class="gcols">
        <div><h3>Leaving PS Plus soon</h3><ul class="gleave">{leave_html}</ul></div>
        <div><h3>Ready-made lists</h3>{list_nav()}</div>
      </div>
      <h3>Questions</h3>
      {"".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in faq)}
    </section>
    <!-- guides:end -->"""
    s = re.sub(r"<!-- guides:start.*?<!-- guides:end -->", lambda m: block, s, count=1, flags=re.S)
    ld = [{"@context": "https://schema.org", "@type": "WebApplication", "name": "PS Plus Rental Wall", "url": SITE + "/",
           "applicationCategory": "GameApplication", "operatingSystem": "Any (web browser)",
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "CAD"},
           "description": "Sort and filter every PS Plus Extra and Premium game by Metascore, completion time, genre, co-op, "
                          "crossplay and age rating, and track what you've played."},
          {"@context": "https://schema.org", "@type": "FAQPage",
           "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}]
    ld_html = ("<!-- ld:start (generated by tools/build_pages.py) -->\n<script type=\"application/ld+json\">"
               + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>\n<!-- ld:end -->")
    s = re.sub(r"<!-- ld:start.*?<!-- ld:end -->", lambda m: ld_html, s, count=1, flags=re.S)
    p.write_text(s, encoding="utf-8")


if __name__ == "__main__":
    build()
