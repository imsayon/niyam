import type { NextRequest } from "next/server";
import { commitImport, importFingerprint, importSchema } from "../../../../../server/workspace-domain.js";
import { jsonBody } from "../../../../lib/record-helpers";
import { checkOrigin, requireRole, safeResponse } from "../../../../lib/security";
import { change } from "../../../../lib/workspace-change";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const body = importSchema.parse(await jsonBody(request));
    const fingerprint = importFingerprint(body);
    const result = await change(body.revision, account.id, "import.committed", body.kind,
      (data) => commitImport(data, body, fingerprint));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeResponse(error);
  }
}
