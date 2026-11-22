import type { PlanFailure, Run, ScreenProps } from "./types";
import { useState } from "react";
import { policyDefault, send } from "./client";
import { CheckCircle2, Play, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Blank, Field, Select, Table } from "./controls";
import { SeatMap } from "./rooms";

type SolveResponse = { revision: number; result: Run } | PlanFailure;

export function Allocation({
  data,
  event,
  eventId,
  run,
  revision,
  act,
  notify,
  busy,
}: ScreenProps) {
  const [policy, setPolicy] = useState(policyDefault),
    [failure, setFailure] = useState<PlanFailure | null>(null),
    [sittingId, setSitting] = useState(""),
    [roomId, setRoom] = useState(""),
    [table, setTable] = useState(false);
  const sizes = [
    ...new Set(
      data.rooms.flatMap((room) =>
        [...new Set(room.cells.map((cell) => cell.bench))].map(
          (bench) => room.cells.filter((cell) => cell.bench === bench).length,
        ),
      ),
    ),
  ].sort((a, b) => a - b);
  const sitting =
    run?.sessions.find((s) => s.id === sittingId) || run?.sessions[0];
  const room =
    data.rooms.find(
      (room) => room.id === roomId && sitting?.roomIds.includes(room.id),
    ) || data.rooms.find((room) => room.id === sitting?.roomIds[0]);
  return (
    <>
      <div className="allocation-layout">
        <section className="panel rules-panel">
          <div className="panel-title">
            <div>
              <h3>Allocation rules</h3>
              <p>Saved with every generated plan</p>
            </div>
            <Sparkles size={20} />
          </div>
          <h4>Repeating bench pattern</h4>
          <p className="micro">
            Choose the cohort for each physical seat. Empty positions accept any
            cohort.
          </p>
          {sizes.map((size) => (
            <div className="pattern" key={size}>
              <span>{size} seats per bench</span>
              <div className="pattern-slots">
                {Array.from({ length: size }, (_, index) => (
                  <Field key={index} label={"Seat " + (index + 1)}>
                    <select
                      value={policy.patterns[size]?.[index]?.semester || ""}
                      onChange={(e) => {
                        const list = Array.from(
                          { length: size },
                          (_, i) => policy.patterns[size]?.[i] || {},
                        );
                        list[index] = e.target.value
                          ? { semester: Number(e.target.value) }
                          : {};
                        setPolicy({
                          ...policy,
                          patterns: { ...policy.patterns, [size]: list },
                        });
                      }}
                    >
                      <option value="">Any semester</option>
                      {Array.from({ length: 16 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Semester {i + 1}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
          ))}
          <details>
            <summary>Paper and department selectors</summary>
            <p className="micro">
              Optional patterns for mixed papers in one semester. Each array
              item accepts semester, paper, and department.
            </p>
            <textarea
              rows={5}
              defaultValue={JSON.stringify(policy.patterns, null, 2)}
              onBlur={(e) => {
                try {
                  const patterns = JSON.parse(e.target.value);
                  if (
                    !patterns ||
                    Array.isArray(patterns) ||
                    typeof patterns !== "object"
                  )
                    throw Error();
                  setPolicy({ ...policy, patterns });
                } catch {
                  notify("Enter a valid JSON object for the patterns.", true);
                }
              }}
            />
          </details>
          <h4>Anti-collusion checks</h4>
          {([
            ["neighbors", "Same-paper neighbors on a bench"],
            ["frontBack", "Same paper directly front or behind"],
            ["diagonal", "Same paper diagonally adjacent"],
            ["avoidRepeat", "Prefer different rooms for faculty"],
          ] as const).map(([key, label]) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={policy[key]}
                onChange={(e) =>
                  setPolicy({ ...policy, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
          <div className="form-grid">
            <Field label="Max duties per faculty">
              <input
                type="number"
                min={1}
                max={20}
                value={policy.maxDuties}
                onChange={(e) =>
                  setPolicy({ ...policy, maxDuties: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Leave buffer days">
              <input
                type="number"
                min={0}
                max={7}
                value={policy.leaveBuffer}
                onChange={(e) =>
                  setPolicy({ ...policy, leaveBuffer: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <button
            className="button primary full"
            disabled={!event || busy}
            onClick={async () => {
              const response = await act(() =>
                send<SolveResponse>("/events/" + eventId + "/solve", { revision, policy }),
              );
              if (response) {
                if ("result" in response) {
                  setFailure(null);
                  notify(
                    "Draft allocation generated. Review before publishing.",
                  );
                } else setFailure(response);
              }
            }}
          >
            <Play size={16} />
            {busy ? "Calculating…" : "Generate allocation"}
          </button>
        </section>
        <div>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h3>Room plan</h3>
                <p>
                  {run
                    ? run.sessions.reduce((n, s) => n + s.seats.length, 0) +
                      " candidates assigned across " +
                      run.sessions.length +
                      " sittings"
                    : "Generate a plan to inspect student placements."}
                </p>
              </div>
              {run && (
                <Badge>
                  {event?.publishedRunId === run.id ? "published" : "draft"}
                </Badge>
              )}
            </div>
            {failure && (
              <div className="inline-error">
                <strong>
                  {failure.status === "timed_out"
                    ? "Search limit reached"
                    : failure.status === "needs_review"
                      ? "Review the exam inputs"
                      : "Arrangement infeasible"}
                </strong>
                {failure.issues.map((issue, index) => (
                  <p key={index}>
                    {typeof issue === "string" ? issue : issue.message}
                  </p>
                ))}
              </div>
            )}
            {run && run.revision + (run.publishedAt ? 1 : 0) !== revision && (
              <p className="inline-warning">
                Planning records changed. Generate a fresh plan before
                publishing.
              </p>
            )}
            {run ? (
              <>
                <div className="plan-tools">
                  <Select
                    value={sitting?.id}
                    onChange={setSitting}
                    items={run.sessions}
                  />
                  <Select
                    value={room?.id}
                    onChange={setRoom}
                    items={data.rooms.filter((room) =>
                      sitting?.roomIds.includes(room.id),
                    )}
                  />
                  <button
                    className="button small"
                    onClick={() => setTable(!table)}
                  >
                    {table ? "Room view" : "Table view"}
                  </button>
                </div>
                {room && sitting &&
                  (table ? (
                    <Table headers={["Candidate", "Paper", "Bench", "Seat"]}>
                      {sitting.seats
                        .filter((seat) => seat.roomId === room.id)
                        .map((seat) => (
                          <tr key={seat.studentId}>
                            <td>
                              {seat.student}
                              <small>{seat.code}</small>
                            </td>
                            <td>{seat.paper.code}</td>
                            <td>{seat.bench}</td>
                            <td>{seat.position}</td>
                          </tr>
                        ))}
                    </Table>
                  ) : (
                    <SeatMap
                      cells={room.cells}
                      seats={sitting.seats.filter(
                        (seat) => seat.roomId === room.id,
                      )}
                    />
                  ))}
                <div className="plan-summary">
                  <span>
                    <CheckCircle2 size={17} /> All candidates placed
                  </span>
                  <span>
                    <ShieldCheck size={17} /> Hard constraints satisfied
                  </span>
                </div>
                <div className="publish-bar">
                  <p>
                    Publishing makes this revision visible to faculty and
                    students.
                  </p>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      run.revision !== revision ||
                      event?.publishedRunId === run.id
                    }
                    onClick={() =>
                      act(
                        () =>
                          send("/events/" + eventId + "/publish", {
                            revision,
                            runId: run.id,
                          }),
                        "Plan published to students and faculty",
                      )
                    }
                  >
                    <Send size={16} />
                    Publish plan
                  </button>
                </div>
              </>
            ) : (
              <Blank title="Your plan will appear here">
                Configure the exam and enroll candidates, then generate an
                allocation.
              </Blank>
            )}
          </section>
          {sitting && (
            <section className="panel">
              <div className="panel-title">
                <h3>Invigilation duties</h3>
              </div>
              <Table headers={["Room", "Invigilator"]}>
                {sitting.duties.map((duty) => (
                  <tr key={duty.roomId + duty.facultyId}>
                    <td>{duty.room}</td>
                    <td>{duty.faculty}</td>
                  </tr>
                ))}
              </Table>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
