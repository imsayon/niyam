import assert from "node:assert/strict";
import test from "node:test";
import { classifyRows } from "../server/import-classifier.js";
import { fixture } from "../server/fixture.js";
import { importRows } from "../server/workspace.js";

test("infers official timetable and directory destinations from their columns", () => {
  const timetable = {
    Sitting: "Sample morning",
    "Paper Code": "ISE301",
    "Paper Name": "Sample examination",
    "Exam Date": "2026-12-01",
    "Start Time": "09:00",
    "End Time": "11:00",
    Semester: 3,
    Department: "ISE",
  };
  assert.equal(
    classifyRows("records.xlsx", [timetable]).destination,
    "sittings",
  );
  assert.equal(
    classifyRows("records.xlsx", [{ "Employee ID": "F01", Name: "Faculty" }])
      .destination,
    "faculty",
  );
  assert.equal(
    classifyRows("records.xlsx", [{ USN: "S01", Name: "Student", Semester: 3 }])
      .destination,
    "students",
  );
  assert.equal(
    classifyRows("records.xlsx", [{ Name: "Unknown" }]).manualOverrideRequired,
    true,
  );

  const data = fixture();
  const review = importRows(data, {
    kind: "sittings",
    eventId: data.events[0].id,
    roomId: data.rooms[0].id,
    rows: [timetable, { ...timetable, "Paper Code": "ISE701", Semester: 7 }],
  });
  assert.equal(review.errors.length, 0);
  assert.equal(review.items.length, 1);
  assert.equal(review.items[0].record.papers.length, 2);
  assert.equal(review.items[0].record.date, "2026-12-01");
});

test("keeps multiple teaching cells in one row and flags historical ID conflicts across batches", () => {
  const data = { ...fixture(), references: [] };
  const lab = {
    type: "historical-lab-batch",
    year: "2025-26",
    semester: 3,
    section: "A",
    batch: "A1",
    studentId: "SAMPLE01",
    studentName: "Sample Student",
    candidatePool: true,
    source: { fileName: "sample.docx", table: 1, row: 2 },
  };
  const teaching = {
    type: "teaching",
    term: "2026-27",
    semester: 7,
    section: "A",
    day: "MON",
    entry: "Sample teaching",
    source: { fileName: "sample-timetable.docx", table: 1, row: 2, column: 2 },
  };
  const review = importRows(data, {
    kind: "references",
    rows: [
      lab,
      { ...lab, batch: "A2", source: { ...lab.source, table: 2 } },
      teaching,
      { ...teaching, source: { ...teaching.source, column: 3 } },
    ],
  });
  assert.equal(review.errors.length, 1);
  assert.match(review.errors[0].message, /Duplicate identifier/);
  assert.equal(review.items.length, 3);
  assert.equal(review.items[0].record.historical, true);
  assert.equal(review.items[0].record.candidatePool, false);
  assert.deepEqual(data.references, []);
});
