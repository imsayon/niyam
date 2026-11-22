import { database } from "../../../lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { rowCount } = await database().query("SELECT 1 FROM niyam_workspace WHERE id");
    if (!rowCount) return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return Response.json({ status: "ok", version: process.env.RENDER_GIT_COMMIT || "preview" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Next health query failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
