import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import express from "express";
import { seedDemo } from "../scripts/seed.js";
import { adminEmail } from "../server/accounts.js";
import { application } from "../server/index.js";
import { database, setup } from "../server/store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const challenge = "__Secure-neon-auth.session_challenge=mock-challenge";
const providerCookie = "__Secure-neon-auth.session_token=mock-session";

test(
  "Google sign-in verifies email and enforces the selected roster",
  {
    skip: !databaseUrl,
  },
  async (t) => {
    const schema = "google_" + randomBytes(5).toString("hex");
    const root = database(databaseUrl);
    await root.query("CREATE SCHEMA " + schema);
    const isolated = new URL(databaseUrl);
    isolated.searchParams.set("options", "-c search_path=" + schema);
    const db = database(isolated.href);
    t.after(async () => {
      await db.end();
      await root.query("DROP SCHEMA " + schema + " CASCADE");
      await root.end();
    });
    await setup(db);
    const password = randomBytes(18).toString("hex");
    await seedDemo(db, {
      admin: password,
      faculty: password,
      student: password,
    });
    await db.query(
      "UPDATE niyam_accounts SET email='admin@niyam.example' WHERE role='admin'",
    );
    await seedDemo(db, {
      admin: password,
      faculty: password,
      student: password,
    });

    const provider = express();
    provider.use(express.json());
    const address = "candidate@example.test";
    let verified = true;
    provider.post("/sign-in/social", (req, res) => {
      assert.equal(req.body.provider, "google");
      const callback = new URL(req.body.callbackURL);
      callback.searchParams.set("neon_auth_session_verifier", "verifier");
      res.append("Set-Cookie", challenge + "; Path=/; Secure; HttpOnly");
      res.json({ url: callback.href });
    });
    provider.get("/get-session", (req, res) => {
      if (
        req.query.neon_auth_session_verifier === "verifier" &&
        req.get("cookie") === challenge
      ) {
        res.append("Set-Cookie", providerCookie + "; Path=/; Secure; HttpOnly");
      } else if (req.get("cookie") !== providerCookie) {
        return res.status(401).json({});
      }
      const now = new Date().toISOString();
      res.json({
        user: {
          email: address,
          emailVerified: verified,
          createdAt: now,
          updatedAt: now,
        },
        session: {
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      });
    });
    async function serve(app) {
      const listener = await new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => resolve(server));
      });
      t.after(() => new Promise((resolve) => listener.close(resolve)));
      return "http://127.0.0.1:" + listener.address().port;
    }
    const googleUrl = await serve(provider);
    const previous = { ...process.env };
    Object.assign(process.env, {
      NEON_AUTH_URL: googleUrl,
      NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString("hex"),
      PUBLIC_ORIGIN: "http://niyam.example",
    });
    t.after(() => {
      for (const key of [
        "NEON_AUTH_URL",
        "NEON_AUTH_COOKIE_SECRET",
        "PUBLIC_ORIGIN",
      ]) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    });
    const base = await serve(application(db));
    function request(
      path,
      { body, cookie, method = body ? "POST" : "GET" } = {},
    ) {
      return fetch(base + path, {
        method,
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: body && JSON.stringify(body),
      });
    }
    const sessionCookie = (response) =>
      response.headers
        .getSetCookie()
        .find((value) => value.startsWith("niyam="))
        ?.split(";")[0];
    const admin = await request("/api/session", {
      body: { email: adminEmail, password, role: "admin" },
    });
    assert.equal(admin.status, 200);
    assert.equal(
      (
        await request("/api/session", {
          body: { email: "student@niyam.example", password, role: "student" },
        })
      ).status,
      401,
    );
    const adminCookie = sessionCookie(admin);
    async function changeEmail(value) {
      const { revision, data } = await (
        await request("/api/workspace", { cookie: adminCookie })
      ).json();
      const { id, ...student } = data.students[0];
      const result = await request("/api/records/students/" + id, {
        cookie: adminCookie,
        method: "PATCH",
        body: { revision, record: { ...student, email: value } },
      });
      assert.equal(result.status, 200, await result.text());
    }
    async function signIn(role, wrongRole) {
      const start = await request("/api/session/google", { body: { role } });
      assert.equal(start.status, 200);
      const { url } = await start.json();
      const callback = new URL(url);
      if (wrongRole) callback.searchParams.set("role", wrongRole);
      const cookie = start.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      return request(callback.pathname + callback.search, { cookie });
    }
    assert.match(
      (await signIn("student")).headers.get("location"),
      /signIn=roster/,
    );
    await changeEmail(address);
    assert.match(
      (await signIn("faculty")).headers.get("location"),
      /signIn=roster/,
    );
    assert.match(
      (await signIn("faculty", "student")).headers.get("location"),
      /signIn=retry/,
    );
    verified = false;
    assert.match(
      (await signIn("student")).headers.get("location"),
      /signIn=retry/,
    );
    verified = true;
    const signedIn = await signIn("student");
    assert.equal(signedIn.headers.get("location"), "/");
    const cookie = sessionCookie(signedIn);
    const { account } = await (
      await request("/api/session", { cookie })
    ).json();
    assert.equal(account.role, "student");
    assert.equal(account.email, address);
    assert.equal(account.passwordLogin, false);
    assert.equal((await request("/api/accounts", { cookie })).status, 403);
    await seedDemo(db, {
      admin: password,
      faculty: password,
      student: password,
    });
    await changeEmail("another@example.test");
    assert.equal((await request("/api/workspace", { cookie })).status, 401);
  },
);
