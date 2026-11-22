import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../../../../../../server/store.js";
import { limitAuth, newToken, rosterRole } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { jsonBody } from "../../../../../lib/record-helpers";
import {
  ApiError, checkOrigin, digest, googleEnabled, noStore, publicOrigin, safeResponse,
} from "../../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const origin = publicOrigin();
    if (!origin || !googleEnabled())
      throw new ApiError(503, "Desktop Google sign-in is not configured.");
    limitAuth(request, "desktop-start");
    const { role } = z.object({ role: rosterRole }).parse(await jsonBody(request, 2048));
    const requestId = randomUUID();
    const verifier = newToken();
    await transaction(database(), async (client: PoolClient) => {
      await client.query("DELETE FROM niyam_desktop_logins WHERE expires_at < now()");
      await client.query(
        `INSERT INTO niyam_desktop_logins(request_id,token_hash,role,expires_at)
         VALUES ($1,$2,$3,now() + interval '10 minutes')`,
        [requestId, digest(verifier), role],
      );
    });
    const openUrl = new URL("/", origin);
    openUrl.searchParams.set("desktop", requestId);
    openUrl.searchParams.set("role", role);
    return Response.json({ requestId, verifier, url: openUrl.href }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
