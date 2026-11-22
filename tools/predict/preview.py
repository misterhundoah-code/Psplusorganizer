#!/usr/bin/env python3
"""Preview page for the prediction list: writes index.html and data.json to a folder (default
/home/claude/predict-preview) from data/predict.json. Not part of the live site yet."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/claude/predict-preview"); OUT.mkdir(parents=True, exist_ok=True)
d = json.loads((ROOT / "data" / "predict.json").read_text(encoding="utf-8"))
data = {"asof": d["asof"]}
for k in ("extra", "essential"):
    rows = d[k]["top"]
    data[k] = {"n": d[k]["n"], "weights": d[k]["weights"],
               "backtest": [{x: r[x] for x in ("month", "added", "top50", "found", "cands")} for r in d[k]["backtest"]],
               "rows": [[r["t"], r["p"], (r["rel"] or "")[:4], ", ".join(r["pub"][:2]), r["why"][:5]] for r in rows if r["p"] >= 0.0005 or r["rank"] <= 3000]}
(OUT / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
(OUT / "index.html").write_text((Path(__file__).parent / "preview.html").read_text(encoding="utf-8"), encoding="utf-8")
print("rows", len(data["extra"]["rows"]), len(data["essential"]["rows"]), "bytes", (OUT / "data.json").stat().st_size)
