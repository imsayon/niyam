import assert from "node:assert/strict";
import { defaultPolicy } from "../../server/workspace-domain.js";

export async function verifyWorkspace({ base, adminHeaders, studentCookie }) {
  const studentHeaders = { ...adminHeaders, Cookie: studentCookie };
  const event = "/events/demo-event";
  async function request(path, input, status = 200, headers = adminHeaders) {
    const response = await fetch(base + "/api" + path, {
      method: input ? "POST" : "GET",
      headers,
      body: input ? JSON.stringify(input) : undefined,
    });
    const data = await response.json();
    assert.equal(response.status, status, `${path} ${JSON.stringify(data)}`);
    return data;
  }

  const personal = async () => (await request("/workspace", undefined, 200, studentHeaders)).data;
  const before = await request("/workspace");
  let revision = before.revision;
  assert.deepEqual((await personal()).schedules, []);
  await request(event + "/transition", { revision, to: "archived" }, 409);
  await request(event + "/solve", { revision, policy: defaultPolicy }, 403,
    { ...adminHeaders, Origin: "https://untrusted.example" });
  const solved = await request(event + "/solve", { revision, policy: defaultPolicy });
  const first = solved.result;
  assert.equal(solved.revision, revision);
  assert.equal(first.sessions[0].seats.length, 120);
  assert.deepEqual((await personal()).schedules, []);
  await request(event + "/publish", { revision, runId: first.id }, 403, studentHeaders);
  const published = await request(event + "/publish", { revision, runId: first.id });
  revision = published.revision;
  assert.equal((await personal()).schedules[0].revision, first.id);
  const original = (await request("/workspace")).data.runs.find((run) => run.id === first.id);
  assert.ok(original.publishedAt);

  const draft = await request(event + "/solve", { revision, policy: defaultPolicy });
  const references = Array.from({ length: 208 }, (_, index) => ({
    type: "historical-lab-batch",
    year: "2024-25",
    batch: "Test batch",
    studentId: "HISTORICAL" + index,
    studentName: "Synthetic historical candidate " + index,
    source: { fileName: "historical.docx", table: 1, row: index + 2 },
  }));
  const input = { revision, kind: "references", rows: [...references, references[0]] };
  const wrongKind = await request("/import/preview", { revision, kind: "students", rows: [references[0]] });
  assert.equal(wrongKind.items.length, 0);
  assert.match(wrongKind.errors[0].message, /historical/);
  const review = await request("/import/preview", input);
  assert.equal(review.items.length, 208);
  assert.equal(review.errors.length, 1);
  assert.equal(review.items[0].record.candidatePool, false);
  const rejected = await request("/import/commit", input, 422);
  assert.equal(rejected.details.length, 1);
  assert.equal((await request("/workspace")).data.references.length, 0);
  const committed = await request("/import/commit", { ...input, skipInvalid: true });
  assert.deepEqual(committed.result, { imported: 208, skipped: 1 });
  revision = committed.revision;
  const afterImport = await request("/workspace");
  assert.equal(afterImport.data.references.length, 208);
  assert.equal(afterImport.data.students.length, before.data.students.length);
  await request(event + "/publish", { revision, runId: draft.result.id }, 409);
  const stalePreview = await request("/import/preview", input, 409);
  assert.match(stalePreview.error, /Refresh/);

  const withdrawn = await request(event + "/transition", { revision, to: "configured" });
  assert.deepEqual((await personal()).schedules, []);
  const refreshed = await request(event + "/solve", { revision: withdrawn.revision, policy: defaultPolicy });
  await request(event + "/publish", { revision: refreshed.revision, runId: refreshed.result.id });
  const final = await request("/workspace");
  assert.deepEqual(final.data.runs.find((run) => run.id === first.id), original);
  assert.equal((await personal()).schedules[0].revision, refreshed.result.id);

  const tooLarge = await fetch(base + "/api/import/preview", {
    method: "POST",
    headers: adminHeaders,
    body: new Blob([JSON.stringify({ pad: "あ".repeat(175000) })]).stream(),
    duplex: "half",
  });
  assert.equal(tooLarge.status, 413);
}
