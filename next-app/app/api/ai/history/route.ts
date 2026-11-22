import type { NextRequest } from "next/server";
import { database } from "../../../../lib/db";
import { checkOrigin, requireRole, safeResponse } from "../../../../lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const account = await requireRole(request);
    const { rows } = await database().query(
      "SELECT role,body AS text,event_id AS \"eventId\" FROM niyam_ai_messages WHERE account_id=$1 ORDER BY id DESC LIMIT 60",
      [account.id],
    );
    return Response.json({ messages: rows.reverse() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request);
    await database().query("DELETE FROM niyam_ai_messages WHERE account_id=$1", [account.id]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
