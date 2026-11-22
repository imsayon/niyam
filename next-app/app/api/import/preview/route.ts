import type { NextRequest } from "next/server";
import { importSchema, previewImport } from "../../../../../server/workspace-domain.js";
import { jsonBody } from "../../../../lib/record-helpers";
import { checkOrigin, requireRole, safeResponse } from "../../../../lib/security";
import { snapshot } from "../../../../lib/workspace-change";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    await requireRole(request, "admin");
    const body = importSchema.parse(await jsonBody(request));
    return Response.json(previewImport(await snapshot(), body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeResponse(error);
  }
}
