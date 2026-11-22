import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { requireRole } from "./accounts.js";
import { HttpError } from "./store.js";
import {
  allocationReadiness,
  editable,
  fail,
  get,
  importRows,
  policySchema,
  remove,
  schemas,
  scoped,
  update,
} from "./workspace.js";
import { departmentId } from "./firebase-store.js";
import { firebaseAdminEmail } from "./firebase-auth.js";
import { solve } from "./solver.js";

const id = z.string().trim().min(1).max(80);
const revision = z.number().int().min(0);
const referenceId = z.string().regex(/^[a-f\d]{64}$/i);
const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function checkDepartment(req, body = {}) {
  const papers = Array.isArray(body.record?.papers) ? body.record.papers : [];
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const values = [
    req.params.department,
    req.query.department,
    body.department,
    body.record?.department,
    ...papers.map((paper) => paper?.department),
    ...rows.map((row) =>
      row && typeof row === "object" ? row.department : undefined,
    ),
  ].filter((value) => value !== undefined && value !== null && value !== "");
  if (
    req.account?.department !== departmentId ||
    values.some((value) => value !== departmentId)
  )
    throw new HttpError(403, "This request is outside the ISE workspace.");
}

function validateDepartment(kind, record) {
  if (
    ["students", "faculty"].includes(kind) &&
    record.department !== departmentId
  )
    fail("Records must belong to the ISE department.", 403);
  if (
    kind === "sittings" &&
    record.papers.some((paper) => paper.department !== departmentId)
  )
    fail("Exam papers must belong to the ISE department.", 403);
}

export function firebaseWorkspaceApi(app, store) {
  app.get("/api/workspace", async (req, res) => {
    const account = requireRole(req);
    checkDepartment(req);
    const since =
      req.query.since === undefined
        ? undefined
        : z.coerce.number().int().min(0).parse(req.query.since);
    const row = await store.snapshot(since);
    if (row.unchanged) return res.json(row);
    res.json({
      data: scoped(row.data, account),
      revision: row.revision,
      marker: row.marker,
    });
  });

  app.get("/api/audit", async (req, res) => {
    requireRole(req, "admin");
    checkDepartment(req);
    res.json(await store.auditRows());
  });

  app.post("/api/records/:kind", async (req, res) => {
    const kind = z.enum(Object.keys(schemas)).parse(req.params.kind);
    const account = requireRole(
      req,
      ...(kind === "leaves" ? ["admin", "faculty"] : ["admin"]),
    );
    checkDepartment(req, req.body);
    const body = z.object({ revision, record: z.unknown() }).parse(req.body);
    const value = schemas[kind].parse(body.record);
    validateDepartment(kind, value);
    if (kind === "leaves" && account.role === "faculty")
      value.facultyId = account.roster_id;
    if (kind === "leaves") value.status = "pending";
    if (kind === "events")
      Object.assign(value, { status: "draft", publishedRunId: null });
    const key = randomUUID();
    res
      .status(201)
      .json(
        await store.commitMutation(
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
    checkDepartment(req, req.body);
    const body = z.object({ revision, record: z.unknown() }).parse(req.body);
    const value =
      kind === "leaves"
        ? z
            .object({ status: z.enum(["approved", "rejected"]) })
            .parse(body.record)
        : schemas[kind].parse(body.record);
    validateDepartment(kind, value);
    res.json(
      await store.commitMutation(
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
    checkDepartment(req, req.body);
    const body = z.object({ revision }).parse(req.body);
    res.json(
      await store.commitMutation(
        body.revision,
        account.id,
        kind + ".deleted",
        key,
        async (data, { tx, refs }) => {
          if (["faculty", "students"].includes(kind)) {
            const { docs } = await tx.get(refs.accountMembers);
            const role = kind === "faculty" ? "faculty" : "student";
            if (
              docs.some(
                (doc) =>
                  doc.data().role === role && doc.data().rosterId === key,
              )
            )
              fail("This record is linked to an account.", 409);
          }
          return remove(data, kind, get(data[kind], key));
        },
      ),
    );
  });

  app.post("/api/accounts/:id/decision", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = referenceId.parse(req.params.id);
    checkDepartment(req, req.body);
    const body = z
      .object({
        revision,
        action: z.enum(["approve", "reject", "disable"]),
      })
      .parse(req.body);
    res.json(
      await store.commitMutation(
        body.revision,
        account.id,
        "account." + body.action,
        key,
        async (_data, { tx, refs }) => {
          const memberRef = refs.accountMembers.doc(key);
          const memberSnapshot = await tx.get(memberRef);
          const member = memberSnapshot.data();
          if (!member || member.role === "admin")
            fail("Account cannot be managed here.");
          if (body.action === "approve") {
            const rosterRef =
              refs[member.role === "faculty" ? "faculty" : "students"];
            const roster = await tx.get(rosterRef);
            const matches = roster.docs
              .map((doc) => doc.data())
              .filter(
                (person) =>
                  person.id === member.rosterId &&
                  person.department === departmentId &&
                  person.status !== "inactive" &&
                  person.status !== "disabled" &&
                  person.active !== false &&
                  person.email?.trim().toLowerCase() ===
                    member.email?.trim().toLowerCase(),
              );
            if (matches.length !== 1)
              fail(
                "The account no longer matches an active roster entry.",
                409,
              );
          }
          tx.update(memberRef, {
            status: body.action === "approve" ? "active" : "disabled",
          });
        },
        { planning: false },
      ),
    );
  });

  app.post("/api/events/:id/transition", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = id.parse(req.params.id);
    checkDepartment(req, req.body);
    const body = z
      .object({ revision, to: z.enum(["configured", "completed", "archived"]) })
      .parse(req.body);
    res.json(
      await store.commitMutation(
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
              (sitting) =>
                sitting.eventId === key && sitting.status === "scheduled",
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
    checkDepartment(req, req.body);
    const body = z.object({ revision, policy: policySchema }).parse(req.body);
    const row = await store.snapshot();
    if (row.revision !== body.revision)
      fail("Refresh before solving again.", 409);
    const event = editable(row.data, key);
    if (event.status === "draft")
      fail("Configure the event before running allocation.");
    const issues = allocationReadiness(row.data, key);
    if (issues.length) return res.json({ status: "needs_review", issues });
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
      await store.commitMutation(
        row.revision,
        account.id,
        "allocation.solved",
        keyRun,
        (data) => {
          const retained = new Set(
            data.events.map((item) => item.publishedRunId).filter(Boolean),
          );
          data.runs = data.runs.filter(
            (item) =>
              item.eventId !== key || retained.has(item.id) || item.publishedAt,
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
    checkDepartment(req, req.body);
    const body = z.object({ revision, runId: id }).parse(req.body);
    res.json(
      await store.commitMutation(
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
    checkDepartment(req, req.body);
    const body = z
      .object({
        revision,
        kind: z.enum([
          "students",
          "faculty",
          "enrollments",
          "sittings",
          "references",
        ]),
        rows: z.array(z.unknown()).min(1).max(250),
        eventId: id.optional(),
        sittingId: id.optional(),
        roomId: id.optional(),
      })
      .parse(req.body);
    const row = await store.snapshot();
    if (row.revision !== body.revision) fail("Refresh before importing.", 409);
    const result = importRows(row.data, body);
    for (const item of result.items) validateDepartment(body.kind, item.record);
    res.json(result);
  });

  app.post("/api/import/commit", async (req, res) => {
    const account = requireRole(req, "admin");
    checkDepartment(req, req.body);
    const body = z
      .object({
        revision,
        kind: z.enum([
          "students",
          "faculty",
          "enrollments",
          "sittings",
          "references",
        ]),
        rows: z.array(z.unknown()).min(1).max(250),
        eventId: id.optional(),
        sittingId: id.optional(),
        roomId: id.optional(),
      })
      .parse(req.body);
    const { revision: base, ...input } = body;
    const hash = fingerprint(input);
    res.json(
      await store.commitMutation(
        base,
        account.id,
        "import.committed",
        body.kind,
        (data) => {
          if (data.imports.includes(hash))
            fail("These exact rows were already imported.", 409);
          const { items, errors } = importRows(data, body);
          if (errors.length)
            throw new HttpError(
              422,
              "Correct the invalid rows before committing.",
              errors,
            );
          for (const { record } of items) {
            validateDepartment(body.kind, record);
            update(data, body.kind, record);
          }
          data.imports.push(hash);
          return items.length;
        },
      ),
    );
  });
}
