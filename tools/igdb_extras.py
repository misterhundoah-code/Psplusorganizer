"""Turns data/igdb.json into the files the wall uses, and downloads the portrait covers.

  data/videos.json  { wall id: [[label, YouTube id], ...] }  up to three per game, gameplay first
  data/box.json     [ wall ids whose portrait cover the wall should use ]
  box/<id>.webp     IGDB's cover art, 330x440 (the PlayStation case shape, 3:4)

  python tools/igdb_extras.py            # also downloads covers not saved yet
  python tools/igdb_extras.py --no-download
"""
import io, json, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOX = ROOT / "box"


def rank(x):
    n = x[0].lower()
    if "gameplay" in n and "walkthrough" not in n: return 0
    if "launch" in n or "release" in n: return 1
    if "trailer" in n: return 2
    if "teaser" in n or "announce" in n: return 3
    return 4


def main():
    ig = json.loads((ROOT / "data/igdb.json").read_text())
    vids = {}
    for k, v in sorted(ig.items()):
        vs = sorted(v.get("videos") or [], key=rank)
        keep = [x for x in vs if rank(x) < 4][:3] or vs[:1]
        if keep:
            vids[k] = keep
    (ROOT / "data/videos.json").write_text(json.dumps(vids, ensure_ascii=False, separators=(",", ":")))
    if "--no-download" not in sys.argv:
        from PIL import Image
        BOX.mkdir(exist_ok=True)
        got = fail = 0
        for k, v in sorted(ig.items()):
            f = BOX / f"{k}.webp"
            if not v.get("cover") or f.exists():
                continue
            url = f"https://images.igdb.com/igdb/image/upload/t_cover_big_2x/{v['cover']}.jpg"
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "wallofpsplus.com"}), timeout=30) as r:
                    im = Image.open(io.BytesIO(r.read())).convert("RGB")
                im.resize((330, 440), Image.LANCZOS).save(f, "WEBP", quality=80, method=6)
                got += 1
            except Exception as e:
                print("!!", k, e); fail += 1
            time.sleep(0.05)
        print(f"{got} covers downloaded, {fail} failed.")
    # Only games that still match on IGDB use their saved cover; a stale file is simply left unused.
    have = sorted(p.stem for p in BOX.glob("*.webp") if (ig.get(p.stem) or {}).get("cover")) if BOX.exists() else []
    (ROOT / "data/box.json").write_text(json.dumps(have, separators=(",", ":")))
    print(f"{len(vids)} games with videos, {len(have)} portrait covers in use.")


if __name__ == "__main__":
    main()
