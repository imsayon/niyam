import type { NextRequest } from "next/server";
import { z } from "zod";
import { sendAccountLink } from "../../../lib/account-mail";
import { emailSchema, limitAuth } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { jsonBody } from "../../../lib/record-helpers";
import { ApiError, checkOrigin, googleEnabled, mailEnabled, noStore, safeResponse } from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    if (!mailEnabled())
      throw new ApiError(503, "Email delivery is not configured. Contact the administrator.");
    limitAuth(request, "recovery");
    const { email } = z.object({ email: emailSchema }).parse(await jsonBody(request, 2048));
    const { rows: [account] } = await database().query<{ id: string; email: string }>(
      `SELECT id,email FROM niyam_accounts WHERE email=$1 AND status='active'
       AND password_hash IS NOT NULL AND (role='admin' OR NOT $2::boolean)`,
      [email, googleEnabled()],
    );
    if (account) await sendAccountLink(account, "reset");
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
