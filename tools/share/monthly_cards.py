"""Shareable cards for a month's PS Plus games: one lineup image (1080x1350, for a Reddit or Instagram post)
and, with --each, one square card per game (1080x1080), each with Metascore, HowLongToBeat main story and OpenCritic.

  python3 tools/share/monthly_cards.py                 # this month's lineup from data/coming.json
  python3 tools/share/monthly_cards.py data/cards.json # or a hand-made list (for the hour after an announcement)

A hand-made list looks like:
  {"title": "PS Plus monthly games", "sub": "December 2026",
   "games": [{"id": "dead-island-2", "t": "Dead Island 2", "p": ["PS4", "PS5"],
              "m": 73, "h": 16.2, "oc": 61, "g": "Zombie action RPG", "img": "https://..."}]}
Anything left out is filled from data/games.json, data/opencritic.json and data/coming.json when the game is
known. Pictures: "img" (a URL or a file path) if it can be loaded, then art/wide/<id>.webp, then art/<id>.webp.
Writes share-cards/<month or sub>/lineup.png (and one <id>.png per game with --each).
"""
import base64
import functools
import html
import http.server
import json
import pathlib
import re
import sys
import threading
import urllib.request

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
esc = html.escape


def load(name, default):
    try:
        return json.loads((ROOT / "data" / name).read_text())
    except (FileNotFoundError, ValueError):
        return default


def games_index():
    d = load("games.json", [])
    items = d if isinstance(d, list) else d.get("games", list(d.values()) if isinstance(d, dict) else [])
    return {g["id"]: g for g in items if isinstance(g, dict) and "id" in g}


def picture(g):
    """A data: URI for the game's picture, and whether it is wide (16:9) or a square cover."""
    src = g.get("img")
    if src:
        try:
            if re.match(r"https?://", src):
                src = re.sub(r"fit=\d+%2C\d+", "fit=1280%2C720", src)  # the PlayStation Blog's resizer: ask for a sharper copy
                req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
                raw = urllib.request.urlopen(req, timeout=20).read()
            else:
                raw = (ROOT / src).read_bytes()
            mime = "image/png" if raw[:4] == b"\x89PNG" else "image/webp" if raw[8:12] == b"WEBP" else "image/jpeg"
            return f"data:{mime};base64,{base64.b64encode(raw).decode()}", True
        except Exception as e:  # no network here, or a dead link: fall back to the art we keep
            print(f"  ({g.get('t')}: couldn't load {src[:60]}: {e.__class__.__name__}; using stored art)")
    for path, wide in ((ROOT / "art" / "wide" / f"{g.get('id')}.webp", True), (ROOT / "art" / f"{g.get('id')}.webp", False)):
        if path.exists():
            return "data:image/webp;base64," + base64.b64encode(path.read_bytes()).decode(), wide
    return "", False


def hours(h):
    if h is None:
        return None
    return f"{h:.0f}" if h >= 10 else f"{h:.1f}".rstrip("0").rstrip(".")


def tone(m):
    return "hi" if m >= 75 else "mid" if m >= 50 else "lo"


def stats(g):
    out = []
    if g.get("m") is not None:
        out.append(f'<div class="st"><b class="ms {tone(g["m"])}">{g["m"]}</b><span>Metascore</span></div>')
    if g.get("oc") is not None:
        out.append(f'<div class="st"><b>{g["oc"]}%</b><span>OpenCritic<br>recommend</span></div>')
    if g.get("h") is not None:
        out.append(f'<div class="st"><b>{hours(g["h"])}<small>h</small></b><span>Main story<br>(HowLongToBeat)</span></div>')
    if not out:
        out.append('<div class="st none"><span>No scores yet</span></div>')
    return "".join(out)


def game_block(g):
    pic, wide = picture(g)
    art = (f'<div class="pic {"wide" if wide else "sq"}"><img src="{pic}" alt="">'
           + ("" if wide else f'<img class="bg" src="{pic}" alt="">') + "</div>") if pic else '<div class="pic none"></div>'
    meta = " / ".join(g.get("p") or [])
    if g.get("g"):
        meta = f'{g["g"]}, {meta}' if meta else g["g"]
    return (f'<article class="game">{art}<div class="body"><h2>{esc(g["t"])}</h2>'
            f'<p class="meta">{esc(meta)}</p><div class="stats">{stats(g)}</div></div></article>')


CSS = """
*{box-sizing:border-box;margin:0}
html,body{width:WIDTHpx;height:HEIGHTpx;overflow:hidden}
body{background:#1E3A9E;font-family:"Archivo",sans-serif;color:#0E1636;position:relative;display:flex;flex-direction:column}
.top{background:#FFC925;border-bottom:10px solid #0E1636;padding:34px 48px 30px;display:flex;align-items:center;gap:34px}
.top img{width:250px;height:auto;flex:none}
.top h1{font-family:"Bungee";font-weight:400;font-size:46px;line-height:1.02;color:#0E1636}
.top h1 small{display:block;font-family:"Archivo";font-weight:800;font-size:30px;margin-top:8px;color:#13286F}
.games{flex:1;display:flex;flex-direction:column;gap:26px;padding:34px 48px 0}
.game{background:#fff;border:5px solid #0E1636;box-shadow:10px 10px 0 #0E1636;display:flex;flex:1;min-height:0}
.pic{flex:none;width:400px;position:relative;overflow:hidden;border-right:5px solid #0E1636;background:#0E1636}
.pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pic.sq img{object-fit:contain;z-index:1}.pic.sq img.bg{object-fit:cover;filter:blur(18px) brightness(.7);transform:scale(1.2);z-index:0}
.body{flex:1;padding:22px 26px;display:flex;flex-direction:column;justify-content:center;min-width:0}
h2{font-weight:800;font-size:36px;line-height:1.08}
.meta{font-size:22px;color:#4A5578;margin-top:6px}
.stats{display:flex;gap:26px;margin-top:18px;align-items:flex-end}
.st{display:flex;flex-direction:column;gap:4px}
.st b{font-family:"Bungee";font-weight:400;font-size:46px;line-height:1}
.st b small{font-size:26px;margin-left:2px}
.st span{font-size:16px;line-height:1.15;color:#4A5578;font-weight:600}
.ms{display:inline-block;min-width:84px;text-align:center;padding:10px 8px 6px;border:4px solid #0E1636;color:#0E1636}
.ms.hi{background:#5BC85B}.ms.mid{background:#FFC925}.ms.lo{background:#F06A5A}
.none span{font-size:20px}
.foot{display:flex;justify-content:space-between;align-items:center;padding:26px 48px 30px;color:#fff;font-size:18px}
.foot b{font-family:"Bungee";font-weight:400;font-size:22px;color:#FFC925}
/* square single-game card */
.one .games{padding:40px 48px 0}
.one .game{flex-direction:column}
.one .pic{width:auto;height:470px;border-right:0;border-bottom:5px solid #0E1636}
.one h2{font-size:46px}.one .meta{font-size:26px}.one .stats{gap:40px;margin-top:22px}
.one .st b{font-size:58px}.one .ms{min-width:104px}
.one .top{padding:26px 48px 22px}.one .top img{width:190px}.one .top h1{font-size:34px}.one .top h1 small{font-size:24px}
"""


def page(body, w, h, cls=""):
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts/fonts.css">'
            f'<style>{CSS.replace("WIDTH", str(w)).replace("HEIGHT", str(h))}</style></head>'
            f'<body class="{cls}">{body}</body></html>')


def top(title, sub):
    return f'<header class="top"><img src="/logo.svg" alt=""><h1>{esc(title)}<small>{esc(sub)}</small></h1></header>'


def foot(games):
    who = "Metacritic and OpenCritic" if any(g.get("oc") is not None for g in games) else "Metacritic"
    return (f'<footer class="foot"><span>Scores from {who}. Times are HowLongToBeat averages.</span>'
            '<b>wallofpsplus.com</b></footer>')


def main():
    idx, oc = games_index(), load("opencritic.json", {})
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        spec = json.loads(pathlib.Path(args[0]).read_text())
    else:
        mon = load("coming.json", {}).get("monthly") or {}
        y, m = (mon.get("month") or "0000-00").split("-")
        months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
                  "November", "December"]
        spec = {"title": "PS Plus monthly games", "sub": f"{months[int(m) - 1]} {y}" if int(m) else "",
                "games": mon.get("games") or []}
    games = []
    for raw in spec["games"]:
        g = dict(raw)
        known = idx.get(g.get("id")) or {}
        for k in ("t", "p", "m", "h"):
            if g.get(k) is None and known.get(k) is not None:
                g[k] = known[k]
        if g.get("oc") is None and (oc.get(g.get("id")) or {}).get("r") is not None:
            g["oc"] = oc[g["id"]]["r"]
        if not g.get("g") and known.get("g"):
            g["g"] = " / ".join(known["g"][:2])
        g.setdefault("id", re.sub(r"[^a-z0-9]+", "-", g["t"].lower()).strip("-"))
        games.append(g)
    out = ROOT / "share-cards" / re.sub(r"[^a-z0-9]+", "-", (spec.get("sub") or "cards").lower()).strip("-")
    out.mkdir(parents=True, exist_ok=True)
    # Skip a lineup that's already drawn, so the twice-daily runs don't redraw (and recommit) the same month.
    stamp = json.dumps([spec.get("title"), spec.get("sub"), games], sort_keys=True, ensure_ascii=False)
    if "--force" not in sys.argv and (out / "cards.json").exists() and (out / "cards.json").read_text() == stamp:
        print(f"Cards in {out.relative_to(ROOT)}/ are up to date")
        return
    tmp = HERE / "_card.html"

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/tools/share/_card.html"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            jobs = [("lineup", 1080, 1350, "", top(spec["title"], spec.get("sub", ""))
                     + f'<main class="games">{"".join(game_block(g) for g in games)}</main>' + foot(games))]
            jobs += [] if "--each" not in sys.argv else [(g["id"], 1080, 1080, "one", top(spec["title"], spec.get("sub", ""))
                      + f'<main class="games">{game_block(g)}</main>' + foot([g])) for g in games]
            for name, w, h, cls, body in jobs:
                tmp.write_text(page(body, w, h, cls))
                pg = b.new_page(viewport={"width": w, "height": h})
                pg.goto(url)
                pg.wait_for_timeout(500)
                pg.screenshot(path=str(out / f"{name}.png"))
                pg.close()
            b.close()
    finally:
        srv.shutdown()
        tmp.unlink(missing_ok=True)
    (out / "cards.json").write_text(stamp)
    print(f"Wrote {len(jobs)} cards to {out.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
