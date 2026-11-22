"""Shared helpers for the prediction list: title and publisher normalising, and
linking announcement games and wall games to the Wikipedia pool."""
import json, re, unicodedata
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
load = lambda n: json.loads((ROOT / "data" / n).read_text(encoding="utf-8"))

EDITION = re.compile(r"\b(digital deluxe|deluxe|ultimate|complete|definitive|gold|goty|game of the year|standard|enhanced|"
                     r"director'?s cut|remastered|remaster|ps4 (&|and) ps5|ps5|ps4|edition|bundle|collection|"
                     r"the official (video )?game( of the [a-z ]+)?)\b")
def norm(t):
    t = re.sub(r"['’`]", "", t)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"^tom clancys ", "", t)
    t = re.sub(r"[™®©]", "", t).replace("&", " and ")
    t = re.sub(r"\(.*?\)", " ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return t
def squash(t): return norm(t).replace(" ", "")
def norm_ed(t):
    t = norm(re.split(r"\s[–—-]\s", t)[0])
    return re.sub(r"\s+", " ", EDITION.sub(" ", t)).strip()

ROMAN = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"}
def series(t):
    """Rough franchise key: the title before any subtitle, without numbers. 'Death Stranding 2: On the Beach' -> 'death stranding'."""
    t = norm(re.split(r":|\s[–—-]\s", t)[0])
    words = [w for w in t.split() if not (w.isdigit() or w in ROMAN)]
    words = [w for w in words if w not in ("the", "remastered", "remake")]
    return " ".join(words[:3]) or t

PUB = [(r"sony|playstation (publishing|studios)|^sie$|^scea|^scee|^scej", "Sony"),
       (r"^focus (home )?(interactive|entertainment)", "Focus Entertainment"),
       (r"^koei tecmo", "Koei Tecmo"), (r"^bandai namco", "Bandai Namco"), (r"^namco", "Bandai Namco"),
       (r"^warner bros", "Warner Bros. Games"), (r"^wb games", "Warner Bros. Games"),
       (r"^2k( games)?$", "2K"), (r"^activision", "Activision"), (r"^bethesda", "Bethesda"),
       (r"^square enix", "Square Enix"), (r"^electronic arts|^ea( sports)?$", "Electronic Arts"),
       (r"^ubisoft", "Ubisoft"), (r"^sega", "Sega"), (r"^capcom", "Capcom"), (r"^thq nordic|^plaion|^deep silver|^koch", "Plaion / THQ Nordic"),
       (r"^xbox game studios|^microsoft", "Xbox Game Studios"), (r"^nis america|^nippon ichi", "NIS America"),
       (r"^devolver", "Devolver Digital"), (r"^annapurna", "Annapurna Interactive"), (r"^505", "505 Games"),
       (r"^take-two", "2K"), (r"^konami", "Konami"), (r"^team ?17", "Team17"), (r"^nacon|^bigben", "Nacon"),
       (r"^paradox", "Paradox Interactive"), (r"^fromsoftware", "FromSoftware"), (r"^atlus", "Atlus"),
       (r"^disney|^lucasfilm", "Disney / Lucasfilm"), (r"^raw fury", "Raw Fury"), (r"^humble", "Humble Games"),
       (r"^ratalaika", "Ratalaika Games"), (r"^eastasiasoft", "Eastasiasoft"), (r"^hamster", "Hamster")]
def pub(n):
    s = n.strip().lower()
    for rx, out in PUB:
        if re.search(rx, s): return out
    return n.strip()

class Linker:
    """Finds the pool entry for a title from an announcement or the wall."""
    def __init__(self, pool):
        self.pool = pool; self.by = {}; self.byed = {}; self.byw = {}
        for i, g in enumerate(pool):
            self.by.setdefault(norm(g["t"]), i); self.byed.setdefault(norm_ed(g["t"]), i)
            if g.get("w"): self.byw.setdefault(g["w"].lower(), i)
            self.bysq = getattr(self, "bysq", {}); self.bysq.setdefault(squash(g["t"]), i)
    def find(self, t, w=None):
        if w and w.lower() in self.byw: return self.byw[w.lower()]
        for k, d in ((norm(t), self.by), (norm_ed(t), self.byed), (norm_ed(t), self.by), (squash(t), self.bysq), (norm_ed(t).replace(" ", ""), self.bysq)):
            if k in d: return d[k]
        k = norm_ed(t)
        cands = [i for kk, i in self.byed.items() if kk and (k.startswith(kk + " ") or kk.startswith(k + " ")) and min(len(k), len(kk)) >= 8]
        return cands[0] if len(cands) == 1 else None
