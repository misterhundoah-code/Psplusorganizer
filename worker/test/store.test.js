// Run with: npm test   (from the worker folder)
// These use small hand-made pages shaped like the PlayStation Store's markup, so they
// check the parser's logic. They are not a guarantee about the live store's current markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStoreUrl, parseStorePage, cleanTitle, platformsFromProductId } from "../src/store.js";

test("accepts store concept and product links, rejects everything else", () => {
  assert.deepEqual(parseStoreUrl("https://store.playstation.com/en-ca/concept/10002694"),
    { kind: "concept", id: "10002694", locale: "en-ca", url: "https://store.playstation.com/en-ca/concept/10002694" });
  assert.equal(parseStoreUrl("https://store.playstation.com/en-us/product/UP9000-PPSA01284_00-GAME000000000000/").kind, "product");
  assert.equal(parseStoreUrl("https://store.playstation.com/concept/123").locale, "en-ca");
  for (const bad of ["http://store.playstation.com/en-ca/concept/1", "https://evil.example/store.playstation.com/en-ca/concept/1",
    "https://store.playstation.com.evil.example/en-ca/concept/1", "https://store.playstation.com/en-ca/search/foo",
    "https://user:pw@store.playstation.com/en-ca/concept/1", "https://store.playstation.com:8443/en-ca/concept/1", "not a url"])
    assert.equal(parseStoreUrl(bad), null, bad);
});

test("product ids give platforms", () => {
  assert.deepEqual(platformsFromProductId("UP9000-PPSA01284_00-GAME"), ["PS5"]);
  assert.deepEqual(platformsFromProductId("EP9000-CUSA07408_00-GAME"), ["PS4"]);
});

test("cleans store titles", () => {
  assert.equal(cleanTitle("Ghost of Tsushima DIRECTOR&#39;S CUT | PlayStation Store"), "Ghost of Tsushima DIRECTOR'S CUT");
  assert.equal(cleanTitle("Astro Bot - PS5 Games | PlayStation (Canada)"), "Astro Bot");
  assert.equal(cleanTitle("TEKKEN 3 PS4 & PS5"), "TEKKEN 3");
  assert.equal(cleanTitle("Returnal™"), "Returnal");
});

test("reads a page with an app data block", () => {
  const data = { props: { apolloState: {
    "Concept:10002694": { __typename: "Concept", id: "10002694", name: "Returnal™", genres: ["ACTION", "SHOOTER"],
      releaseDate: { type: "DAY_MONTH_YEAR", value: "2021-04-30T00:00:00Z" } },
    "Product:UP9000-PPSA01284_00-RETURNAL00000000": { __typename: "Product", id: "UP9000-PPSA01284_00-RETURNAL00000000", name: "Returnal™", platforms: ["PS5"] } } } };
  const html = `<html><head><title>Returnal | PlayStation Store</title></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
  const r = parseStorePage(html, parseStoreUrl("https://store.playstation.com/en-ca/concept/10002694"));
  assert.equal(r.title, "Returnal");
  assert.deepEqual(r.platforms, ["PS5"]);
  assert.deepEqual(r.genres, ["ACTION", "SHOOTER"]);
  assert.equal(r.year, 2021);
  assert.equal(r.conceptId, "10002694");
  assert.equal(r.productId, "UP9000-PPSA01284_00-RETURNAL00000000");
});

test("reads a page that only has structured data and meta tags", () => {
  const ld = { "@context": "http://schema.org", "@type": "Product", name: "Hollow Knight: Voidheart Edition", sku: "UP1234-CUSA13285_00-HOLLOW" };
  const html = `<meta property="og:title" content="Hollow Knight: Voidheart Edition">
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    <div>... "genres":["Action","Adventure"] ... "releaseDate":{"type":"DAY_MONTH_YEAR","value":"2018-09-25T00:00:00Z"} ...</div>`;
  const r = parseStorePage(html, parseStoreUrl("https://store.playstation.com/en-ca/product/UP1234-CUSA13285_00-HOLLOW"));
  assert.equal(r.title, "Hollow Knight: Voidheart Edition");
  assert.deepEqual(r.platforms, ["PS4"]);
  assert.deepEqual(r.genres, ["Action", "Adventure"]);
  assert.equal(r.year, 2018);
});

test("falls back to the page title and survives junk", () => {
  const html = `<title>Some Game - PS4 &amp; PS5 Games | PlayStation (Canada)</title><script type="application/json">{not json</script>`;
  const r = parseStorePage(html, parseStoreUrl("https://store.playstation.com/en-ca/concept/42"));
  assert.equal(r.title, "Some Game");
  assert.deepEqual(r.platforms, []);
  assert.equal(r.year, null);
});
