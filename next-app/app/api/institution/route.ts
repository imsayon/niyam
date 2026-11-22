import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { database } from "../../../lib/db";
import { ApiError, checkOrigin, requireRole, safeResponse } from "../../../lib/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().trim().min(2).max(150),
  shortName: z.string().trim().min(2).max(32),
});
const defaults = { name: "Dayananda Sagar College of Engineering", shortName: "DSCE" };
export async function GET(request: NextRequest) {
  try {
    await requireRole(request);
    const { rows: [row] } = await database().query<{ value: unknown }>("SELECT value FROM niyam_settings WHERE name='institution'");
    return Response.json(row ? schema.parse(row.value) : defaults, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return safeResponse(e); }
}
export async function PUT(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const raw = await request.text();
    if (raw.length > 2048) throw new ApiError(413, "The request is too large.");
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new ApiError(400, "Invalid JSON."); }
    const setting = schema.parse(value);
    const db = database(), client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO niyam_settings(name,value) VALUES ('institution',$1) ON CONFLICT(name) DO UPDATE SET value=excluded.value", [setting]);
      await client.query("INSERT INTO niyam_audit(actor,action,target) VALUES ($1,$2,$3)", [account.id, "institution.updated", setting.shortName]);
      await client.query("COMMIT");
    } catch(e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
    return Response.json(setting, { headers: { "Cache-Control": "no-store" } });
  } catch(e) {
    if (e instanceof ZodError) return Response.json({ error: "Correct the input and try again.", details: e.issues.map(i => ({field: i.path.join("."), message: i.message})) }, { status: 422 });
    return safeResponse(e);
  }
}
