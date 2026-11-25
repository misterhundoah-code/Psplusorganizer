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
import os
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
        data = api(action="query", titles="|".join(chunk), redirects=1, prop="description|pageimages|pageprops",
                   piprop="thumbnail|original", pithumbsize=500, pilicense="any", ppprop="wikibase_item")
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
                # PS3 streaming games and classics are often later re-releases of older games, so their year
                # in our data can be well after the original's.
                remake = re.search(r"remaster|remake|collection|edition|redux|\(", g["t"], re.I) or g.get("s3") or g.get("cl")
                if g.get("y") and years and not c.endswith("video game)") and not remake \
                        and min(abs(int(g["y"]) - yy) for yy in years) > 3:
                    continue
                found[g["id"]] = p
                break
    # Second try for games still unmatched: Wikipedia's search, taking a result only when its title is the
    # game's own (ignoring case, punctuation and a "(video game)" suffix) and it is about one game.
    def key(t):
        t = re.sub(r"\s*\((?:\d{4} )?video game\)$", "", t)
        return re.sub(r"[^a-z0-9]+", " ", t.lower().replace("&", "and")).strip()
    for g in games:
        if g["id"] in found:
            continue
        names = {key(g["t"].replace("’", "'")), key(base_title(g["t"]))}
        try:
            hits = api(action="query", list="search", srsearch=f'{base_title(g["t"])} video game', srlimit=5,
                       srnamespace=0).get("query", {}).get("search", [])
        except Exception:
            continue
        cands = [h["title"] for h in hits if key(h["title"]) in names]
        if cands:
            data = api(action="query", titles="|".join(cands), redirects=1, prop="description|pageimages|pageprops",
                       piprop="thumbnail|original", pithumbsize=500, pilicense="any", ppprop="wikibase_item")
            for pg in data.get("query", {}).get("pages", []):
                if is_game(pg):
                    found[g["id"]] = pg
                    break
        time.sleep(0.2)
    return found


# ---- descriptions ---------------------------------------------------------
# Built from what the game is and how it plays, not its release history: the genre from the
# article's first sentence (cut before "developed by ..."), the start of its Gameplay section,
# and the set-up from its Premise, Setting or Plot section (kept short to avoid spoilers).
# Sentences about release dates, platforms, ports, sales or reviews are dropped.
MONTHS = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
NOISE_WORDS = re.compile(
    r"\b(?:released|re-released|release date|ported|port of|launched|launch title|announced|sold|copies|sales|"
    r"reviews?|reviewers|critics?|critical reception|acclaim|nominated|awards?|Metacritic|aggregator|developed by|"
    r"published by|publisher|downloadable content|season pass|early access|Kickstarter|crowdfund|remastered|"
    r"remake|compilation|bundled)\b|" + MONTHS + r"\s+(?:\d{1,2},\s+)?\d{4}",
    re.I,
)
NOISE_PLATFORMS = re.compile(r"\b(?:Microsoft Windows|Windows|Xbox|Nintendo|Wii|Steam|Epic Games Store|macOS|iOS|Android|Stadia|DLC|PlayStation\s?(?:\d|Vita|Portable|Network|Store|VR))\b")


class _Noise:
    @staticmethod
    def search(x):
        return NOISE_WORDS.search(x) or NOISE_PLATFORMS.search(x)


NOISE = _Noise()
GAMEPLAY = ("gameplay", "game play", "gameplay and premise", "gameplay and plot", "overview", "game mechanics", "mechanics", "game modes")
STORY = ("premise", "setting", "synopsis", "plot", "story", "setting and characters", "plot and setting", "characters and setting", "narrative")
JUNK_PAREN = re.compile(r"\s*\((?:[^()]*?(?:Japanese|Korean|Chinese|lit\.|pronounced|stylized|stylised|abbreviated|known in|released in|titled)[^()]*|[^()]*[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af][^()]*)\)")


def sentences(text):
    text = JUNK_PAREN.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"“'‘(])", text)
    return [p.strip() for p in parts if len(p.strip()) > 20]


def sections(full):
    """Split a plain-text extract (exsectionformat=wiki) into {heading: text} for top-level sections."""
    out, head, buf = {}, "_intro", []
    for line in full.split("\n"):
        m = re.match(r"^(=+)\s*(.*?)\s*=+\s*$", line)
        if m and len(m.group(1)) == 2:
            out[head] = "\n".join(buf).strip()
            head, buf = m.group(2).strip().lower(), []
        elif not m:
            buf.append(line)
    out[head] = "\n".join(buf).strip()
    return out


def pick(secs, names):
    for n in names:
        if secs.get(n):
            return secs[n]
    for k, v in secs.items():
        if v and any(k.startswith(n) for n in names):
            return v
    return ""


def take(sents, max_n, max_chars, skip_noise=True):
    out, size = [], 0
    for x in sents:
        if skip_noise and NOISE.search(x):
            continue
        if size + len(x) > max_chars and out:
            break
        out.append(x)
        size += len(x)
        if len(out) >= max_n:
            break
    return out


def describe(full):
    secs = sections(full)
    intro = sentences(secs.get("_intro", ""))
    lead = ""
    if intro:
        first = intro[0]
        m = re.search(r"\s(?:developed|co-developed|published|co-published|created|made|designed|produced|programmed)\b|,\s(?:and\s)?(?:developed|published)\b|\swhich was\b|\sthat was\b", first)
        if m:
            first = first[: m.start()].rstrip(" ,;") + "."
        if not NOISE.search(first) and len(first) < 220:
            lead = first
    play = take(sentences(pick(secs, GAMEPLAY)), 3, 420)
    story = take(sentences(pick(secs, STORY)), 2, 300)
    if not play and not story:
        play = take(intro[1:], 3, 420)
    # Gameplay sections often open by saying what the game is; then the genre line repeats it.
    if lead and play and re.match(r"^[^.]{0,90}\b(?:is|was) an?\b", play[0]):
        lead = ""
    p1 = " ".join(([lead] if lead else []) + play).strip()
    p2 = " ".join(story).strip()
    text = "\n\n".join(x for x in (p1, p2) if x)
    # A lone genre sentence isn't worth showing over the site's own synopsis.
    return text if len(text) >= 140 else ""


def extracts(titles):
    """Full plain-text articles, one per request (the API only returns one full extract at a time)."""
    out = {}
    for n, t in enumerate(titles):
        try:
            data = api(action="query", titles=t, prop="extracts", explaintext=1, exsectionformat="wiki")
            for p in data.get("query", {}).get("pages", []):
                if p.get("extract"):
                    d = describe(p["extract"])
                    if d:
                        out[p["title"]] = d
        except Exception as e:
            print(f"  {t}: {e}")
        if n % 100 == 0:
            print(f"  read {n} of {len(titles)} articles")
        time.sleep(0.25)
    return out


# ---- facts from Wikidata ----------------------------------------------------
# Wikidata (CC0, no credit required) has structured facts for most games' Wikipedia articles.
WD_API = "https://www.wikidata.org/w/api.php"
PROPS = {"P178": "dev", "P123": "pub", "P57": "dir", "P86": "mus", "P179": "ser", "P404": "modes", "P852": "esrb", "P908": "pegi"}


def wd(**params):
    # No maxlag here: it refers to Wikidata's query service, which is often behind, and these are
    # small read-only lookups.
    params.update(format="json")
    for attempt in range(5):
        r = S.get(WD_API, params=params, timeout=40)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code == 200 and "error" not in body:
            return body
        print(f"  wikidata: {r.status_code} {str(body.get('error', ''))[:120]}")
        time.sleep(3 + attempt * 5)
    raise RuntimeError("Wikidata lookups kept failing")


def mode_flags(labels):
    """Single-player (s), multiplayer (m), co-op (c), online (o) and local/split-screen (l) from game-mode labels."""
    out = ""
    joined = " | ".join(l.lower() for l in labels)
    for flag, pat in (("s", r"single[- ]?player"), ("m", r"multi[- ]?player"), ("c", r"co-?op|cooperative"),
                      ("o", r"online|massively"), ("l", r"split[- ]screen|local multiplayer|hot ?seat|couch")):
        if re.search(pat, joined):
            out += flag
    if ("c" in out or "o" in out or "l" in out) and "m" not in out:
        out += "m"
    return out


def facts_for(found):
    """game id -> {dev, pub, dir, mus: [names], ser, modes, max, esrb, pegi} from each article's Wikidata item."""
    qid_of = {gid: (p.get("pageprops") or {}).get("wikibase_item") for gid, p in found.items()}
    qids = sorted({q for q in qid_of.values() if q})
    claims, refs = {}, set()
    for i in range(0, len(qids), 50):
        data = wd(action="wbgetentities", ids="|".join(qids[i:i + 50]), props="claims")
        for q, ent in (data.get("entities") or {}).items():
            c = {}
            for pid, key in PROPS.items():
                vals = []
                for st in (ent.get("claims") or {}).get(pid, []):
                    dv = ((st.get("mainsnak") or {}).get("datavalue") or {}).get("value")
                    if isinstance(dv, dict) and dv.get("id"):
                        vals.append(dv["id"])
                        refs.add(dv["id"])
                c[key] = vals
            mx = []
            for st in (ent.get("claims") or {}).get("P1873", []):
                dv = ((st.get("mainsnak") or {}).get("datavalue") or {}).get("value")
                if isinstance(dv, dict) and dv.get("amount"):
                    try:
                        mx.append(int(float(dv["amount"])))
                    except ValueError:
                        pass
            c["max"] = max(mx) if mx else None
            claims[q] = c
        time.sleep(0.3)
    labels, refs = {}, sorted(refs)
    for i in range(0, len(refs), 50):
        data = wd(action="wbgetentities", ids="|".join(refs[i:i + 50]), props="labels", languages="en")
        for q, ent in (data.get("entities") or {}).items():
            lab = ((ent.get("labels") or {}).get("en") or {}).get("value")
            if lab:
                labels[q] = lab
        time.sleep(0.3)
    out = {}
    for gid, q in qid_of.items():
        c = claims.get(q)
        if not c:
            continue
        name = lambda ids: [labels[x] for x in ids if x in labels]
        f = {}
        for k in ("dev", "pub", "dir", "mus"):
            v = list(dict.fromkeys(name(c[k])))[:3]
            if v:
                f[k] = v
        ser = name(c["ser"])
        if ser:
            f["ser"] = re.sub(r"\s*\((?:video game )?(?:series|franchise)\)$", "", ser[0])
        modes = mode_flags(name(c["modes"]))
        if modes:
            f["modes"] = modes
        if c["max"] and 1 <= c["max"] <= 64:
            f["max"] = c["max"]
        for k in ("esrb", "pegi"):
            v = name(c[k])
            if v:
                f[k] = v[0]
        if f:
            out[gid] = f
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
    art_skip = set(json.loads(ov_path.read_text(encoding="utf-8")).get("wiki_art_skip", [])) if ov_path.exists() else set()
    print(f"matched {len(found)} of {len(games)} games to Wikipedia articles")

    print(f"{sum(1 for p in found.values() if (p.get('pageprops') or {}).get('wikibase_item'))} articles have a Wikidata item")
    facts = facts_for(found)
    (ROOT / "data/facts.json").write_text(json.dumps(facts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"facts for {len(facts)} games; co-op {sum('c' in f.get('modes', '') for f in facts.values())}, "
          f"multiplayer {sum('m' in f.get('modes', '') for f in facts.values())}")
    if os.environ.get("ONLY") == "facts":
        return

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
        if gid not in ids or gid in art_skip or (found.get(gid) or {}).get("title") != title:
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
        p = found.get(gid) if gid not in art_skip else None
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
