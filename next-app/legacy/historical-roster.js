// A lab batch document is historical reference material by default.
// Promoting its occupants to the active roster requires a deliberate admin action.
export const isHistoricalBatch = (row) =>
  !!row && typeof row === "object" && row.type === "historical-lab-batch";

export function isHistoricalBatchDocument(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.every(isHistoricalBatch);
}

export function prepareStudentRoster(rows, { department, semester }) {
  if (!isHistoricalBatchDocument(rows))
    throw new Error("Select an extracted historical lab-batch document first.");

  const code = String(department ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,31}$/.test(code))
    throw new Error("Specify a valid department code (for example, ISE).");
  const term = Number(semester);
  if (!Number.isInteger(term) || term < 1 || term > 16)
    throw new Error("Confirm the current semester (1–16) before importing students.");

  return rows.map((row) => ({
    code: String(row.studentId ?? "").replace(/\s+/g, "").toUpperCase(),
    name: String(row.studentName ?? "").trim(),
    department: code,
    semester: term,
    email: "",
  }));
}
