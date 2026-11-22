#!/usr/bin/env python3
"""Turns Wikipedia's lists of PS4 and PS5 games (data/predict-raw/wiki-*.txt) into
data/predict-pool.json: one entry per game with title, article, developers,
publishers, platforms and earliest release date."""
import json, re, datetime
from pathlib import Path
import mwparserfromhell as mw

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "predict-raw"
MON = {m: i for i, m in enumerate(["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"], 1)}

def split_attr(cell):
    """'rowspan="2" | text' -> ({'rowspan':2}, 'text'); ignores pipes inside [[ ]] and {{ }}."""
    depth = 0; i = 0
    while i < len(cell):
        two = cell[i:i+2]
        if two in ("[[", "{{"): depth += 1; i += 2; continue
        if two in ("]]", "}}"): depth -= 1; i += 2; continue
        if cell[i] == "|" and depth == 0:
            attr, text = cell[:i], cell[i+1:]
            if "=" in attr and "[[" not in attr and "{{" not in attr:
                m = re.search(r'rowspan\s*=\s*"?(\d+)', attr)
                return ({"rowspan": int(m.group(1))} if m else {}), text
            break
        i += 1
    return {}, cell

def split_inline(line):
    """Split a row line on || (or !!) outside links and templates."""
    out, depth, cur, i = [], 0, "", 0
    while i < len(line):
        two = line[i:i+2]
        if two in ("[[", "{{"): depth += 1; cur += two; i += 2; continue
        if two in ("]]", "}}"): depth -= 1; cur += two; i += 2; continue
        if two in ("||", "!!") and depth == 0: out.append(cur); cur = ""; i += 2; continue
        cur += line[i]; i += 1
    out.append(cur); return out

def text(w):
    w = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", w, flags=re.S)
    w = re.sub(r"<!--.*?-->", "", w, flags=re.S)
    code = mw.parse(w)
    for t in code.filter_templates(recursive=False):
        n = str(t.name).strip().lower()
        if n in ("hlist", "plainlist", "flatlist", "ubl", "unbulleted list"):
            try: code.replace(t, ", ".join(str(p.value).strip() for p in t.params if not p.showkey))
            except ValueError: pass
    s = code.strip_code().replace("&nbsp;", " ")
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", s).strip(" ,'")

def names(w):
    s = text(w.replace("<br>", ", ").replace("<br />", ", ").replace("<br/>", ", "))
    return [x.strip() for x in re.split(r",|\n", s) if x.strip() and x.strip().lower() not in ("unreleased", "tba")]

def dates(w):
    out = []
    for t in mw.parse(w).filter_templates():
        n = str(t.name).strip().lower()
        if n in ("dts", "date table sorting", "start date", "release date"):
            ps = [str(p.value).strip() for p in t.params if not p.showkey]
            try:
                y = int(ps[0]); mo = MON.get(ps[1][:3].lower(), None) if len(ps) > 1 and not ps[1].isdigit() else (int(ps[1]) if len(ps) > 1 else 12)
                d = int(ps[2]) if len(ps) > 2 and ps[2].isdigit() else 28
                out.append(datetime.date(y, mo or 12, min(d, 28) if not ps[2:3] else d).isoformat())
            except Exception: pass
    for m in re.finditer(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})", w):
        out.append(datetime.date(int(m.group(3)), MON[m.group(1)[:3].lower()], int(m.group(2))).isoformat())
    return out

def link(w):
    for l in mw.parse(w).filter_wikilinks():
        t = str(l.title).strip()
        if not t.lower().startswith(("file:", "image:")): return t.split("#")[0]
    return None

def parse(path, plat):
    src = path.read_text(encoding="utf-8")
    m = re.search(r'\{\|[^\n]*id="softwarelist".*?\n\|\}', src, flags=re.S)
    body = m.group(0)
    rows = re.split(r"\n\|-[^\n]*", body)
    games, spans = [], {}
    for r in rows:
        cells = []
        for line in r.split("\n"):
            if line.startswith(("{|", "|}", "|+")) or not line.startswith(("|", "!")): 
                if cells and line and not line.startswith(("{|", "|}", "<!--")): cells[-1] += "\n" + line
                continue
            for c in split_inline(line[1:]): cells.append(c)
        if not cells or all(not c.strip() for c in cells): continue
        if any("scope=\"col\"" in c or "colspan=\"3\"" in c for c in cells): continue
        full, ci = [], 0
        col = 0
        while ci < len(cells) or col in spans:
            if col in spans:
                v, left = spans[col]; full.append(v)
                if left <= 1: del spans[col]
                else: spans[col] = (v, left - 1)
                col += 1; continue
            attr, t = split_attr(cells[ci]); ci += 1
            if attr.get("rowspan", 1) > 1: spans[col] = (t, attr["rowspan"] - 1)
            full.append(t); col += 1
        if len(full) < 7: continue
        title = text(full[0])
        if not title or title.lower() in ("title",): continue
        ds = sorted(d for c in full[4:7] for d in dates(c))
        unreleased = all(("unreleased" in c.lower() or "tba" in c.lower() or not c.strip()) for c in full[4:7])
        games.append({"t": title, "w": link(full[0]), "dev": names(full[2]), "pub": names(full[3]), "g": names(full[1]),
                      "rel": ds[0] if ds else None, "tba": (not ds) and not unreleased or ("TBA" in "".join(full[4:7])),
                      "p": [plat]})
    return games

if __name__ == "__main__":
    pool = {}
    for f in sorted(RAW.glob("wiki-*.txt")):
        plat = "PS5" if "PlayStation 5" in f.read_text(encoding="utf-8").split("\n", 1)[0] else "PS4"
        gs = parse(f, plat); print(f.name, plat, len(gs))
        for g in gs:
            k = (g["w"] or g["t"]).lower()
            if k in pool:
                pool[k]["p"] = sorted(set(pool[k]["p"] + g["p"]))
                if g["rel"] and (not pool[k]["rel"] or g["rel"] < pool[k]["rel"]): pool[k]["rel"] = g["rel"]
            else: pool[k] = g
    out = sorted(pool.values(), key=lambda g: g["t"].lower())
    (ROOT / "data" / "predict-pool.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("pool", len(out), "linked", sum(1 for g in out if g["w"]))
