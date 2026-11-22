const word = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function classifyRows(fileName, rows = []) {
  const headers = new Set(
    Object.keys(rows[0] || {})
      .map(word)
      .filter(Boolean),
  );
  const has = (...names) => names.some((name) => headers.has(word(name)));
  let destination = null;
  let evidence = [];
  if (
    has("paper code", "code") &&
    has("date", "exam date") &&
    has("start", "start time") &&
    has("end", "end time") &&
    has("subject", "paper name")
  ) {
    destination = "sittings";
    evidence = ["Paper, subject, date, and exam-time columns are present."];
  } else if (
    has("paper", "paper code", "subject code") &&
    has("candidate id", "student id", "usn", "code")
  ) {
    destination = "enrollments";
    evidence = ["Candidate and paper identifier columns are present."];
  } else if (
    (has("employee id", "employeeid", "faculty id") ||
      (has("code") &&
        has("email") &&
        /\b(faculty|teacher|staff)\b/.test(word(fileName)))) &&
    has("name")
  ) {
    destination = "faculty";
    evidence = ["Faculty identifier and name columns are present."];
  } else if (
    has("usn", "student id", "candidate id", "code") &&
    has("name") &&
    has("semester")
  ) {
    destination = "students";
    evidence = ["Student identifier, name, and semester columns are present."];
  }
  return {
    destination,
    evidence: evidence.length
      ? evidence
      : ["No unique record type matched the document structure."],
    manualOverrideRequired: !destination,
  };
}

export function classifyDocx(paragraphs, tables) {
  const source = paragraphs.join(" ");
  const text = word(source);
  const year = /\b20\d{2}\s*[-–/]\s*(?:20)?\d{2}\b/
    .exec(source)?.[0]
    .replace(/\s/g, "")
    .replace(/[–/]/g, "-");
  const sem = /\bsem(?:ester)?\s*:\s*([IVX]+(?:\s+[IVX]+)*|\d{1,2})\b/i
    .exec(source)?.[1]
    .replace(/\s/g, "")
    .toUpperCase();
  const semester =
    { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 }[sem] ||
    Number(sem) ||
    undefined;
  const isWeekday = (value) =>
    /^(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?)$/i.test(
      value || "",
    );
  const grids = tables.filter(
    (table) =>
      (table.rows[0] || []).some((cell) => word(cell).includes("day")) ||
      table.rows.slice(1).some((row) => isWeekday(row[0])),
  );
  const legends = tables.filter((table) => {
    const header = (table.rows[0] || []).map(word);
    return (
      header.some((cell) => cell.includes("code")) &&
      header.some((cell) => cell.includes("subject"))
    );
  });
  if (
    /lab/.test(text) &&
    /batch/.test(text) &&
    tables.length > 0 &&
    tables.every(({ rows }) => {
      const header = (rows[0] || []).map(word);
      return (
        rows.length > 1 && header.includes("usn") && header.includes("name")
      );
    }) &&
    year
  ) {
    const rowCount = tables.reduce(
      (sum, table) => sum + table.rows.length - 1,
      0,
    );
    return {
      destination: "students",
      referenceType: "historical-lab-batch",
      semester,
      term: year,
      evidence: [
        "Batch tables with student identifiers and an academic year were detected.",
        `${rowCount} student identifiers were found in batch tables. Confirm their CURRENT department and semester before creating or updating student records; an old lab list does not prove current exam enrollment.`,
      ],
      manualOverrideRequired: false,
    };
  }
  if (
    /\btime\s*table\b/.test(text) &&
    /semester|\bsem\b/.test(text) &&
    grids.length > 0 &&
    grids.length === legends.length &&
    tables.length === grids.length + legends.length &&
    tables.every((table, index) =>
      (index % 2 === 0 ? grids : legends).includes(table),
    )
  ) {
    return {
      destination: "references",
      referenceType: "weekly-timetable",
      evidence: [
        "Weekly class grids and course legends were detected.",
        "Faculty text is stored as an unverified match suggestion only.",
      ],
      semester,
      term: year,
      manualOverrideRequired: false,
    };
  }
  return {
    destination: null,
    evidence: [
      `${tables.length} tables and ${paragraphs.length} paragraphs were extracted locally.`,
      "The document does not match a supported structure; choose a destination and review every row.",
    ],
    manualOverrideRequired: true,
  };
}
