import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import nodemailer from "nodemailer";
import { z } from "zod";
import { audit, HttpError, transaction } from "./store.js";
import { googleAuth } from "./google.js";

const scrypt = promisify(derive);
const digest = (token) => createHash("sha256").update(token).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(12).max(128);
const role = z.enum(["faculty", "student"]);
const maxAge = 12 * 60 * 60 * 1000;
export const adminEmail = "admin.niyam@dsce.edu.in";
const googleCallback = "/api/session/google/callback";

export async function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await scrypt(value, salt, 64)).toString("hex");
}

async function correctPassword(value, stored) {
  const [salt, hash] = (stored || "0000000000000000:" + "00".repeat(64)).split(
    ":",
  );
  return (
    timingSafeEqual(await scrypt(value, salt, 64), Buffer.from(hash, "hex")) &&
    !!stored
  );
}

export function publicAccount(account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
    rosterId: account.roster_id,
    passwordLogin: account.password_hash != null,
  };
}

export function requireRole(req, ...roles) {
  if (!req.account) throw new HttpError(401, "Sign in to continue.");
  if (req.account.status !== "active")
    throw new HttpError(403, "Your account is awaiting approval.");
  if (roles.length && !roles.includes(req.account.role))
    throw new HttpError(403, "Your role cannot perform this action.");
  return req.account;
}

export function accountApi(app, db, origin) {
  const google = googleAuth(origin);
  const cookie = {
    httpOnly: true,
    sameSite: "strict",
    secure: origin?.startsWith("https://") || false,
    path: "/",
  };
  const mail =
    process.env.SMTP_URL && origin && process.env.MAIL_FROM
      ? nodemailer.createTransport(process.env.SMTP_URL)
      : null;
  const attempts = new Map();
  const googleCookie = { ...cookie, sameSite: "lax", path: googleCallback };

  async function createSession(client, req, account) {
    const value = token();
    await client.query(
      "DELETE FROM niyam_sessions WHERE expires_at<now() OR token_hash=$1",
      [req.cookies.niyam ? digest(req.cookies.niyam) : ""],
    );
    await client.query("INSERT INTO niyam_sessions VALUES ($1,$2,$3)", [
      digest(value),
      account.id,
      new Date(Date.now() + maxAge),
    ]);
    return value;
  }

  function limit(req, action) {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key);
    if (attempts.size > 5000)
      throw new HttpError(429, "Try again in a few minutes.");
    const key = action + ":" + req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 600000 };
    if (++entry.count > 12)
      throw new HttpError(429, "Try again in a few minutes.");
    attempts.set(key, entry);
  }

  async function link(account, purpose) {
    const value = token();
    await db.query(
      `INSERT INTO niyam_account_tokens(token_hash,account_id,purpose,expires_at)
      VALUES ($1,$2,$3,now()+interval '30 minutes')`,
      [digest(value), account.id, purpose],
    );
    const url = new URL("/", origin);
    url.hash = purpose + "=" + value;
    await mail.sendMail({
      from: process.env.MAIL_FROM,
      to: account.email,
      subject:
        purpose === "verify"
          ? "Verify your Niyam email"
          : "Reset your Niyam password",
      text: "Open this link within 30 minutes: " + url.href,
    });
  }

  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const allowed = origin || req.protocol + "://" + req.get("host");
      if (
        req.get("sec-fetch-site") === "cross-site" ||
        (req.get("origin") &&
          req.get("origin") !== allowed &&
          req.get("origin") !== process.env.DEV_ORIGIN)
      ) {
        throw new HttpError(403, "This request must come from Niyam.");
      }
    }
    const session = req.cookies.niyam;
    if (session && /^[\w-]{43}$/.test(session)) {
      const {
        rows: [account],
      } = await db.query(
        `SELECT a.* FROM niyam_sessions s JOIN niyam_accounts a ON a.id=s.account_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND a.status IN ('active','pending')
        AND (
          (a.password_hash IS NOT NULL AND (a.role='admin' OR NOT $2::boolean))
          OR (a.password_hash IS NULL AND EXISTS (
            SELECT 1 FROM niyam_workspace w,
              jsonb_array_elements(w.data->(CASE a.role WHEN 'faculty' THEN 'faculty' ELSE 'students' END)) person
            WHERE person->>'id'=a.roster_id AND lower(person->>'email')=a.email
          ))
        )`,
        [digest(session), !!google],
      );
      req.account = account;
    }
    next();
  });

  app.get("/api/session", (req, res) =>
    res.json({
      account: req.account ? publicAccount(req.account) : null,
      adminEmail,
      google: !!google,
      registration: !!mail && !google,
      recovery: !!mail,
    }),
  );

  app.post("/api/session", async (req, res) => {
    limit(req, "login");
    const body = z
      .object({
        email,
        password: z.string().min(1).max(128),
        role: z.enum(["admin", "faculty", "student"]).optional(),
      })
      .parse(req.body);
    const {
      rows: [account],
    } = await db.query("SELECT * FROM niyam_accounts WHERE email=$1", [
      body.email,
    ]);
    if (
      !(await correctPassword(body.password, account?.password_hash)) ||
      !["active", "pending"].includes(account.status) ||
      (body.role && body.role !== account.role) ||
      (account.role === "admin" && account.email !== adminEmail) ||
      (google && account.role !== "admin")
    ) {
      throw new HttpError(401, "Email or password is incorrect.");
    }
    const value = await transaction(db, (client) =>
      createSession(client, req, account),
    );
    res
      .cookie("niyam", value, { ...cookie, maxAge })
      .json({ account: publicAccount(account) });
  });

  if (google) {
    app.post("/api/session/google", async (req, res) => {
      limit(req, "google");
      const body = z.object({ role }).parse(req.body);
      const state = token();
      const callback = new URL(googleCallback, origin);
      callback.searchParams.set("role", body.role);
      callback.searchParams.set("state", state);
      const url = await google.start(res, callback);
      if (!url)
        throw new HttpError(502, "Google sign-in is temporarily unavailable.");
      res
        .cookie("niyam_google", body.role + "." + state, {
          ...googleCookie,
          maxAge: 600000,
        })
        .json({ url });
    });

    app.get(googleCallback, async (req, res) => {
      const selection = role.safeParse(req.query.role);
      const selectedRole = selection.success ? selection.data : "student";
      const redirect = (error) =>
        res.redirect(303, "/?role=" + selectedRole + "&signIn=" + error);
      res.clearCookie("niyam_google", googleCookie);
      if (
        !selection.success ||
        typeof req.query.state !== "string" ||
        req.cookies.niyam_google !== selectedRole + "." + req.query.state
      )
        return redirect("retry");
      const callback = new URL(req.originalUrl, origin);
      const verified = email.safeParse(await google.finish(req, res, callback));
      if (!verified.success) return redirect("retry");
      const address = verified.data;
      const value = await transaction(db, async (client) => {
        const {
          rows: [workspace],
        } = await client.query(
          "SELECT data FROM niyam_workspace WHERE id FOR UPDATE",
        );
        const matches = workspace.data[
          selectedRole === "faculty" ? "faculty" : "students"
        ].filter((person) => person.email?.toLowerCase() === address);
        if (matches.length !== 1) return null;
        const person = matches[0];
        const { rows } = await client.query(
          `SELECT * FROM niyam_accounts
           WHERE email=$1 OR (role=$2 AND roster_id=$3) FOR UPDATE`,
          [address, selectedRole, person.id],
        );
        const account = rows[0];
        if (
          rows.length > 1 ||
          (account &&
            (account.role !== selectedRole ||
              (account.roster_id && account.roster_id !== person.id) ||
              !["active", "pending"].includes(account.status)))
        )
          return null;
        const id = account?.id ?? randomUUID();
        if (!account) {
          await client.query(
            `INSERT INTO niyam_accounts(id,email,name,role,status,roster_id,verified_at)
             VALUES ($1,$2,$3,$4,'active',$5,now())`,
            [id, address, person.name, selectedRole, person.id],
          );
          await audit(client, id, "account.google_linked", person.id);
        } else if (
          account.email !== address ||
          account.roster_id !== person.id ||
          account.password_hash ||
          account.status === "pending"
        ) {
          await client.query(
            `UPDATE niyam_accounts SET email=$1,status='active',roster_id=$2,password_hash=NULL,verified_at=now()
             WHERE id=$3`,
            [address, person.id, id],
          );
          await client.query("DELETE FROM niyam_sessions WHERE account_id=$1", [
            id,
          ]);
          await client.query(
            "DELETE FROM niyam_account_tokens WHERE account_id=$1",
            [id],
          );
          await audit(client, id, "account.google_linked", person.id);
        }
        return createSession(client, req, { id });
      });
      if (!value) return redirect("roster");
      res.cookie("niyam", value, { ...cookie, maxAge }).redirect(303, "/");
    });
  }

  app.delete("/api/session", async (req, res) => {
    if (req.cookies.niyam)
      await db.query("DELETE FROM niyam_sessions WHERE token_hash=$1", [
        digest(req.cookies.niyam),
      ]);
    res.clearCookie("niyam", cookie).json({ ok: true });
  });

  app.post("/api/register", async (req, res) => {
    if (!mail || google)
      throw new HttpError(
        503,
        "Email delivery is not configured. Contact the administrator for access.",
      );
    limit(req, "register");
    const body = z
      .object({
        email,
        password,
        role,
        name: z.string().trim().min(2).max(100),
      })
      .parse(req.body);
    const id = randomUUID();
    await db.query(
      `INSERT INTO niyam_accounts(id,email,name,role,status,password_hash)
      VALUES ($1,$2,$3,$4,'pending',$5) ON CONFLICT(email) DO NOTHING`,
      [id, body.email, body.name, body.role, await hashPassword(body.password)],
    );
    const {
      rows: [account],
    } = await db.query(
      `SELECT id,email FROM niyam_accounts WHERE email=$1 AND verified_at IS NULL AND status='pending'`,
      [body.email],
    );
    if (account) await link(account, "verify");
    res.json({ ok: true });
  });

  app.post("/api/recovery", async (req, res) => {
    if (!mail)
      throw new HttpError(
        503,
        "Email delivery is not configured. Contact the administrator.",
      );
    limit(req, "recovery");
    const { email: address } = z.object({ email }).parse(req.body);
    const {
      rows: [account],
    } = await db.query(
      `SELECT id,email FROM niyam_accounts WHERE email=$1 AND status='active'
       AND password_hash IS NOT NULL AND (role='admin' OR NOT $2::boolean)`,
      [address, !!google],
    );
    if (account) await link(account, "reset");
    res.json({ ok: true });
  });

  app.post("/api/account-token", async (req, res) => {
    limit(req, "token");
    const body = z
      .object({
        token: z.string().regex(/^[\w-]{43}$/),
        purpose: z.enum(["verify", "reset"]),
        password: password.optional(),
      })
      .parse(req.body);
    const hash =
      body.purpose === "reset"
        ? await hashPassword(password.parse(body.password))
        : null;
    await transaction(db, async (client) => {
      const {
        rows: [record],
      } = await client.query(
        `DELETE FROM niyam_account_tokens WHERE token_hash=$1 AND purpose=$2
        AND expires_at>now() RETURNING account_id`,
        [digest(body.token), body.purpose],
      );
      if (!record) throw new HttpError(400, "This link is invalid or expired.");
      if (hash) {
        await client.query(
          "UPDATE niyam_accounts SET password_hash=$1 WHERE id=$2",
          [hash, record.account_id],
        );
        await client.query(
          `DELETE FROM niyam_account_tokens WHERE account_id=$1 AND purpose='reset'`,
          [record.account_id],
        );
        await client.query("DELETE FROM niyam_sessions WHERE account_id=$1", [
          record.account_id,
        ]);
      } else {
        if (req.account?.id !== record.account_id)
          throw new HttpError(
            403,
            "Sign in with the account that requested this link, then open it again.",
          );
        await client.query(
          "UPDATE niyam_accounts SET verified_at=now() WHERE id=$1",
          [record.account_id],
        );
      }
      await audit(
        client,
        record.account_id,
        body.purpose === "reset"
          ? "account.password_reset"
          : "account.email_verified",
        record.account_id,
      );
    });
    res.json({ ok: true });
  });

  app.patch("/api/profile", async (req, res) => {
    const account = requireRole(req);
    const body = z
      .object({
        name: z.string().trim().min(2).max(100),
        current: z.string().max(128).optional(),
        password: password.optional(),
      })
      .parse(req.body);
    if (
      body.password &&
      !(await correctPassword(body.current || "", account.password_hash))
    )
      throw new HttpError(400, "Current password is incorrect.");
    const hash = body.password ? await hashPassword(body.password) : null;
    const updated = await transaction(db, async (client) => {
      const {
        rows: [row],
      } = await client.query(
        "UPDATE niyam_accounts SET name=$1,password_hash=COALESCE($2,password_hash) WHERE id=$3 RETURNING *",
        [body.name, hash, account.id],
      );
      if (hash)
        await client.query(
          "DELETE FROM niyam_sessions WHERE account_id=$1 AND token_hash<>$2",
          [account.id, digest(req.cookies.niyam)],
        );
      await audit(client, account.id, "profile.updated", account.id);
      return row;
    });
    res.json({ account: publicAccount(updated) });
  });

  app.get("/api/accounts", async (req, res) => {
    requireRole(req, "admin");
    const { rows } = await db.query(
      `SELECT id,email,name,role,status,roster_id,verified_at FROM niyam_accounts ORDER BY status,email`,
    );
    res.json(
      rows.map((row) => ({
        ...publicAccount(row),
        verified: !!row.verified_at,
      })),
    );
  });
}
