/* PS Plus Rental Wall: copy my PlayStation library.
   This is the code inside the "Copy my PlayStation library" bookmark. It runs on Sony's own site
   (library.playstation.com), where you're already signed in, and asks Sony for two lists using that
   sign-in: the games you've bought or claimed, and the PS4/PS5 games you've played. It then copies them
   to your clipboard so you can paste them into the wall. It never sees your password, and sends nothing
   anywhere except to Sony. These are the same requests Sony's own pages make; Sony could change them at
   any time, in which case this shows an error and nothing is copied. */
(async () => {
  const API = "https://web.np.playstation.com/api/graphql/v1/op";
  const PURCHASED = "827a423f6a8ddca4107ac01395af2ec0eafd8396fc7fa204aaf9b7ed2eefa168";
  const PLAYED = "e780a6d8b921ef0c59ec01ea5c5255671272ca0d819edb61320914cf7a78b3ae";
  const box = document.createElement("div");
  box.setAttribute("style", "position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);max-width:min(520px,calc(100vw - 24px));" +
    "background:#FFC925;color:#0E1636;border:3px solid #0E1636;box-shadow:6px 6px 0 #0E1636;padding:16px 18px;font:15px/1.45 system-ui,sans-serif");
  const say = (html) => { box.innerHTML = '<b style="font-size:17px">PS Plus Rental Wall</b><div style="margin-top:6px">' + html + "</div>"; };
  document.body.appendChild(box);
  if (!/(^|\.)playstation\.com$/.test(location.hostname)) {
    say('Open <a href="https://library.playstation.com/recently-purchased" style="color:#1E3A9E">library.playstation.com</a>, sign in, then tap this bookmark again.');
    return;
  }
  say("Reading your library from Sony…");
  const q = async (name, hash, vars) => {
    const u = new URL(API);
    u.searchParams.set("operationName", name);
    u.searchParams.set("variables", JSON.stringify(vars));
    u.searchParams.set("extensions", JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }));
    const r = await fetch(u, { credentials: "include", headers: { "content-type": "application/json" } });
    if (!r.ok) throw new Error(name + " " + r.status);
    const j = await r.json();
    if (j.errors && !j.data) throw new Error(name + ": " + (j.errors[0] && j.errors[0].message || "error"));
    return j.data;
  };
  const owned = [], played = [];
  let err = "";
  try {
    for (let start = 0, page = 0; page < 40; page++, start += 100) {
      const d = await q("getPurchasedGameList", PURCHASED, { isActive: true, platform: ["ps4", "ps5"], size: 100, start, sortBy: "ACTIVE_DATE", sortDirection: "desc" });
      const games = (d && d.purchasedTitlesRetrieve && d.purchasedTitlesRetrieve.games) || [];
      for (const g of games) owned.push({ n: g.name, c: g.conceptId, t: g.titleId, pf: g.platform, plus: g.membership === "PS_PLUS" ? 1 : 0, img: g.image && g.image.url, pid: g.productId });
      if (games.length < 100) break;
    }
  } catch (e) { err += "Bought and claimed games: " + e.message + ". "; }
  try {
    let d = null;
    for (const limit of [1000, 200, 50]) {
      try { d = await q("getUserGameList", PLAYED, { limit, categories: "ps4_game,ps5_native_game" }); break; } catch (e) { if (limit === 50) throw e; }
    }
    for (const g of (d && d.gameLibraryTitlesRetrieve && d.gameLibraryTitlesRetrieve.games) || [])
      played.push({ n: g.name, c: g.conceptId, t: g.titleId, pf: g.platform, last: g.lastPlayedDateTime });
  } catch (e) { err += "Played games: " + e.message + "."; }
  if (!owned.length && !played.length) {
    say("Couldn't read your library. Make sure you're signed in on this page, then try again." +
      '<div style="font-size:12px;margin-top:6px;opacity:.8">' + err.replace(/</g, "&lt;") + "</div>");
    return;
  }
  const text = JSON.stringify({ app: "psplus-import", v: 1, at: new Date().toISOString(), owned, played });
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
  say((copied ? "Copied" : "Found") + " <b>" + owned.length + "</b> bought or claimed games and <b>" + played.length + "</b> played games." +
    (copied ? " Go back to the wall and paste them into the import box." : ' Copy the text below, then paste it into the import box on the wall.<textarea readonly style="display:block;width:100%;height:90px;margin-top:8px">' + text.replace(/</g, "&lt;") + "</textarea>") +
    (err ? '<div style="margin-top:8px;padding:6px 8px;background:#fff;border:2px solid #0E1636;font-size:13px"><b>Part of it didn\'t work:</b> ' + err.replace(/</g, "&lt;") + "</div>" : "") +
    '<div style="margin-top:8px"><button style="font:inherit;font-weight:700;padding:4px 10px;border:2px solid #0E1636;background:#fff;cursor:pointer">Close</button></div>');
  box.querySelector("button").onclick = () => box.remove();
  const ta = box.querySelector("textarea"); if (ta) ta.select();
})();
