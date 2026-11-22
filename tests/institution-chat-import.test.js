import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { application } from "../server/index.js";
import { adminEmail } from "../server/accounts.js";
import { database, setup } from "../server/store.js";
import { seedDemo } from "../scripts/seed.js";

test("institution, persisted AI conversation, and reviewed duplicate import are durable", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const root = database(process.env.TEST_DATABASE_URL);
  const schema = "workflow_" + randomBytes(6).toString("hex");
  await root.query("CREATE SCHEMA " + schema);
  const isolatedUrl = new URL(process.env.TEST_DATABASE_URL);
  isolatedUrl.searchParams.set("options", "-c search_path=" + schema);
  const db = database(isolatedUrl.href);
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.end();
    await root.query("DROP SCHEMA " + schema + " CASCADE");
    await root.end();
  });
  await setup(db);
  const password = randomBytes(20).toString("hex");
  await seedDemo(db, { admin: password, faculty: password, student: password });
  server = application(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  async function req(path, { body, method, cookie } = {}) {
    const response = await fetch(base + "/api" + path, {
      method: method || (body ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const admin = await req("/session", {
    body: { email: adminEmail, password, role: "admin" },
  });
  assert.equal(admin.status, 200);
  const student = await req("/session", {
    body: { email: "student@niyam.example", password, role: "student" },
  });
  assert.equal(student.status, 200);
  const adminCookie = admin.cookie;
  const studentCookie = student.cookie;

  assert.equal((await req("/institution")).status, 401);
  assert.equal((await req("/institution", { cookie: adminCookie })).data.shortName, "DSCE");
  assert.equal((await req("/institution", { cookie: studentCookie, method: "PUT",
    body: { name: "Unauthorized institution", shortName: "BAD" } })).status, 403);
  const saved = await req("/institution", { cookie: adminCookie, method: "PUT",
    body: { name: "Dayananda Sagar College of Engineering", shortName: "DSCE" } });
  assert.equal(saved.status, 200);
  assert.equal((await req("/institution", { cookie: studentCookie })).data.name,
    "Dayananda Sagar College of Engineering");
  assert.equal((await db.query("SELECT count(*) FROM niyam_settings WHERE name='institution'")).rows[0].count, "1");

  assert.equal((await req("/ai/history", { cookie: studentCookie })).data.messages.length, 0);
  const hello = await req("/ai/ask", { cookie: studentCookie, body: { question: "hi" } });
  assert.equal(hello.status, 200);
  assert.match(hello.data.answer, /exam timings/);
  const history = await req("/ai/history", { cookie: studentCookie });
  assert.deepEqual(history.data.messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal((await req("/ai/history", { cookie: adminCookie })).data.messages.length, 0);
  assert.equal((await db.query("SELECT count(*) FROM niyam_ai_messages")).rows[0].count, "2");
  assert.equal((await req("/ai/history", { cookie: studentCookie, method: "DELETE" })).status, 200);
  assert.equal((await req("/ai/history", { cookie: studentCookie })).data.messages.length, 0);

  const { data: workspace } = await req("/workspace", { cookie: adminCookie });
  const reference = {
    type: "historical-lab-batch",
    year: "2025-26",
    semester: 3,
    section: "A",
    batch: "A1",
    studentId: "1DS24IS007",
    studentName: "Test Student",
    historical: true,
    candidatePool: false,
    source: { fileName: "lab.docx", table: 1, row: 2 },
  };
  const rows = [reference, {
    ...reference,
    batch: "A2",
    studentName: "Different Student",
    source: { fileName: "lab.docx", table: 2, row: 3 },
  }];
  const input = { revision: workspace.revision, kind: "references", rows };
  const preview = await req("/import/preview", { cookie: adminCookie, body: input });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.items.length, 1);
  assert.equal(preview.data.errors.length, 1);
  const blocked = await req("/import/commit", { cookie: adminCookie, body: input });
  assert.equal(blocked.status, 422);
  assert.equal((await db.query("SELECT data->'references' AS refs FROM niyam_workspace")).rows[0].refs.length, 0);
  const committed = await req("/import/commit", {
    cookie: adminCookie, body: { ...input, skipInvalid: true },
  });
  assert.equal(committed.status, 200);
  assert.deepEqual(committed.data.result, { imported: 1, skipped: 1 });
  let next = await req("/workspace", { cookie: adminCookie });
  assert.equal(next.data.data.references.length, 1);
  // Re-importing the same reviewed document updates the existing source row rather than corrupting the roster.
  const again = await req("/import/commit", {
    cookie: adminCookie, body: { ...input, revision: next.data.revision, skipInvalid: true },
  });
  assert.equal(again.status, 200);
  next = await req("/workspace", { cookie: adminCookie });
  assert.equal(next.data.data.references.length, 1);
  assert.equal(next.data.data.students.length, 120);
});
