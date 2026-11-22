# PS Plus Rental Wall

A single-page site for sorting and tracking the PlayStation Plus Game Catalogue, the Premium Classics, the PS3 games Premium streams and every PS4 and PS5 monthly game since November 2013 (1,373 games as of 19 November 2026). Visitors can pick their PS Plus tier and say when they joined, and the list hides what they couldn't play.

- Sort and filter by Metacritic score, completion time, platform, style, camera view and original system
- Mark games as Now playing, Want to play, Played, Bounced off or Not interested
- Rate games you've played, add notes, and log progress and hours
- A taste profile and a "Priority for me" score built from your ratings
- Add games that aren't listed, by pasting their PlayStation Store link
- Optional accounts (no email, no name) that sync your marks across devices, encrypted in the browser

It runs as plain static files, so GitHub Pages can host it. Accounts and store lookups need a small, free Cloudflare Worker (in [`worker/`](worker/)). Without the Worker, everything still works and each visitor's marks are saved in their own browser.

## Layout

```
index.html            the app
config.js             site settings: the Worker's address, if you deploy one
terms.html            Terms of Service
privacy.html          Privacy Policy
legal.css, theme.js   shared styles for those pages, and the saved light/dark choice
fonts/                the two typefaces, self-hosted (SIL Open Font License)
art/, data/art.json   game artwork (256 x 256 WebP) and the list of games that have it
tools/fetch_art.py    downloads artwork; run weekly by .github/workflows/artwork.yml
data/games.json       the game list, one game per line
data/catalogue.json   last-updated date, leaving-soon dates and small monthly changes
worker/               the optional Cloudflare Worker (accounts and store lookups)
```

## 1. Put the site on GitHub Pages

1. Create a GitHub repository and push these files to it.
2. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick your main branch and the `/ (root)` folder, and save.
3. After a minute the site is live at `https://misterhundoah-code.github.io/Psplusorganizer/`. (This repository's own site now lives at `https://wallofpsplus.com`, served by Cloudflare; see Custom domain below.)

To try it on your own computer first, run `python3 -m http.server 8000` in this folder and open http://localhost:8000. Opening `index.html` straight from disk won't work, because the page loads its data files.

## 2. Turn on accounts and store lookups (optional)

You need a free Cloudflare account and Node.js 18 or newer.

```bash
cd worker
npm install
npx wrangler login                       # opens a browser to sign in to Cloudflare
npx wrangler d1 create psplus-sorter     # prints a database_id
```

Then edit `worker/wrangler.jsonc`:

- paste the `database_id` it printed
- set `ALLOWED_ORIGINS` to your Pages address with no path and no trailing slash, for this repository `https://misterhundoah-code.github.io` (already filled in)

Create the table and deploy:

```bash
npm run db:init       # creates the table in the live database
npm run deploy        # prints your Worker's address, e.g. https://psplus-sorter-api.your-subdomain.workers.dev
```

Finally, put that address in `config.js`:

```js
window.SORTER_CONFIG = { apiBase: "https://psplus-sorter-api.your-subdomain.workers.dev" };
```

Commit and push. A "Sign in or create an account" button now appears at the top of the page, and the Look up button in "Add a game" fills in details from the store.

Cloudflare's free plan covers this comfortably for personal use: 100,000 Worker requests and 100,000 database writes a day.

## Privacy: what the accounts do and don't keep

An account is just a username and a password. The page asks people not to use their real name or an email address, and refuses usernames containing `@`.

When someone signs in, their browser turns the username and password into three values using PBKDF2 (310,000 rounds of SHA-256):

| Value | What the server sees |
|---|---|
| Account id | A SHA-256 hash of the username |
| Login token | Only a SHA-256 hash of it |
| Encryption key | Nothing. It never leaves the browser |

Marks, ratings, notes and added games are encrypted with AES-GCM in the browser before they are sent. The database therefore holds only an account id, a hashed token, an encrypted blob, a version number and timestamps. There are no usernames, passwords, emails, names or IP addresses in it (see [`worker/schema.sql`](worker/schema.sql)). The site sets no cookies and serves its own fonts. The one outside script is Cloudflare Web Analytics, which counts visits without cookies or browser storage (the token is in the snippet at the end of each HTML page; delete those lines to switch it off). The full details are in [privacy.html](privacy.html). Cloudflare keeps its own short-lived request logs as part of running any Worker; this project doesn't add to them.

The trade-offs:

- **No password reset.** Nobody can recover a forgotten password, so the page reminds people to download a backup (Your data → Download backup).
- **No password change** in this version. To change it, someone can download a backup, delete the account, create a new one and restore the backup.
- After five wrong passwords, an account is locked for 30 seconds, doubling with each further miss up to an hour.
- New accounts are capped per day (`MAX_NEW_ACCOUNTS_PER_DAY`, default 500) to limit abuse. For a public site you may also want a Cloudflare rate-limiting rule on `/api/`.
- "Remember me" is automatic: the derived login token and key are kept in the browser's local storage until the person signs out. The account panel has "Sign out and clear this browser" for shared computers.

## Adding games by store link

Paste a `https://store.playstation.com/.../concept/...` or `.../product/...` link into **Add a game** and press **Look up**. The Worker fetches that one page and returns the title, platforms, genres and release year, which the page maps onto its own styles. The person then picks a camera view and a status (Played, Playing now, Want to play, or just add it).

- Only `store.playstation.com` concept and product pages are fetched; anything else is refused.
- Results are cached for a day.
- No descriptions or images are copied from the store.
- Added games belong to the person who added them, and sync with their account. They aren't shared with other visitors.
- Without the Worker, the page still reads the platform from a product link (PS5 ids contain `PPSA`, PS4 ids `CUSA`) and saves the link, and the title and details are typed in by hand.

**Not yet tested against the live store.** The parser in [`worker/src/store.js`](worker/src/store.js) handles the store's usual page data, structured data and meta tags, and it is tested against sample pages in that shape. I couldn't reach the real PlayStation Store while building this, though. If Sony's markup differs or changes, lookups fail politely ("couldn't read the game's details") and the person fills the form in by hand. Try a few links after deploying.

## Updating the game list

- **Small changes:** use `data/catalogue.json`.
  - `added`: new games, in the same shape as entries in `games.json`.
  - `removed`: ids of games that have left.
  - `leaving`: `{ "game-id": "2026-12-15" }`.
  - `asOf` and `leaveNote`: the date and the leaving-soon sentence shown on the page.
- **Bigger changes:** edit `data/games.json` directly. Each line is one game:

| Field | Meaning |
|---|---|
| `id` | Unique slug |
| `t` | Title |
| `p` | `["PS4","PS5"]` |
| `m` | Metascore or `null` |
| `y` | Year |
| `g` | Styles, main one first |
| `pv` | Camera view |
| `d` | One-sentence synopsis |
| `u` | Store link |
| `h`, `x`, `c`, `a` | Main, main+extras, completionist and all-styles hours |
| `n` | Number of HowLongToBeat reports |
| `cat` | 1 if in the Game Catalogue |
| `cl`, `sys` | Premium Classic and its original system (`PS3` for streaming-only games) |
| `s3` | Streams on PS3 with Premium: a streaming-only Classic, or the PS3 version of a game listed here |
| `rg` | `"na"`: a PS3 streaming game Sony offers in the US and Canada only; hidden when the store region is elsewhere |

### Regions

What's on PS Plus differs by country. `tools/fetch_regions.py` (run by `.github/workflows/regions.yml` twice a week and whenever the game data changes) downloads Sony's Game Catalogue and Classics lists for every region in the site's region menu and writes `data/regions.json`: which games each region gets, and whether its top tier is Premium (with cloud streaming and PS3 games) or Deluxe (without). Sony publishes no list for Brazil, so Brazil uses the Latin American list. The site hides games that aren't offered in the chosen region, unless you've marked, added or own them, and calls the top tier Deluxe where that's its name. Monthly games are shown everywhere.

The same lists carry each game's official age rating for that region (ESRB, PEGI, USK, ACB, CERO, GRAC, IARC and so on), which the script saves to `data/ratings/<region>.json` as `id: [badge label, minimum age, Sony's full rating name, content descriptors]`. The site downloads only the chosen region's file, shows the rating on each game and in the game's details, and uses the minimum age for the Age rating filter. PS3 streaming games aren't in Sony's lists, so for those the site falls back to the ESRB or PEGI rating on Wikidata where the region uses that system. Brazil uses the Latin American list, so it shows ESRB ratings rather than ClassInd.

`tools/fetch_crossplay.py` (run weekly by `.github/workflows/crossplay.yml`) reads Wikipedia's [list of games that support cross-platform play](https://en.wikipedia.org/wiki/List_of_video_games_that_support_cross-platform_play) and writes `data/crossplay.json`: for each game, which PlayStation versions play with Xbox players (`x`) and with PC players (`p`). Each row of Wikipedia's table is one group of platforms that play together, so a PlayStation version only counts when it shares a row with Xbox or PC. The list is incomplete: a game that isn't on it may still have crossplay, so the site only ever says yes. The Players filter's Crossplay option and the Crossplay line in each game's details use it.
| `e`, `el` | Monthly game and its month (the most recent, if it was offered twice) |

People's marks are keyed by `id`, so don't change an existing game's id.

## Tests

```bash
cd worker
npm test                       # store-link and store-page parser tests
npm run db:init:local          # one-off: create a local test database
npm run dev                    # run the Worker at http://localhost:8787
node test/api.e2e.mjs          # in a second terminal: account, sync, lockout and CORS checks
```

To try the whole site locally against that Worker, set `apiBase` in `config.js` to `http://localhost:8787` and serve the folder on a `localhost` port. `npm run dev` allows `localhost` origins; the deployed Worker does not.

## Data sources and credits

- **Game lists:**
  - Sony's PlayStation Plus Game Catalogue and Premium Classics lists: Canada's for the game data, and every region's for what's shown where (see Regions).
  - PS3 streaming games: Sony doesn't publish this list; it comes from [Thumbsticks](https://www.thumbsticks.com/playstation-classics-every-retro-game-available-with-playstation-plus-premium/), cross-checked against [PlayStation Universe](https://www.psu.com/news/ps-plus-premium-game-list-all-playstation-plus-premium-ps5-ps4-ps3-ps2-ps1-games/). The US and Canada only titles come from [ComicBook's comparison of the US and European lists](https://comicbook.com/gaming/news/playstation-ps-plus-premium-ps3-ps5-infamous-ratchet-and-clank).
  - Monthly games: November 2013 to October 2022 from the [PlayStation Fandom wiki](https://playstation.fandom.com/wiki/List_of_PlayStation_Plus_monthly_games_(North_America))'s North American lists; November 2022 on as reported by Game Rant, Insider Gaming and Beebom.
- **Scores:** Metacritic, via public datasets on GitHub plus manual checks on metacritic.com.
- **Completion times:** HowLongToBeat, via a public dataset on GitHub (March 2026).
- **Synopses, camera views and style tags:** written for this project. They haven't all been checked one by one.

Metascores and completion times are other sites' data. Check their terms before publishing this repository publicly.

PlayStation, PS Plus, PS4 and PS5 are trademarks of Sony Interactive Entertainment. This is an independent fan-made tool, not affiliated with or endorsed by Sony, Metacritic or HowLongToBeat.

No licence has been chosen yet. Add a `LICENSE` file if you want others to be able to reuse the code.

## Custom domain

The site is served at `https://wallofpsplus.com` by Cloudflare Workers static assets (`wrangler.jsonc`, `.assetsignore`), deployed by Workers Builds from this repository with root directory `/` and deploy command `npx wrangler deploy`. It has no Worker script, so every request is a free static-asset request and none count toward the 100,000-a-day Workers limit. A Cloudflare Redirect Rule (Rules > Redirect Rules, "Redirect from WWW to root" template, 301, keep query string) sends `www.wallofpsplus.com` to `wallofpsplus.com`.

GitHub Pages keeps serving the old address, `https://misterhundoah-code.github.io/Psplusorganizer/`. There, `move.js` checks that the new site is up, then forwards visitors to the same page on the new address, carrying their saved data (not their sign-in) in the link's `#fragment` so nothing is lost. Don't set a custom domain in the GitHub Pages settings: GitHub would then redirect on its own and that hand-over couldn't happen.

## Pages for search engines

The wall is one interactive page, so `tools/build_pages.py` also writes plain-HTML pages that search engines (and people) can read without running the app: `lists/*.html` (best Extra games, best Classics, co-op, crossplay, short, long, PS5, RPGs, horror, shooters, open world, for kids, and leaving soon), a guide and FAQ block at the foot of `index.html`, structured data (`WebApplication` and `FAQPage`) in its `<head>`, and `sitemap.xml`. Everything is computed from the data files, so the numbers stay current; `.github/workflows/pages.yml` reruns it after each data workflow and daily. To add a list, add a line to `LISTS` in the script.

Each list's "Open these on the wall" button is a link such as `/?src=plus&players=c&sort=m`: the wall reads `src`, `players`, `age`, `tlen`, `tmode`, `sort`, `desc`, `minm`, `styles`, `pv`, `plat`, `sys`, `onlyleave`, `layout` and `q` from the address, applies them over the defaults (keeping the visitor's country, tier and display choices), then removes them from the address bar. `src=plus` means everything Extra and Premium include right now, without old monthly games.

## Coming soon

`tools/fetch_coming.py` (run twice a day by `.github/workflows/coming.yml`) reads the PlayStation Blog's RSS feeds for Sony's monthly announcements ("PlayStation Plus Monthly Games for…" and "PlayStation Plus Game Catalog for…") and writes the games that haven't arrived yet to `data/coming.json`, with tier, platforms, arrival date (including per-game later dates) and Sony's promo image. The wall shows them under the Coming tab of the This month panel, and `tools/build_pages.py` makes `lists/new-on-ps-plus`. If Sony changes the post format and nothing parses, the existing file is kept; `data/coming-manual.json` (a list of `{"t", "p", "tier", "date"}`) can fill in by hand. It also records the Monthly Games you can claim right now (`monthly`: games, the first day and Sony's "until" date) for the Claim now tab; when that post isn't known, the wall works it out from `data/games.json` (lineups arrive on the first Tuesday of the month and can be claimed until the day before the next one).

## Import from a PlayStation account

The "Import from my PlayStation account" button (in Your data) explains a three-step import. `psn-import.js` is the code of a bookmark that runs on library.playstation.com while the visitor is signed in: it calls the same GraphQL queries Sony's own pages use (`getPurchasedGameList` and `getUserGameList`, persisted-query hashes as used by the `psn-api` library) with the visitor's session, and copies the bought/claimed and played lists to the clipboard. Pasted into the wall, games are matched by Sony's concept id or title id (`data/psn-ids.json`, written by `tools/fetch_regions.py` from Sony's catalogue lists) and then by name; owned games are tagged as in the library and unmarked played games become Playing (last 30 days) or Played, with Undo. If Sony changes those queries, the bookmark shows an error and nothing is copied; update the hashes in `psn-import.js`. Bought and claimed games are kept as `OWNED` (`psplus-owned`: key `c<conceptId>` or `n<name>` → name, platforms, concept id, Sony cover link, PS Plus claim, matching wall id). Those not on the wall become private `buy-` listings, shown under the My library tab and the My purchases source, never in Browse. They're part of the synced records (`o`, with the consent time in `s.ownsync`) only after the visitor ticks "Keep my purchases in my account"; unticking drops them from the account at the next sync, and other devices notice and stop syncing too. Each entry also keeps Sony's product id (`pid`), so its listing links to the store page and can be looked up with the same `/api/store` lookup as adding a game by hand (the pop-up's Fill in details button, or Fill in details for all on the My library tab), plus `hide` for games the visitor has hidden and the looked-up styles and year; a new import keeps those. Apps, demos, soundtracks and bonus content are dropped at import (`NOT_GAME`). The This month's games and Coming soon shelves use them (matching by wall id, then by title with edition words removed) to show Already yours, or You own the PS4 version when the platforms differ.


## Likely to join PS Plus (predictions)

`lists/coming-to-ps-plus` ranks every PS4 and PS5 game that isn't on PS Plus by its chance of joining the Game Catalog (Extra) or the monthly games (Essential) in the next three months, with a month-by-month chart for each game. `.github/workflows/predict.yml` runs weekly (Thursdays, after Sony's Wednesday announcements):

- `tools/predict/fetch_raw.py` fetches Wikipedia's lists of PS4 and PS5 games, every PS4/PS5 game on Wikidata (platforms, publishers, developers, series), Wikipedia page views for the last 60 days, and the newest PlayStation Blog posts. None of this raw material is committed.
- `tools/predict/history.py` adds new Game Catalog and Monthly Games announcements to `data/predict-history.json` (every lineup since mid-2022).
- `tools/predict/model.py` trains a logistic regression month by month on past additions (age, Sony's own games, PlayStation exclusivity, popularity, publisher and developer track records, sequels due soon), checks it on the last 12 months it didn't see, and writes `data/predict-page.json` (odds, plain-English reasons, 12-month curves, backtest) and `data/predict-snapshot.json` (each month's top 50, for the live scorecard). Free-to-play games are left out by name, and the year's biggest launches are held back until their first year is up.
- `tools/build_pages.py` builds the page; `lists/predict.js` adds the tabs, search and charts.

`python3 tools/predict/preview.py` builds a standalone preview from the local output.

## Featured picks and write-ups

A list in `data/list-copy.json` gets a hand-written page: title and description (with `{month}`, `{count}`, `{top}` filled in each build), an intro, the top N games as cards, and a FAQ with FAQPage structured data. Each card shows the game's write-up from `data/writeups.json` (one per game, reused on every list it appears in; games without one fall back to the short synopsis), its wide key art from `art/wide/` (fetched from the PlayStation Store by `tools/fetch_wide_art.py` in the artwork workflow, for every game with a write-up; the square cover is used otherwise), and links to the PlayStation Store, Metacritic, YouTube trailers and the wall. These lists show one entry per game across editions.
