#!/usr/bin/env python3
"""More about each game from IGDB: genres, themes, modes, makers, age ratings, series and similar games.

Runs in GitHub Actions after tools/fetch_igdb.py (see .github/workflows/igdb.yml), using the IGDB ids that
script matched (data/igdb.json). Asks IGDB for 500 games at a time and writes data/igdb-meta.json:

  {"asOf": "2026-11-28",
   "games": {wall id: {
      "gen": ["Role-playing (RPG)", ...],  IGDB genres
      "th":  ["Fantasy", "Open world"],    themes
      "mo":  ["Single player", "Co-operative", "Split screen", ...],  game modes
      "pp":  ["Third person"],             player perspectives
      "dev": ["FromSoftware"], "pub": ["Bandai Namco Entertainment"],
      "esrb": "M", "pegi": 16,             age ratings, where IGDB has them
      "ser": "Dark Souls",                 franchise, or else IGDB's collection (series)
      "r": 89, "rc": 1520,                 IGDB's combined rating and how many ratings it's from
      "kw": ["boss fight", ...],           up to 12 keywords
      "mp": {"cc": 1, "oc": 1, "ss": 1, "lmax": 4, "omax": 8},  co-op and player counts on PS4/PS5:
             campaign co-op, couch co-op, online co-op, split screen, most players on one console, online
      "sim": [wall ids]                    IGDB's similar games that are also on the wall
   }}}

Fields IGDB doesn't have for a game are left out rather than written empty.
"""
import json
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_igdb import post, token  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PS = {48, 167}  # PS4, PS5: multiplayer details are per platform
FIELDS = ("fields genres.name,themes.name,game_modes.name,player_perspectives.name,"
          "involved_companies.company.name,involved_companies.developer,involved_companies.publisher,"
          "age_ratings.organization.name,age_ratings.rating_category.rating,age_ratings.category,age_ratings.rating,"
          "franchises.name,collection.name,collections.name,total_rating,total_rating_count,keywords.name,similar_games,"
          "multiplayer_modes.platform,multiplayer_modes.campaigncoop,multiplayer_modes.offlinecoop,"
          "multiplayer_modes.onlinecoop,multiplayer_modes.splitscreen,multiplayer_modes.offlinemax,"
          "multiplayer_modes.offlinecoopmax,multiplayer_modes.onlinemax,multiplayer_modes.onlinecoopmax;")
# The older numbered age-rating fields, for games IGDB hasn't moved to the newer named ones.
OLD_ORG = {1: "ESRB", 2: "PEGI"}
OLD_RATING = {1: 3, 2: 7, 3: 12, 4: 16, 5: 18, 6: "RP", 7: "EC", 8: "E", 9: "E10+", 10: "T", 11: "M", 12: "AO"}


def names(r, key):
    return [x["name"] for x in (r.get(key) or []) if isinstance(x, dict) and x.get("name")]


def ratings(r):
    esrb = pegi = None
    for a in r.get("age_ratings") or []:
        org = (a.get("organization") or {}).get("name") if isinstance(a.get("organization"), dict) else OLD_ORG.get(a.get("category"))
        val = (a.get("rating_category") or {}).get("rating") if isinstance(a.get("rating_category"), dict) else OLD_RATING.get(a.get("rating"))
        if not org or val is None:
            continue
        if org == "ESRB" and not esrb:
            esrb = str(val).replace("E10", "E10+").replace("E10++", "E10+")
        if org == "PEGI" and not pegi:
            try:
                pegi = int(str(val).replace("PEGI", "").strip())
            except ValueError:
                pass
    return esrb, pegi


def multiplayer(r):
    out = {}
    for m in r.get("multiplayer_modes") or []:
        if m.get("platform") and m["platform"] not in PS:
            continue
        for k, f in (("cc", "campaigncoop"), ("lc", "offlinecoop"), ("oc", "onlinecoop"), ("ss", "splitscreen")):
            if m.get(f):
                out[k] = 1
        lmax = max(m.get("offlinemax") or 0, m.get("offlinecoopmax") or 0)
        omax = max(m.get("onlinemax") or 0, m.get("onlinecoopmax") or 0)
        if lmax > out.get("lmax", 0):
            out["lmax"] = lmax
        if omax > out.get("omax", 0):
            out["omax"] = omax
    return out


def main():
    ig = json.loads((ROOT / "data/igdb.json").read_text(encoding="utf-8"))
    ours = {}   # IGDB id -> wall ids (an IGDB game can sit behind more than one wall entry)
    for wid, e in ig.items():
        if isinstance(e, dict) and e.get("igdb"):
            ours.setdefault(e["igdb"], []).append(wid)
    cid, tok = token()
    head = {"Client-ID": cid, "Authorization": "Bearer " + tok}
    ids, rows = sorted(ours), {}
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        got = post("https://api.igdb.com/v4/games", FIELDS + f" where id = ({','.join(map(str, chunk))}); limit 500;", head)
        for r in got:
            rows[r["id"]] = r
        print(f"{len(rows)} of {len(ids)} fetched")
        time.sleep(0.3)
    out = {}
    for gid, r in rows.items():
        devs = [c["company"]["name"] for c in (r.get("involved_companies") or []) if c.get("developer") and isinstance(c.get("company"), dict)]
        pubs = [c["company"]["name"] for c in (r.get("involved_companies") or []) if c.get("publisher") and isinstance(c.get("company"), dict)]
        esrb, pegi = ratings(r)
        ser = (names(r, "franchises") or [None])[0] or ((r.get("collection") or {}).get("name") if isinstance(r.get("collection"), dict) else None) or (names(r, "collections") or [None])[0]
        sim = sorted({w for s in (r.get("similar_games") or []) for w in ours.get(s, [])})
        e = {"gen": names(r, "genres"), "th": names(r, "themes"), "mo": names(r, "game_modes"), "pp": names(r, "player_perspectives"),
             "dev": devs[:3], "pub": pubs[:3], "esrb": esrb, "pegi": pegi, "ser": ser,
             "r": round(r["total_rating"]) if r.get("total_rating") else None, "rc": r.get("total_rating_count"),
             "kw": names(r, "keywords")[:12], "mp": multiplayer(r)}
        e = {k: v for k, v in e.items() if v not in (None, [], {}, "")}
        for wid in ours[gid]:
            out[wid] = dict(e, sim=[s for s in sim if s != wid]) if sim else e
    (ROOT / "data/igdb-meta.json").write_text(json.dumps({"asOf": date.today().isoformat(), "games": dict(sorted(out.items()))},
                                                          ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    have = lambda k: sum(1 for v in out.values() if k in v)
    print(f"Wrote {len(out)} games: genres {have('gen')}, themes {have('th')}, modes {have('mo')}, developer {have('dev')}, "
          f"ESRB {have('esrb')}, PEGI {have('pegi')}, series {have('ser')}, co-op details {have('mp')}, similar on the wall {have('sim')}")


if __name__ == "__main__":
    main()
