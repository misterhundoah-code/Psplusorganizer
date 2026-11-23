"""Turn text set in Bungee into SVG path data, so the logo needs no web font."""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from pathlib import Path
F = TTFont(str(Path(__file__).resolve().parents[2] / "fonts" / "bungee-latin-400-normal.woff2"))
GS, CMAP, HM = F.getGlyphSet(), F.getBestCmap(), F["hmtx"]
UPM = F["head"].unitsPerEm
def text_path(s, size, x=0, y=0, track=0):
    """Path for s with its baseline at y, starting at x. Returns (d, width)."""
    sc = size / UPM
    pen = SVGPathPen(GS)
    cx = 0
    for ch in s:
        g = CMAP.get(ord(ch))
        if not g: continue
        GS[g].draw(TransformPen(pen, (sc, 0, 0, -sc, x + cx, y)))
        cx += HM[g][0] * sc + track
    return pen.getCommands(), cx - track
def cap_height(size):
    os2 = F["OS/2"]; return getattr(os2, "sCapHeight", 0.7 * UPM) * size / UPM
