import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer as httpServer } from "node:http";
import { createServer as tcpServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { database, setup } from "../../server/store.js";
import { seedDemo } from "../../scripts/seed.js";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const adminEmail = "admin.niyam@dsce.edu.in";
const password = () => randomBytes(18).toString("hex");

async function serve(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function isolatedNext(databaseUrl, config, exercise, dev) {
  const root = database(databaseUrl);
  const schema = "auth_" + randomBytes(5).toString("hex");
  await root.query("CREATE SCHEMA " + schema);
  const url = new URL(databaseUrl);
  url.searchParams.set("options", "-c search_path=" + schema);
  const db = database(url.href);
  let child, finished;
  try {
    await setup(db);
    const adminPassword = password();
    await seedDemo(db, { admin: adminPassword, faculty: password(), student: password() });
    const socket = await serve(tcpServer());
    await socket.close();
    const base = socket.url;
    const command = dev ? ["dev", "--webpack"] : ["start"];
    child = spawn(process.execPath, [
      "node_modules/next/dist/bin/next", ...command, "--hostname", "127.0.0.1", "--port", new URL(base).port,
    ], {
      cwd,
      env: {
        ...process.env, DATABASE_URL: url.href, PUBLIC_ORIGIN: base, DEV_ORIGIN: "",
        RENDER: "", NEON_AUTH_URL: "", NEON_AUTH_COOKIE_SECRET: "", SMTP_URL: "", MAIL_FROM: "",
        ...config,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    finished = once(child, "exit");
    let logs = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", chunk => { logs = (logs + chunk.toString()).slice(-4000); });
    for (let n = 0; n < 200; n++) {
      const result = await fetch(base + "/api/health", { signal: AbortSignal.timeout(1500) }).catch(() => null);
      if (result?.ok) break;
      assert.ok(n < 199 && child.exitCode === null, logs);
      await sleep(200);
    }
    const request = async (path, { body, cookie, method = body ? "POST" : "GET", status = 200, headers = {} } = {}) => {
      const response = await fetch(base + "/api" + path, {
        method, redirect: "manual",
        headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body && JSON.stringify(body),
      });
      const text = await response.text();
      if (status !== null) assert.equal(response.status, status, path + ": " + text.slice(0, 300) + "\n" + logs);
      const data = text ? JSON.parse(text) : null;
      const cookies = response.headers.getSetCookie().map(value => value.split(";")[0]);
      return { status: response.status, data, cookies, session: cookies.find(value => value.startsWith("niyam=")),
        location: response.headers.get("location") };
    };
    await exercise({ request, base, adminPassword });
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await finished;
    }
    await db.end();
    await root.query("DROP SCHEMA " + schema + " CASCADE");
    await root.end();
  }
}

export async function verifyAuth({ dev = false } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  const host = databaseUrl && new URL(databaseUrl).hostname;
  if (process.env.NIYAM_SANDBOX !== "1" || !["127.0.0.1", "localhost", "[::1]"].includes(host))
    throw new Error("Auth tests require a disposable loopback DATABASE_URL and NIYAM_SANDBOX=1");
  const address = "candidate@example.test";
  const challenge = "__Secure-neon-auth.session_challenge=niyam-test-challenge";
  const token = "__Secure-neon-auth.session_token=niyam-test-session";
  let verified = true;
  const provider = await serve(httpServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/sign-in/social") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const { provider, callbackURL } = JSON.parse(raw);
      assert.equal(provider, "google");
      const callback = new URL(callbackURL);
      callback.searchParams.set("neon_auth_session_verifier", "test-verifier");
      response.setHeader("Set-Cookie", challenge + "; Path=/; Secure; HttpOnly");
      response.end(JSON.stringify({ url: callback.href }));
    } else if (url.pathname === "/get-session") {
      if (url.searchParams.get("neon_auth_session_verifier") === "test-verifier" && request.headers.cookie === challenge)
        response.setHeader("Set-Cookie", token + "; Path=/; Secure; HttpOnly");
      else if (request.headers.cookie !== token) {
        response.writeHead(401).end("{}");
        return;
      }
      const now = new Date().toISOString();
      response.end(JSON.stringify({
        user: { email: address, emailVerified: verified, createdAt: now, updatedAt: now },
        session: { createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60000).toISOString() },
      }));
    } else response.writeHead(404).end("{}");
  }));
  try {
    await isolatedNext(databaseUrl, {
      NEON_AUTH_URL: provider.url, NEON_AUTH_COOKIE_SECRET: password(),
    }, async ({ request, base, adminPassword }) => {
      const admin = (await request("/session", { body: { email: adminEmail, password: adminPassword } })).session;
      assert.ok(admin);
      await request("/session/google", { body: { role: "student" }, status: 403, headers: { Origin: "https://foreign.example" } });
      const signIn = async (role, callbackRole = role) => {
        const start = await request("/session/google", { body: { role } });
        const callback = new URL(start.data.url);
        callback.searchParams.set("role", callbackRole);
        assert.ok(start.cookies.includes(challenge));
        return request(callback.pathname.replace(/^\/api/, "") + callback.search, { cookie: start.cookies.join("; "), status: 303 });
      };
      const changeEmail = async email => {
        const { data, revision } = (await request("/workspace", { cookie: admin })).data;
        const { id, ...student } = data.students[0];
        await request("/records/students/" + id, { method: "PATCH", cookie: admin, body: { revision, record: { ...student, email } } });
      };
      assert.match((await signIn("student")).location, /signIn=roster/);
      await changeEmail(address);
      assert.match((await signIn("faculty")).location, /signIn=roster/);
      assert.match((await signIn("faculty", "student")).location, /signIn=retry/);
      verified = false;
      assert.match((await signIn("student")).location, /signIn=retry/);
      verified = true;
      const student = await signIn("student");
      assert.equal(student.location, "/");
      assert.ok(student.session);
      const { account } = (await request("/session", { cookie: student.session })).data;
      assert.deepEqual([account.role, account.email, account.passwordLogin], ["student", address, false]);
      await request("/accounts", { cookie: student.session, status: 403 });

      const { requestId, verifier, url } = (await request("/session/desktop/start", { body: { role: "student" } })).data;
      assert.equal(new URL(url).origin, base);
      assert.equal(new URL(url).searchParams.get("desktop"), requestId);
      const exchange = (status, value = verifier) => request("/session/desktop/exchange", { body: { requestId, verifier: value }, status });
      await exchange(202);
      await exchange(410, "X".repeat(43));
      await request("/session/desktop/approve", { body: { requestId }, cookie: admin, status: 403 });
      await request("/session/desktop/approve", { body: { requestId }, cookie: student.session });
      const exchanges = await Promise.all([exchange(null), exchange(null)]);
      assert.deepEqual(exchanges.map(item => item.status).sort(), [200, 410]);
      const desktop = exchanges.find(item => item.status === 200).session;
      assert.ok(desktop);
      assert.equal((await request("/session", { cookie: desktop })).data.account.id, account.id);
      await changeEmail("changed@example.test");
      for (const cookie of [student.session, desktop]) await request("/workspace", { cookie, status: 401 });
    }, dev);
  } finally {
    await provider.close();
  }

  const messages = [];
  const smtp = await serve(tcpServer(socket => {
    let buffer = "", message = "", reading = false;
    socket.write("220 niyam-test SMTP\r\n");
    socket.on("data", chunk => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (reading && line !== ".") {
          message += line + "\n";
        } else if (reading) {
          messages.push(message.replace(/=\n/g, "").replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
          reading = false;
          message = "";
          socket.write("250 Accepted\r\n");
        } else if (line === "DATA") {
          reading = true;
          socket.write("354 Begin data\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  }));
  try {
    await isolatedNext(databaseUrl, { SMTP_URL: smtp.url.replace("http:", "smtp:"), MAIL_FROM: "office@example.test" },
      async ({ request, adminPassword }) => {
        const email = "new@example.test";
        const secret = password();
        await request("/register", { body: { email, role: "student", name: "Candidate Test", password: secret } });
        const token = messages.at(-1)?.match(/#verify=([\w-]+)/)?.[1];
        assert.ok(token);
        const student = await request("/session", { body: { email, password: secret } });
        assert.equal(student.data.account.status, "pending");
        const confirmation = { token, purpose: "verify" };
        await request("/account-token", { body: confirmation, status: 403 });
        await request("/account-token", { body: confirmation, cookie: student.session });
        await request("/account-token", { body: confirmation, cookie: student.session, status: 400 });
        const admin = (await request("/session", { body: { email: adminEmail, password: adminPassword } })).session;
        const { revision } = (await request("/workspace", { cookie: admin })).data;
        await request("/accounts/" + student.data.account.id + "/decision", {
          cookie: admin, body: { revision, action: "approve", rosterId: "student-2" },
        });
        const next = password();
        const profile = await request("/profile", { method: "PATCH", cookie: student.session, body: {
          name: "Candidate Updated", current: secret, password: next,
        } });
        assert.equal(profile.data.account.name, "Candidate Updated");
        await request("/session", { body: { email, password: secret }, status: 401 });
        await request("/recovery", { body: { email } });
        const reset = messages.at(-1)?.match(/#reset=([\w-]+)/)?.[1];
        assert.ok(reset);
        const resetPassword = password();
        await request("/account-token", { body: { token: reset, purpose: "reset", password: resetPassword } });
        await request("/workspace", { cookie: student.session, status: 401 });
        assert.ok((await request("/session", { body: { email, password: resetPassword } })).session);
        await request("/account-token", { body: { token: reset, purpose: "reset", password: resetPassword }, status: 400 });
        await request("/session", { body: { password: "é".repeat(1200) }, status: 413 });
        for (let n = 0; n < 13; n++) {
          const result = await request("/session", {
            body: { email }, headers: { "X-Forwarded-For": "192.0.2." + n }, status: null,
          });
          assert.ok([422, 429].includes(result.status));
          if (n === 12) assert.equal(result.status, 429);
        }
      }, dev);
  } finally {
    await smtp.close();
  }
  console.log("Native Google roster checks, one-use desktop handoff, SMTP lifecycle and auth protections passed");
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await verifyAuth({ dev: process.argv.includes("--dev") });
