import type { ScreenProps, EventRecord, Save, Workspace, Sitting } from "./types";
import { Badge, Blank, Field, Table } from "./controls";
import { ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { dateLabel, send } from "./client";
import { useState } from "react";

export function Events({
  data,
  event,
  eventId,
  sessions,
  setModal,
  act,
  revision,
  drop,
  busy,
}: ScreenProps) {
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>{event?.name || "Choose an examination"}</h3>
            <p>{event?.cycle}</p>
          </div>
          {event && (
            <div className="button-row">
              <Badge>{event.status}</Badge>
              {event.status === "draft" && (
                <button
                  className="icon"
                  aria-label="Delete examination"
                  onClick={() => drop("events", event)}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                className="button small"
                onClick={() => setModal({ type: "event", row: event })}
              >
                <Pencil size={14} />
                Edit
              </button>
              {event.status === "published" && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Withdraw the current plan from student and faculty views?",
                      )
                    )
                      act(
                        () =>
                          send("/events/" + eventId + "/transition", {
                            revision,
                            to: "configured",
                          }),
                        "Published plan withdrawn",
                      );
                  }}
                >
                  Withdraw plan
                </button>
              )}
              {["draft", "published", "completed"].includes(event.status) && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        send("/events/" + eventId + "/transition", {
                          revision,
                          to: {
                            draft: "configured",
                            published: "completed",
                            completed: "archived",
                          }[event.status],
                        }),
                      "Event updated",
                    )
                  }
                >
                  {
                    {
                      draft: "Mark configured",
                      published: "Complete event",
                      completed: "Archive event",
                    }[event.status]
                  }
                </button>
              )}
            </div>
          )}
        </div>
        <div className="lifecycle">
          {["Draft", "Configured", "Published", "Completed", "Archived"].map(
            (stage) => (
              <span
                className={
                  event?.status === stage.toLowerCase() ? "current" : ""
                }
                key={stage}
              >
                {stage}
                <ChevronRight size={14} />
              </span>
            ),
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Sittings & papers</h3>
            <p>
              Each sitting can contain several papers and share a set of rooms.
            </p>
          </div>
          <button
            className="button primary"
            disabled={!event}
            onClick={() => setModal({ type: "sitting" })}
          >
            <Plus size={16} />
            Add sitting
          </button>
        </div>
        {sessions.length ? (
          <Table
            headers={[
              "Sitting",
              "Date & time",
              "Papers",
              "Rooms",
              "Candidates",
              "Status",
              "Actions",
            ]}
          >
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                </td>
                <td>
                  {dateLabel(s.date)}
                  <small>
                    {s.start}–{s.end}
                  </small>
                </td>
                <td>
                  {s.papers.map((p) => (
                    <small key={p.id}>
                      {p.code} · Semester {p.semester}
                    </small>
                  ))}
                </td>
                <td>
                  {s.roomIds
                    .map((id) => data.rooms.find((r) => r.id === id)?.name)
                    .join(", ")}
                </td>
                <td>
                  {data.enrollments.filter((e) => e.sittingId === s.id).length}
                </td>
                <td>
                  <Badge>{s.status}</Badge>
                </td>
                <td>
                  <div className="button-row">
                    <button
                      className="icon"
                      aria-label="Edit sitting"
                      onClick={() => setModal({ type: "sitting", row: s })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon"
                      aria-label="Delete sitting"
                      onClick={() => drop("sittings", s)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Blank title="Add your first sitting" />
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Candidate enrollment</h3>
            <p>Review or remove registrations for this examination.</p>
          </div>
          <button
            className="button"
            disabled={!sessions.length}
            onClick={() => setModal({ type: "enrollment" })}
          >
            <Plus size={15} />
            Enroll candidate
          </button>
        </div>
        <Table
          headers={[
            "Candidate",
            "Sitting",
            "Paper",
            "Accessibility",
            "Actions",
          ]}
        >
          {data.enrollments.map((entry) => {
            const sitting = sessions.find(
              (sitting) => sitting.id === entry.sittingId,
            );
            if (!sitting) return null;
            const person = data.students.find(
              (student) => student.id === entry.studentId,
            );
            return (
              <tr key={entry.id}>
                <td>
                  {person?.name}
                  <small>{person?.code}</small>
                </td>
                <td>{sitting.name}</td>
                <td>
                  {
                    sitting.papers.find((paper) => paper.id === entry.paperId)
                      ?.code
                  }
                </td>
                <td>{entry.accessible ? "Required" : "Standard"}</td>
                <td>
                  <button
                    className="icon"
                    aria-label={"Remove enrollment for " + person?.name}
                    onClick={() => drop("enrollments", entry)}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      </section>
    </>
  );
}

export function EventForm({ row, save, busy }: { row?: EventRecord; save: Save; busy: boolean }) {
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        save(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <Field label="Examination name">
        <input
          name="name"
          defaultValue={row?.name}
          required
          maxLength={150}
          placeholder="End-Semester Examinations"
        />
      </Field>
      <Field label="Academic cycle">
        <input
          name="cycle"
          defaultValue={row?.cycle}
          required
          maxLength={150}
          placeholder="2026–27 · Odd semester"
        />
      </Field>
      <button className="button primary" disabled={busy}>
        Save examination
      </button>
    </form>
  );
}

export function SittingForm({ data, eventId, row, save, busy, department = "CSE" }: { data: Workspace; eventId: string; row?: Sitting; save: Save; busy: boolean; department?: string }) {
  const [papers, setPapers] = useState(
    row?.papers || [
      {
        id: crypto.randomUUID(),
        code: "",
        name: "",
        semester: 3,
        department,
      },
    ],
  );
  const [roomIds, setRoomIds] = useState(row?.roomIds || []);
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          eventId: row?.eventId || eventId,
          papers,
          roomIds,
        });
      }}
    >
      <div className="form-grid">
        <Field label="Sitting name">
          <input name="name" defaultValue={row?.name} required />
        </Field>
        <Field label="Exam date">
          <input name="date" type="date" defaultValue={row?.date} required />
        </Field>
        <Field label="Starts">
          <input
            name="start"
            type="time"
            defaultValue={row?.start || "09:30"}
            required
          />
        </Field>
        <Field label="Ends">
          <input
            name="end"
            type="time"
            defaultValue={row?.end || "12:00"}
            required
          />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={row?.status || "scheduled"}>
            <option>scheduled</option>
            <option>cancelled</option>
          </select>
        </Field>
      </div>
      <h3>Available rooms</h3>
      <div className="checks">
        {data.rooms.map((room) => (
          <label key={room.id}>
            <input
              type="checkbox"
              checked={roomIds.includes(room.id)}
              onChange={(e) =>
                setRoomIds(
                  e.target.checked
                    ? [...roomIds, room.id]
                    : roomIds.filter((id) => id !== room.id),
                )
              }
            />
            {room.name}
          </label>
        ))}
      </div>
      <h3>Papers in this sitting</h3>
      {papers.map((paper, i) => (
        <div className="paper-form" key={paper.id}>
          {([
            ["code", "Paper code"],
            ["name", "Paper name"],
            ["semester", "Semester"],
            ["department", "Department"],
          ] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                value={paper[key]}
                type={key === "semester" ? "number" : "text"}
                min={1}
                max={16}
                required
                onChange={(e) =>
                  setPapers(
                    papers.map((p, j) =>
                      j === i
                        ? {
                            ...p,
                            [key]:
                              key === "semester"
                                ? Number(e.target.value)
                                : key === "name"
                                  ? e.target.value
                                  : e.target.value.toUpperCase(),
                          }
                        : p,
                    ),
                  )
                }
              />
            </Field>
          ))}
          <button
            type="button"
            className="icon"
            onClick={() => setPapers(papers.filter((_, j) => j !== i))}
            aria-label="Remove paper"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        onClick={() =>
          setPapers([
            ...papers,
            {
              id: crypto.randomUUID(),
              code: "",
              name: "",
              semester: 3,
              department,
            },
          ])
        }
      >
        <Plus size={15} />
        Add paper
      </button>
      <button
        className="button primary"
        disabled={busy || !papers.length || !roomIds.length}
      >
        Save sitting
      </button>
    </form>
  );
}
