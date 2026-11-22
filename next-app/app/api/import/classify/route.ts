import type { NextRequest } from "next/server";
import { classificationInput } from "../../../../../server/document-domain.js";
import { classifyRows } from "../../../../../server/import-classifier.js";
import { jsonBody } from "../../../../lib/record-helpers";
import { checkOrigin, noStore, requireRole, safeResponse } from "../../../../lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    await requireRole(request, "admin");
    const { fileName, rows } = classificationInput.parse(await jsonBody(request));
    return Response.json(classifyRows(fileName, rows), { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
