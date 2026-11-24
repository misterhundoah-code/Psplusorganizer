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
from common import load, norm, norm_ed, dupe_key, series, pub as normpub, Linker, ROOT

RAW = ROOT / "data" / "predict-raw"
WDFILE = Path(sys.argv[1]) if len(sys.argv) > 1 else RAW / "wikidata.json"
TODAY = datetime.date.today()

def mi(m): y, mo = map(int, m.split("-")); return y * 12 + mo - 1
def ms(i): return f"{i // 12}-{i % 12 + 1:02d}"
def rel_m(d): return mi(d[:7]) if d else None

# ---------- the pool: Wikidata first, Wikipedia's lists for anything Wikidata lacks ----------
PLAT = {"Q5014725": "PlayStation 4", "Q63184502": "PlayStation 5", "Q13361286": "Xbox One", "Q98973368": "Xbox Series X and Series S",
        "Q48263": "Xbox 360", "Q19610114": "Nintendo Switch", "Q122761124": "Nintendo Switch 2", "Q1406": "Microsoft Windows",
        "Q14116": "macOS", "Q388": "Linux", "Q94": "Android", "Q48493": "iOS", "Q10683": "PlayStation 3", "Q188808": "PlayStation Vita"}
FREE = re.compile(r"free[- ]to[- ]play", re.I)
NEVER = {norm(t) for t in ["Fortnite", "Roblox", "Apex Legends", "Genshin Impact", "Warframe", "Call of Duty: Warzone", "Rocket League",
         "Fall Guys", "Marvel Rivals", "Overwatch 2", "Honkai: Star Rail", "Zenless Zone Zero", "eFootball", "Destiny 2", "Paladins",
         "Smite", "Smite 2", "Brawlhalla", "War Thunder", "World of Tanks", "Dauntless", "Neverwinter", "Path of Exile", "Path of Exile 2",
         "The Finals", "XDefiant", "Multiversus", "Spectre Divide", "Wuthering Waves", "The First Descendant", "Delta Force", "Once Human",
         "Infinity Nikki", "Marvel Snap", "Splitgate", "Splitgate 2", "Concord", "Call of Duty: Warzone 2.0", "Grand Theft Auto Online",
         "Where Winds Meet", "99 Nights in the Forest", "Blue Protocol: Star Resonance", "Arena Breakout: Infinite", "Minecraft", "Grand Theft Auto V", "Red Dead Redemption 2"]}
# Minecraft, GTA V and RDR2: always among the best sellers and kept off subscriptions by their makers; listed so they don't swamp the top.

V = json.loads((RAW / "views.json").read_text(encoding="utf-8"))
wd = json.loads(WDFILE.read_text(encoding="utf-8"))
wl = load("predict-pool.json")
pool, seen = [], {}
def add(g):
    k = dupe_key(g["t"])
    if not k or k in seen: return
    seen[k] = len(pool); pool.append(g)
for g in wd:
    plats = {PLAT.get(p, p) for p in g["plat"]}
    if not ({"PlayStation 4", "PlayStation 5"} & plats): continue
    add({"t": g["t"], "w": g.get("w"), "rel": g.get("rel"), "pub": sorted({normpub(p) for p in g["pub"] if not re.fullmatch(r"Q\d+", p)}),
         "dev": [d for d in g["dev"] if not re.fullmatch(r"Q\d+", d)], "ser": [s for s in g["ser"] if not re.fullmatch(r"Q\d+", s)],
         "plats": sorted(plats), "src": "wd", "free": any(FREE.search(x) for x in g["gen"] + g["mode"]),
         "multi": any(re.search(r"multiplayer|online|co-op|cooperative", x, re.I) for x in g["mode"]),
         "mc": g.get("mc"), "mcid": g.get("mcid")})
for g in wl:
    if dupe_key(g["t"]) in seen:
        p = pool[seen[dupe_key(g["t"])]]
        if len(g["t"]) < len(p["t"]) or (g.get("w") and not p.get("w")): p["t"] = g["t"]; p["w"] = g.get("w") or p.get("w")
        if not p["rel"] and g["rel"]: p["rel"] = g["rel"]
        if not p["pub"]: p["pub"] = sorted({normpub(x) for x in g["pub"]})
        if not p["dev"]: p["dev"] = g["dev"]
        continue
    add({"t": g["t"], "w": g.get("w"), "rel": g.get("rel"), "pub": sorted({normpub(x) for x in g["pub"]}), "dev": g["dev"], "ser": [],
         "plats": ["PlayStation 5" if p == "PS5" else "PlayStation 4" for p in g["p"]], "free": False, "multi": False})
# The wall's own PS4/PS5 games, so past additions that neither list has still count.
F = load("facts.json"); AB = load("about.json"); _pre = Linker(list(pool))
for g in load("games.json"):
    if not ({"PS4", "PS5"} & set(g["p"])) or dupe_key(g["t"]) in seen: continue
    if _pre.find(g["t"], (AB.get(g["id"]) or {}).get("w")) is not None: continue
    f = F.get(g["id"], {})
    add({"t": g["t"], "w": (AB.get(g["id"]) or {}).get("w"), "rel": f"{g['y']}-06-30" if g.get("y") else None,
         "pub": sorted({normpub(x) for x in f.get("pub", [])}), "dev": f.get("dev", []), "ser": [f["ser"]] if f.get("ser") else [],
         "plats": ["PlayStation 5" if p == "PS5" else "PlayStation 4" for p in g["p"] if p in ("PS4", "PS5")],
         "free": False, "multi": "m" in f.get("modes", "") or "c" in f.get("modes", "")})
# Sony's own studios: their games are Sony's, whoever Wikidata names as publisher.
SONY_STUDIOS = re.compile(r"^(sucker punch|insomniac|naughty dog|santa monica studio|guerrilla|bend studio|sie bend|media molecule|polyphony|"
                          r"bluepoint|housemarque|firesprite|haven|team asobi|japan studio|nixxes|valkyrie entertainment|"
                          r"(sie |sony )?san diego studio|(sie |sony )?london studio|pixelopus|playstation studios|sony interactive)", re.I)
for g in pool:
    g["views"] = V.get(g["w"] or "", 0) or V.get(g["t"], 0)
    if any(SONY_STUDIOS.search(d) for d in g["dev"]) and "Sony" not in g["pub"]:
        g["pub"] = sorted(set(g["pub"]) | {"Sony"})
    g["sony"] = "Sony" in g["pub"]
    g["excl"] = g.get("src") == "wd" and not g["sony"] and not any(re.search(r"Windows|Xbox|Switch|Stadia", p) for p in g["plats"])
    g["ps5"] = "PlayStation 5" in g["plats"]
    g["skey"] = norm(g["ser"][0]) if g["ser"] else series(g["t"])
    g["rm"] = rel_m(g["rel"])
    g["skip"] = g["free"] or norm_ed(g["t"]) in NEVER or norm(g["t"]) in NEVER
print("pool", len(pool), "with views", sum(1 for g in pool if g["views"]))

# ---------- history: what joined, and when ----------
L = Linker(pool)
H = load("predict-history.json"); G = load("games.json"); A = load("about.json"); CAT = load("catalogue.json")
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
if "--young" in sys.argv:
    for name, adds in (("extra", extra_add), ("monthly", ess_add)):
        ys = sorted(((pool[i]["views"], pool[i]["t"], m - pool[i]["rm"]) for i, m in adds.items() if pool[i]["rm"] is not None and m - pool[i]["rm"] < 12), reverse=True)[:8]
        print(name, "added within a year, most viewed:", ys)
    big = sorted(((g["views"], g["t"], g["rel"]) for g in pool if g["rm"] and g["rm"] >= mi("2025-12")), reverse=True)[:10]
    print("released in the last year, most viewed:", big)
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
        hit = any(a.get(i, 10**9) < m for a in src) or (i in launch and (which in (None, 0)) and m > mi("2022-06"))
        # A game Sony published counts for Sony and its own studios only: Bloodborne says nothing about
        # whether FromSoftware's own games come to PS Plus.
        names = ({"Sony"} | {d for d in g["dev"] if SONY_STUDIOS.search(d)}) if g["sony"] else set(g["pub"]) | set(g["dev"])
        for p in names: tot_p[p] += 1; hit_p[p] += hit
        for d in names: tot_d[d] += 1; hit_d[d] += hit
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

MON = ["January","February","March","April","May","June","July","August","September","October","November","December"]
def nice(d):
    return f"{MON[int(d[5:7]) - 1]} {d[:4]}" if d and len(d) >= 7 else "date not set"
def reasons(g, i, d, c, kind, m):
    """Plain-English signals for one game, strongest first, each with its direction (+1 helps, -1 hurts)."""
    where = "the Game Catalog" if kind == "extra" else "the monthly games"
    out = []
    age = d["age"]
    yrs = "under a year" if age < 12 else ("about a year" if age < 18 else f"about {round(age / 12)} years")
    def add(f, txt):
        v = c.get(f, 0)
        if abs(v) > 0.04: out.append((v, txt))
    if g["sony"] and abs(c.get("Sony game, 1 to 3 years old", 0)) > 0.04: add("Sony game, 1 to 3 years old", f"Sony's own game, {yrs} old: about when Sony tends to add its own games")
    elif g["sony"]: add("Sony game", "Sony's own game")
    if d["pub"][1]: add("publisher track record", f"{d['pub'][1]}: {d['pub'][2]} of {d['pub'][3]} of its games have joined {where}")
    if d["dev"][1] and d["dev"][1] not in g["pub"] and not g["sony"]: add("developer track record", f"{d['dev'][1]}: {d['dev'][2]} of {d['dev'][3]} of its games have joined {where}")
    if d["seq"]:
        h = d["seq"]; due = rel_m(h["rel"]) >= m
        add("sequel or follow-up due soon", f"{h['t']} {'is due' if due else 'came out'} {nice(h['rel'])}")
    add("big new release", "A big new release: usually too soon for a subscription")
    for f, txt in (("day one", "Brand new: some smaller games join on launch day"), ("under 6 months old", f"Out {max(age, 0)} months: usually too new"),
                   ("6 to 12 months old", "Out 6 to 12 months"), ("1 to 2 years old", "Out 1 to 2 years: the most common age to join"),
                   ("2 to 4 years old", "Out 2 to 4 years")):
        add(f, txt)
    if g["views"]: add("popularity", f"{'Popular' if c.get('popularity', 0) > 1.2 else 'Some interest'}: {g['views']:,} Wikipedia views in the last 60 days")
    add("PlayStation exclusive", "Only on PlayStation, from an outside publisher")
    if i in ess_add: add("was a monthly game", f"Was a monthly game in {nice(ms(ess_add[i]))}")
    add("already on Extra", "Already on the Game Catalog")
    add("multiplayer", "Multiplayer")
    out.sort(key=lambda x: -abs(x[0]))
    return [[1 if v > 0 else -1, t] for v, t in out[:6]]

def months(a, b): return list(range(mi(a), mi(b) + 1))

def first_open(kind):
    done = {mi(p["month"]) for p in H if p["kind"] == ("catalog" if kind == "extra" else "monthly")}
    if kind == "essential": done |= {mi(g["e"]) for g in G if g.get("e")}
    else: done |= {mi(m) for m in (CAT.get("addedMonths") or [])}
    m = mi(TODAY.isoformat()[:7])
    while m in done: m += 1
    return m

SNAPF = ROOT / "data" / "predict-snapshot.json"
SNAP = json.loads(SNAPF.read_text(encoding="utf-8")) if SNAPF.exists() else {}
out = {"asof": TODAY.isoformat(), "feats": FEATS}
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
    m0 = first_open(kind); tr = trk(m0, kind)
    cap = 2 * max((pool[i]["views"] for i, mm in adds.items() if pool[i]["rm"] is not None and 0 <= mm - pool[i]["rm"] < 12), default=10**9)
    where = "the Game Catalog" if kind == "extra" else "the monthly games"
    cl = list(cands(m0, kind)); rows = []
    # Age moves in steps (1 to 2 years, 2 to 4 years...), so each month's chance is averaged over the
    # months either side; the chart then changes gradually instead of jumping at a birthday.
    X = [[row(i, m0 + k, tr, kind) for k in range(-2, 14)] for i in cl]
    PP = clf.predict_proba(np.array([x for xs in X for x, _ in xs])).reshape(len(cl), 16, 2)[:, :, 1]
    P = np.stack([PP[:, k:k + 5].mean(axis=1) for k in range(12)], axis=1)
    X = [xs[2:] for xs in X]
    for n, i in enumerate(cl):
        g = pool[i]; curve = []
        for k in range(12):
            pk = float(P[n, k])
            # Nothing anywhere near this big has ever joined in its first year, and the page-view signal can't
            # learn that (old launches' views have faded), so it's a rule: wait out the first year.
            if m0 + k - g["rm"] < 12 and g["views"] > cap: pk *= 0.1
            curve.append(pk)
        p3 = 1 - (1 - curve[0]) * (1 - curve[1]) * (1 - curve[2])
        x0, detail = X[n][0]
        contrib = {f: float(c * v) for f, c, v in zip(FEATS, clf.coef_[0], x0)}
        why = reasons(g, i, detail, contrib, kind, m0)
        if m0 - g["rm"] < 12 and g["views"] > cap:
            why.insert(0, [-1, f"A huge new release: nothing this big has joined {where} in its first year"])
        rows.append({"why": why, "t": g["t"], "w": g["w"], "rel": g["rel"], "pub": g["pub"], "p": round(p3, 4),
                     "curve": [round(v * 10000) for v in curve], "views": g["views"],
                     "x": {k: v for k, v in (("m", g.get("mc")), ("mc", g.get("mcid"))) if v}})
    rows.sort(key=lambda r: -r["p"])
    for n, r in enumerate(rows): r["rank"] = n + 1
    print("   top 15 for", ms(m0), ":", [(r["t"], r["p"]) for r in rows[:15]])
    # The month's top 50 is kept so the page can show, once Sony announces it, how many we had.
    SNAP.setdefault(kind, {})[ms(m0)] = [r["t"] for r in rows[:50]]
    live = []
    for mon, tops in sorted(SNAP.get(kind, {}).items()):
        if mi(mon) >= m0: continue
        added = [x["t"] for p in H if p["month"] == mon and p["kind"] == ("catalog" if kind == "extra" else "monthly") for x in p["games"]
                 if kind == "essential" or x["tier"] == "Extra"]
        if not added: continue
        topk = {dupe_key(t) for t in tops}
        live.append({"month": mon, "added": len(added), "found": [t for t in added if dupe_key(t) in topk]})
    out[kind] = {"backtest": res, "weights": coef, "top": rows, "n": len(rows), "cap": cap, "start": ms(m0), "live": live}
if "--eval" not in sys.argv:
    for k in SNAP: SNAP[k] = dict(sorted(SNAP[k].items())[-24:])
    SNAPF.write_text(json.dumps(SNAP, ensure_ascii=False, indent=1), encoding="utf-8")
    # The compact file the site's page reads: [title, 3-month chance, year, publisher, reasons, monthly curve in basis points,
    # extras: {"m": Metascore, "mc": Metacritic id} when Wikidata has them]
    page = {"asof": out["asof"], "stats": {"pool": len(pool), "views": sum(1 for g in pool if g["views"]), "wikidata": len(wd),
             "extra_linked": len(extra_add), "monthly_linked": len(ess_add), "catalogue_now": len(in_cat_now)}}
    for k in ("extra", "essential"):
        o = out[k]
        page[k] = {"n": o["n"], "start": o["start"], "weights": o["weights"], "live": o["live"],
                   "backtest": [{x: r[x] for x in ("month", "added", "top50", "found", "cands")} for r in o["backtest"]],
                   "rows": [[r["t"], r["p"], (r["rel"] or "")[:4], ", ".join(r["pub"][:2]), r["why"][:5], r["curve"]] + ([r["x"]] if r.get("x") else [])
                            for r in o["top"] if r["p"] >= 0.0005 or r["rank"] <= 3000]}
    (ROOT / "data" / "predict-page.json").write_text(json.dumps(page, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
if "--eval" not in sys.argv: (ROOT / "data" / "predict.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
