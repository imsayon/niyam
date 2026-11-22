import type { NextRequest } from "next/server";
import { database } from "../../../lib/db";
import { requireRole, safeResponse } from "../../../lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, "admin");
    const { rows } = await database().query("SELECT at,actor,action,target FROM niyam_audit ORDER BY id DESC LIMIT 100");
    return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
