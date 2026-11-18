import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { requireRole } from "./accounts.js";
import { change, snapshot, HttpError } from "./store.js";
import { solve } from "./solver.js";

const id = z.string().trim().min(1).max(80);
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
const revision = z.number().int().min(0);
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
const policySchema = z.object({
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
const schemas = {
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
};

function fail(message, status = 422) {
  throw new HttpError(status, message);
}
function get(rows, key) {
  const value = rows.find((row) => row.id === key);
  if (!value) fail("The requested record no longer exists.", 404);
  return value;
}
function unique(items) {
  return new Set(items).size === items.length;
}
function editable(data, eventId) {
  const event = get(data.events, eventId);
  if (["completed", "archived"].includes(event.status))
    fail("This event is closed.");
  return event;
}
function validate(data, kind, row) {
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
function update(data, kind, row) {
  validate(data, kind, row);
  const index = data[kind].findIndex((item) => item.id === row.id);
  if (index === -1) data[kind].push(row);
  else data[kind][index] = row;
  return row.id;
}
function remove(data, kind, row) {
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
  };
  if (linked[kind]())
    fail(
      "This record is in use. Remove its dependencies or archive it instead.",
      409,
    );
  data[kind] = data[kind].filter((item) => item.id !== row.id);
}
export function scoped(data, account) {
  if (account.role === "admin") return data;
  const events = data.events.filter(
    (event) => event.publishedRunId && event.status !== "archived",
  );
  const published = new Set(events.map((event) => event.publishedRunId));
  const schedules = [];
  for (const run of data.runs.filter((run) => published.has(run.id))) {
    const event = events.find((event) => event.id === run.eventId);
    for (const session of run.sessions) {
      const { id, name, date, start, end } = session;
      if (account.role === "student") {
        const seat = session.seats.find(
          (seat) => seat.studentId === account.roster_id,
        );
        if (seat)
          schedules.push({
            id,
            event: event.name,
            name,
            date,
            start,
            end,
            revision: run.id,
            seat,
          });
      } else {
        const duties = session.duties.filter(
          (duty) => duty.facultyId === account.roster_id,
        );
        for (const duty of duties) {
          const seats = session.seats
            .filter((seat) => seat.roomId === duty.roomId)
            .map(({ student, code, paper, bench, position }) => ({
              student,
              code,
              paper: paper.code,
              bench,
              position,
            }));
          schedules.push({
            id,
            event: event.name,
            name,
            date,
            start,
            end,
            revision: run.id,
            duty,
            seats,
          });
        }
      }
    }
  }
  schedules.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return {
    schedules,
    leaves:
      account.role === "faculty"
        ? data.leaves.filter((leave) => leave.facultyId === account.roster_id)
        : [],
  };
}

const ingestKinds = z.enum(["students", "faculty", "enrollments", "sittings"]);
const importSchema = z.object({
  revision,
  kind: ingestKinds,
  rows: z
    .array(
      z.record(
        z.string(),
        z.union([z.string().max(300), z.number(), z.boolean(), z.null()]),
      ),
    )
    .min(1)
    .max(250),
  eventId: id.optional(),
  sittingId: id.optional(),
  roomId: id.optional(),
});
function importRows(data, body) {
  const items = [];
  const errors = [];
  const original = structuredClone(data);
  for (const [index, raw] of body.rows.entries()) {
    try {
      const found = {};
      for (const [key, value] of Object.entries(raw))
        found[key.trim().toLowerCase()] = String(value ?? "").trim();
      let next;
      if (body.kind === "students")
        next = student.parse({
          name: found.name,
          code: found.code || found.usn,
          email: found.email || "",
          department: found.department || found.branch,
          semester: found.semester,
        });
      if (body.kind === "faculty")
        next = faculty.parse({
          name: found.name,
          code: found.code || found.employeeid,
          email: found.email || "",
          department: found.department || found.branch,
          available: found.available !== "false",
        });
      if (body.kind === "enrollments") {
        const block = get(data.sittings, body.sittingId);
        const person = data.students.find(
          (person) => person.code === found.code?.toUpperCase(),
        );
        const examination = block.papers.find(
          (paper) => paper.code === found.paper?.toUpperCase(),
        );
        if (!person || !examination) fail("Check candidate ID and paper code.");
        next = {
          sittingId: block.id,
          paperId: examination.id,
          studentId: person.id,
          accessible: /^(yes|true|1)$/i.test(found.accessible),
        };
      }
      if (body.kind === "sittings") {
        next = sitting.parse({
          eventId: body.eventId,
          name: found.name || found.subject,
          date: found.date,
          start: found.start,
          end: found.end,
          status: "scheduled",
          roomIds: [body.roomId],
          papers: [
            {
              id: "paper-1",
              code: found.code,
              name: found.subject,
              semester: found.semester,
              department: found.department,
            },
          ],
        });
      }
      const matches = (row) =>
        next.code
          ? row.code === next.code
          : body.kind === "enrollments"
            ? row.sittingId === next.sittingId &&
              row.studentId === next.studentId
            : row.eventId === next.eventId &&
              row.date === next.date &&
              row.start === next.start &&
              row.papers[0]?.code === next.papers[0].code;
      const existing = original[body.kind].find(matches);
      if (items.some((item) => matches(item.record)))
        fail("Duplicate row in this import.");
      const record = { ...next, id: existing?.id || randomUUID() };
      validate(data, body.kind, record);
      items.push({
        row: index + 2,
        action: existing ? "update" : "create",
        record,
      });
    } catch (error) {
      errors.push({
        row: index + 2,
        message:
          error instanceof z.ZodError
            ? error.issues
                .map((issue) => issue.path.join(".") + " " + issue.message)
                .join(", ")
            : error.message,
      });
    }
  }
  return { items, errors };
}

export function workspaceApi(app, db) {
  app.get("/api/workspace", async (req, res) => {
    const account = requireRole(req);
    const { data, revision } = await snapshot(db);
    res.json({ data: scoped(data, account), revision });
  });
  app.get("/api/audit", async (req, res) => {
    requireRole(req, "admin");
    const { rows } = await db.query(
      "SELECT at,actor,action,target FROM niyam_audit ORDER BY id DESC LIMIT 100",
    );
    res.json(rows);
  });
  app.post("/api/records/:kind", async (req, res) => {
    const kind = z.enum(Object.keys(schemas)).parse(req.params.kind);
    const account = requireRole(
      req,
      ...(kind === "leaves" ? ["admin", "faculty"] : ["admin"]),
    );
    const body = z.object({ revision, record: z.unknown() }).parse(req.body);
    const value = schemas[kind].parse(body.record);
    if (kind === "leaves" && account.role === "faculty")
      value.facultyId = account.roster_id;
    if (kind === "leaves") value.status = "pending";
    if (kind === "events")
      Object.assign(value, { status: "draft", publishedRunId: null });
    const key = randomUUID();
    res
      .status(201)
      .json(
        await change(
          db,
          body.revision,
          account.id,
          kind + ".created",
          key,
          (data) => update(data, kind, { ...value, id: key }),
        ),
      );
  });
  app.patch("/api/records/:kind/:id", async (req, res) => {
    const account = requireRole(req, "admin");
    const kind = z.enum(Object.keys(schemas)).parse(req.params.kind);
    const key = id.parse(req.params.id);
    const body = z.object({ revision, record: z.unknown() }).parse(req.body);
    const value =
      kind === "leaves"
        ? z
            .object({ status: z.enum(["approved", "rejected"]) })
            .parse(body.record)
        : schemas[kind].parse(body.record);
    res.json(
      await change(
        db,
        body.revision,
        account.id,
        kind + ".updated",
        key,
        (data) => {
          const row = get(data[kind], key);
          if (kind === "events") editable(data, key);
          if (kind === "sittings") editable(data, row.eventId);
          if (kind === "enrollments")
            editable(data, get(data.sittings, row.sittingId).eventId);
          if (kind === "leaves" && row.status !== "pending")
            fail("This request has already been reviewed.");
          return update(data, kind, { ...row, ...value });
        },
      ),
    );
  });
  app.delete("/api/records/:kind/:id", async (req, res) => {
    const account = requireRole(req, "admin");
    const kind = z.enum(Object.keys(schemas)).parse(req.params.kind);
    const key = id.parse(req.params.id);
    const body = z.object({ revision }).parse(req.body);
    res.json(
      await change(
        db,
        body.revision,
        account.id,
        kind + ".deleted",
        key,
        async (data, client) => {
          if (["faculty", "students"].includes(kind)) {
            const { rowCount } = await client.query(
              "SELECT id FROM niyam_accounts WHERE role=$1 AND roster_id=$2",
              [kind === "faculty" ? "faculty" : "student", key],
            );
            if (rowCount) fail("This record is linked to an account.", 409);
          }
          return remove(data, kind, get(data[kind], key));
        },
      ),
    );
  });
  app.post("/api/accounts/:id/decision", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = z.uuid().parse(req.params.id);
    const body = z
      .object({
        revision,
        action: z.enum(["approve", "reject", "disable"]),
        rosterId: id.optional(),
      })
      .parse(req.body);
    res.json(
      await change(
        db,
        body.revision,
        account.id,
        "account." + body.action,
        key,
        async (data, client) => {
          const {
            rows: [pending],
          } = await client.query(
            "SELECT * FROM niyam_accounts WHERE id=$1 FOR UPDATE",
            [key],
          );
          if (!pending || pending.role === "admin")
            fail("Account cannot be managed here.");
          if (body.action === "approve") {
            if (!pending.verified_at || pending.status !== "pending")
              fail("The email must be verified and awaiting approval.");
            const person = get(
              data[pending.role === "faculty" ? "faculty" : "students"],
              body.rosterId,
            );
            const { rows: linked } = await client.query(
              "SELECT id FROM niyam_accounts WHERE role=$1 AND roster_id=$2",
              [pending.role, person.id],
            );
            if (linked.length)
              fail("That roster record is already linked.", 409);
            await client.query(
              "UPDATE niyam_accounts SET status='active',roster_id=$1 WHERE id=$2",
              [person.id, key],
            );
          } else {
            const status = body.action === "disable" ? "disabled" : "rejected";
            await client.query(
              "UPDATE niyam_accounts SET status=$1 WHERE id=$2",
              [status, key],
            );
            await client.query(
              "DELETE FROM niyam_sessions WHERE account_id=$1",
              [key],
            );
          }
        },
        { planning: false },
      ),
    );
  });
  app.post("/api/events/:id/transition", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = id.parse(req.params.id);
    const body = z
      .object({ revision, to: z.enum(["configured", "completed", "archived"]) })
      .parse(req.body);
    res.json(
      await change(
        db,
        body.revision,
        account.id,
        "event." + body.to,
        key,
        (data) => {
          const event = get(data.events, key);
          const allowed = {
            draft: "configured",
            published: "completed",
            completed: "archived",
          };
          const withdrawing =
            event.status === "published" && body.to === "configured";
          if (!withdrawing && allowed[event.status] !== body.to)
            fail("This lifecycle transition is unavailable.", 409);
          if (
            body.to === "configured" &&
            !withdrawing &&
            !data.sittings.some(
              (s) => s.eventId === key && s.status === "scheduled",
            )
          )
            fail("Add a scheduled sitting first.");
          if (withdrawing) event.publishedRunId = null;
          event.status = body.to;
        },
      ),
    );
  });
  app.post("/api/events/:id/solve", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = id.parse(req.params.id);
    const body = z.object({ revision, policy: policySchema }).parse(req.body);
    const row = await snapshot(db);
    if (row.revision !== body.revision)
      fail("Refresh before solving again.", 409);
    const event = editable(row.data, key);
    if (event.status === "draft")
      fail("Configure the event before running allocation.");
    const solution = solve(row.data, key, body.policy);
    if (solution.status !== "feasible") return res.json(solution);
    const keyRun = randomUUID();
    const run = {
      ...solution,
      id: keyRun,
      eventId: key,
      revision: row.revision,
      policy: body.policy,
      at: new Date().toISOString(),
    };
    res.json(
      await change(
        db,
        row.revision,
        account.id,
        "allocation.solved",
        keyRun,
        (data) => {
          const retained = new Set(
            data.events.map((event) => event.publishedRunId).filter(Boolean),
          );
          data.runs = data.runs.filter(
            (run) =>
              run.eventId !== key || retained.has(run.id) || run.publishedAt,
          );
          data.runs.push(run);
          return run;
        },
        { planning: false },
      ),
    );
  });
  app.post("/api/events/:id/publish", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = id.parse(req.params.id);
    const body = z.object({ revision, runId: id }).parse(req.body);
    res.json(
      await change(
        db,
        body.revision,
        account.id,
        "allocation.published",
        body.runId,
        (data) => {
          const event = editable(data, key);
          const run = get(data.runs, body.runId);
          if (
            run.eventId !== key ||
            run.revision !== body.revision ||
            run.status !== "feasible"
          )
            fail("Run a fresh allocation against the current records.", 409);
          const checked = solve(data, key, run.policy);
          if (
            checked.status !== "feasible" ||
            !isDeepStrictEqual(checked.sessions, run.sessions)
          )
            fail(
              "The draft could not be reproduced. Run allocation again.",
              409,
            );
          run.publishedAt = new Date().toISOString();
          event.publishedRunId = run.id;
          event.status = "published";
          return run.id;
        },
      ),
    );
  });
  app.post("/api/import/preview", async (req, res) => {
    requireRole(req, "admin");
    const body = importSchema.parse(req.body);
    const row = await snapshot(db);
    if (row.revision !== body.revision) fail("Refresh before importing.", 409);
    res.json(importRows(row.data, body));
  });
  app.post("/api/import/commit", async (req, res) => {
    const account = requireRole(req, "admin");
    const body = importSchema.parse(req.body);
    const { revision: base, ...input } = body;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    res.json(
      await change(
        db,
        base,
        account.id,
        "import.committed",
        body.kind,
        (data) => {
          if (data.imports.includes(fingerprint))
            fail("These exact rows were already imported.", 409);
          const { items, errors } = importRows(data, body);
          if (errors.length)
            throw new HttpError(
              422,
              "Correct the invalid rows before committing.",
              errors,
            );
          for (const { record } of items) update(data, body.kind, record);
          data.imports.push(fingerprint);
          return items.length;
        },
      ),
    );
  });
}
