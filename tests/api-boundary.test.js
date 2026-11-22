import test from "node:test";
import assert from "node:assert/strict";
import { application } from "../server/index.js";

test("API-only mode preserves API contracts without serving the legacy SPA", async (t) => {
  const queries = [];
  const db = {
    async query(sql) {
      queries.push(sql);
      return { rows: [{ ok: 1 }] };
    },
  };
  const server = application(db, { serveFrontend: false }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = "http://127.0.0.1:" + server.address().port;
  const health = await fetch(base + "/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  assert.deepEqual(queries, ["SELECT 1"]);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("referrer-policy"), "no-referrer");

  const missingApi = await fetch(base + "/api/unknown");
  assert.equal(missingApi.status, 404);
  assert.match(missingApi.headers.get("content-type"), /application\/json/);
  assert.equal((await missingApi.json()).error, "API endpoint not found.");

  for (const path of ["/", "/examinations", "/downloads/old-installer.exe"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get("content-type"), /application\/json/, path);
    assert.equal((await response.json()).error, "Not found.");
  }
});
