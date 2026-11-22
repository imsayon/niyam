import type { ScreenProps, Save, Workspace, Account } from "./types";
import { dateLabel, send } from "./client";
import { Badge, Blank, Field, Table } from "./controls";
import { Download, Plus } from "lucide-react";

export function Personal(props: ScreenProps) {
  const { data, account } = props;
  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>
              {account.role === "student" ? "My exams & seats" : "My duties"}
            </h3>
            <p>Current published examination plans</p>
          </div>
        </div>
        {data.schedules?.length ? (
          <div className="personal-cards">
            {data.schedules.map((item, i) => (
              <article className="personal-card" key={item.id + i}>
                <div className="eyebrow">{item.event}</div>
                <h2>{item.seat?.paper.name || item.name}</h2>
                <p>
                  {dateLabel(item.date)} · {item.start}–{item.end}
                </p>
                <div className="personal-assignment">
                  <div>
                    <span>ROOM</span>
                    <strong>{item.seat?.roomName || item.duty?.room}</strong>
                  </div>
                  {item.seat && (
                    <>
                      <div>
                        <span>BENCH</span>
                        <strong>{item.seat.bench}</strong>
                      </div>
                      <div>
                        <span>POSITION</span>
                        <strong>{item.seat.position}</strong>
                      </div>
                    </>
                  )}
                </div>
                {item.seats && (
                  <details>
                    <summary>Room candidate list ({item.seats.length})</summary>
                    <Table headers={["Candidate", "Paper", "Bench / seat"]}>
                      {item.seats.map((seat) => (
                        <tr key={seat.code}>
                          <td>
                            {seat.student}
                            <small>{seat.code}</small>
                          </td>
                          <td>{seat.paper}</td>
                          <td>
                            {seat.bench} / {seat.position}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </details>
                )}
                <small className="micro">Published plan</small>
                <a
                  className="text-link"
                  href={
                    "/api/export/" +
                    encodeURIComponent(item.event) +
                    "/timetable.pdf"
                  }
                >
                  <Download size={14} />
                  Download timetable
                </a>
              </article>
            ))}
          </div>
        ) : (
          <Blank title="Your plan is awaiting publication">
            Your examination office will publish your assignments here.
          </Blank>
        )}
      </section>
      {account.role === "faculty" && (
        <Leaves {...props} />
      )}
    </>
  );
}

export function Leaves({ data, account, setModal, act, revision, busy }: ScreenProps) {
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h3>Leave requests</h3>
          <p>Approved leave is enforced during allocation.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setModal({ type: "leave" })}
        >
          <Plus size={15} />
          Request leave
        </button>
      </div>
      {data.leaves?.length ? (
        <Table headers={["Faculty", "Dates", "Reason", "Status", "Review"]}>
          {data.leaves.map((leave) => (
            <tr key={leave.id}>
              <td>
                {data.faculty?.find((f) => f.id === leave.facultyId)?.name ||
                  account.name}
              </td>
              <td>
                {dateLabel(leave.from)}
                <small>to {dateLabel(leave.to)}</small>
              </td>
              <td>{leave.reason}</td>
              <td>
                <Badge>{leave.status}</Badge>
              </td>
              <td>
                {account.role === "admin" && leave.status === "pending" && (
                  <div className="button-row">
                    {["approved", "rejected"].map((status) => (
                      <button
                        key={status}
                        className="button small"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              send(
                                "/records/leaves/" + leave.id,
                                { revision, record: { status } },
                                "PATCH",
                              ),
                            "Leave " + status,
                          )
                        }
                      >
                        {status === "approved" ? "Approve" : "Reject"}
                      </button>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Blank title="No leave requests" />
      )}
    </section>
  );
}

export function LeaveForm({ data, account, save, busy }: { data: Workspace; account: Account; save: Save; busy: boolean }) {
  return (
    <form
      className="dialog-content"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          ...(account.role === "faculty"
            ? { facultyId: account.rosterId }
            : {}),
        });
      }}
    >
      {account.role === "admin" && (
        <Field label="Faculty">
          <select name="facultyId" required>
            {data.faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="From">
          <input name="from" type="date" required />
        </Field>
        <Field label="To">
          <input name="to" type="date" required />
        </Field>
      </div>
      <Field label="Reason">
        <textarea name="reason" maxLength={400} required rows={3} />
      </Field>
      <button className="button primary" disabled={busy}>
        Submit request
      </button>
    </form>
  );
}
