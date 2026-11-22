import type { NextRequest } from "next/server";
import { executeAiAction } from "../../../../../../server/ai-actions.js";
import { jsonBody } from "../../../../../lib/record-helpers";
import { checkOrigin, noStore, requireRole, safeResponse } from "../../../../../lib/security";
import { database } from "../../../../../lib/db";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const admin = await requireRole(request, "admin");
    const body = await jsonBody(request, 8 * 1024);
    const result = await executeAiAction(database(), admin, body);
    return Response.json(result, { headers: noStore });
  } catch (error) { return safeResponse(error); }
}
