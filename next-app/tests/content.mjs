import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { CFB, utils, write } from "xlsx";

function historicalDocx() {
  const paragraph = (text) => "<w:p><w:r><w:t>" + text + "</w:t></w:r></w:p>";
  const row = (...cells) => "<w:tr>" + cells.map((text) => "<w:tc>" + paragraph(text) + "</w:tc>").join("") + "</w:tr>";
  const rows = Array.from({ length: 208 }, (_, index) => row("WORD" + index, "Candidate " + index));
  const tables = [rows.slice(0, 70), rows.slice(70, 140), rows.slice(140)];
  const xml = "<w:document><w:body>" + paragraph("Lab batches 2025-26 Sem: III") +
    tables.map((body, index) => paragraph("Batch A" + (index + 1)) +
      "<w:tbl>" + row("USN", "Name") + body.join("") + "</w:tbl>").join("") +
    "</w:body></w:document>";
  const archive = CFB.utils.cfb_new();
  CFB.utils.cfb_add(archive, "word/document.xml", Buffer.from(xml));
  return CFB.write(archive, { fileType: "zip", type: "buffer", compression: true });
}

export async function verifyContent({ base, adminHeaders, studentCookie }) {
  const studentHeaders = { ...adminHeaders, Cookie: studentCookie };
  async function json(path, { body, headers = adminHeaders, method = body ? "POST" : "GET", status = 200 } = {}) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${path} ${JSON.stringify(data)}`);
    assert.match(response.headers.get("cache-control"), /no-store/);
    return data;
  }
  async function upload(path, name, body, media = "application/octet-stream", status = 200, headers = adminHeaders) {
    const uploadHeaders = new Headers(headers);
    uploadHeaders.set("content-type", media);
    uploadHeaders.set("x-document-name", encodeURIComponent(name));
    const response = await fetch(base + "/api/import/" + path, {
      method: "POST",
      headers: uploadHeaders,
      body,
    });
    const data = await response.json();
    assert.equal(response.status, status, `/import/${path} ${JSON.stringify(data)}`);
    return data;
  }

  const configuration = { key: "integration-test-provider-key", model: "gemini-3.1-flash-lite" };
  await json("/ai/config", { body: configuration, headers: studentHeaders, status: 403 });
  await json("/ai/config", { body: configuration });
  const configuredAt = Date.now();
  assert.deepEqual(await json("/ai/status"), { enabled: true, model: configuration.model });

  const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const historical = await upload("docx", "historical Lab Batch.docx", historicalDocx(), docxType);
  assert.equal(historical.rows.length, 208);
  assert.equal(historical.classification.destination, "students");
  assert.equal(historical.classification.referenceType, "historical-lab-batch");
  assert.ok(historical.rows.every((row) => row.historical && !row.candidatePool));
  await upload("docx", "historical.docx", historicalDocx(), docxType, 403, studentHeaders);

  const sample = [{ Name: "Imported Candidate", USN: "SAMPLE1", Semester: 5 }];
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(sample), "Roster");
  for (const bookType of ["csv", "xls", "xlsx"]) {
    const bytes = write(workbook, { bookType, type: "buffer", compression: true });
    const parsed = await upload("spreadsheet", "roster." + bookType, bytes);
    assert.deepEqual(parsed.rows, sample);
    assert.equal(parsed.classification.destination, "students");
    if (bookType === "xlsx") {
      assert.deepEqual(await upload("archive-check", "roster.xlsx", bytes, xlsxType), { ok: true });
      await upload("spreadsheet", "wrong.csv", bytes, "application/octet-stream", 422);
    }
  }
  const text = await upload("spreadsheet", "note.txt", "An example file");
  assert.equal(text.text, "An example file");
  assert.deepEqual(text.rows, []);
  assert.equal((await json("/import/classify", { body: { fileName: "roster.csv", rows: sample } })).destination, "students");

  const eventPath = "/api/export/demo-event/";
  const adminReport = await fetch(base + eventPath + "seating.csv", { headers: adminHeaders });
  assert.equal(adminReport.status, 200);
  assert.match(adminReport.headers.get("content-disposition"), /Niyam-seating\.csv/);
  assert.match(await adminReport.text(), /DEMO002/);
  const studentReport = await fetch(base + eventPath + "seating.csv?run=other", { headers: studentHeaders });
  assert.equal(studentReport.status, 200);
  const studentCsv = await studentReport.text();
  assert.match(studentCsv, /DEMO001/);
  assert.doesNotMatch(studentCsv, /DEMO002/);
  assert.equal((await fetch(base + eventPath + "duties.csv", { headers: studentHeaders })).status, 403);
  const pdfResponse = await fetch(base + eventPath + "timetable.pdf", { headers: adminHeaders });
  assert.equal(pdfResponse.status, 200);
  assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const extracted = await upload("pdf", "timetable.pdf", pdf);
  assert.match(extracted.text, /Morning sitting/);
  assert.match(extracted.text, /End-Semester Examinations/);
  await upload("pdf", "invalid.pdf", "invalid", "application/octet-stream", 422);

  const first = await json("/ai/ask", { body: { question: "Hi" }, headers: studentHeaders });
  assert.match(first.answer, /exam timings/);
  const adminHistory = await json("/ai/history");
  assert.deepEqual(adminHistory.messages, []);
  await sleep(825);
  const next = await json("/ai/ask", { body: { question: "What about my schedule?" }, headers: studentHeaders });
  assert.match(next.answer, /Data Structures room/);
  const timeline = await json("/ai/history", { headers: studentHeaders });
  assert.deepEqual(timeline.messages.map((item) => item.role), ["user", "assistant", "user", "assistant"]);
  await json("/ai/history", { method: "DELETE", headers: { ...studentHeaders, Origin: "https://another.example" }, status: 403 });
  await json("/ai/history", { method: "DELETE", headers: studentHeaders });
  assert.deepEqual((await json("/ai/history", { headers: studentHeaders })).messages, []);

  await sleep(Math.max(0, 5025 - (Date.now() - configuredAt)));
  assert.deepEqual(await json("/ai/extract", { body: { text: "Example candidate DEMO001", kind: "students" } }), {
    rows: [{ code: "DEMO001", name: "Example candidate" }],
  });

  // LLM proposals never write on their own. The admin must approve a
  // signed token. A student cannot replay the token or execute the action.
  await sleep(5100); // Extraction has a five-second, account-wide AI cooldown.
  const proposed = await json("/ai/ask", { body: {
    question: "Add student named AI Test Candidate with USN AITEST001 in ISE department, semester 3, email aitest@example.edu",
  } });
  assert.equal(proposed.action.operation, "create_student");
  assert.match(proposed.action.summary, /AITEST001/);
  assert.ok(proposed.action.token);
  const before = await json("/workspace");
  assert.equal(before.data.students.some(student => student.code === "AITEST001"), false);
  await json("/ai/actions/execute", { body: { token: proposed.action.token }, headers: studentHeaders, status: 403 });
  await json("/ai/actions/execute", { body: { token: proposed.action.token, confirmation: "" },
    headers: { ...adminHeaders, Origin: "https://malicious.example" }, status: 403 });
  const altered = proposed.action.token.slice(0, -1) + (proposed.action.token.endsWith("a") ? "b" : "a");
  await json("/ai/actions/execute", { body: { token: altered }, status: 403 });
  const committed = await json("/ai/actions/execute", { body: { token: proposed.action.token } });
  assert.equal(committed.ok, true);
  assert.equal(committed.result.code, "AITEST001");
  const after = await json("/workspace");
  assert.equal(after.data.students.filter(student => student.code === "AITEST001").length, 1);
  assert.equal(after.revision, before.revision + 1);
  await json("/ai/actions/execute", { body: { token: proposed.action.token }, status: 409 });
  const audit = await json("/audit");
  assert.ok(audit.some(row => row.action === "ai.action.create_student"));

  await sleep(850);
  const demo = await json("/ai/ask", { body: { question: "Remove the example students" } });
  assert.equal(demo.action.operation, "remove_demo_students");
  assert.equal(demo.action.confirmationPhrase, "REMOVE DEMO");
  assert.ok(demo.action.impact.students >= 100);
  await json("/ai/actions/execute", { body: { token: demo.action.token, confirmation: "yes" }, status: 422 });
  assert.equal((await json("/workspace")).data.students.some(student => student.code === "DEMO001"), true);
  // File knowledge is separate from roster imports and is per administrator.
  const documentHeaders = new Headers(adminHeaders);
  documentHeaders.set("content-type", "application/octet-stream");
  documentHeaders.set("x-document-name", encodeURIComponent("batch source.docx"));
  assert.equal((await json("/ai/documents", { headers: studentHeaders, status: 403 })).error !== undefined, true);
  const documentResponse = await fetch(base + "/api/ai/documents", {
    method: "POST", headers: documentHeaders, body: historicalDocx(),
  });
  const documentSaved = await documentResponse.json();
  assert.equal(documentResponse.status, 201, JSON.stringify(documentSaved));
  assert.match(documentSaved.summary, /NOT imported/i);
  assert.equal((await json("/ai/documents")).documents.length, 1);
  assert.equal((await json("/ai/documents", { headers: studentHeaders, status: 403 })).error !== undefined, true);
  const repeats = await fetch(base + "/api/ai/documents", {
    method: "POST", headers: documentHeaders, body: historicalDocx(),
  });
  assert.equal(repeats.status, 201);
  assert.equal((await repeats.json()).id, documentSaved.id, "Same evidence must deduplicate by content hash");
  await sleep(850);
  const fromFile = await json("/ai/ask", { body: { question: "What does my attached batch source file say about Candidate 1?" } });
  assert.match(fromFile.answer, /batch source/i);
  await json("/ai/documents", { method: "DELETE", headers: { ...adminHeaders, Origin: "https://attacker.example" }, status: 403 });
  assert.equal((await json("/ai/documents")).documents.length, 1);
  assert.equal((await json("/ai/documents", { method: "DELETE" })).removed, 1);
  assert.deepEqual((await json("/ai/documents")).documents, []);
  // The confirmed clean-up is verified at the end of smoke, after all other
  // reports and role-specific tests have used the synthetic fixture.
  return { demoCleanupToken: demo.action.token };
}
