"""Builds store/aisle.json for the walk-through store preview (store/index.html): two shelves of games,
best reviewed first, each with its IGDB portrait cover id and up to three videos (data/igdb.json).

  python tools/store/build_aisle.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AISLES = [("left", "JRPGs", "JRPG"), ("right", "Horror", "Horror")]
PER_SHELF = 24


def key(t):
    t = t.lower().split(":")[0]
    t = re.sub(r"\b(ultimate|deluxe|digital deluxe|complete|definitive|game of the year|goty|standard|cross-gen)\s+edition\b"
               r"|\bremaster(ed)?\b|\bdirector'?s cut\b|\bintergrade\b|[^a-z0-9 ]", "", t)
    return " ".join(t.split())


def videos(v):
    """Gameplay first, then launch and release trailers, then any trailer; skip dev diaries and the like."""
    def rank(x):
        n = x[0].lower()
        if "gameplay" in n and "walkthrough" not in n: return 0
        if "launch" in n or "release" in n: return 1
        if "trailer" in n: return 2
        if "teaser" in n or "announce" in n: return 3
        return 4
    vs = sorted(v.get("videos") or [], key=rank)
    return [x for x in vs if rank(x) < 4][:3] or vs[:1]


def main():
    d = json.loads((ROOT / "data/games.json").read_text())
    G = [g for g in (d if isinstance(d, list) else d["games"]) if not g.get("gone")]
    ig = json.loads((ROOT / "data/igdb.json").read_text())
    out = {}
    for side, name, tag in AISLES:
        xs = sorted([g for g in G if tag in g.get("g", []) and g.get("m")], key=lambda g: -g["m"])
        seen, rows = set(), []
        for g in xs:
            k = key(g["t"])
            v = ig.get(g["id"]) or {}
            if k in seen or not (v.get("cover") or (ROOT / f"art/{g['id']}.webp").exists()):
                continue
            seen.add(k)
            r = {k2: g[k2] for k2 in ("id", "t", "m", "h", "y", "g", "d", "sys", "p", "cl", "s3") if g.get(k2) is not None}
            if v.get("cover"):
                r["igc"] = v["cover"]
            r["v"] = videos(v)
            rows.append(r)
            if len(rows) == PER_SHELF:
                break
        out[side] = {"name": name, "games": rows}
    (ROOT / "store/aisle.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print({s: len(a["games"]) for s, a in out.items()}, "videos:", sum(bool(g["v"]) for a in out.values() for g in a["games"]))


if __name__ == "__main__":
    main()
