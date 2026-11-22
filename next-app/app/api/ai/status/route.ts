import type { NextRequest } from "next/server";
import { aiConfiguration } from "../../../../../server/ai-config.js";
import { database } from "../../../../lib/db";
import { requireRole, safeResponse } from "../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requireRole(request);
    const { key, model } = await aiConfiguration(database());
    // Provider credentials never leave the server. Expose only config status.
    return Response.json({ enabled: !!key, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
