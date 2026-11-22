import type { NextRequest } from "next/server";
import { database } from "../../../lib/db";
import { ApiError, requireRole, safeResponse } from "../../../lib/security";
import { scoped } from "../../../lib/scoped";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const account = await requireRole(request);
    const { rows: [row] } = await database().query<{ revision: number; data: Record<string, unknown> }>(
      "SELECT revision,data FROM niyam_workspace WHERE id"
    );
    if (!row) throw new ApiError(503, "Workspace is unavailable.");
    const data = { ...row.data, references: row.data.references || [] };
    return Response.json({ data: scoped(data, account), revision: row.revision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
