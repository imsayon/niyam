import assert from "node:assert/strict";
import test from "node:test";
import { classifyRows, classifyDocx } from "../server/import-classifier.js";
import { fixture } from "../server/fixture.js";
import { importRows } from "../server/workspace.js";
import { isHistoricalBatchDocument, prepareStudentRoster, reviewStudentRoster } from "../shared/historical-roster.js";

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

test("208 historical DOCX rows stay references unless explicitly converted to students", () => {
  const data = fixture();
  const sourceRows = Array.from({ length: 208 }, (_, index) => ({
    type: "historical-lab-batch",
    year: "2025-26",
    semester: 3,
    section: "A",
    batch: index < 104 ? "A1" : "A2",
    studentId: "1DS24IS" + String(index === 207 ? 205 : index + 1).padStart(3, "0"),
    studentName: "Candidate " + (index + 1),
    historical: true,
    candidatePool: false,
    source: {
      fileName: "III _ Lab Batches_2025-26.docx",
      table: index < 104 ? 1 : 9,
      row: index % 104 + 2,
    },
  }));
  assert.equal(isHistoricalBatchDocument(sourceRows), true);
  assert.throws(
    () => prepareStudentRoster(sourceRows, { department: "", semester: 3 }),
    /department code/,
  );
  assert.throws(
    () => prepareStudentRoster(sourceRows, { department: "ISE", semester: "" }),
    /current semester/,
  );

  const wrongType = importRows(data, { kind: "students", rows: sourceRows });
  assert.equal(wrongType.items.length, 0);
  assert.equal(wrongType.errors.length, 208);
  assert.match(wrongType.errors[0].message, /historical lab reference/);

  const references = importRows(data, { kind: "references", rows: sourceRows });
  assert.equal(references.items.length, 207);
  assert.equal(references.errors.length, 1);
  assert.deepEqual(data.references, []);

  const roster = prepareStudentRoster(sourceRows, { department: "ise", semester: "3" });
  assert.equal(roster.length, 208);
  assert.deepEqual(roster[0], {
    code: "1DS24IS001",
    name: "Candidate 1",
    department: "ISE",
    semester: 3,
    email: "",
  });
  assert.equal(sourceRows[0].studentId, "1DS24IS001");
  const rosterPreview = importRows(data, { kind: "students", rows: roster });
  assert.equal(rosterPreview.items.length, 207);
  assert.equal(rosterPreview.errors.length, 1);
  assert.match(rosterPreview.errors[0].message, /Duplicate row/);
  assert.equal(data.students.length, 120);
});

test("an existing student USN is an update, not another student", () => {
  const data = fixture();
  const existing = data.students[0];
  const row = {
    code: existing.code.toLowerCase(),
    name: "Reviewed Name",
    department: "ISE",
    semester: 3,
    email: "",
  };
  const reviewed = importRows(data, { kind: "students", rows: [row] });
  assert.equal(reviewed.errors.length, 0);
  assert.equal(reviewed.items.length, 1);
  assert.equal(reviewed.items[0].action, "update");
  assert.equal(reviewed.items[0].record.id, existing.id);
  assert.equal(reviewed.items[0].record.email, existing.email);
  assert.equal(data.students[0].name, existing.name);
});


test("batch student roster consolidates identical repeated USNs but retains identity conflicts", () => {
  const sample = {
    type: "historical-lab-batch",
    studentId: "1DS24IS007", studentName: "Test Student",
    source: { fileName: "batch.docx", table: 1, row: 2 },
  };
  const review = reviewStudentRoster([
    sample,
    { ...sample, studentId: " 1ds24is007 ", source: { ...sample.source, row: 3 } },
    { ...sample, studentName: "Different Student", source: { ...sample.source, row: 4 } },
  ], { department: "ISE", semester: 3 });
  assert.equal(review.identicalDuplicates, 1);
  assert.equal(review.conflicts.length, 1);
  assert.equal(review.conflicts[0].code, "1DS24IS007");
  assert.equal(review.roster.length, 2);
  assert.deepEqual(review.roster[0], {
    code: "1DS24IS007", name: "Test Student",
    department: "ISE", semester: 3, email: "",
  });
});

test("DOCX lab batches are recognized as student identity sources, not automatically enrolled", () => {
  const classified = classifyDocx(
    ["III Semester Lab Batches 2025-26"],
    [{ rows: [["USN", "Name"], ["1DS24IS007", "Test Student"]] }],
  );
  assert.equal(classified.destination, "students");
  assert.equal(classified.referenceType, "historical-lab-batch");
  assert.match(classified.evidence.join(" "), /current exam enrollment/i);
});
