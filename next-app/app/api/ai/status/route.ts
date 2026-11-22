import type { NextRequest } from "next/server";
import { aiConfiguration } from "../../../../lib/ai-config";
import { requireRole, safeResponse } from "../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requireRole(request);
    const { key, model } = await aiConfiguration();
    // Provider credentials never leave the server. Expose only config status.
    return Response.json({ enabled: !!key, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
