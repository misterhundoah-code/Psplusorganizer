#!/usr/bin/env python3
"""Which PS4 and PS5 games are likely to join PS Plus next.

Learns from every Game Catalog (Extra) addition announced since the 2022 relaunch and every
monthly (Essential) game since 2013, month by month: for each month, every game that could
have been added is a row, and the ones Sony actually added are the positives. A logistic
regression over a handful of plain-English signals then scores the games that could be added
next. The last 12 months are held out first to check the model on months it hasn't seen.

Writes data/predict.json for the preview page.
"""
import json, math, re, sys, datetime, collections
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load, norm, norm_ed, series, pub as normpub, Linker, ROOT

RAW = ROOT / "data" / "predict-raw"
WDFILE = Path(sys.argv[1]) if len(sys.argv) > 1 else RAW / "wikidata.json"
TODAY = datetime.date(2026, 11, 22)
NOW_M = "2026-12"      # next month to predict

def mi(m): y, mo = map(int, m.split("-")); return y * 12 + mo - 1
def ms(i): return f"{i // 12}-{i % 12 + 1:02d}"
def rel_m(d): return mi(d[:7]) if d else None

# ---------- the pool: Wikidata first, Wikipedia's lists for anything Wikidata lacks ----------
PLAT = {"Q5014725": "PlayStation 4", "Q63184502": "PlayStation 5", "Q13361286": "Xbox One", "Q19610114": "Nintendo Switch",
        "Q122761124": "Nintendo Switch 2", "Q48493": "iOS", "Q64350339": "Stadia", "Q48263": "Xbox 360"}
FREE = re.compile(r"free[- ]to[- ]play", re.I)
NEVER = {norm(t) for t in ["Fortnite", "Roblox", "Apex Legends", "Genshin Impact", "Warframe", "Call of Duty: Warzone", "Rocket League",
         "Fall Guys", "Marvel Rivals", "Overwatch 2", "Honkai: Star Rail", "Zenless Zone Zero", "eFootball", "Destiny 2", "Paladins",
         "Smite", "Smite 2", "Brawlhalla", "War Thunder", "World of Tanks", "Dauntless", "Neverwinter", "Path of Exile", "Path of Exile 2",
         "The Finals", "XDefiant", "Multiversus", "Spectre Divide", "Wuthering Waves", "The First Descendant", "Delta Force", "Once Human",
         "Infinity Nikki", "Marvel Snap", "Splitgate", "Splitgate 2", "Concord", "Minecraft", "Grand Theft Auto V", "Red Dead Redemption 2"]}
# Minecraft, GTA V and RDR2: always among the best sellers and kept off subscriptions by their makers; listed so they don't swamp the top.

V = json.loads((RAW / "views.json").read_text(encoding="utf-8"))
wd = json.loads(WDFILE.read_text(encoding="utf-8"))
wl = load("predict-pool.json")
pool, seen = [], {}
def add(g):
    k = norm_ed(g["t"])
    if not k or k in seen: return
    seen[k] = len(pool); pool.append(g)
for g in wd:
    plats = {PLAT.get(p, p) for p in g["plat"]}
    if not ({"PlayStation 4", "PlayStation 5"} & plats): continue
    add({"t": g["t"], "w": g.get("w"), "rel": g.get("rel"), "pub": sorted({normpub(p) for p in g["pub"] if not re.fullmatch(r"Q\d+", p)}),
         "dev": [d for d in g["dev"] if not re.fullmatch(r"Q\d+", d)], "ser": [s for s in g["ser"] if not re.fullmatch(r"Q\d+", s)],
         "plats": sorted(plats), "free": any(FREE.search(x) for x in g["gen"] + g["mode"]),
         "multi": any(re.search(r"multiplayer|online|co-op|cooperative", x, re.I) for x in g["mode"])})
for g in wl:
    if norm_ed(g["t"]) in seen:
        p = pool[seen[norm_ed(g["t"])]]
        if not p["rel"] and g["rel"]: p["rel"] = g["rel"]
        if not p["pub"]: p["pub"] = sorted({normpub(x) for x in g["pub"]})
        if not p["dev"]: p["dev"] = g["dev"]
        continue
    add({"t": g["t"], "w": g.get("w"), "rel": g.get("rel"), "pub": sorted({normpub(x) for x in g["pub"]}), "dev": g["dev"], "ser": [],
         "plats": ["PlayStation 5" if p == "PS5" else "PlayStation 4" for p in g["p"]], "free": False, "multi": False})
# The wall's own PS4/PS5 games, so past additions that neither list has still count.
F = load("facts.json"); AB = load("about.json")
for g in load("games.json"):
    if not ({"PS4", "PS5"} & set(g["p"])) or norm_ed(g["t"]) in seen: continue
    f = F.get(g["id"], {})
    add({"t": g["t"], "w": (AB.get(g["id"]) or {}).get("w"), "rel": f"{g['y']}-06-30" if g.get("y") else None,
         "pub": sorted({normpub(x) for x in f.get("pub", [])}), "dev": f.get("dev", []), "ser": [f["ser"]] if f.get("ser") else [],
         "plats": ["PlayStation 5" if p == "PS5" else "PlayStation 4" for p in g["p"] if p in ("PS4", "PS5")],
         "free": False, "multi": "m" in f.get("modes", "") or "c" in f.get("modes", "")})
for g in pool:
    g["views"] = V.get(g["w"] or "", 0) or V.get(g["t"], 0)
    g["sony"] = "Sony" in g["pub"]
    g["excl"] = not any(re.search(r"Windows|Xbox|Switch|Stadia", p) for p in g["plats"])
    g["ps5"] = "PlayStation 5" in g["plats"]
    g["skey"] = norm(g["ser"][0]) if g["ser"] else series(g["t"])
    g["rm"] = rel_m(g["rel"])
    g["skip"] = g["free"] or norm_ed(g["t"]) in NEVER or norm(g["t"]) in NEVER
print("pool", len(pool), "with views", sum(1 for g in pool if g["views"]))

# ---------- history: what joined, and when ----------
L = Linker(pool)
H = load("predict-history.json"); G = load("games.json"); A = load("about.json")
extra_add = {}      # pool idx -> month index added to the Game Catalog
ess_add = {}        # pool idx -> month index given as a monthly game
for p in H:
    m = mi(p["month"])
    for x in p["games"]:
        i = L.find(x["t"])
        if i is None: continue
        if p["kind"] == "catalog" and x["tier"] == "Extra": extra_add.setdefault(i, m)
        if p["kind"] == "monthly": ess_add.setdefault(i, m)
in_cat_now = set()
for g in G:
    i = L.find(g["t"], (A.get(g["id"]) or {}).get("w"))
    if i is None: continue
    if g.get("e"): ess_add.setdefault(i, mi(g["e"]))
    if g["cat"]: in_cat_now.add(i)
launch = {i for i in in_cat_now if i not in extra_add}     # on the catalogue since the June 2022 relaunch
print("extra additions linked", len(extra_add), "| monthly linked", len(ess_add), "| catalogue now", len(in_cat_now))

# ---------- features ----------
FEATS = ["day one", "under 6 months old", "6 to 12 months old", "1 to 2 years old", "2 to 4 years old",
         "Sony game", "Sony game, 1 to 3 years old", "PlayStation exclusive", "popularity", "publisher track record",
         "developer track record", "sequel or follow-up due soon", "was a monthly game", "already on Extra", "multiplayer", "PS5 game",
         "big new release", "publisher's other track record"]

def track(kind_adds, m, which=None):
    """For each publisher and developer: games added before month m, out of their games released at least 6 months before."""
    tot_p, hit_p, tot_d, hit_d = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
    for i, g in enumerate(pool):
        if g["rm"] is None or g["rm"] > m - 6 or g["skip"]: continue
        src = kind_adds if which is None else (kind_adds[which],)
        hit = any(a.get(i, 10**9) < m for a in src)
        for p in g["pub"]: tot_p[p] += 1; hit_p[p] += hit
        for d in g["dev"]: tot_d[d] += 1; hit_d[d] += hit
    base = max(1e-4, sum(hit_p.values()) / max(1, sum(tot_p.values())))
    return tot_p, hit_p, tot_d, hit_d, base

def lift(names, tot, hit, base, k=6):
    best = None
    for n in names:
        if tot[n] < 2: continue
        r = (hit[n] + k * base) / (tot[n] + k)
        v = math.log(r / base)
        if best is None or abs(v) > abs(best[0]): best = (v, n, hit[n], tot[n])
    return best or (0.0, None, 0, 0)

# series index for "sequel due soon"
by_series = collections.defaultdict(list)
for i, g in enumerate(pool):
    if g["skey"] and len(g["skey"]) > 3: by_series[g["skey"]].append(i)

def sequel(i, m):
    g = pool[i]
    for j in by_series.get(g["skey"], []):
        h = pool[j]
        if j == i or h["rm"] is None or g["rm"] is None: continue
        if h["rm"] > g["rm"] and m - 1 <= h["rm"] <= m + 6 and (h["views"] > 2000 or h["sony"]): return h
    return None

def row(i, m, tr, kind):
    g = pool[i]; age = m - g["rm"]
    (tp, hp, td, hd, base), (tp2, hp2, _, _, base2) = tr
    pl = lift(g["pub"], tp, hp, base); dl = lift(g["dev"], td, hd, base); pl2 = lift(g["pub"], tp2, hp2, base2)
    sq = sequel(i, m)
    in_extra = i in launch or extra_add.get(i, 10**9) < m
    x = [age <= 0, 0 < age <= 6, 6 < age <= 12, 12 < age <= 24, 24 < age <= 48,
         g["sony"], g["sony"] and 12 <= age <= 36, g["excl"], math.log1p(g["views"]) / 10,
         pl[0], dl[0], sq is not None, ess_add.get(i, 10**9) < m, in_extra, g["multi"], g["ps5"],
         (age <= 12) * max(0.0, math.log10(max(g["views"], 1)) - 4.5), pl2[0]]
    return [float(v) for v in x], {"pub": pl, "dev": dl, "seq": sq, "age": age}

def cands(m, kind):
    out = []
    for i, g in enumerate(pool):
        if g["skip"] or g["rm"] is None or g["rm"] > m: continue
        if kind == "extra":
            if i in launch or extra_add.get(i, 10**9) < m: continue
        else:
            if ess_add.get(i, 10**9) < m: continue
            if m < mi("2020-11") and not "PlayStation 4" in g["plats"]: continue
        out.append(i)
    return out

def trk(m, kind):
    w = 0 if kind == "extra" else 1
    return track((extra_add, ess_add), m, w), track((extra_add, ess_add), m, 1 - w)

def build(kind, months):
    X, y, meta = [], [], []
    adds = extra_add if kind == "extra" else ess_add
    for m in months:
        tr = trk(m, kind)
        for i in cands(m, kind):
            x, _ = row(i, m, tr, kind)
            X.append(x); y.append(adds.get(i) == m); meta.append((m, i))
    return np.array(X), np.array(y, dtype=int), meta

MODEL = sys.argv[2] if len(sys.argv) > 2 else "lr"
def make():
    if MODEL == "gb":
        from sklearn.ensemble import HistGradientBoostingClassifier
        return HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0)
    return LogisticRegression(C=0.5, max_iter=3000)
def evaluate(kind, months_train, months_test):
    Xtr, ytr, _ = build(kind, months_train)
    clf = make().fit(Xtr, ytr)
    Xte, yte, meta = build(kind, months_test)
    p = clf.predict_proba(Xte)[:, 1]
    res = []
    for m in months_test:
        idx = [k for k, (mm, _) in enumerate(meta) if mm == m]
        if not idx: continue
        pm = p[idx]; ym = yte[idx]; order = np.argsort(-pm)
        ranks = [int(np.where(order == k)[0][0]) + 1 for k in range(len(idx)) if ym[k]]
        res.append({"month": ms(m), "added": int(ym.sum()), "cands": len(idx), "ranks": sorted(ranks),
                    "top50": sum(r <= 50 for r in ranks), "expected": round(float(pm.sum()), 1),
                    "found": [pool[meta[idx[k]][1]]["t"] for k in range(len(idx)) if ym[k] and int(np.where(order == k)[0][0]) < 50]})
    return clf, res

def months(a, b): return list(range(mi(a), mi(b) + 1))

out = {"asof": TODAY.isoformat(), "month": NOW_M, "feats": FEATS}
for kind, start in (("extra", "2022-07"), ("essential", "2019-01")):
    adds = extra_add if kind == "extra" else ess_add
    allm = [m for m in months(start, "2026-11") if any(v == m for v in adds.values())]
    test = allm[-12:]; train = allm[:-12]
    clf, res = evaluate(kind, train, test)
    tot = sum(r["added"] for r in res); t50 = sum(r["top50"] for r in res)
    allranks = sorted(x for r in res for x in r["ranks"])
    print(f"\n{kind}: held-out {len(test)} months, {tot} linked additions; {t50} ({t50 / max(1, tot):.0%}) were in the model's top 50 that month;"
          f" median rank {allranks[len(allranks) // 2] if allranks else '-'} of ~{res[-1]['cands'] if res else 0}")
    for r in res[-4:]: print("  ", r["month"], "added", r["added"], "ranks", r["ranks"][:10], "expected", r["expected"], "| found", r["found"][:5])
    # final model on every month, then score the next three months
    if "--eval" in sys.argv: continue
    clf = LogisticRegression(C=0.5, max_iter=3000).fit(*build(kind, allm)[:2])
    coef = dict(zip(FEATS, clf.coef_[0].round(3)))
    print("   weights:", {k: v for k, v in coef.items()})
    m0 = mi(NOW_M); tr = trk(m0, kind)
    rows = []
    for i in cands(m0, kind):
        p3 = 1.0; detail = None
        for k in range(3):
            x, d = row(i, m0 + k, tr, kind)
            if k == 0: detail, x0 = d, x
            p3 *= 1 - clf.predict_proba([x])[0, 1]
        g = pool[i]
        contrib = {f: float(c * v) for f, c, v in zip(FEATS, clf.coef_[0], x0)}
        rows.append({"t": g["t"], "w": g["w"], "rel": g["rel"], "pub": g["pub"], "dev": g["dev"][:3], "p": round(1 - p3, 4),
                     "excl": g["excl"], "sony": g["sony"], "views": g["views"], "ps5": g["ps5"],
                     "was": ("extra" if i in extra_add else None), "monthly": ms(ess_add[i]) if i in ess_add else None,
                     "c": {k: round(v, 3) for k, v in contrib.items() if abs(v) > 0.05},
                     "pubtr": detail["pub"][1:] if detail["pub"][1] else None, "devtr": detail["dev"][1:] if detail["dev"][1] else None,
                     "seq": {"t": detail["seq"]["t"], "rel": detail["seq"]["rel"]} if detail["seq"] else None})
    rows.sort(key=lambda r: -r["p"])
    out[kind] = {"backtest": res, "weights": coef, "top": rows[:400], "n": len(rows)}
    print("   top 15 for", NOW_M, ":", [(r["t"], r["p"]) for r in rows[:15]])
if "--eval" not in sys.argv: (ROOT / "data" / "predict.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
