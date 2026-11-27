"""Downloads the IGDB portrait covers for the games in store/aisle.json into store/covers/<id>.webp.
Run by .github/workflows/store.yml (the sandbox that builds the page can't reach IGDB's image server)."""
import io, json, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "store/covers"


def main():
    OUT.mkdir(exist_ok=True)
    data = json.loads((ROOT / "store/aisle.json").read_text())
    got = skip = 0
    for a in data.values():
        for g in a["games"]:
            f = OUT / f"{g['id']}.webp"
            if not g.get("igc") or f.exists():
                skip += 1; continue
            url = f"https://images.igdb.com/igdb/image/upload/t_cover_big_2x/{g['igc']}.jpg"
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "wallofpsplus.com"}), timeout=30) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGB")
            im = im.resize((480, 640), Image.LANCZOS)  # PlayStation case shape, 3:4
            im.save(f, "WEBP", quality=82, method=6)
            got += 1
    print(f"{got} covers downloaded, {skip} already there or without one.")


if __name__ == "__main__":
    main()
