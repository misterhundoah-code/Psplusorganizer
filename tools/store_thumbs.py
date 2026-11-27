"""Builds the shop's cover sheets: every game's box art at 64x86, 64 to a sheet (8x8), so the 3D shop can fill
every shelf from about twenty small downloads instead of one request per box.

Writes store/thumbs/<n>.webp and store/thumbs.json ({"cols": 8, "rows": 8, "w": 64, "h": 86, "ids": [...]}).
Square key art (art/) is cropped to the middle three quarters, the same way the shop crops it.
"""
import json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, COLS, ROWS = 64, 86, 8, 8
PER = COLS * ROWS

def cover(gid):
    for folder, square in (("box", False), ("art", True)):
        p = os.path.join(ROOT, folder, gid + ".webp")
        if os.path.exists(p):
            im = Image.open(p).convert("RGB")
            if square:
                w, h = im.size
                im = im.crop((int(w * 0.125), 0, int(w * 0.875), h))
            return im.resize((W, H), Image.LANCZOS)
    return None

def main():
    raw = json.load(open(os.path.join(ROOT, "data", "games.json")))
    games = raw if isinstance(raw, list) else raw.get("games", [])
    ids, ims = [], []
    for g in games:
        if g.get("gone") or not g.get("t"):
            continue
        im = cover(g["id"])
        if im is not None:
            ids.append(g["id"]); ims.append(im)
    out = os.path.join(ROOT, "store", "thumbs")
    os.makedirs(out, exist_ok=True)
    n = (len(ims) + PER - 1) // PER
    for s in range(n):
        sheet = Image.new("RGB", (W * COLS, H * ROWS), (43, 51, 80))
        for k, im in enumerate(ims[s * PER:(s + 1) * PER]):
            sheet.paste(im, ((k % COLS) * W, (k // COLS) * H))
        sheet.save(os.path.join(out, f"{s}.webp"), "WEBP", quality=72, method=6)
    for f in os.listdir(out):   # sheets left over from a bigger catalogue are emptied rather than deleted
        if f.endswith(".webp") and int(f[:-5]) >= n:
            open(os.path.join(out, f), "wb").close()
    json.dump({"cols": COLS, "rows": ROWS, "w": W, "h": H, "sheets": n, "ids": ids}, open(os.path.join(ROOT, "store", "thumbs.json"), "w"), separators=(",", ":"))
    print(f"{len(ids)} covers on {n} sheets")

if __name__ == "__main__":
    main()
