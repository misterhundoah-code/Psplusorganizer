// End-to-end check of the API against a running local worker:
//   npm run db:init:local && npm run dev      (in one terminal)
//   node test/api.e2e.mjs                       (in another)
import assert from "node:assert/strict";
const BASE = process.env.API || "http://localhost:8787";
const ORIGIN = "http://localhost:5500";
const hex = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const post = async (path, body, origin = ORIGIN) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};

const uid = hex(), auth = hex();
let r = await post("/api/account/create", { uid, auth });
assert.equal(r.status, 201, "create");
assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN, "CORS echo");
r = await post("/api/account/create", { uid, auth: hex() });
assert.equal(r.status, 409, "duplicate username refused");

r = await post("/api/data/get", { uid, auth });
assert.deepEqual(r.body, { ver: 0, ct: null, iv: null }, "empty account");

r = await post("/api/data/put", { uid, auth, ct: "QUJD", iv: "AAAAAAAAAAAAAAAA", base: 0 });
assert.deepEqual(r.body, { ver: 1 }, "first save");
r = await post("/api/data/put", { uid, auth, ct: "WFla", iv: "AAAAAAAAAAAAAAAA", base: 0 });
assert.equal(r.status, 409, "stale save refused");
assert.equal(r.body.ver, 1); assert.equal(r.body.ct, "QUJD", "conflict returns the current copy");

r = await post("/api/data/get", { uid, auth: hex() });
assert.equal(r.status, 401, "wrong password");
r = await post("/api/data/get", { uid: hex(), auth });
assert.equal(r.status, 401, "unknown user gets the same answer");
r = await post("/api/data/put", { uid, auth, ct: "not base64!!", iv: "x", base: 1 });
assert.equal(r.status, 400, "malformed data refused");

r = await post("/api/data/get", { uid, auth }, "https://evil.example");
assert.equal(r.status, 403, "other sites refused");

// lockout after repeated failures
const u2 = hex(), a2 = hex();
await post("/api/account/create", { uid: u2, auth: a2 });
for (let i = 0; i < 5; i++) await post("/api/data/get", { uid: u2, auth: hex() });
r = await post("/api/data/get", { uid: u2, auth: a2 });
assert.equal(r.status, 429, "locked after five wrong passwords, even with the right one");

r = await post("/api/account/delete", { uid, auth });
assert.equal(r.status, 200, "delete");
r = await post("/api/data/get", { uid, auth });
assert.equal(r.status, 401, "deleted account is gone");

r = await fetch(BASE + "/api/store?url=" + encodeURIComponent("https://example.com/x"), { headers: { Origin: ORIGIN } });
assert.equal(r.status, 400, "store lookup only accepts store links");

console.log("API checks passed");
