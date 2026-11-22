import type { NextRequest } from "next/server";
import { checkAiRateLimit } from "../../server/output-domain.js";
import { jsonBody } from "./record-helpers";
import { ApiError, checkOrigin, noStore, requireRole, safeResponse, type Account, type Role } from "./security";

type AiRequests = { cooldowns: Map<string, number>; active: Set<string> };
const globals = globalThis as typeof globalThis & { niyamAiRequests?: AiRequests };
const requests = globals.niyamAiRequests ??= { cooldowns: new Map(), active: new Set() };

export async function aiRequest(
  request: NextRequest,
  roles: Role[],
  cooldown: number,
  run: (account: Account, body: unknown) => Promise<object>,
) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, ...roles);
    if (requests.active.has(account.id))
      throw new ApiError(429, "Wait for the current AI request to finish.");
    if (requests.active.size >= 100)
      throw new ApiError(429, "The assistant is busy. Try again soon.");
    checkAiRateLimit(requests.cooldowns, account.id, cooldown);
    requests.active.add(account.id);
    try {
      const body = await jsonBody(request, 160 * 1024);
      return Response.json(await run(account, body), { headers: noStore });
    } finally {
      requests.active.delete(account.id);
    }
  } catch (error) {
    return safeResponse(error);
  }
}
