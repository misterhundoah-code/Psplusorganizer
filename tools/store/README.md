# Store walk-through preview

An unlisted page at /store/ (store/index.html): one aisle of the shop in 3D, drawn with three.js (WebGPU,
falling back to WebGL), with a TV at the end of the aisle that plays a game's trailer from YouTube.

- `build_aisle.py` picks the games and writes store/aisle.json, with IGDB cover ids and videos from data/igdb.json.
- `covers.py` downloads those IGDB covers into store/covers/ (run by .github/workflows/store.yml).
- `main.js` is the page's code. After changing it: `cd tools/store && npm install && npm run build`,
  which writes store/store.js. Commit both.
