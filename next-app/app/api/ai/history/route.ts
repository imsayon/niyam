import type { NextRequest } from "next/server";
import { aiHistory, clearAiHistory } from "../../../../../server/output-domain.js";
import { database } from "../../../../lib/db";
import { checkOrigin, noStore, requireRole, safeResponse } from "../../../../lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const account = await requireRole(request);
    return Response.json(await aiHistory(database(), account.id), { headers: noStore });
  } catch (error) { return safeResponse(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request);
    return Response.json(await clearAiHistory(database(), account.id), { headers: noStore });
  } catch (error) { return safeResponse(error); }
}
