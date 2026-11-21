// Live check of the community-score routes, using a throwaway account that it deletes at the end.
// Run with: API=https://psplus-sorter-api.example.workers.dev ORIGIN=https://you.github.io node test/votes.smoke.mjs
import { randomBytes } from "node:crypto";
const API = process.env.API, ORIGIN = process.env.ORIGIN;
const hex = () => randomBytes(32).toString("hex");
const call = async (path, body) => {
  const r = await fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify(body) } : { headers: { Origin: ORIGIN } });
  return [r.status, await r.json().catch(() => null)];
};
const id = { uid: hex(), auth: hex() };
const ok = (cond, msg) => { console.log((cond ? "ok   " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
let [s] = await call("/api/account/create", id); ok(s === 201, "create throwaway account");
[s] = await call("/api/votes/put", { ...id, votes: { "smoke-test-game": { m: "p", r: 4 }, "BAD ID!": { m: "p" }, "x": { m: "zz", r: 9 } } });
ok(s === 200, "put votes");
[s] = await call("/api/votes/put", { uid: id.uid, auth: hex(), votes: {} }); ok(s === 401, "wrong password refused");
let [, c] = await call("/api/community"); ok(c && typeof c.voters === "number" && !c.games["smoke-test-game"], "single voter's game not published");
[s] = await call("/api/votes/delete", id); ok(s === 200, "withdraw votes");
[s] = await call("/api/account/delete", id); ok(s === 200, "delete throwaway account");
