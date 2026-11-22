import type { Classification, ImportedRecord, ImportPreview, ImportRow, UploadResult, ScreenProps, Reference, State } from "./types";
import { useEffect, useState } from "react";
import { isHistoricalBatchDocument, prepareStudentRoster } from "../../../shared/historical-roster.js";
import { api, errorMessage, send } from "./client";
import { Check, Download, FileUp } from "lucide-react";
import { Badge, Field, Select, Table } from "./controls";

export const attachmentTypes = ".csv,.xlsx,.xls,.pdf,.txt,.docx";

export const importLabels: Record<string, string> = {
  students: "Students",
  faculty: "Faculty",
  enrollments: "Exam enrollments",
  sittings: "Official exam timetable",
  references: "Course and historical references",
};

export const previewName = (record: ImportedRecord) =>
  record.name ||
  record.studentName ||
  record.courseName ||
  record.entry ||
  record.studentId ||
  record.code ||
  record.type;

export function Imports({
  data,
  eventId,
  sessions,
  revision,
  act,
  notify,
  busy,
  incomingFile,
  clearFile,
}: ScreenProps & { incomingFile: File | null; clearFile: State<File | null> }) {
  const [kind, setKind] = useState(""),
    [rows, setRows] = useState<ImportRow[]>([]),
    [sourceRows, setSourceRows] = useState<ImportRow[]>([]),
    [convertedRoster, setConvertedRoster] = useState(false),
    [rosterDepartment, setRosterDepartment] = useState(""),
    [rosterSemester, setRosterSemester] = useState(""),
    [text, setText] = useState(""),
    [classification, setClassification] = useState<Classification | null>(null),
    [filename, setFilename] = useState(""),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [skipInvalid, setSkipInvalid] = useState(false),
    [parsing, setParsing] = useState(false),
    [sittingId, setSitting] = useState(""),
    [roomId, setRoom] = useState(""),
    [json, setJson] = useState("");
  const historicalDocument =
    classification?.referenceType === "historical-lab-batch" &&
    isHistoricalBatchDocument(sourceRows);
  const incompatibleHistoricalKind =
    historicalDocument && kind !== "references" && !(kind === "students" && convertedRoster);
  const body = {
    kind,
    rows,
    revision,
    eventId,
    sittingId: sittingId || sessions[0]?.id,
    roomId: roomId || data.rooms[0]?.id,
  };
  useEffect(() => { setPreview(null); setSkipInvalid(false); }, [eventId, sittingId, roomId]);
  useEffect(() => {
    if (!incomingFile) return;
    clearFile(null);
    void fileChanged(incomingFile);
  }, [incomingFile, clearFile]);

  async function fileChanged(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      return notify("Use a file smaller than 10 MB.", true);
    setParsing(true);
    setPreview(null);
    setClassification(null);
    setSkipInvalid(false);
    setKind("");
    setText("");
    setRows([]);
    setSourceRows([]);
    setConvertedRoster(false);
    setRosterDepartment("");
    setRosterSemester("");
    setJson("");
    setFilename(file.name);
    try {
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (!ext || !["docx", "csv", "xlsx", "xls", "pdf", "txt"].includes(ext)) {
        throw Error("Select Word, CSV, Excel, TXT, or a searchable PDF.");
      }
      const format = ext === "docx" || ext === "pdf" ? ext : "spreadsheet";
      const { rows: output, classification: detected, text: extracted } = await api<UploadResult>("/import/" + format, {
        method: "POST",
        headers: {
          "content-type": format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/octet-stream",
          "x-document-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      setText(extracted || "");
      setClassification(detected);
      setKind(detected.destination || "");
      setSourceRows(output);
      setRows(output);
      setConvertedRoster(false);
      setRosterSemester(detected.semester ? String(detected.semester) : "");
      setJson(JSON.stringify(output, null, 2));
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setParsing(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h3>Review before committing</h3>
          <p>
            Niyam suggests where records belong. Review the rows before saving.
          </p>
        </div>
        {kind && kind !== "references" && (
          <a
            className="text-link"
            href={"/templates/" + kind + ".csv"}
            download
          >
            <Download size={15} />
            Download CSV template
          </a>
        )}
      </div>
      <div className="import-body">
        <div className="form-grid">
          <Field label="Record type">
            <select
              value={kind}
              onChange={(e) => {
                const nextKind = e.target.value;
                setKind(nextKind);
                setPreview(null);
                setSkipInvalid(false);
                if (historicalDocument) {
                  setRows(sourceRows);
                  setJson(JSON.stringify(sourceRows, null, 2));
                  setConvertedRoster(false);
                }
              }}
            >
              <option value="">Detect from file or choose</option>
              {Object.entries(importLabels).map(([type, label]) => (
                <option value={type} key={type}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {kind === "enrollments" && (
            <Field label="Enroll into sitting">
              <Select
                value={sittingId || sessions[0]?.id}
                onChange={setSitting}
                items={sessions}
              />
            </Field>
          )}
          {kind === "sittings" && (
            <Field label="Default room">
              <Select
                value={roomId || data.rooms[0]?.id}
                onChange={setRoom}
                items={data.rooms}
              />
            </Field>
          )}
        </div>
        {kind && kind !== "references" && (
          <p className="micro">
            Columns ·{" "}
            {
              {
                students: "code, name, department, semester, email",
                faculty: "code, name, department, email",
                enrollments:
                  "code (candidate ID), paper (paper code), accessible (yes/no)",
                sittings:
                  "sitting, code, subject, date, start, end, semester, department",
              }[kind]
            }
          </p>
        )}
        <label className="dropzone">
          <FileUp size={31} />
          <strong>
            {parsing
              ? "Reading document…"
              : filename || "Choose a file to import"}
          </strong>
          <span>Word, CSV, Excel, searchable PDF, or TXT · up to 10 MB</span>
          <input
            type="file"
            accept={attachmentTypes}
            disabled={parsing || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void fileChanged(file);
            }}
          />
        </label>
        {classification && (
          <div className="import-preview" aria-live="polite">
            <h3>
              Detected source: {importLabels[(classification.destination ?? "")] ||
                "Unclassified records"}
            </h3>
            {classification.evidence.map((message) => (
              <p key={message} className="micro">
                {message}
              </p>
            ))}
            {classification.conflicts?.map(({ table, row, message }) => (
              <p key={table + ":" + row} className="inline-error">
                Table {table}, row {row} · {message}
              </p>
            ))}
          </div>
        )}
        {historicalDocument && kind === "references" && (
          <p className="micro" role="status">
            Historical records are saved as references, not active exam candidates.
            To create current student profiles, select Students above and confirm
            their department and current semester.
          </p>
        )}
        {historicalDocument && kind === "students" && (
          <div className="import-preview historical-roster" aria-live="polite">
            <h3>Convert historical batch into a current student roster</h3>
            <p className="micro">
              This file contains historical lab assignments, not a verified
              current enrollment list. Confirm the department and CURRENT semester
              before creating student profiles. Imported profiles have no email;
              add verified emails before enabling Google sign-in or enrollment.
              Existing USNs are shown as updates at preview, not duplicated.
            </p>
            <div className="form-grid">
              <Field label="Department code (required)">
                <input
                  value={rosterDepartment}
                  onChange={(event) => {
                    setRosterDepartment(event.target.value);
                    setConvertedRoster(false);
                    setPreview(null);
                  }}
                  placeholder="e.g. ISE"
                  maxLength={32}
                  required
                />
              </Field>
              <Field label="Current semester (required)">
                <input type="number" min="1" max="16" step="1"
                  value={rosterSemester}
                  onChange={(event) => {
                    setRosterSemester(event.target.value);
                    setConvertedRoster(false);
                    setPreview(null);
                  }} required />
              </Field>
            </div>
            <button className="button" type="button" disabled={parsing || busy}
              onClick={() => {
                try {
                  const prepared = prepareStudentRoster(sourceRows, {
                    department: rosterDepartment, semester: rosterSemester,
                  });
                  setRows(prepared);
                  setJson(JSON.stringify(prepared, null, 2));
                  setConvertedRoster(true);
                  setPreview(null);
                  notify("Student roster prepared. Review every row before importing.");
                } catch (error) {
                  notify(errorMessage(error), true);
                }
              }}>
              Prepare student roster ({sourceRows.length} source rows)
            </button>
            {convertedRoster && (
              <p className="micro" role="status">
                Student rows prepared. Review the JSON and validate before committing.
                Any duplicate USNs will be reported for review.
              </p>
            )}
          </div>
        )}
        {historicalDocument && kind &&
          !["references", "students"].includes(kind) && (
          <p className="inline-error" role="alert">
            Historical lab-batch records cannot be imported as {importLabels[kind]}.
            Choose Course and historical references, or convert to Students.
          </p>
        )}
        {text && (
          <Field label="Document text">
            <textarea value={text} readOnly rows={6} />
          </Field>
        )}
        {json && (
          <>
            <Field label="Review and edit extracted rows as JSON">
              <textarea
                className="mono"
                rows={9}
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  setPreview(null);
                  setSkipInvalid(false);
                }}
              />
            </Field>
            <button
              className="button"
              disabled={busy || parsing || !kind || incompatibleHistoricalKind}
              onClick={async () => {
                try {
                  if (incompatibleHistoricalKind)
                    throw Error("Convert the historical document to students, or choose references.");
                  const changed = JSON.parse(json);
                  if (!Array.isArray(changed) || !changed.length)
                    throw Error("Enter one or more records to review.");
                  setRows(changed);
                  setSkipInvalid(false);
                  const result = await act(() =>
                    send<ImportPreview>("/import/preview", { ...body, rows: changed }),
                  );
                  if (result) setPreview({ ...result, revision });
                } catch (error) {
                  notify(errorMessage(error), true);
                }
              }}
            >
              Validate & preview changes
            </button>
          </>
        )}
        {preview && (
          <div className="import-preview">
            <h3>
              {preview.items.length} valid rows · {preview.errors.length}{" "}
              {preview.errors.length === 1 ? "error" : "errors"}
            </h3>
            {preview.errors.slice(0, 20).map((error, index) => (
              <p className="inline-error" key={index}>
                Row {error.row} · {error.message}
              </p>
            ))}
            {preview.errors.length > 20 && (
              <p className="micro" role="status">
                Showing 20 of {preview.errors.length} errors. Correct the
                source or choose the compatible record type before importing.
              </p>
            )}
            <Table headers={["Source row", "Action", "Record"]}>
              {preview.items.slice(0, 20).map((item) => (
                <tr key={item.record.id}>
                  <td>
                    {item.record.source
                      ? "Table " + item.record.source.table + ", row "
                      : ""}
                    {item.row}
                  </td>
                  <td>
                    <Badge>{item.action}</Badge>
                  </td>
                  <td>{previewName(item.record)}</td>
                </tr>
              ))}
            </Table>
            {preview.errors.length > 0 && preview.items.length > 0 && (
              <label className="partial-import">
                <input type="checkbox" checked={skipInvalid}
                  onChange={(event) => setSkipInvalid(event.target.checked)} />
                <span>Import {preview.items.length} valid rows and skip {preview.errors.length}
                  {" "}invalid {preview.errors.length === 1 ? "row" : "rows"}.
                  Review the conflicts first; skipped records will not be saved.</span>
              </label>
            )}
            <button className="button primary"
              disabled={busy || preview.items.length === 0 ||
                (preview.errors.length > 0 && !skipInvalid)}
              onClick={async () => {
                const result = await act(
                  () =>
                    send("/import/commit", {
                      ...body,
                      revision: preview.revision,
                      skipInvalid,
                    }),
                  skipInvalid
                    ? `Imported ${preview.items.length} valid rows; skipped ${preview.errors.length}`
                    : "Import committed",
                );
                if (result) {
                  setRows([]);
                  setJson("");
                  setPreview(null);
                  setSkipInvalid(false);
                  setFilename("");
                  setText("");
                  setClassification(null);
                  setSourceRows([]);
                  setConvertedRoster(false);
                  setRosterDepartment("");
                  setRosterSemester("");
                }
              }}
            >
              <Check size={17} />
              Commit {preview.items.length} rows
            </button>
          </div>
        )}
        {!!data.references?.length && (
          <SavedReferences references={data.references} />
        )}
      </div>
    </section>
  );
}

export function SavedReferences({ references }: { references: Reference[] }) {
  const [search, setSearch] = useState("");
  const matched = references.filter((row) =>
    [
      previewName(row),
      row.courseCode,
      row.studentId,
      row.year,
      row.term,
      row.batch,
      row.facultySuggestion,
    ].some((value) =>
      value?.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  return (
    <details className="import-preview">
      <summary>Saved references ({references.length})</summary>
      <Field label="Search references">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <Table
        headers={["Reference", "Academic year", "Section / batch", "Source"]}
      >
        {matched.slice(0, 25).map((row) => (
          <tr key={row.id}>
            <td>{previewName(row)}</td>
            <td>{row.year || row.term || "—"}</td>
            <td>{row.batch || row.section || "—"}</td>
            <td>
              {row.source.fileName} · Table {row.source.table}, row{" "}
              {row.source.row}
            </td>
          </tr>
        ))}
      </Table>
      {matched.length > 25 && (
        <p className="micro">Search to narrow the {matched.length} results.</p>
      )}
    </details>
  );
}
