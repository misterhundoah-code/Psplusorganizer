/* The "likely to join PS Plus" page (lists/coming-to-ps-plus.html). The page is generated with the top games
   already in it, for search engines; this script loads the full list from /data/predict-page.json and adds
   the tabs, search, "show more" and a chart of each game's chances month by month.
   Row format: [title, chance over the next three months, year, publisher, reasons, monthly chances in basis points]. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fold = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthAt = (start, k) => { const y = +start.slice(0, 4), m = +start.slice(5, 7) - 1 + k; return [y + Math.floor(m / 12), m % 12]; };
  const mname = (start, k) => { const [y, m] = monthAt(start, k); return MON[m] + " " + y; };
  const pct = p => { const v = p * 100; return v >= 10 ? Math.round(v) + "%" : v >= 0.1 ? v.toFixed(1) + "%" : "<0.1%"; };
  const odds = p => p < 0.001 ? "long shot" : "1 in " + Math.round(1 / p).toLocaleString();
  const NAMES = {
    "popularity": "How popular it is", "1 to 2 years old": "Out 1 to 2 years", "2 to 4 years old": "Out 2 to 4 years",
    "6 to 12 months old": "Out 6 to 12 months", "under 6 months old": "Out less than 6 months", "day one": "Brand new (launch day)",
    "publisher track record": "Publisher's record of adding games", "developer track record": "Developer's record",
    "publisher's other track record": "Publisher's record on the other tier", "PS5 game": "On PS5", "Sony game": "Sony's own game",
    "Sony game, 1 to 3 years old": "Sony's own game, 1 to 3 years old", "PlayStation exclusive": "Only on PlayStation (outside publisher)",
    "sequel or follow-up due soon": "Sequel due soon", "was a monthly game": "Already given as a monthly game",
    "already on Extra": "Already on the Game Catalog", "multiplayer": "Multiplayer", "big new release": "Big new release"
  };
  let D = null, K = "extra", SHOW = 50;

  function chart(row, start, width) {
    // Drawn at the space it has, so the axis text stays a readable size on a phone.
    const c = row[5].map(v => v / 10000), W = Math.round(Math.max(300, Math.min(640, width || 600))), H = W < 450 ? 190 : 210, L = 44, R = 8, T = 12, B = 30, every = W < 450 ? 2 : 1;
    const top = Math.max(0.005, ...c), step = top > 0.08 ? 0.02 : top > 0.04 ? 0.01 : top > 0.02 ? 0.005 : top > 0.01 ? 0.0025 : 0.001;
    const ymax = Math.ceil(top / step) * step, y = v => T + (H - T - B) * (1 - v / ymax), bw = (W - L - R) / 12;
    let by = 1, grid = "", bars = "", labels = "";
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${+(v * 100).toFixed(2)}%</text>`;
    }
    c.forEach((v, k) => {
      by *= 1 - v;
      const [yr, m] = monthAt(start, k), x = L + k * bw + bw * 0.22, w = bw * 0.56, h = Math.max(1, y(0) - y(v)), r = Math.min(4, w / 2, h);
      const tip = `${MON[m]} ${yr}: ${pct(v)} chance of joining that month. ${pct(1 - by)} chance it has joined by then.`;
      bars += `<g class="bh" tabindex="0" aria-label="${esc(tip)}"><rect class="hit" x="${L + k * bw}" y="${T}" width="${bw}" height="${H - T - B}"/>`
        + `<path class="bar" d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z"/><title>${esc(tip)}</title></g>`;
      if (k % every === 0) labels += `<text x="${L + k * bw + bw / 2}" y="${H - 10}" class="ax" text-anchor="middle">${SHORT[m]}${m === 0 || k === 0 ? " '" + String(yr).slice(2) : ""}</text>`;
    });
    const by12 = 1 - c.reduce((a, v) => a * (1 - v), 1), hi = Math.max(...c), lo = Math.min(...c), best = c.indexOf(hi);
    const drop = c.findIndex(v => v < hi * 0.9);
    const shape = hi < lo * 1.15 ? "Its chances hold about steady all year."
      : best === 0 ? (drop > 2 ? `Its chances hold until ${mname(start, drop - 1)}, then fall.` : "Its chances are highest now and fall from here.")
      : `Its chances peak in ${mname(start, best)}.`;
    return `<p class="chartsum">${pct(by12)} chance it joins in the next 12 months. ${shape}</p>`
      + `<svg class="odds" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance of joining each month for the next 12 months">${grid}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="base"/>${bars}${labels}</svg>`
      + `<p class="tipline" aria-live="polite"></p>`;
  }

  function item(r, n, start) {
    const [t, p, y, pub, why] = r;
    return `<li class="g" data-n="${n}"><span class="n">${n}</span><div class="t"><b>${esc(t)}</b><span class="meta">${[y, pub].filter(Boolean).map(esc).join(" · ")}</span></div>`
      + `<div class="pc"><b>${pct(p)}</b><span>${odds(p)}</span></div>`
      + `<ul class="why">${why.map(([s, w]) => `<li class="${s > 0 ? "up" : "down"}">${esc(w)}</li>`).join("")}</ul>`
      + `<details class="month"><summary>Odds month by month</summary><div class="chartbox"></div></details></li>`;
  }

  function render() {
    const d = D[K], q = fold($("pq").value);
    let list = d.rows.map((r, i) => [r, i + 1]);
    if (q) { list = list.filter(([r]) => fold(r[0]).includes(q)).slice(0, 30); $("pmore").hidden = true; }
    else { list = list.slice(0, SHOW); $("pmore").hidden = SHOW >= d.rows.length; }
    $("plist").innerHTML = list.length ? list.map(([r, n]) => item(r, n, d.start)).join("")
      : `<li class="empty">No game by that name among the ${d.n.toLocaleString()} we looked at. It may already be on PS Plus, be free-to-play, or be missing from Wikipedia's lists.</li>`;
    $("pwhen").textContent = `Chances are for the three months from ${mname(d.start, 0)}.`;
    const ws = Object.entries(d.weights).filter(([, v]) => Math.abs(v) >= 0.05).sort((a, b) => b[1] - a[1]), mx = Math.max(...ws.map(([, v]) => Math.abs(v)));
    $("psig").innerHTML = ws.map(([k, v]) => `<span>${esc(NAMES[k] || k)}</span><span class="sbar"><i class="${v > 0 ? "up" : "down"}" style="left:${v > 0 ? 50 : 50 - Math.abs(v) / mx * 50}%;width:${Math.abs(v) / mx * 50}%"></i></span>`).join("");
    const bt = d.backtest, tot = bt.reduce((a, r) => a + r.added, 0), hit = bt.reduce((a, r) => a + r.top50, 0);
    $("pbtnote").textContent = `We trained the model without the last 12 months, then had it rank each of them. Of the ${tot} games Sony added that we could match, ${hit} (${Math.round(hit / tot * 100)}%) were in that month's top 50, out of about ${bt[bt.length - 1].cands.toLocaleString()} candidates. Picking 50 at random would catch less than 1%.`;
    $("pbt").innerHTML = bt.slice().reverse().map(r => `<tr><td>${mname(r.month, 0)}</td><td class="num">${r.added}</td><td class="num">${r.top50}</td><td>${r.found.map(esc).join(", ") || "None"}</td></tr>`).join("");
    const live = d.live || [];
    $("plive").hidden = !live.length;
    if (live.length) $("plivebody").innerHTML = live.slice().reverse().map(r => `<tr><td>${mname(r.month, 0)}</td><td class="num">${r.added}</td><td class="num">${r.found.length}</td><td>${r.found.map(esc).join(", ") || "None"}</td></tr>`).join("");
  }

  document.addEventListener("toggle", e => {
    const det = e.target;
    if (!(det instanceof HTMLDetailsElement) || !det.classList.contains("month") || !det.open || !D) return;
    const box = det.querySelector(".chartbox"), n = +det.closest("li.g").dataset.n;
    if (!box.innerHTML) box.innerHTML = chart(D[K].rows[n - 1], D[K].start, box.clientWidth);
  }, true);
  const showTip = e => { const g = e.target.closest && e.target.closest(".bh"); if (!g) return; const p = g.closest(".chartbox").querySelector(".tipline"); p.textContent = g.getAttribute("aria-label"); };
  document.addEventListener("mouseover", showTip); document.addEventListener("focusin", showTip);

  fetch("/data/predict-page.json").then(r => r.json()).then(d => {
    D = d;
    $("ptabs").hidden = false; $("pfind").hidden = false;
    $("ptabs").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; K = b.dataset.k; SHOW = 50;
      document.querySelectorAll("#ptabs button").forEach(x => x.setAttribute("aria-selected", x === b)); render();
    });
    $("pq").addEventListener("input", render); $("pfind").addEventListener("submit", e => e.preventDefault());
    $("pmore").addEventListener("click", () => { SHOW += 50; render(); });
    const h = (location.hash || "").slice(1); if (h === "monthly") $("ptabs").querySelector('[data-k="essential"]').click(); else render();
  }).catch(() => {});
})();
