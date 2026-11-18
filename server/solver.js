import { createHash } from "node:crypto";

const ordered = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const overlap = (a, b) =>
  a.date === b.date && a.start < b.end && b.start < a.end;
const day = (date) => Date.parse(date + "T00:00:00Z") / 86400000;
const rank = (seed, id) =>
  createHash("sha256")
    .update(seed + ":" + id)
    .digest("hex");

export function solve(data, eventId, policy, limit = 100_000) {
  let visits = 0;
  const issues = [];
  const sessions = data.sittings
    .filter((s) => s.eventId === eventId && s.status !== "cancelled")
    .sort(ordered);
  const published = new Set(
    data.events
      .filter((e) => e.id !== eventId && e.status !== "archived")
      .map((e) => e.publishedRunId),
  );
  const others = data.runs
    .filter((r) => published.has(r.id))
    .flatMap((r) => r.sessions);
  const completed = new Set(
    data.events
      .filter((e) => e.status === "completed" || e.status === "archived")
      .map((e) => e.publishedRunId),
  );
  const history = new Map();
  for (const duty of data.runs
    .filter((r) => completed.has(r.id))
    .flatMap((r) => r.sessions.flatMap((s) => s.duties))) {
    history.set(duty.facultyId, (history.get(duty.facultyId) || 0) + 1);
  }
  const jobs = sessions.map((sitting) => ({
    ...sitting,
    rooms: sitting.roomIds.map((id) => data.rooms.find((r) => r.id === id)),
    entries: data.enrollments
      .filter((entry) => entry.sittingId === sitting.id)
      .sort(ordered),
  }));
  if (!jobs.length) issues.push("Add at least one scheduled sitting.");
  for (const [index, sitting] of jobs.entries()) {
    if (!sitting.entries.length)
      issues.push(sitting.name + " has no enrolled students.");
    if (sitting.entries.length > 600)
      issues.push(
        sitting.name + " exceeds the supported limit of 600 candidates.",
      );
    if (!sitting.rooms.length || sitting.rooms.some((room) => !room))
      issues.push(sitting.name + " needs valid rooms.");
    const ids = new Set(sitting.entries.map((entry) => entry.studentId));
    if (ids.size !== sitting.entries.length)
      issues.push(sitting.name + " has a student enrolled twice.");
    for (const other of [...jobs.slice(0, index), ...others]) {
      if (!overlap(sitting, other)) continue;
      if (other.roomIds.some((id) => sitting.roomIds.includes(id)))
        issues.push(
          sitting.name + " overlaps a room booking in " + other.name + ".",
        );
      if (
        (other.entries || other.seats).some((entry) => ids.has(entry.studentId))
      )
        issues.push(
          sitting.name + " overlaps a student exam in " + other.name + ".",
        );
    }
  }
  if (issues.length) return { status: "infeasible", issues };
  const planned = [];
  let timedOut = false;
  const consume = () => {
    if (++visits <= limit) return true;
    timedOut = true;
    return false;
  };
  for (const sitting of jobs) {
    const cells = [];
    for (const room of sitting.rooms) {
      const sizes = new Map();
      for (const cell of room.cells)
        sizes.set(cell.bench, (sizes.get(cell.bench) || 0) + 1);
      for (const cell of room.cells) {
        if (cell.blocked) continue;
        const selector =
          policy.patterns[String(sizes.get(cell.bench))]?.[cell.position - 1];
        cells.push({ ...cell, roomId: room.id, roomName: room.name, selector });
      }
    }
    const groups = new Map();
    for (const entry of sitting.entries) {
      const student = data.students.find((s) => s.id === entry.studentId);
      const paper = sitting.papers.find((p) => p.id === entry.paperId);
      if (!student || !paper)
        return {
          status: "infeasible",
          issues: [
            "Review roster and paper references in " + sitting.name + ".",
          ],
        };
      const id = paper.id + ":" + Number(entry.accessible);
      if (!groups.has(id))
        groups.set(id, {
          id,
          paper,
          accessible: entry.accessible,
          students: [],
          used: [],
        });
      groups.get(id).students.push(student);
    }
    const adjacent = cells.map(() => []);
    const placed = Array(cells.length).fill(null);
    const within = (a, b) =>
      policy.neighbors &&
      a.bench === b.bench &&
      Math.abs(a.position - b.position) === 1;
    for (let i = 0; i < cells.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = cells[i],
          b = cells[j];
        if (a.roomId !== b.roomId) continue;
        const dr = Math.abs(a.row - b.row),
          dc = Math.abs(a.col - b.col);
        if (
          within(a, b) ||
          (policy.frontBack && dr === 1 && dc === 0) ||
          (policy.diagonal && dr === 1 && dc === 1)
        ) {
          adjacent[i].push(j);
          adjacent[j].push(i);
        }
      }
    }
    const candidates = [...groups.values()].sort(ordered);
    for (const group of candidates) {
      const { paper } = group;
      group.options = cells.flatMap((cell, i) => {
        const rule = cell.selector;
        const matches =
          !rule ||
          ((!rule.semester || rule.semester === paper.semester) &&
            (!rule.paper || rule.paper === paper.code) &&
            (!rule.department || rule.department === paper.department));
        return matches && (!group.accessible || cell.accessible) ? [i] : [];
      });
      if (group.options.length < group.students.length) {
        issues.push(
          sitting.name +
            " / " +
            paper.code +
            (group.accessible ? " (accessible)" : "") +
            " needs " +
            group.students.length +
            " seats, with " +
            group.options.length +
            " eligible.",
        );
      }
    }
    if (sitting.entries.length > cells.length)
      issues.push(
        sitting.name +
          " has " +
          cells.length +
          " active seats for " +
          sitting.entries.length +
          " candidates.",
      );
    if (issues.length) return { status: "infeasible", issues };
    function seat(remaining) {
      if (!remaining) return true;
      if (!consume()) return false;
      let next = null,
        options = [];
      for (const group of candidates) {
        const need = group.students.length - group.used.length;
        if (!need) continue;
        const last = group.used.at(-1) ?? -1;
        const available = group.options.filter(
          (i) =>
            i > last &&
            !placed[i] &&
            !adjacent[i].some((j) => placed[j] === group.paper.code),
        );
        if (available.length < need) return false;
        if (
          !next ||
          available.length - need <
            options.length - (next.students.length - next.used.length)
        ) {
          next = group;
          options = available;
        }
      }
      for (const i of options) {
        placed[i] = next.paper.code;
        next.used.push(i);
        if (seat(remaining - 1)) return true;
        placed[i] = null;
        next.used.pop();
        if (timedOut) return false;
      }
      return false;
    }
    if (!seat(sitting.entries.length)) {
      return {
        status: timedOut ? "timed_out" : "infeasible",
        issues: [
          sitting.name +
            (timedOut
              ? " exceeded the seating search budget."
              : " has no placement meeting the bench, capacity, and adjacency rules."),
        ],
      };
    }
    const seats = candidates.flatMap((group) => {
      const students = group.students
        .map((student) => ({ student, rank: rank(sitting.id, student.id) }))
        .sort((a, b) => a.rank.localeCompare(b.rank));
      return group.used.map((index, i) => {
        const { id, roomId, roomName, bench, position, row, col } =
          cells[index];
        const student = students[i].student;
        return {
          studentId: student.id,
          student: student.name,
          code: student.code,
          paper: group.paper,
          seatId: id,
          roomId,
          roomName,
          bench,
          position,
          row,
          col,
        };
      });
    });
    const { id, name, date, start, end, roomIds } = sitting;
    planned.push({ id, name, date, start, end, roomIds, seats, duties: [] });
  }
  const faculty = data.faculty
    .filter((person) => person.available)
    .sort(ordered);
  const tasks = planned
    .flatMap((sitting, index) =>
      jobs[index].rooms.map((room) => {
        const eligible = faculty.filter(
          (person) =>
            !data.leaves.some(
              (leave) =>
                leave.status === "approved" &&
                leave.facultyId === person.id &&
                day(sitting.date) >= day(leave.from) - policy.leaveBuffer &&
                day(sitting.date) <= day(leave.to) + policy.leaveBuffer,
            ) &&
            !others.some(
              (other) =>
                overlap(sitting, other) &&
                other.duties.some((duty) => duty.facultyId === person.id),
            ),
        );
        return { sitting, room, eligible };
      }),
    )
    .sort((a, b) => a.eligible.length - b.eligible.length);
  for (const task of tasks) {
    if (task.eligible.length < task.room.invigilators)
      issues.push(
        task.sitting.name +
          " / " +
          task.room.name +
          " has only " +
          task.eligible.length +
          " eligible invigilators.",
      );
  }
  if (issues.length) return { status: "infeasible", issues };
  const load = new Map(faculty.map((person) => [person.id, []]));
  function duty(index, slot = 0) {
    if (index === tasks.length) return true;
    if (!consume()) return false;
    const { sitting, room, eligible } = tasks[index];
    if (slot === room.invigilators) return duty(index + 1);
    const eligibleNow = eligible
      .filter((person) => {
        const assigned = load.get(person.id);
        return (
          assigned.length < policy.maxDuties &&
          !assigned.some((record) => overlap(sitting, record.sitting))
        );
      })
      .sort((a, b) => {
        const x = load.get(a.id),
          y = load.get(b.id);
        return (
          x.length - y.length ||
          (history.get(a.id) || 0) - (history.get(b.id) || 0) ||
          (policy.avoidRepeat
            ? Number(x.some((r) => r.roomId === room.id)) -
              Number(y.some((r) => r.roomId === room.id))
            : 0) ||
          ordered(a, b)
        );
      });
    for (const person of eligibleNow) {
      load.get(person.id).push({ sitting, roomId: room.id });
      sitting.duties.push({
        facultyId: person.id,
        faculty: person.name,
        roomId: room.id,
        room: room.name,
      });
      if (duty(index, slot + 1)) return true;
      sitting.duties.pop();
      load.get(person.id).pop();
      if (timedOut) return false;
    }
    return false;
  }
  if (!duty(0))
    return {
      status: timedOut ? "timed_out" : "infeasible",
      issues: [
        timedOut
          ? "The invigilation search budget was exhausted."
          : "The available staff cannot cover all rooms within the leave, overlap, and duty limits.",
      ],
    };
  return { status: "feasible", issues: [], sessions: planned };
}
