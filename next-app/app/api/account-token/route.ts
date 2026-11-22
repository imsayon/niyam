import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { audit, transaction } from "../../../../server/store.js";
import { hashPassword, limitAuth, passwordSchema, tokenSchema } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { jsonBody } from "../../../lib/record-helpers";
import {
  ApiError, checkOrigin, digest, getAccount, googleEnabled, noStore, safeResponse, type Account,
} from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tokenInput = z.object({
  token: tokenSchema,
  purpose: z.enum(["verify", "reset"]),
  password: passwordSchema.optional(),
});

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    limitAuth(request, "token");
    const body = tokenInput.parse(await jsonBody(request, 2048));
    const hash = body.purpose === "reset" ? await hashPassword(passwordSchema.parse(body.password)) : null;
    const viewer = hash ? null : await getAccount(request);
    const params = [digest(body.token), body.purpose];
    const invalid = () => new ApiError(400, "This link is invalid or expired.");
    await transaction(database(), async (client: PoolClient) => {
      const { rows: [record] } = await client.query<{ account_id: string }>(
        "SELECT account_id FROM niyam_account_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now()",
        params,
      );
      if (!record) throw invalid();
      // Lock account before consuming tokens, matching Google account linking.
      const { rows: [account] } = await client.query<Account>(
        "SELECT * FROM niyam_accounts WHERE id=$1 FOR UPDATE", [record.account_id],
      );
      if (!account) throw invalid();
      if (hash) {
        if (account.status !== "active" || !account.password_hash ||
            (account.role !== "admin" && googleEnabled()))
          throw invalid();
      } else if (viewer?.id !== account.id) {
        throw new ApiError(403, "Sign in with the account that requested this link, then open it again.");
      }
      const { rowCount } = await client.query(
        "DELETE FROM niyam_account_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now()",
        params,
      );
      if (!rowCount) throw invalid();
      if (hash) {
        await client.query("UPDATE niyam_accounts SET password_hash=$1 WHERE id=$2", [hash, account.id]);
        await client.query("DELETE FROM niyam_account_tokens WHERE account_id=$1 AND purpose='reset'", [account.id]);
        await client.query("DELETE FROM niyam_sessions WHERE account_id=$1", [account.id]);
      } else {
        await client.query("UPDATE niyam_accounts SET verified_at=now() WHERE id=$1", [account.id]);
      }
      await audit(client, account.id, hash ? "account.password_reset" : "account.email_verified", account.id);
    });
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
