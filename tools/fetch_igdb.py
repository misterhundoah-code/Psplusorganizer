"""Look games up on IGDB (Twitch's game database) for portrait cover art and official trailer videos.

Needs the IGDB_CLIENT_ID and IGDB_CLIENT_SECRET secrets (a Twitch developer app). For now this only runs a
sample (prints what it finds) or the whole list, saved to data/igdb.json:

  { wall id: {"igdb": id, "name": IGDB name, "y": year, "cover": image_id, "cw": width, "ch": height,
              "videos": [[label, YouTube id], ...]} }   or  { wall id: {"miss": "YYYY-MM-DD"} }

Covers are served by IGDB at https://images.igdb.com/igdb/image/upload/t_cover_big_2x/<image_id>.jpg

  python tools/fetch_igdb.py --sample 24          # a spread of modern, classic and PS3 games
  python tools/fetch_igdb.py --ids a,b,c          # particular games by wall id
  python tools/fetch_igdb.py --all                # every game not looked up yet (misses retried after 14 days)
  python tools/fetch_igdb.py --all --refresh      # every game again
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLATFORMS = {7: "PS1", 8: "PS2", 9: "PS3", 38: "PSP", 46: "Vita", 48: "PS4", 167: "PS5"}


def post(url, body=None, headers=None):
    req = urllib.request.Request(url, data=(body or "").encode(), headers=headers or {}, method="POST")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(1 + attempt); continue
            raise RuntimeError(f"{url} -> {e.code} {e.read()[:200]!r}")


def token():
    cid, sec = os.environ["IGDB_CLIENT_ID"], os.environ["IGDB_CLIENT_SECRET"]
    q = urllib.parse.urlencode({"client_id": cid, "client_secret": sec, "grant_type": "client_credentials"})
    return cid, post("https://id.twitch.tv/oauth2/token?" + q)["access_token"]


def norm(t):
    t = t.lower().replace("&", "and")
    t = re.sub(r"\b(remastered|remaster|hd|the|edition|ultimate|deluxe|definitive|complete|director'?s cut|ps4|ps5)\b", " ", t)
    return re.sub(r"[^a-z0-9]+", "", t)


def find(g, cid, tok):
    title = re.sub(r"\s*\((ps1|ps2|psp|ps3|(19|20)\d\d)\)\s*$", "", g["t"], flags=re.I)
    q = (f'search "{title.replace(chr(34), "")}"; '
         "fields name,first_release_date,platforms,cover.image_id,cover.width,cover.height,"
         "videos.video_id,videos.name,category,version_parent; "
         f"where platforms = ({','.join(map(str, PLATFORMS))}); limit 10;")
    rows = post("https://api.igdb.com/v4/games", q, {"Client-ID": cid, "Authorization": "Bearer " + tok})
    want, year = norm(title), g.get("y")
    def score(r):
        s = 0
        n = norm(r.get("name", ""))
        if n == want: s += 10
        elif want in n or n in want: s += 4
        if r.get("cover"): s += 2
        if r.get("videos"): s += 1
        if year and r.get("first_release_date"):
            ry = time.gmtime(r["first_release_date"]).tm_year
            s -= min(abs(ry - year), 6)
        if r.get("version_parent"): s -= 1
        return s
    rows.sort(key=score, reverse=True)
    return rows[0] if rows and score(rows[0]) > 2 else None, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--ids", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    if a.all:
        return run_all(a.refresh)
    d = json.loads((ROOT / "data/games.json").read_text())
    G = d if isinstance(d, list) else d["games"]
    by = {g["id"]: g for g in G}
    if a.ids:
        pick = [by[i] for i in a.ids.split(",") if i in by]
    else:
        modern = [g for g in G if g.get("cat") and g.get("m")][:: max(1, len(G) // 400)][: a.sample // 2]
        classic = [g for g in G if g.get("cl") and not g.get("s3")][:: 9][: a.sample // 4]
        ps3 = [g for g in G if g.get("s3")][:: 23][: a.sample - len(modern) - len(classic)]
        pick = modern + classic + ps3
    cid, tok = token()
    found = 0; vids = 0
    for g in pick:
        try:
            r, rows = find(g, cid, tok)
        except Exception as e:
            print(f"!! {g['t']}: {e}"); continue
        kind = "PS3" if g.get("s3") else "classic" if g.get("cl") else "modern"
        if not r:
            print(f"-- [{kind}] {g['t']} ({g.get('y')}): no match. Candidates: {[x.get('name') for x in rows[:4]]}")
            continue
        found += 1
        ry = time.gmtime(r["first_release_date"]).tm_year if r.get("first_release_date") else "?"
        cov = r.get("cover") or {}
        cover = f"https://images.igdb.com/igdb/image/upload/t_cover_big_2x/{cov['image_id']}.jpg" if cov.get("image_id") else "none"
        vs = r.get("videos") or []
        vids += bool(vs)
        print(f"OK [{kind}] {g['t']} ({g.get('y')}) -> {r['name']} ({ry}) [{', '.join(PLATFORMS.get(p, str(p)) for p in r.get('platforms', []) if p in PLATFORMS)}]")
        print(f"     cover {cov.get('width')}x{cov.get('height')}: {cover}")
        for v in vs[:4]:
            print(f"     video: {v.get('name')!s:40.40} https://www.youtube.com/watch?v={v.get('video_id')}")
        time.sleep(0.3)  # IGDB allows 4 requests a second
    print(f"\n{found} of {len(pick)} matched, {vids} with at least one video.")


def entry(r):
    cov = r.get("cover") or {}
    return {"igdb": r["id"], "name": r.get("name"),
            "y": time.gmtime(r["first_release_date"]).tm_year if r.get("first_release_date") else None,
            "cover": cov.get("image_id"), "cw": cov.get("width"), "ch": cov.get("height"),
            "videos": [[v.get("name") or "Trailer", v["video_id"]] for v in (r.get("videos") or []) if v.get("video_id")]}


def run_all(refresh):
    d = json.loads((ROOT / "data/games.json").read_text())
    G = d if isinstance(d, list) else d["games"]
    out_path = ROOT / "data/igdb.json"
    out = {} if refresh or not out_path.exists() else json.loads(out_path.read_text())
    today = time.strftime("%Y-%m-%d")
    retry = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 14 * 86400))
    todo = [g for g in G if g["id"] not in out or (out[g["id"]].get("miss") and out[g["id"]]["miss"] <= retry)]
    print(f"{len(G)} games, {len(todo)} to look up.")
    cid, tok = token()
    hit = miss = 0
    for i, g in enumerate(todo):
        try:
            r, _ = find(g, cid, tok)
        except Exception as e:
            print(f"!! {g['t']}: {e}"); time.sleep(2); continue
        if r:
            out[g["id"]] = entry(r); hit += 1
        else:
            out[g["id"]] = {"miss": today}; miss += 1
        if i % 100 == 99:
            print(f"  {i + 1} done ({hit} found, {miss} not)"); out_path.write_text(json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        time.sleep(0.26)  # IGDB allows 4 requests a second
    keep = {g["id"] for g in G}
    out = {k: v for k, v in out.items() if k in keep}
    out_path.write_text(json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    have = [v for v in out.values() if v.get("igdb")]
    print(f"Done: {hit} found and {miss} not this run. In the file: {len(have)} of {len(out)} matched, "
          f"{sum(1 for v in have if v.get('cover'))} with covers, {sum(1 for v in have if v.get('videos'))} with videos.")
    for k, v in out.items():
        if v.get("miss"): print("   no match:", k)


if __name__ == "__main__":
    main()
