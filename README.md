# PS Plus Catalogue Sorter

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
3. After a minute the site is live at `https://misterhundoah-code.github.io/Psplusorganizer/`.

To try it on your own computer first, run `python3 -m http.server 8000` in this folder and open http://localhost:8000. Opening `index.html` straight from disk won't work, because the page loads its data files.

## 2. Turn on accounts and store lookups (optional)

You need a free Cloudflare account and Node.js 18 or newer.

```bash
cd worker
npm install
npx wrangler login                       # opens a browser to sign in to Cloudflare
npx wrangler d1 create psplus-sorter     # prints a database_id
```

Then edit `worker/wrangler.toml`:

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
  - Sony's PlayStation Plus Game Catalogue and Premium Classics lists (Canada).
  - PS3 streaming games: Sony doesn't publish this list; it comes from [Thumbsticks](https://www.thumbsticks.com/playstation-classics-every-retro-game-available-with-playstation-plus-premium/), cross-checked against [PlayStation Universe](https://www.psu.com/news/ps-plus-premium-game-list-all-playstation-plus-premium-ps5-ps4-ps3-ps2-ps1-games/).
  - Monthly games: November 2013 to October 2022 from the [PlayStation Fandom wiki](https://playstation.fandom.com/wiki/List_of_PlayStation_Plus_monthly_games_(North_America))'s North American lists; November 2022 on as reported by Game Rant, Insider Gaming and Beebom.
- **Scores:** Metacritic, via public datasets on GitHub plus manual checks on metacritic.com.
- **Completion times:** HowLongToBeat, via a public dataset on GitHub (March 2026).
- **Synopses, camera views and style tags:** written for this project. They haven't all been checked one by one.

Metascores and completion times are other sites' data. Check their terms before publishing this repository publicly.

PlayStation, PS Plus, PS4 and PS5 are trademarks of Sony Interactive Entertainment. This is an independent fan-made tool, not affiliated with or endorsed by Sony, Metacritic or HowLongToBeat.

No licence has been chosen yet. Add a `LICENSE` file if you want others to be able to reuse the code.
