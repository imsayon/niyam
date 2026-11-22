import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { sendAccountLink } from "../../../lib/account-mail";
import { emailSchema, hashPassword, limitAuth, passwordSchema, rosterRole } from "../../../lib/auth";
import { database } from "../../../lib/db";
import { jsonBody } from "../../../lib/record-helpers";
import { ApiError, checkOrigin, googleEnabled, mailEnabled, noStore, safeResponse } from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registration = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: rosterRole,
  name: z.string().trim().min(2).max(100),
});

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    if (!mailEnabled() || googleEnabled())
      throw new ApiError(503, "Email delivery is not configured. Contact the administrator for access.");
    limitAuth(request, "register");
    const body = registration.parse(await jsonBody(request, 2048));
    const db = database();
    await db.query(
      `INSERT INTO niyam_accounts(id,email,name,role,status,password_hash)
       VALUES ($1,$2,$3,$4,'pending',$5) ON CONFLICT(email) DO NOTHING`,
      [randomUUID(), body.email, body.name, body.role, await hashPassword(body.password)],
    );
    const { rows: [account] } = await db.query<{ id: string; email: string }>(
      "SELECT id,email FROM niyam_accounts WHERE email=$1 AND verified_at IS NULL AND status='pending'",
      [body.email],
    );
    if (account) await sendAccountLink(account, "verify");
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}
