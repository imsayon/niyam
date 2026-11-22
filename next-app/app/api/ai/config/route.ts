import type { NextRequest } from "next/server";
import { configureAi } from "../../../../../server/output-domain.js";
import { aiRequest } from "../../../../lib/ai-request";
import { database } from "../../../../lib/db";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return aiRequest(request, ["admin"], 5000, (account, body) => configureAi(database(), account, body));
}
