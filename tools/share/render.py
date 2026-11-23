"""Renders og.png (1200x630 link preview) and the icons from the sources next to this file and the SVGs
that make_logo.py writes to the site root (logo.svg, icon.svg, favicon.svg).

  python3 tools/share/make_logo.py && python3 tools/share/render.py
"""
import io
import pathlib
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.goto((HERE / "card.html").as_uri()); pg.wait_for_timeout(600)
    pg.screenshot(path=str(ROOT / "og.png"))
    pg = b.new_page(viewport={"width": 512, "height": 512})
    pg.goto((HERE / "icon.html").as_uri()); pg.wait_for_timeout(400)
    big = Image.open(io.BytesIO(pg.screenshot())).convert("RGBA")
    big.save(ROOT / "icon-512.png")
    big.resize((192, 192), Image.LANCZOS).save(ROOT / "icon-192.png")
    big.resize((180, 180), Image.LANCZOS).convert("RGB").save(ROOT / "apple-touch-icon.png")
    # favicon.ico: the simplified controller on a transparent background, for browsers without SVG favicons
    pg = b.new_page(viewport={"width": 256, "height": 256})
    pg.set_content(f'<html><body style="margin:0;background:transparent">'
                   f'{(ROOT / "favicon.svg").read_text().replace("<svg ", "<svg width=\"256\" height=\"256\" ", 1)}</body></html>')
    fav = Image.open(io.BytesIO(pg.screenshot(omit_background=True))).convert("RGBA")
    fav.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    b.close()
print("Wrote og.png, icon-512.png, icon-192.png, apple-touch-icon.png, favicon.ico")
