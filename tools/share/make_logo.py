"""Draws the logo and icons as SVG: logo.svg (the marquee sign), icon.svg (the controller) and favicon.svg
(the simplified controller for small sizes). Lettering is Bungee (fonts/, SIL OFL), converted to outlines
so the files need no web font. Needs fonttools and brotli. Then run render.py for the PNG and ICO files.

  python3 tools/share/make_logo.py && python3 tools/share/render.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from glyphs import text_path  # noqa: E402

NAVY, INK, Y, W = "#1E3A9E", "#0E1636", "#FFC925", "#FFFFFF"


def star(cx, cy, R, rot=-90):
    r = R * 0.47
    return " ".join(f"{cx + (R if i % 2 == 0 else r) * math.cos(math.radians(rot + i * 36)):.1f},"
                    f"{cy + (R if i % 2 == 0 else r) * math.sin(math.radians(rot + i * 36)):.1f}" for i in range(10))


BODY = ("M150 150 C120 150 97 160 87 185 L44 350 C28 414 54 452 92 452 C122 452 138 432 153 406 L184 356 "
        "C194 342 204 338 220 338 L292 338 C308 338 318 342 328 356 L359 406 C374 432 390 452 420 452 "
        "C458 452 484 414 468 350 L425 185 C415 160 392 150 362 150 C335 150 320 164 300 164 L212 164 C192 164 177 150 150 150 Z")
ICON_BOX = "12 -12 520 520"


def controller(simple=False):
    """The controller with its star, in a 520-unit box (ICON_BOX)."""
    sx, sy, R = (412, 112, 84) if not simple else (404, 118, 104)
    st = star(sx, sy, R)
    out = [f'<g fill="{W}" stroke="{W}" stroke-width="44" stroke-linejoin="round"><path d="{BODY}"/><polygon points="{st}"/></g>',
           f'<path d="{BODY}" fill="{NAVY}" stroke="{INK}" stroke-width="18" stroke-linejoin="round"/>']
    if simple:
        out.append(f'<path d="M110 240h26v-26h30v26h26v30h-26v26h-30v-26h-26z" fill="{W}" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>')
        out += [f'<circle cx="{x}" cy="292" r="24" fill="{W}" stroke="{INK}" stroke-width="8"/>' for x in (210, 302)]
        out += [f'<circle cx="{x}" cy="{y}" r="17" fill="{W}" stroke="{INK}" stroke-width="7"/>' for x, y in ((352, 262), (390, 262), (371, 294))]
    else:
        out.append(f'<path d="M112 228h24v-24h28v24h24v28h-24v24h-28v-24h-24z" fill="{W}" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>')
        out += [f'<circle cx="{x}" cy="288" r="36" fill="{NAVY}" stroke="{INK}" stroke-width="12"/>'
                f'<circle cx="{x}" cy="288" r="19" fill="{NAVY}" stroke="{W}" stroke-width="7"/>' for x in (210, 302)]
        out.append(f'<rect x="236" y="226" width="40" height="14" rx="7" fill="{W}" stroke="{INK}" stroke-width="5"/>')
        out += [f'<circle cx="{x}" cy="{y}" r="14" fill="{W}" stroke="{INK}" stroke-width="6"/>' for x, y in ((342, 242), (374, 214), (374, 270), (406, 242))]
    out.append(f'<polygon points="{st}" fill="{Y}" stroke="{INK}" stroke-width="18" stroke-linejoin="round"/>')
    return "".join(out)


def centred(s, size, cx, base, fill, track=0):
    _, w = text_path(s, size, track=track)
    d, _ = text_path(s, size, cx - w / 2, base, track)
    return f'<path d="{d}" fill="{fill}"/>'


def marquee():
    """The sign: a navy lightbox with bulbs, the name in Bungee, and the controller stuck on the corner."""
    w, h, pad = 700, 300, 40
    o = [f'<g transform="translate(0 {pad})">',
         f'<rect x="20" y="20" width="{w - 40}" height="{h - 40}" rx="26" fill="{NAVY}" stroke="{INK}" stroke-width="12"/>']
    n, m = 18, 7
    for i in range(n + 1):
        x = 52 + i * (w - 104) / n
        o += [f'<circle cx="{x:.1f}" cy="{y}" r="7" fill="{Y}"/>' for y in (44, h - 44)]
    for j in range(1, m):
        y = 44 + j * (h - 88) / m
        o += [f'<circle cx="{x}" cy="{y:.1f}" r="7" fill="{Y}"/>' for x in (44, w - 44)]
    o.append(centred("WALL OF", 52, w / 2, 128, W, 6))
    o.append(centred("PS PLUS", 104, w / 2, 228, Y, 4))
    o.append(f'<svg x="{w - 150}" y="-62" width="170" height="170" viewBox="{ICON_BOX}" overflow="visible">'
             f'<g transform="rotate(12 260 248)">{controller()}</g></svg>')
    o.append("</g>")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w + 24} {h + pad}" role="img" aria-label="Wall of PS Plus">'
            f'<title>Wall of PS Plus</title>{"".join(o)}</svg>')


def standalone(simple):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ICON_BOX}">{controller(simple)}</svg>'


if __name__ == "__main__":
    (ROOT / "logo.svg").write_text(marquee() + "\n", encoding="utf-8")
    (ROOT / "icon.svg").write_text(standalone(False) + "\n", encoding="utf-8")
    (ROOT / "favicon.svg").write_text(standalone(True) + "\n", encoding="utf-8")
    print("Wrote logo.svg, icon.svg, favicon.svg")
