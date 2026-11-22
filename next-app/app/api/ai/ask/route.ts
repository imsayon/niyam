import type { NextRequest } from "next/server";
import { askAi } from "../../../../../server/output-domain.js";
import { proposeAiAction } from "../../../../../server/ai-actions.js";
import { aiRequest } from "../../../../lib/ai-request";
import { database } from "../../../../lib/db";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return aiRequest(request, [], 800, async (account, body) =>
    (await proposeAiAction(database(), account, body)) ?? askAi(database(), account, body));
}
