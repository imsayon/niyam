import type { NextRequest } from "next/server";
import { id, transitionEvent, transitionInput } from "../../../../../../server/workspace-domain.js";
import { jsonBody } from "../../../../../lib/record-helpers";
import { checkOrigin, requireRole, safeResponse } from "../../../../../lib/security";
import { change } from "../../../../../lib/workspace-change";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const key = id.parse((await params).id);
    const body = transitionInput.parse(await jsonBody(request));
    const result = await change(body.revision, account.id, "event." + body.to, key,
      (data) => transitionEvent(data, key, body.to));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeResponse(error);
  }
}
