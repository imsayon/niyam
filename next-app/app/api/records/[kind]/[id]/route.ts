import type { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "../../../../../lib/db";
import { change } from "../../../../../lib/workspace-change";
import { checkOrigin, requireRole } from "../../../../../lib/security";
import { kindSchema, jsonBody, recordError, recordSchema, recordId, requestRevision } from "../../../../../lib/record-helpers";
import { editable, fail, get, remove, update } from "../../../../../lib/workspace-domain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ kind: string; id: string }> };
export async function PATCH(request: NextRequest, context: Params) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const params = await context.params, kind = kindSchema.parse(params.kind), key = recordId.parse(params.id);
    const body = z.object({ revision: requestRevision, record: z.unknown() }).parse(await jsonBody(request));
    const value = kind === "leaves"
      ? z.object({ status: z.enum(["approved", "rejected"]) }).parse(body.record)
      : recordSchema(kind).parse(body.record);
    const parsedValue = value as Record<string, unknown>;
    const result = await change(body.revision, account.id, kind + ".updated", key, (data: any) => {
      const row = get(data[kind], key);
      if (kind === "events") editable(data, key);
      if (kind === "sittings") editable(data, row.eventId);
      if (kind === "enrollments") editable(data, get(data.sittings, row.sittingId).eventId);
      if (kind === "leaves" && row.status !== "pending") fail("This request has already been reviewed.");
      return update(data, kind, { ...row, ...parsedValue });
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return recordError(error); }
}
export async function DELETE(request: NextRequest, context: Params) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const params = await context.params, kind = kindSchema.parse(params.kind), key = recordId.parse(params.id);
    const body = z.object({ revision: requestRevision }).parse(await jsonBody(request));
    const result = await change(body.revision, account.id, kind + ".deleted", key, async (data: any, client) => {
      if (["faculty","students"].includes(kind)) {
        const { rowCount } = await client.query(
          "SELECT id FROM niyam_accounts WHERE role=$1 AND roster_id=$2",
          [kind === "faculty" ? "faculty" : "student", key],
        );
        if (rowCount) fail("This record is linked to an account.", 409);
      }
      return remove(data, kind, get(data[kind], key));
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return recordError(error); }
}
