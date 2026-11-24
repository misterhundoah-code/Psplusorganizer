"""Daily Steam player counts for PS4 and PS5 games, kept as a history for the predictions model.

Steam's public API gives only the number playing right now (no key needed), so this records one reading a day,
at the same time each day, and the history builds up from there. Games are matched to Steam through Wikidata's
Steam application ID (P1733).

Writes:
  data/steam-players/apps.json       {appid: [Wikidata id, title]}, refreshed each run
  data/steam-players/YYYY-MM.json    {"days": ["YYYY-MM-DD", ...], "apps": {appid: [count or null per day]}}
"""
import datetime
import json
import pathlib
import sys
import time

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "steam-players"
UA = {"User-Agent": "WallOfPSPlus/1.0 (https://wallofpsplus.com; https://github.com/misterhundoah-code/Psplusorganizer)"}
COUNT = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/"


def sparql(q):
    for attempt in range(4):
        try:
            r = requests.get("https://query.wikidata.org/sparql", params={"query": q, "format": "json"},
                             headers={**UA, "Accept": "application/sparql-results+json"}, timeout=120)
            if r.status_code == 200:
                return r.json()["results"]["bindings"]
            print("sparql", r.status_code)
        except Exception as e:
            print("sparql", e)
        time.sleep(20 * (attempt + 1))
    return None


def steam_apps():
    """Every PS4 or PS5 game on Wikidata with a Steam application ID."""
    apps = {}
    for console in ("Q5014725", "Q63184502"):   # PlayStation 4, PlayStation 5
        rows = sparql(f"""SELECT ?g ?id ?t WHERE {{ ?g wdt:P400 wd:{console} ; wdt:P1733 ?id .
          OPTIONAL {{ ?g rdfs:label ?t . FILTER(LANG(?t) = "en") }} }}""")
        if rows is None:
            sys.exit("::error::Wikidata didn't answer; no readings taken today.")
        for b in rows:
            appid = b["id"]["value"].strip()
            if appid.isdigit():
                apps.setdefault(appid, [b["g"]["value"].rsplit("/", 1)[1], b.get("t", {}).get("value", "")])
        time.sleep(3)
    return apps


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    apps = steam_apps()
    print("games with a Steam id:", len(apps))
    (OUT / "apps.json").write_text(json.dumps(dict(sorted(apps.items(), key=lambda kv: int(kv[0]))), ensure_ascii=False,
                                              separators=(",", ":")) + "\n", encoding="utf-8")
    today = datetime.datetime.now(datetime.timezone.utc).date()
    path = OUT / f"{today:%Y-%m}.json"
    month = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"days": [], "apps": {}}
    if today.isoformat() in month["days"]:
        print("Already have today's readings.")
        return
    s = requests.Session(); s.headers.update(UA)
    got = {}
    for n, appid in enumerate(apps, 1):
        for attempt in range(3):
            try:
                r = s.get(COUNT, params={"appid": appid}, timeout=20)
                if r.status_code == 429:
                    time.sleep(30 * (attempt + 1)); continue
                j = r.json().get("response", {})
                if j.get("result") == 1:
                    got[appid] = int(j.get("player_count", 0))
                break       # result 42 and the like: no count for this app (not a game, or unreleased)
            except Exception:
                time.sleep(5)
        time.sleep(0.25)    # about four requests a second
        if n % 500 == 0:
            print(f"  {n} of {len(apps)}")
    # A run that got very few answers (Steam down or blocking us) would leave a hole that looks like a crash in
    # every game's numbers, so it isn't saved.
    if len(got) < 0.5 * len(apps):
        sys.exit(f"::error::Only {len(got)} of {len(apps)} games answered; not saving today's readings.")
    k = len(month["days"])
    month["days"].append(today.isoformat())
    for appid in set(month["apps"]) | set(got):
        row = month["apps"].setdefault(appid, [None] * k)
        row += [None] * (k - len(row))
        row.append(got.get(appid))
    month["apps"] = dict(sorted(month["apps"].items(), key=lambda kv: int(kv[0])))
    path.write_text(json.dumps(month, separators=(",", ":")).replace('],"', '],\n"') + "\n", encoding="utf-8")
    top = sorted(got.items(), key=lambda kv: -kv[1])[:5]
    print(f"Saved {len(got)} readings for {today}. Most played: " + ", ".join(f"{apps[a][1]} {c:,}" for a, c in top))


if __name__ == "__main__":
    main()
