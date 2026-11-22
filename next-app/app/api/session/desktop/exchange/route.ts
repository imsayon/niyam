import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../../../../../../server/store.js";
import { createSession, rosterFor, sessionResponse, type AccountRoster } from "../../../../../lib/auth";
import { database } from "../../../../../lib/db";
import { jsonBody } from "../../../../../lib/record-helpers";
import { ApiError, checkOrigin, digest, noStore, safeResponse, type Account } from "../../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Pairing {
  account_id: string | null;
  role: "faculty" | "student";
  approved_at: Date | null;
}

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const { requestId, verifier } = z.object({
      requestId: z.uuid(),
      verifier: z.string().min(43).max(100),
    }).parse(await jsonBody(request, 2048));
    const response: Response | null = await transaction(database(), async (client: PoolClient) => {
      const { rows: [pair] } = await client.query<Pairing>(
        `SELECT account_id,role,approved_at FROM niyam_desktop_logins
         WHERE request_id=$1 AND token_hash=$2 AND expires_at>now() FOR UPDATE`,
        [requestId, digest(verifier)],
      );
      if (!pair) return null;
      if (!pair.approved_at) return Response.json({ pending: true }, { status: 202, headers: noStore });
      const { rows: [account] } = await client.query<Account>(
        "SELECT * FROM niyam_accounts WHERE id=$1 FOR UPDATE", [pair.account_id],
      );
      if (!account || account.status !== "active" || account.role !== pair.role) return null;
      const { rows: [workspace] } = await client.query<{ data: AccountRoster }>(
        "SELECT data FROM niyam_workspace WHERE id",
      );
      if (!workspace || !rosterFor(workspace.data, pair.role).some(person =>
        person.id === account.roster_id && person.email?.toLowerCase() === account.email.toLowerCase(),
      )) return null;
      await client.query("DELETE FROM niyam_desktop_logins WHERE request_id=$1", [requestId]);
      return sessionResponse(request, account, await createSession(client, request, account.id));
    });
    if (!response) throw new ApiError(410, "The desktop sign-in request expired. Try again.");
    return response;
  } catch (error) {
    return safeResponse(error);
  }
}
