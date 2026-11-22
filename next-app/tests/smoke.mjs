import { randomBytes } from "node:crypto";
import { database as legacyDatabase, setup } from "../../server/store.js";
import { seedDemo } from "../../scripts/seed.js";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(cwd, "..");
const apiPort = 4317;
const nextPort = 4318;
if (!process.env.DATABASE_URL || process.env.NIYAM_SANDBOX !== "1")
  throw new Error("Smoke test requires isolated DATABASE_URL and NIYAM_SANDBOX=1");

const passwords = {
  admin: randomBytes(18).toString("hex"),
  faculty: randomBytes(18).toString("hex"),
  student: randomBytes(18).toString("hex"),
};
const db = legacyDatabase();
await setup(db);
await seedDemo(db, passwords);
await db.end();
const children = [];
function launch(args, workdir) {
  const child = spawn(process.execPath, args, {
    cwd: workdir, env: { ...process.env, ...(workdir === root ? { PORT: String(apiPort) } : {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", c => output += c.toString());
  child.stderr.on("data", c => output += c.toString());
  children.push({ child, logs: () => output });
}
async function ready(path) {
  for (let n = 0; n < 200; n++) {
    try {
      const r = await fetch(path, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return r;
    } catch {}
    await sleep(250);
  }
  throw Error("Service not ready: " + path);
}
try {
  launch(["server/api-only.js"], root);
  await ready("http://127.0.0.1:" + apiPort + "/api/health");
  launch(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(nextPort)], cwd);
  const base = "http://127.0.0.1:" + nextPort;
  const health = await ready(base + "/api/health");
  assert.equal((await health.json()).status, "ok");
  const releases = await fetch(base + "/api/releases");
  assert.equal(releases.status, 200);
  assert.match((await releases.json()).windows, /Niyam-Setup-x64\.exe$/);
  const session = await fetch(base + "/api/session");
  assert.equal(session.status, 200, "Unmigrated session must reach sandbox API");
  assert.equal(typeof (await session.json()).adminEmail, "string");
  const unauthenticated = await fetch(base + "/api/institution");
  assert.equal(unauthenticated.status, 401);
  const rejected = await fetch(base + "/api/session", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "admin.niyam@dsce.edu.in", password: passwords.admin, role: "student" }),
  });
  assert.equal(rejected.status, 401);
  const signedIn = await fetch(base + "/api/session", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "admin.niyam@dsce.edu.in", password: passwords.admin, role: "admin" }),
  });
  assert.equal(signedIn.status, 200, await signedIn.text().catch(() => ""));
  const cookie = signedIn.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("niyam="), "Native session must set the legacy-compatible cookie");
  assert.equal((await (await fetch(base + "/api/session", { headers: { Cookie: cookie } })).json()).account.role, "admin");
  const institution = await fetch(base + "/api/institution", { headers: { Cookie: cookie } });
  assert.equal(institution.status, 200);
  assert.equal((await institution.json()).shortName, "DSCE");
  const forbiddenOrigin = await fetch(base + "/api/institution", {
    method: "PUT", headers: { Cookie: cookie, Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test College", shortName: "TEST" }),
  });
  assert.equal(forbiddenOrigin.status, 403);
  const updated = await fetch(base + "/api/institution", {
    method: "PUT", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Isolated Test College", shortName: "ITC" }),
  });
  assert.equal(updated.status, 200, await updated.text().catch(() => ""));
  assert.equal((await (await fetch(base + "/api/institution", { headers: { Cookie: cookie } })).json()).shortName, "ITC");
  // The session token minted by Next must remain readable by the original Express API.
  const crossFramework = await fetch(base + "/api/workspace", { headers: { Cookie: cookie } });
  assert.equal(crossFramework.status, 200, "Express must accept the Next session");
  assert.ok((await crossFramework.json()).data.events.length > 0);
  const logout = await fetch(base + "/api/session", { method: "DELETE", headers: { Cookie: cookie, Origin: base } });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(base + "/api/institution", { headers: { Cookie: cookie } })).status, 401);
  for (const path of ["/", "/examinations", "/settings", "/allocation"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(await res.text(), /Niyam/, path);
  }
  console.log("Next App Router/native health/release/local API rewrite/deep link smoke passed");
} catch (err) {
  for (const child of children) console.error(child.logs().slice(-4000));
  throw err;
} finally {
  for (const {child} of children) child.kill("SIGTERM");
}
