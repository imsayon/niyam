import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole } from "./accounts.js";
import { change, snapshot } from "./store.js";
import {
  commitImport,
  editable,
  fail,
  get,
  id,
  importFingerprint,
  importSchema,
  prepareRun,
  previewImport,
  publishInput,
  publishRun,
  remove,
  revision,
  saveRun,
  schemas,
  scoped,
  solveInput,
  transitionEvent,
  transitionInput,
  update,
} from "./workspace-domain.js";

export {
  allocationReadiness,
  defaultPolicy,
  editable,
  fail,
  get,
  importRows,
  policySchema,
  remove,
  schemas,
  scoped,
  update,
  validate,
} from "./workspace-domain.js";

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
    const body = transitionInput.parse(req.body);
    res.json(await change(db, body.revision, account.id, "event." + body.to, key,
      (data) => transitionEvent(data, key, body.to)));
  });
  app.post("/api/events/:id/solve", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = id.parse(req.params.id);
    const body = solveInput.parse(req.body);
    const row = await snapshot(db);
    const { solution, run } = prepareRun(row, key, body);
    if (!run) return res.json(solution);
    res.json(await change(db, row.revision, account.id, "allocation.solved", run.id,
      (data) => saveRun(data, run), { planning: false }));
  });
  app.post("/api/events/:id/publish", async (req, res) => {
    const account = requireRole(req, "admin");
    const key = id.parse(req.params.id);
    const body = publishInput.parse(req.body);
    res.json(await change(db, body.revision, account.id, "allocation.published", body.runId,
      (data) => publishRun(data, key, body)));
  });
  app.post("/api/import/preview", async (req, res) => {
    requireRole(req, "admin");
    const body = importSchema.parse(req.body);
    res.json(previewImport(await snapshot(db), body));
  });
  app.post("/api/import/commit", async (req, res) => {
    const account = requireRole(req, "admin");
    const body = importSchema.parse(req.body);
    const fingerprint = importFingerprint(body);
    res.json(await change(db, body.revision, account.id, "import.committed", body.kind,
      (data) => commitImport(data, body, fingerprint)));
  });
}
