import { randomBytes } from "node:crypto";
import { database as legacyDatabase, setup } from "../../server/store.js";
import { saveConfiguration } from "../../server/ai-config.js";
import { seedDemo } from "../../scripts/seed.js";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
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
// Synthetic fixture key, inherited by both local test processes. Never a production credential.
process.env.AI_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");

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
  const roleScoped = await fetch(base + "/api/workspace", { headers: { Cookie: cookie } });
  assert.equal(roleScoped.status, 200);
  assert.ok((await roleScoped.json()).data.events.length > 0);
  const nativeAiStatus = await fetch(base + "/api/ai/status", { headers: { Cookie: cookie } });
  assert.equal(nativeAiStatus.status, 200, "Next AI config read must work");
  const nativeAi = await nativeAiStatus.json();
  assert.equal(typeof nativeAi.enabled, "boolean");
  assert.equal(typeof nativeAi.model, "string");
  assert.equal(nativeAi.key, undefined, "Never expose provider secret");
  const aiFixture = legacyDatabase();
  await saveConfiguration(aiFixture, "ci-test-gemini-provider-key-never-used", "gemini-3.1-flash-lite");
  await aiFixture.end();
  const persistedAi = await fetch(base + "/api/ai/status", { headers: { Cookie: cookie } });
  assert.equal(persistedAi.status, 200);
  assert.deepEqual(await persistedAi.json(), { enabled: true, model: "gemini-3.1-flash-lite" });
  // Still-unmigrated export route proves the compatibility bridge works.
  const legacyExport = await fetch(base + "/api/export/demo-event/timetable.pdf");
  assert.equal(legacyExport.status, 401, "Legacy Express API must enforce unauthenticated access");
  assert.equal((await fetch(base + "/api/ai/status")).status, 401);
  const history = await fetch(base + "/api/ai/history", { headers: { Cookie: cookie } });
  assert.equal(history.status, 200);
  assert.deepEqual((await history.json()).messages, []);
  // Native CRUD must preserve optimistic revisions, unique identifiers,
  // transaction rollback, and single-winner concurrency under row locks.
  const revisionOf = async () =>
    (await (await fetch(base + "/api/workspace", { headers: { Cookie: cookie } })).json()).revision;
  const studentRecord = (code, name = "Next Native Candidate") =>
    ({ name, code, email: "", department: "ISE", semester: 3 });
  const adminHeaders = { Cookie: cookie, Origin: base, "Content-Type": "application/json" };
  const postStudent = (revision, code) => fetch(base + "/api/records/students", {
    method: "POST", headers: adminHeaders,
    body: JSON.stringify({ revision, record: studentRecord(code) }),
  });
  let rev = await revisionOf();
  const created = await postStudent(rev, "NEXT0001");
  const inserted = await created.json();
  assert.equal(created.status, 201, JSON.stringify(inserted));
  assert.equal(inserted.revision, rev + 1);
  assert.ok(inserted.result);
  assert.equal((await postStudent(rev, "NEXT0002")).status, 409, "Stale revision must be rejected");
  assert.equal((await postStudent(inserted.revision, "NEXT0001")).status, 409, "Duplicate code must be rejected");
  assert.equal(await revisionOf(), inserted.revision, "Failed changes cannot advance revision");

  const amended = await fetch(base + "/api/records/students/" + inserted.result, {
    method: "PATCH", headers: adminHeaders,
    body: JSON.stringify({ revision: inserted.revision, record: studentRecord("NEXT0001", "Next Updated Candidate") }),
  });
  assert.equal(amended.status, 200);
  const amendedResult = await amended.json();
  assert.equal(amendedResult.revision, inserted.revision + 1);
  const afterAmend = (await (await fetch(base + "/api/workspace", { headers: { Cookie: cookie } })).json()).data;
  assert.equal(afterAmend.students.find(s => s.id === inserted.result)?.name, "Next Updated Candidate");

  const deleted = await fetch(base + "/api/records/students/" + inserted.result, {
    method: "DELETE", headers: adminHeaders, body: JSON.stringify({ revision: amendedResult.revision }),
  });
  assert.equal(deleted.status, 200);
  const deletion = await deleted.json();
  rev = deletion.revision;
  assert.equal((await (await fetch(base + "/api/workspace", { headers: { Cookie: cookie } })).json())
    .data.students.some(s => s.id === inserted.result), false);
  const race = await Promise.all([postStudent(rev, "NEXTRACE1"), postStudent(rev, "NEXTRACE2")]);
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409], "Concurrent writers must have one winner");
  const winning = await race[race.findIndex(r => r.status === 201)].json();
  const cleaned = await fetch(base + "/api/records/students/" + winning.result, {
    method: "DELETE", headers: adminHeaders, body: JSON.stringify({ revision: winning.revision }),
  });
  assert.equal(cleaned.status, 200);
  const accounts = await fetch(base + "/api/accounts", { headers: { Cookie: cookie } });
  assert.equal(accounts.status, 200);
  const listed = await accounts.json();
  assert.ok(listed.length >= 3);
  assert.equal(listed.find(a => a.role === "admin").passwordLogin, true);
  const audit = await fetch(base + "/api/audit", { headers: { Cookie: cookie } });
  assert.equal(audit.status, 200);
  assert.ok((await audit.json()).some(row => row.action === "institution.updated"));
  const studentLogin = await fetch(base + "/api/session", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "student@niyam.example", password: passwords.student, role: "student" }),
  });
  assert.equal(studentLogin.status, 200);
  const studentCookie = studentLogin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(studentCookie);
  const studentWorkspace = await fetch(base + "/api/workspace", { headers: { Cookie: studentCookie } });
  assert.equal(studentWorkspace.status, 200);
  const personal = (await studentWorkspace.json()).data;
  assert.ok(Array.isArray(personal.schedules));
  assert.equal(personal.faculty, undefined, "Student must not read the full institutional workspace");
  assert.equal((await fetch(base + "/api/audit", { headers: { Cookie: studentCookie } })).status, 403);
  assert.equal((await fetch(base + "/api/accounts", { headers: { Cookie: studentCookie } })).status, 403);
  const deniedWrite = await fetch(base + "/api/records/students", {
    method: "POST",
    headers: { Cookie: studentCookie, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ revision: await revisionOf(), record: studentRecord("FORBIDDEN") }),
  });
  assert.equal(deniedWrite.status, 403, "Student must never modify another student's records");
  const logout = await fetch(base + "/api/session", { method: "DELETE", headers: { Cookie: cookie, Origin: base } });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(base + "/api/institution", { headers: { Cookie: cookie } })).status, 401);
  for (const path of ["/", "/examinations", "/settings", "/allocation"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(await res.text(), /Niyam/, path);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Welcome back." }).waitFor({ timeout: 15000 });
    await page.getByRole("tab", { name: "Faculty" }).click();
    await page.getByRole("tab", { name: "Admin" }).click();
    await page.locator('input[name="password"]').fill(passwords.admin);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator(".app-shell").waitFor({ timeout: 15000 });
    await page.getByRole("link", { name: "Examinations" }).click();
    await page.getByText("Examinations", { exact: true }).last().waitFor();
    const appearance = page.getByRole("button", { name: "Toggle appearance" }).last();
    await appearance.click();
    await appearance.click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("heading", { name: "Welcome back." }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Student" }).click();
    await page.getByRole("tab", { name: "Admin" }).click();
    await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  } finally { await browser.close(); }
  console.log("Next App Router, PostgreSQL, native auth/role boundaries, legacy compatibility and browser smoke passed");
} catch (err) {
  for (const child of children) console.error(child.logs().slice(-4000));
  throw err;
} finally {
  for (const {child} of children) child.kill("SIGTERM");
}
