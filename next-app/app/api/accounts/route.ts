import type { NextRequest } from "next/server";
import { database } from "../../../lib/db";
import { requireRole, safeResponse } from "../../../lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface ListedAccount {
  id: string; email: string; name: string; role: string; status: string;
  roster_id: string | null; verified_at: string | null; password_login: boolean;
}
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, "admin");
    // Query a boolean; never fetch or serialize password hashes into the API.
    const { rows } = await database().query<ListedAccount>(
      "SELECT id,email,name,role,status,roster_id,verified_at,(password_hash IS NOT NULL) AS password_login FROM niyam_accounts ORDER BY status,email"
    );
    return Response.json(rows.map(row => ({
      id: row.id, email: row.email, name: row.name, role: row.role,
      status: row.status, rosterId: row.roster_id,
      verified: !!row.verified_at, passwordLogin: row.password_login,
    })), { headers: { "Cache-Control": "no-store" } });
  } catch(error) { return safeResponse(error); }
}
