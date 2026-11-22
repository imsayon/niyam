import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { change } from "../../../../lib/workspace-change";
import { checkOrigin, requireRole } from "../../../../lib/security";
import { kindSchema, jsonBody, recordError, recordSchema, requestRevision } from "../../../../lib/record-helpers";
import { update } from "../../../../lib/workspace-domain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  try {
    checkOrigin(request);
    const { kind: rawKind } = await context.params;
    const kind = kindSchema.parse(rawKind);
    const account = await requireRole(request, ...(kind === "leaves" ? ["admin", "faculty"] as const : ["admin"] as const));
    const body = z.object({ revision: requestRevision, record: z.unknown() }).parse(await jsonBody(request));
    const value = recordSchema(kind).parse(body.record);
    if (kind === "leaves" && account.role === "faculty") value.facultyId = account.roster_id;
    if (kind === "leaves") value.status = "pending";
    if (kind === "events") Object.assign(value, { status: "draft", publishedRunId: null });
    const key = randomUUID();
    const result = await change(body.revision, account.id, kind + ".created", key,
      (data: any) => update(data, kind, { ...value, id: key }));
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return recordError(error); }
}
