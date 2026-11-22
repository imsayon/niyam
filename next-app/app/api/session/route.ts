import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../../../../server/store.js";
import {
  adminEmail, correctPassword, createSession, eligibleStatus, emailSchema, limitAuth,
  sessionResponse, writeSessionCookie,
} from "../../../lib/auth";
import { database } from "../../../lib/db";
import { jsonBody } from "../../../lib/record-helpers";
import {
  ApiError, checkOrigin, digest, getAccount, googleEnabled, mailEnabled, noStore,
  publicAccount, safeResponse, type Account,
} from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  role: z.enum(["admin", "faculty", "student"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const account = await getAccount(request);
    const google = googleEnabled();
    const mail = mailEnabled();
    return Response.json({
      account: account ? publicAccount(account) : null,
      adminEmail,
      google,
      registration: mail && !google,
      recovery: mail,
    }, { headers: noStore });
  } catch (error) {
    return safeResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    limitAuth(request, "login");
    const body = loginInput.parse(await jsonBody(request, 2048));
    return await transaction(database(), async (client: PoolClient) => {
      const { rows: [account] } = await client.query<Account>(
        "SELECT * FROM niyam_accounts WHERE email=$1 FOR UPDATE", [body.email],
      );
      const valid = await correctPassword(body.password, account?.password_hash);
      if (!valid || !account || !eligibleStatus(account) ||
          (body.role && body.role !== account.role) ||
          (account.role === "admin" && account.email !== adminEmail) ||
          (googleEnabled() && account.role !== "admin")) {
        throw new ApiError(401, "Email or password is incorrect.");
      }
      return sessionResponse(request, account, await createSession(client, request, account.id));
    });
  } catch (error) {
    return safeResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
    const value = request.cookies.get("niyam")?.value;
    if (value)
      await database().query("DELETE FROM niyam_sessions WHERE token_hash=$1", [digest(value)]);
    return writeSessionCookie(NextResponse.json({ ok: true }, { headers: noStore }), request, "");
  } catch (error) {
    return safeResponse(error);
  }
}
