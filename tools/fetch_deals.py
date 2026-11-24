#!/usr/bin/env python3
"""PlayStation Store deals for one store region (prototype: en-ca).

Reads the store's public Deals pages (no sign-in, the same pages anyone can browse), collects every
discounted product with its sale price, regular price, discount and end date, and matches them to games
on the wall by the store IDs in data/psn-ids.json, falling back to the name.

Writes data/deals.json and a readable log, data/deals-log.txt (which categories the Deals page offered,
what a product record looks like, and what matched), for checking the prototype.

  python tools/fetch_deals.py            # en-ca
  python tools/fetch_deals.py en-gb
"""
import json, re, sys, time, unicodedata
from datetime import datetime, timezone
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent.parent
LOC = sys.argv[1] if len(sys.argv) > 1 else "en-ca"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": f"{LOC[:2]}-{LOC[3:].upper()},en;q=0.8"})
LOG = []


def log(*a):
    line = " ".join(str(x) for x in a)
    print(line)
    LOG.append(line)


def get(url):
    for attempt in range(3):
        try:
            r = S.get(url, timeout=60)
            if r.status_code == 200:
                return r.text
            log("HTTP", r.status_code, url)
        except requests.RequestException as e:
            log("error", e, url)
        time.sleep(3 * (attempt + 1))
    return ""


def next_data(html):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def products(html):
    """Every record on the page that carries a discounted price."""
    nd = next_data(html)
    out = []
    if nd is not None:
        for d in walk(nd):
            p = d.get("price")
            if isinstance(p, dict) and p.get("discountedPrice") and d.get("name"):
                out.append(d)
    return out, nd


def total_of(nd):
    for d in walk(nd or {}):
        for k in ("totalCount", "total"):
            if isinstance(d.get(k), int) and d.get(k) > 0 and "pageInfo" in str(d)[:400]:
                return d[k]
    for d in walk(nd or {}):
        pi = d.get("pageInfo")
        if isinstance(pi, dict) and isinstance(pi.get("totalCount"), int):
            return pi["totalCount"]
    return None


def norm(t):
    t = re.sub("[™®©]", "", t or "")
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def main():
    games = json.loads((ROOT / "data" / "games.json").read_text(encoding="utf-8"))
    ids = json.loads((ROOT / "data" / "psn-ids.json").read_text(encoding="utf-8"))
    by_concept, by_title = ids.get("c", {}), ids.get("t", {})
    by_name = {}
    for g in games:
        by_name.setdefault(norm(g["t"]), g["id"])

    home = get(f"https://store.playstation.com/{LOC}/pages/deals")
    cats = []
    for m in re.finditer(rf'href="/{LOC}/category/([0-9a-f-]{{36}})(?:/\d+)?"[^>]*>(.*?)</a>', home, re.S):
        label = re.sub(r"<[^>]+>", " ", m.group(2))
        label = re.sub(r"\s+", " ", label).strip()[:80]
        if m.group(1) not in [c for c, _ in cats]:
            cats.append((m.group(1), label))
    for c in re.findall(rf'/{LOC}/category/([0-9a-f-]{{36}})', home):
        if c not in [x for x, _ in cats]:
            cats.append((c, ""))
    log(f"Deals page: {len(home)} bytes, {len(cats)} categories linked")
    for c, label in cats[:30]:
        log("  category", c, label)

    # Size each category from its first page; the biggest is taken as "all deals".
    sized = []
    for c, label in cats[:12]:
        html = get(f"https://store.playstation.com/{LOC}/category/{c}/1")
        ps, nd = products(html)
        tot = total_of(nd)
        log(f"  {c} '{label}': page 1 has {len(ps)} discounted products, total {tot}")
        sized.append((tot or len(ps), c, label, ps))
        time.sleep(1)
    if not sized:
        log("No categories found; stopping.")
        return finish({}, None, 0, 0)
    sized.sort(reverse=True)
    total, cat, label, first = sized[0]
    log(f"Using {cat} '{label}', about {total} products")
    if first:
        sample = {k: v for k, v in first[0].items() if k not in ("media", "__typename")}
        log("Sample product record:", json.dumps(sample)[:1500])

    seen, recs = set(), []
    page, per = 1, max(len(first), 1)
    while True:
        html = get(f"https://store.playstation.com/{LOC}/category/{cat}/{page}") if page > 1 else None
        ps = first if page == 1 else products(html)[0]
        new = [p for p in ps if p.get("id") not in seen]
        if not new:
            break
        for p in new:
            seen.add(p.get("id"))
            recs.append(p)
        page += 1
        if page > 200 or (total and len(recs) >= total):
            break
        time.sleep(0.8)
    log(f"Collected {len(recs)} discounted products over {page - 1} pages")

    deals, unmatched = {}, []
    for p in recs:
        pid, name = p.get("id") or "", p.get("name") or ""
        gid = None
        if p.get("conceptId") and str(p["conceptId"]) in by_concept:
            gid = by_concept[str(p["conceptId"])]
        if not gid:
            m = re.search(r"(CUSA\d{5}_00|PPSA\d{5}_00)", pid)
            if m and m.group(1) in by_title:
                gid = by_title[m.group(1)]
        if not gid:
            gid = by_name.get(norm(name))
        if not gid:
            unmatched.append(name)
            continue
        pr = p["price"]
        rec = {"name": name, "price": pr.get("discountedPrice"), "base": pr.get("basePrice"),
               "off": pr.get("discountText"), "until": pr.get("endTime"), "plus": bool(pr.get("isTiedToSubscription")),
               "url": f"https://store.playstation.com/{LOC}/product/{pid}" if pid else ""}
        # One deal per game: keep the cheapest edition.
        def cents(s):
            m = re.sub(r"[^\d]", "", s or "")
            return int(m) if m else 10 ** 9
        if gid not in deals or cents(rec["price"]) < cents(deals[gid]["price"]):
            deals[gid] = rec
    log(f"Matched {len(deals)} wall games; {len(unmatched)} products not on the wall")
    log("Some unmatched:", "; ".join(unmatched[:25]))
    finish(deals, cat, len(recs), len(unmatched))


def finish(deals, cat, n, un):
    out = {"asOf": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "region": LOC, "category": cat,
           "products": n, "unmatched": un, "deals": dict(sorted(deals.items()))}
    (ROOT / "data" / "deals.json").write_text(json.dumps(out, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    (ROOT / "data" / "deals-log.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
