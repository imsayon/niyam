import type { ScreenProps, Save, Workspace, Sitting, DirectoryKind, Student, Faculty } from "./types";
import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Blank, Field, Select, Table } from "./controls";

export function Directory({ kind, data, setModal, drop, sessions }: ScreenProps & { kind: DirectoryKind }) {
  const [search, setSearch] = useState("");
  const rows = data[kind].filter((row) =>
    (row.name + row.code + row.email)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-title">
        <div className="search">
          <Search size={16} />
          <input
            placeholder="Search name, ID, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="button-row">
          {kind === "students" && (
            <button
              className="button"
              onClick={() => setModal({ type: "enrollment" })}
              disabled={!sessions.length}
            >
              <Plus size={16} />
              Enroll candidate
            </button>
          )}
          <button
            className="button primary"
            onClick={() => setModal({ type: kind })}
          >
            <Plus size={16} />
            Add {kind === "faculty" ? "faculty" : "student"}
          </button>
        </div>
      </div>
      {rows.length ? (
        <Table
          headers={[
            "Name",
            "Institution ID",
            "Department",
            kind === "students" ? "Semester / enrollment" : "Availability",
            "Email",
            "Actions",
          ]}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="person">
                  <span className="avatar pale">{row.name[0]}</span>
                  <strong>{row.name}</strong>
                </div>
              </td>
              <td className="mono">{row.code}</td>
              <td>{row.department}</td>
              <td>
                {kind === "students" ? (
                  <>
                    Semester {"semester" in row ? row.semester : ""}
                    <small>
                      {
                        data.enrollments.filter((e) => e.studentId === row.id)
                          .length
                      }{" "}
                      enrollments
                    </small>
                  </>
                ) : (
                  <Badge>{"available" in row && row.available ? "available" : "unavailable"}</Badge>
                )}
              </td>
              <td>{row.email || "—"}</td>
              <td>
                <div className="button-row">
                  <button
                    className="icon"
                    aria-label={"Edit " + row.name}
                    onClick={() => setModal({ type: kind, row })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon"
                    aria-label={"Delete " + row.name}
                    onClick={() => drop(kind, row)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Blank title="No matching records" />
      )}
      <div className="table-footer">
        {rows.length} {kind === "faculty" ? "faculty members" : "students"}
      </div>
    </section>
  );
}

export function DirectoryForm({ kind, row, save, busy, department }: { kind: DirectoryKind; row?: Student | Faculty; save: Save; busy: boolean; department?: string }) {
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        save({
          ...values,
          ...(kind === "faculty"
            ? { available: values.available === "yes" }
            : { semester: Number(values.semester) }),
        });
      }}
    >
      <div className="form-grid">
        {[
          ["name", "Full name"],
          ["code", "Institution ID"],
          ["department", "Department"],
          ["email", "Email address"],
        ].map(([key, label]) => (
          <Field label={label} key={key}>
            <input
              name={key}
              type={key === "email" ? "email" : "text"}
              defaultValue={
                row?.[key as "name" | "code" | "email" | "department"] || (key === "department" ? department : "") || ""
              }
              required={key !== "email"}
              maxLength={key === "email" ? 254 : 100}
            />
          </Field>
        ))}
        {kind === "students" ? (
          <Field label="Semester">
            <input
              name="semester"
              type="number"
              min={1}
              max={16}
              required
              defaultValue={row && "semester" in row ? row.semester : 3}
            />
          </Field>
        ) : (
          <Field label="Available for duties">
            <select
              name="available"
              defaultValue={row && "available" in row && !row.available ? "no" : "yes"}
            >
              <option value="yes">Available</option>
              <option value="no">Unavailable</option>
            </select>
          </Field>
        )}
      </div>
      <button className="button primary" disabled={busy}>
        Save record
      </button>
    </form>
  );
}

export function EnrollmentForm({ data, sessions, save, busy }: { data: Workspace; sessions: Sitting[]; save: Save; busy: boolean }) {
  const [sittingId, setSitting] = useState(sessions[0]?.id || "");
  const sitting = sessions.find((s) => s.id === sittingId);
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.currentTarget));
        save({ ...v, sittingId, accessible: v.accessible === "on" });
      }}
    >
      <Field label="Sitting">
        <Select value={sittingId} onChange={setSitting} items={sessions} />
      </Field>
      <Field label="Candidate">
        <select name="studentId" required>
          {data.students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Paper">
        <select name="paperId" required key={sittingId}>
          {sitting?.papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input name="accessible" type="checkbox" />
        Requires accessible seating
      </label>
      <button className="button primary" disabled={busy}>
        Enroll candidate
      </button>
      <p className="micro">
        Use Import records to enroll candidates in bulk with candidate ID and
        paper code.
      </p>
    </form>
  );
}
