import type { NextRequest } from "next/server";
import { id, prepareRun, saveRun, solveInput } from "../../../../../../server/workspace-domain.js";
import { jsonBody } from "../../../../../lib/record-helpers";
import { checkOrigin, requireRole, safeResponse } from "../../../../../lib/security";
import { change, snapshot } from "../../../../../lib/workspace-change";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "admin");
    const key = id.parse((await params).id);
    const body = solveInput.parse(await jsonBody(request));
    const row = await snapshot();
    const { solution, run } = prepareRun(row, key, body);
    const result = run ? await change(row.revision, account.id, "allocation.solved", run.id,
      (data) => saveRun(data, run), { planning: false }) : solution;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeResponse(error);
  }
}
