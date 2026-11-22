import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { audit, transaction } from "../../../../server/store.js";
import { correctPassword, hashPassword, passwordSchema } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { jsonBody } from "../../../lib/record-helpers";
import {
  ApiError, checkOrigin, digest, noStore, publicAccount, requireRole, safeResponse, type Account,
} from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profile = z.object({
  name: z.string().trim().min(2).max(100),
  current: z.string().max(128).optional(),
  password: passwordSchema.optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    checkOrigin(request);
    const account = await requireRole(request);
    const body = profile.parse(await jsonBody(request, 2048));
    if (body.password && !(await correctPassword(body.current ?? "", account.password_hash)))
      throw new ApiError(400, "Current password is incorrect.");
    const hash = body.password ? await hashPassword(body.password) : null;
    const updated: Account = await transaction(database(), async (client: PoolClient) => {
      const { rows: [row] } = await client.query<Account>(
        `UPDATE niyam_accounts SET name=$1,password_hash=COALESCE($2,password_hash)
         WHERE id=$3 AND status='active' AND ($2::text IS NULL OR password_hash=$4)
         RETURNING *`,
        [body.name, hash, account.id, account.password_hash],
      );
      if (!row) throw new ApiError(409, "The account changed. Refresh and try again.");
      if (hash) {
        await client.query(
          "DELETE FROM niyam_sessions WHERE account_id=$1 AND token_hash<>$2",
          [account.id, digest(request.cookies.get("niyam")?.value ?? "")],
        );
      }
      await audit(client, account.id, "profile.updated", account.id);
      return row;
    });
    return Response.json({ account: publicAccount(updated) }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
