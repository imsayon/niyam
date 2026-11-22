import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { audit, transaction } from "../../../../../../server/store.js";
import { database } from "../../../../../lib/db";
import { jsonBody } from "../../../../../lib/record-helpers";
import { ApiError, checkOrigin, noStore, requireRole, safeResponse } from "../../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request, "faculty", "student");
    const { requestId } = z.object({ requestId: z.uuid() }).parse(await jsonBody(request, 2048));
    await transaction(database(), async (client: PoolClient) => {
      const { rowCount } = await client.query(
        `UPDATE niyam_desktop_logins SET account_id=$2, approved_at=now()
         WHERE request_id=$1 AND role=$3 AND approved_at IS NULL AND expires_at>now()`,
        [requestId, account.id, account.role],
      );
      if (!rowCount)
        throw new ApiError(409, "This desktop request has expired or belongs to another role.");
      await audit(client, account.id, "session.desktop_approved", requestId);
    });
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
