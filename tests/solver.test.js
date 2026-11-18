import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../server/fixture.js";
import { solve } from "../server/solver.js";
import { defaultPolicy, scoped } from "../server/workspace.js";

test("full 3/5/7 seating honors enrollment, patterns, blocked cells, duties and repeatability", () => {
  const data = fixture(),
    result = solve(data, "demo-event", defaultPolicy);
  assert.equal(result.status, "feasible");
  const sitting = result.sessions[0];
  assert.equal(sitting.seats.length, 120);
  assert.equal(new Set(sitting.seats.map((seat) => seat.studentId)).size, 120);
  assert.equal(
    new Set(sitting.seats.map((seat) => seat.roomId + seat.seatId)).size,
    120,
  );
  for (const seat of sitting.seats) {
    assert.equal(seat.paper.semester, [3, 5, 7][seat.position - 1]);
    const cell = data.rooms
      .find((room) => room.id === seat.roomId)
      .cells.find((cell) => cell.id === seat.seatId);
    assert.equal(cell.blocked, false);
    if (seat.studentId === "student-1") assert.equal(cell.accessible, true);
  }
  assert.equal(sitting.duties.length, 6);
  assert.equal(new Set(sitting.duties.map((duty) => duty.facultyId)).size, 6);
  assert.deepEqual(solve(data, "demo-event", defaultPolicy), result);
});
test("infeasible capacity never creates partial assignments", () => {
  const data = fixture();
  data.rooms.forEach((room) =>
    room.cells.forEach((cell) => (cell.blocked = true)),
  );
  const result = solve(data, "demo-event", defaultPolicy);
  assert.equal(result.status, "infeasible");
  assert.equal(result.sessions, undefined);
});
test("cancelled sittings and approved leave are enforced", () => {
  const data = fixture();
  data.sittings.push({
    ...data.sittings[0],
    id: "cancelled",
    status: "cancelled",
  });
  data.leaves.push({
    facultyId: "faculty-1",
    from: data.sittings[0].date,
    to: data.sittings[0].date,
    status: "approved",
  });
  const result = solve(data, "demo-event", defaultPolicy);
  assert.equal(result.status, "feasible");
  assert.equal(result.sessions.length, 1);
  assert.ok(
    result.sessions[0].duties.every((duty) => duty.facultyId !== "faculty-1"),
  );
});
test("overlap, search timeout and corrupted enrollment produce explicit failures", () => {
  const data = fixture();
  data.sittings.push({ ...data.sittings[0], id: "collision" });
  data.enrollments.push({
    ...data.enrollments[0],
    id: "duplicate",
    sittingId: "collision",
  });
  assert.equal(solve(data, "demo-event", defaultPolicy).status, "infeasible");
  assert.equal(
    solve(fixture(), "demo-event", defaultPolicy, 0).status,
    "timed_out",
  );
  const missing = fixture();
  missing.enrollments[0].studentId = "missing";
  assert.equal(
    solve(missing, "demo-event", defaultPolicy).status,
    "infeasible",
  );
});
test("bounded backtracking recovers a feasible assignment missed by simple greedy", () => {
  const data = fixture();
  data.rooms = data.rooms.slice(0, 1);
  data.rooms[0].invigilators = 2;
  data.sittings[0].roomIds = [data.rooms[0].id];
  data.students = data.students.slice(0, 3);
  data.enrollments = data.enrollments.slice(0, 3);
  data.sittings.push({ ...data.sittings[0], id: "later", date: "2026-12-12" });
  data.sittings[0].date = "2026-12-11";
  data.enrollments.push(
    ...data.enrollments
      .slice(0, 3)
      .map((e) => ({ ...e, id: e.id + "later", sittingId: "later" })),
  );
  data.faculty = data.faculty.slice(0, 4);
  data.leaves = data.faculty
    .slice(2)
    .map((f) => ({
      facultyId: f.id,
      from: "2026-12-12",
      to: "2026-12-12",
      status: "approved",
    }));
  const result = solve(data, "demo-event", {
    ...defaultPolicy,
    patterns: {},
    neighbors: false,
    maxDuties: 1,
  });
  assert.equal(result.status, "feasible");
  assert.ok(
    result.sessions
      .find((s) => s.id === "later")
      .duties.every((d) => ["faculty-1", "faculty-2"].includes(d.facultyId)),
  );
});
test("personal views omit drafts and disclose only own published records", () => {
  const data = fixture();
  data.runs.push({
    ...solve(data, "demo-event", defaultPolicy),
    id: "run",
    eventId: "demo-event",
  });
  const student = { role: "student", roster_id: "student-1" };
  assert.equal(scoped(data, student).schedules.length, 0);
  data.events[0].publishedRunId = "run";
  data.events[0].status = "published";
  assert.equal(scoped(data, student).schedules.length, 1);
  assert.equal(scoped(data, student).schedules[0].seat.studentId, "student-1");
  assert.equal(scoped(data, student).students, undefined);
});
