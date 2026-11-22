// A lab batch document is historical reference material by default.
// Promoting its occupants to the active roster requires a deliberate admin action.
export const isHistoricalBatch = (row) =>
  !!row && typeof row === "object" && row.type === "historical-lab-batch";

export function isHistoricalBatchDocument(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.every(isHistoricalBatch);
}

// Identical appearances of one student across batch tables describe one
// identity. Conflicting names for the same identifier MUST remain visible to
// the import preview instead of silently merging two people.
export function reviewStudentRoster(rows, { department, semester }) {
  if (!isHistoricalBatchDocument(rows))
    throw new Error("Select an extracted historical lab-batch document first.");
  const code = String(department ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,31}$/.test(code))
    throw new Error("Specify a valid department code (for example, ISE).");
  const term = Number(semester);
  if (!Number.isInteger(term) || term < 1 || term > 16)
    throw new Error("Confirm the current semester (1–16) before importing students.");
  const seen = new Map();
  const roster = [];
  let identicalDuplicates = 0;
  const conflicts = [];
  for (const [index, row] of rows.entries()) {
    const candidate = {
      code: String(row.studentId ?? "").replace(/\s+/g, "").toUpperCase(),
      name: String(row.studentName ?? "").replace(/\s+/g, " ").trim(),
      department: code,
      semester: term,
      email: "",
    };
    const prior = seen.get(candidate.code);
    if (prior && candidate.code) {
      if (prior.name.toLowerCase() === candidate.name.toLowerCase()) {
        identicalDuplicates++;
        continue;
      }
      conflicts.push({
        code: candidate.code,
        firstName: prior.name,
        anotherName: candidate.name,
        sourceRow: row.source?.row ?? index + 2,
      });
      // Retain the conflicting row so the backend preview blocks it and
      // the administrator must choose the correct identity.
    } else if (candidate.code) seen.set(candidate.code, candidate);
    roster.push(candidate);
  }
  return { roster, identicalDuplicates, conflicts };
}

export function prepareStudentRoster(rows, options) {
  return reviewStudentRoster(rows, options).roster;
}
