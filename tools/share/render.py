"""Renders og.png (1200x630 link preview) and the icons from the HTML sources next to this file."""
import pathlib
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
with sync_playwright() as p:
    b = p.chromium.launch()
    for src, w, h, outs in [("card.html", 1200, 630, [("og.png", 1)]),
                            ("icon.html", 512, 512, [("icon-512.png", 1)])]:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto((HERE / src).as_uri()); pg.wait_for_timeout(600)
        for name, _ in outs:
            pg.screenshot(path=str(ROOT / name))
    b.close()
