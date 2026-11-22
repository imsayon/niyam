import type { NextRequest } from "next/server";
import { scoped } from "../../../../server/workspace-domain.js";
import { requireRole, safeResponse } from "../../../lib/security";
import { snapshot } from "../../../lib/workspace-change";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const account = await requireRole(request);
    const { data, revision } = await snapshot();
    return Response.json({ data: scoped(data, account), revision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
