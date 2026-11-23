#!/usr/bin/env python3
"""Fetch OpenCritic scores for games on the wall, through OpenCritic's official API on RapidAPI.

OpenCritic's API terms (summarised; see README):
  - every page that shows OpenCritic data links (do-follow) to OpenCritic, to the game's own page where there is one;
  - a Top Critic Average is shown with OpenCritic's name or full logo next to it, linked to the game page;
  - no competing aggregator, and no reselling the data through an API of our own;
  - if OpenCritic asks, all OpenCritic data is deleted within 60 days. Everything we keep lives in
    data/opencritic.json and nowhere else, so deleting that one file (and rebuilding) removes it all.

The free plan has a small daily allowance, so each run spends at most --budget requests and
remembers its progress. Games are matched by title and checked against the release year;
games it can't match are tried again after 90 days, and matched games are refreshed every 30.

  python tools/fetch_opencritic.py               # normal run (needs OPENCRITIC_KEY)
  python tools/fetch_opencritic.py --budget 100
  python tools/fetch_opencritic.py --probe "Bloodborne"   # print what the API returns, save nothing
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
from datetime import date, timedelta
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
GAMES = ROOT / "data" / "games.json"
OUT = ROOT / "data" / "opencritic.json"
HOST = "opencritic-api.p.rapidapi.com"
REFRESH_DAYS, RETRY_DAYS = 30, 90
EDITION = re.compile(r"\b(remastered|remaster|definitive|deluxe|complete|ultimate|digital|enhanced|director'?s cut|"
                     r"game of the year|goty|standard|anniversary|hd|ps4|ps5|edition)\b")


class OutOfQuota(Exception):
    pass


def norm(t, strip_edition=False):
    t = re.sub("[\u2122\u00ae\u00a9]", "", t)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    t = t.replace("&", " and ")
    if strip_edition:
        t = EDITION.sub(" ", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


class Api:
    def __init__(self, key, budget):
        self.s = requests.Session()
        self.s.headers.update({"X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST, "User-Agent": "wallofpsplus.com"})
        self.left = budget
        self.used = 0

    def get(self, path, **params):
        if self.left <= 0:
            raise OutOfQuota("run budget spent")
        self.left -= 1
        self.used += 1
        r = self.s.get(f"https://{HOST}{path}", params=params, timeout=30)
        time.sleep(1.1)
        if r.status_code == 429:
            raise OutOfQuota("API says the daily allowance is used up (429)")
        if r.status_code in (401, 403):
            raise SystemExit(f"::error::OpenCritic API refused the key ({r.status_code}): {r.text[:200]}")
        if not r.ok:
            raise SystemExit(f"::error::OpenCritic API error {r.status_code} on {path}: {r.text[:200]}")
        return r.json()


def match(api, g):
    """Return an OpenCritic record for game g, or None."""
    hits = api.get("/game/search", criteria=g["t"]) or []
    want, want_loose = norm(g["t"]), norm(g["t"], True)
    cands = [h for h in hits if norm(h.get("name", "")) == want] or \
            [h for h in hits if norm(h.get("name", ""), True) == want_loose]
    for h in cands[:2]:
        d = api.get(f"/game/{h['id']}")
        yr = int((d.get("firstReleaseDate") or "0")[:4] or 0)
        plats = {p.get("shortName") for p in d.get("Platforms") or []}
        # Our year can be a re-release's, so only reject an OpenCritic game that came out well after ours
        # (a remake or reboot with the same name), or one with no PlayStation release that's far off.
        if g.get("y") and yr and (yr > g["y"] + 1 or (not plats & {"PS4", "PS5", "PS3"} and abs(yr - g["y"]) > 3)):
            continue
        return record(d)
    return None


def record(d):
    def num(v):
        return None if v is None or v < 0 else round(v)
    return {"oc": d["id"], "u": d.get("url") or f"https://opencritic.com/game/{d['id']}",
            "s": num(d.get("topCriticScore")), "r": num(d.get("percentRecommended")),
            "t": d.get("tier") or None, "n": d.get("numReviews") or 0, "chk": date.today().isoformat()}


def priority(g):
    old = g.get("sys") in ("PS1", "PS2", "PSP", "PS3", "Arcade")
    live = bool(g.get("cat") or g.get("cl"))
    return (old, not live, -(g.get("n") or 0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=int, default=int(os.environ.get("OC_BUDGET") or 25))
    ap.add_argument("--probe")
    a = ap.parse_args()
    key = os.environ.get("OPENCRITIC_KEY", "").strip()
    if not key:
        sys.exit("::error::No API key: add a repository secret named OPENCRITIC_KEY (or RAPIDAPI_KEY) holding the RapidAPI key.")
    api = Api(key, a.budget)
    if a.probe:
        hits = api.get("/game/search", criteria=a.probe)
        print(json.dumps(hits, indent=1)[:3000])
        if hits:
            print(json.dumps(api.get(f"/game/{hits[0]['id']}"), indent=1)[:3000])
        return

    games = json.loads(GAMES.read_text(encoding="utf-8"))
    ids = {g["id"] for g in games}
    data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    data = {k: v for k, v in data.items() if k in ids}
    today = date.today()

    def due(v, days):
        return date.fromisoformat(v["chk"]) + timedelta(days=days) <= today

    todo = [g for g in sorted(games, key=priority) if g["id"] not in data]
    retry = [g for g in sorted(games, key=priority) if g["id"] in data and "oc" not in data[g["id"]] and due(data[g["id"]], RETRY_DAYS)]
    stale = [g for g in games if "oc" in data.get(g["id"], {}) and due(data[g["id"]], REFRESH_DAYS)]
    found = missed = refreshed = 0
    try:
        for g in todo + retry:
            rec = match(api, g)
            if rec:
                data[g["id"]] = rec
                found += 1
                print(f"  {g['t']}: {rec['s']} / {rec['r']}% ({rec['u']})")
            else:
                data[g["id"]] = {"chk": today.isoformat()}
                missed += 1
        for g in stale:
            data[g["id"]] = record(api.get(f"/game/{data[g['id']]['oc']}"))
            refreshed += 1
    except OutOfQuota as e:
        print(f"Stopping: {e}.")
    finally:
        OUT.write_text(json.dumps(dict(sorted(data.items())), ensure_ascii=False, separators=(",", ":")).replace('},"', '},\n"') + "\n",
                       encoding="utf-8")
        have = sum(1 for v in data.values() if v.get("s") is not None or v.get("r") is not None)
        print(f"{api.used} requests: {found} matched, {missed} not found, {refreshed} refreshed. "
              f"{have} games with scores, {len(games) - len(data)} not looked up yet.")


if __name__ == "__main__":
    main()
