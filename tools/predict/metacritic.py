"""Metacritic scores from Wikipedia articles' review tables ({{Video game reviews}}), for the predictions page.

Wikidata holds a Metascore for only a few hundred PS4 and PS5 games, but most released games' Wikipedia articles
have one in the reception section, as the MC parameter of {{Video game reviews}}:
    | MC = PS5: 81/100<ref>...</ref><br />PC: 79/100<ref>...</ref>
We take the PS5 score, else the PS4 one, else the only score given when no platform is named.
"""
import re

_REF = re.compile(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", re.S | re.I)
_COMMENT = re.compile(r"<!--.*?-->", re.S)
_TEMPLATE = re.compile(r"\{\{\s*video game reviews", re.I)


def _template(text):
    """The body of the first {{Video game reviews}} template, braces balanced."""
    m = _TEMPLATE.search(text)
    if not m:
        return None
    depth, i = 0, m.start()
    while i < len(text) - 1:
        two = text[i:i + 2]
        if two == "{{":
            depth += 1; i += 2; continue
        if two == "}}":
            depth -= 1; i += 2
            if depth == 0:
                return text[m.start():i]
            continue
        i += 1
    return None


def _param(body, name):
    """The raw value of a top-level |NAME = ... parameter (up to the next top-level |)."""
    depth, i, start = 0, 0, None
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1; i += 2; continue
        if two in ("}}", "]]"):
            depth -= 1; i += 2; continue
        if body[i] == "|" and depth == 1:
            if start is not None:
                return body[start:i]
            m = re.match(r"\|\s*" + re.escape(name) + r"\s*=", body[i:], re.I)
            if m:
                start = i + m.end()
                i = start; continue
        i += 1
    return body[start:-2] if start is not None else None


def score(text):
    """The Metascore for a game's PlayStation version from its article's wikitext, or None."""
    body = _template(text or "")
    if not body:
        return None
    raw = _param(body, "MC")
    if not raw:
        return None
    raw = _COMMENT.sub("", _REF.sub("", raw))
    raw = re.sub(r"'''?|\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", raw)
    found = re.findall(r"(?:\b(PS5|PS4|PlayStation 5|PlayStation 4|PS|PC|NS|Switch|XSXS|XSX|XONE|XOne|Xbox[^:]*|iOS|Win|NS2)\s*:\s*)?(\d{1,3})\s*/\s*100", raw, re.I)
    found = [(p.upper().replace("PLAYSTATION ", "PS"), int(v)) for p, v in found if int(v) <= 100]
    if not found:
        return None
    for want in ("PS5", "PS4"):
        for p, v in found:
            if p == want:
                return v
    if len(found) == 1 and not found[0][0]:
        return found[0][1]
    return None


if __name__ == "__main__":
    tests = [
        ("{{Video game reviews\n| MC = PS5: 81/100<ref>x</ref><br />PC: 79/100<ref name=a/>\n| OC = 85%\n}}", 81),
        ("{{Video game reviews\n|MC=(PS4) 88/100<ref>{{cite web|url=x}}</ref>\n|GSpot=8/10}}", 88),
        ("{{Video game reviews\n|MC=88/100<ref>{{cite web|url=x}}</ref>\n|GSpot=8/10}}", 88),
        ("{{Video game reviews\n|MC=PC: 90/100<br>PS4: 86/100\n}}", 86),
        ("{{Video game reviews | MC = [[PlayStation 5|PS5]]: 77/100 }}", 77),
        ("{{Video game reviews\n|MC=PC: 90/100\n}}", None),
        ("No table here", None),
    ]
    for t, want in tests:
        got = score(t)
        print("ok " if got == want else "BAD", want, got)
