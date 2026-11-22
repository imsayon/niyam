import type { NextRequest } from "next/server";
import { extractAi } from "../../../../../server/output-domain.js";
import { aiRequest } from "../../../../lib/ai-request";
import { database } from "../../../../lib/db";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return aiRequest(request, ["admin"], 5000, (_account, body) => extractAi(database(), body));
}
