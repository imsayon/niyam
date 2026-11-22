// Source-extracted from server/workspace.js at 702b472bf81272e321833acb44730ca7c1cf365b.
// Keep domain invariants in sync until the legacy app is retired.
import { z } from "zod";
import { ApiError } from "./security";
export const id = z.string().trim().min(1).max(80);
const label = z.string().trim().min(1).max(150);
const code = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((x) => x.toUpperCase());
const email = z.union([
  z.literal(""),
  z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
]);
const date = z.iso.date();
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const semester = z.coerce.number().int().min(1).max(16);
export const revision = z.number().int().min(0);
const choice = z.object({
  semester: semester.optional(),
  paper: code.optional(),
  department: code.optional(),
});
export const defaultPolicy = {
  patterns: { 3: [{ semester: 3 }, { semester: 5 }, { semester: 7 }] },
  neighbors: true,
  frontBack: false,
  diagonal: false,
  maxDuties: 3,
  leaveBuffer: 0,
  avoidRepeat: true,
};
export const policySchema = z.object({
  patterns: z
    .record(
      z.string().regex(/^([1-9]|[1-5][0-9]|60)$/),
      z.array(choice).max(60),
    )
    .refine(
      (value) =>
        Object.entries(value).every(
          ([size, seats]) => seats.length === Number(size),
        ),
      "A pattern must specify each position on the bench.",
    ),
  neighbors: z.boolean(),
  frontBack: z.boolean(),
  diagonal: z.boolean(),
  maxDuties: z.number().int().min(1).max(20),
  leaveBuffer: z.number().int().min(0).max(7),
  avoidRepeat: z.boolean(),
});
const paper = z.object({ id, code, name: label, semester, department: code });
const cell = z.object({
  id,
  bench: id,
  position: z.number().int().min(1).max(60),
  row: z.number().int().min(1).max(30),
  col: z.number().int().min(1).max(20),
  blocked: z.boolean(),
  accessible: z.boolean(),
});
const student = z.object({
  name: label,
  code,
  email,
  department: code,
  semester,
});
const faculty = z.object({
  name: label,
  code,
  email,
  department: code,
  available: z.boolean(),
});
const sitting = z.object({
  eventId: id,
  name: label,
  date,
  start: time,
  end: time,
  roomIds: z.array(id).min(1).max(10),
  status: z.enum(["scheduled", "cancelled"]),
  papers: z.array(paper).min(1).max(20),
});
const leave = z.object({
  facultyId: id,
  from: date,
  to: date,
  reason: z.string().trim().min(1).max(400),
});
export const schemas = {
  events: z.object({ name: label, cycle: label }),
  rooms: z.object({
    name: label,
    building: label,
    invigilators: z.number().int().min(1).max(8),
    cells: z.array(cell).min(1).max(600),
  }),
  faculty,
  students: student,
  sittings: sitting,
  enrollments: z.object({
    sittingId: id,
    paperId: id,
    studentId: id,
    accessible: z.boolean(),
  }),
  leaves: leave,
  references: z.object({
    type: z.enum(["course", "teaching", "historical-lab-batch"]),
    term: z.string().trim().max(30).optional(),
    year: z.string().trim().max(20).optional(),
    semester: semester.optional(),
    section: z.string().trim().max(40).optional(),
    batch: z.string().trim().max(40).optional(),
    courseCode: z.string().trim().max(40).optional(),
    courseName: z.string().trim().max(200).optional(),
    facultySuggestion: z.string().trim().max(150).optional(),
    studentName: z.string().trim().max(150).optional(),
    studentId: z.string().trim().max(40).optional(),
    day: z.string().trim().max(30).optional(),
    period: z.string().trim().max(40).optional(),
    entry: z.string().trim().max(300).optional(),
    roomLabel: z.string().trim().max(80).optional(),
    historical: z.boolean().default(false),
    candidatePool: z.boolean().default(false),
    source: z.object({
      fileName: z.string().trim().min(1).max(180),
      table: z.number().int().min(1).max(256),
      row: z.number().int().min(1).max(10000),
      column: z.number().int().min(1).max(100).optional(),
    }),
  }),
};

export export function fail(message, status = 422) {
  throw new ApiError(status, message);
}
export function get(rows, key) {
  const value = rows.find((row) => row.id === key);
  if (!value) fail("The requested record no longer exists.", 404);
  return value;
}
function unique(items) {
  return new Set(items).size === items.length;
}
export function editable(data, eventId) {
  const event = get(data.events, eventId);
  if (["completed", "archived"].includes(event.status))
    fail("This event is closed.");
  return event;
}
export function validate(data, kind, row) {
  if (kind === "references" && row.type === "historical-lab-batch") {
    if (!row.studentId || !row.studentName || !row.year || !row.batch)
      fail("Historical batch rows need an identifier, name, year, and batch.");
    row.historical = true;
    row.candidatePool = false;
  }
  if (
    ["students", "faculty"].includes(kind) &&
    data[kind].some((other) => other.id !== row.id && other.code === row.code)
  ) {
    fail("This directory identifier already exists.", 409);
  }
  if (kind === "rooms") {
    if (
      !unique(row.cells.map((c) => c.id)) ||
      !unique(row.cells.map((c) => c.row + ":" + c.col))
    )
      fail("Room seats must have unique positions and coordinates.");
    const benches = new Map();
    for (const cell of row.cells) {
      if (!benches.has(cell.bench)) benches.set(cell.bench, []);
      benches.get(cell.bench).push(cell.position);
    }
    if (
      [...benches.values()].some((positions) =>
        positions.sort((a, b) => a - b).some((p, i) => p !== i + 1),
      )
    )
      fail("Bench positions must start at 1 and be consecutive.");
    if (row.cells.every((cell) => cell.blocked))
      fail("A room needs at least one active seat.");
  }
  if (kind === "sittings") {
    editable(data, row.eventId);
    if (row.start >= row.end) fail("The end time must follow the start time.");
    if (!unique(row.roomIds) || !unique(row.papers.map((p) => p.id)))
      fail("Rooms and papers must be unique within a sitting.");
    row.roomIds.forEach((room) => get(data.rooms, room));
    if (
      data.enrollments.some(
        (e) =>
          e.sittingId === row.id && !row.papers.some((p) => p.id === e.paperId),
      )
    )
      fail("Move existing enrollments before deleting a paper.");
  }
  if (kind === "enrollments") {
    const block = get(data.sittings, row.sittingId);
    editable(data, block.eventId);
    get(block.papers, row.paperId);
    get(data.students, row.studentId);
    if (
      data.enrollments.some(
        (other) =>
          other.id !== row.id &&
          other.sittingId === row.sittingId &&
          other.studentId === row.studentId,
      )
    ) {
      fail("A student can only sit one paper in this sitting.", 409);
    }
  }
  if (kind === "leaves") {
    get(data.faculty, row.facultyId);
    if (row.from > row.to)
      fail("Leave end date must fall on or after the start date.");
  }
}
export export function update(data, kind, row) {
  validate(data, kind, row);
  const index = data[kind].findIndex((item) => item.id === row.id);
  if (index === -1) data[kind].push(row);
  else data[kind][index] = row;
  return row.id;
}
export function remove(data, kind, row) {
  const linked = {
    events: () =>
      data.sittings.some((s) => s.eventId === row.id) || row.status !== "draft",
    rooms: () => data.sittings.some((s) => s.roomIds.includes(row.id)),
    students: () =>
      data.enrollments.some((e) => e.studentId === row.id) ||
      data.runs.some((r) =>
        r.sessions.some((s) => s.seats.some((x) => x.studentId === row.id)),
      ),
    faculty: () =>
      data.leaves.some((l) => l.facultyId === row.id) ||
      data.runs.some((r) =>
        r.sessions.some((s) => s.duties.some((x) => x.facultyId === row.id)),
      ),
    sittings: () => {
      editable(data, row.eventId);
      return data.enrollments.some((e) => e.sittingId === row.id);
    },
    enrollments: () => {
      editable(data, get(data.sittings, row.sittingId).eventId);
      return false;
    },
    leaves: () => row.status !== "pending",
    references: () => false,
  };
  if (linked[kind]())
    fail(
      "This record is in use. Remove its dependencies or archive it instead.",
      409,
    );
  data[kind] = data[kind].filter((item) => item.id !== row.id);
}
