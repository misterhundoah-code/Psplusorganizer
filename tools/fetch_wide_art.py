#!/usr/bin/env python3
"""Wide key art for the games featured with write-ups on the list pages (data/writeups.json).

The covers in art/ are small square crops. For featured games the list pages show a wide banner instead:
Sony's own key art from the game's PlayStation Store page (the page's background image, or failing that
its widest promo image), saved as art/wide/<id>.webp at 960x540. Games without one keep the square cover.
Runs in GitHub Actions (.github/workflows/artwork.yml) after the square covers; logs which images each page offered
to art/wide/fetch-log.txt.
"""
import io, json, re, sys, time
from pathlib import Path
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "wide"; OUT.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
S = requests.Session(); S.headers.update({"User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9"})
W, H = 960, 540
PREFER = ["GAMEHUB_COVER_ART", "BACKGROUND", "FOUR_BY_THREE_BANNER", "SIXTEEN_BY_NINE_BANNER", "PORTRAIT_BANNER", "SCREENSHOT", "MASTER"]

def images(html):
    """(role, url) pairs from the page's embedded data, in either key order."""
    out = []
    for m in re.finditer(r'\{[^{}]*?"role":"([A-Z_0-9]+)"[^{}]*?"url":"(https://image\.api\.playstation\.com/[^"]+)"[^{}]*\}', html):
        out.append((m.group(1), m.group(2)))
    for m in re.finditer(r'\{[^{}]*?"url":"(https://image\.api\.playstation\.com/[^"]+)"[^{}]*?"role":"([A-Z_0-9]+)"[^{}]*\}', html):
        out.append((m.group(2), m.group(1)))
    seen, res = set(), []
    for r, u in out:
        if u not in seen: seen.add(u); res.append((r, u))
    return res

def save(url, out):
    r = S.get(url + ("&" if "?" in url else "?") + "w=1280", timeout=60); r.raise_for_status()
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    w, h = im.size
    if w / h < 1.2: return False                       # not wide enough to be a banner
    t = W / H
    if w / h > t: nw = int(h * t); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = int(w / t); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im.resize((W, H), Image.LANCZOS).save(out, "WEBP", quality=74, method=6)
    return True

def main():
    games = {g["id"]: g for g in json.loads((ROOT / "data" / "games.json").read_text(encoding="utf-8"))}
    want = list(json.loads((ROOT / "data" / "writeups.json").read_text(encoding="utf-8")))
    copy = json.loads((ROOT / "data" / "list-copy.json").read_text(encoding="utf-8"))
    want += [i for c in copy.values() for i in c.get("picks", []) if i not in want]
    force = "--force" in sys.argv
    for gid in want:
        g = games.get(gid); out = OUT / f"{gid}.webp"
        if not g or (out.exists() and not force): continue
        m = re.search(r"/concept/(\d+)", g.get("u") or "")
        if not m: print(gid, "no store page"); continue
        try:
            html = S.get(f"https://store.playstation.com/en-ca/concept/{m.group(1)}", timeout=60).text
        except Exception as e:
            print(gid, "fetch failed", e); continue
        imgs = images(html)
        print(gid, "roles:", sorted({r for r, _ in imgs}))
        done = False
        for role in PREFER:
            for r, u in imgs:
                if r == role:
                    try: done = save(u, out)
                    except Exception as e: print("  ", role, e)
                    if done: print("   saved", role); break
            if done: break
        if not done: print("   no wide art")
        time.sleep(1)

if __name__ == "__main__":
    main()
