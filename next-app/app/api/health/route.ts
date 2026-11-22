import pg from "pg";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type GlobalPool = typeof globalThis & { __niyamNextPool?: pg.Pool };
const shared = globalThis as GlobalPool;
function pool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing database configuration");
  return (shared.__niyamNextPool ??= new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 15000 }));
}
export async function GET() {
  try {
    await pool().query("SELECT 1");
    return Response.json({ status: "ok", version: process.env.RENDER_GIT_COMMIT || "preview" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Next health query failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
