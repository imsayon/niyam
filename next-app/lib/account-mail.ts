import nodemailer from "nodemailer";
import { newToken } from "./auth";
import { database } from "./db";
import { ApiError, digest, publicOrigin } from "./security";

export async function sendAccountLink(account: { id: string; email: string }, purpose: "verify" | "reset") {
  const origin = publicOrigin();
  const { SMTP_URL, MAIL_FROM } = process.env;
  if (!origin || !SMTP_URL || !MAIL_FROM)
    throw new ApiError(503, "Email delivery is not configured. Contact the administrator.");
  const value = newToken();
  await database().query(
    `INSERT INTO niyam_account_tokens(token_hash,account_id,purpose,expires_at)
     VALUES ($1,$2,$3,now()+interval '30 minutes')`,
    [digest(value), account.id, purpose],
  );
  const url = new URL("/", origin);
  url.hash = purpose + "=" + value;
  await nodemailer.createTransport(SMTP_URL).sendMail({
    from: MAIL_FROM,
    to: account.email,
    subject: purpose === "verify" ? "Verify your Niyam email" : "Reset your Niyam password",
    text: "Open this link within 30 minutes: " + url.href,
  });
}
