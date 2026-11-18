import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { database, setup } from "../server/store.js";
import { application } from "../server/index.js";
import { seedDemo } from "../scripts/seed.js";

test(
  "email verification, roster approval and one-use recovery links",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const messages = [];
    const decoded = message => message.replace(/=\n/g, "").replace(/=([0-9a-f]{2})/gi, (_,hex) => String.fromCharCode(parseInt(hex,16)));
    const smtp = net.createServer((socket) => {
      let buffer = "",
        content = "",
        reading = false;
      socket.write("220 niyam-test SMTP\r\n");
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        let end;
        while ((end = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (reading) {
            if (line === ".") {
              reading = false;
              messages.push(content);
              content = "";
              socket.write("250 Accepted\r\n");
            } else content += line + "\n";
          } else if (/^EHLO|HELO/.test(line))
            socket.write("250 niyam-test\r\n");
          else if (line === "DATA") {
            reading = true;
            socket.write("354 Begin data\r\n");
          } else if (line === "QUIT") {
            socket.write("221 Bye\r\n");
            socket.end();
          } else socket.write("250 OK\r\n");
        }
      });
    });
    smtp.listen(0, "127.0.0.1");
    await new Promise((resolve) => smtp.once("listening", resolve));
    const saved = { ...process.env };
    process.env.SMTP_URL = "smtp://127.0.0.1:" + smtp.address().port;
    process.env.MAIL_FROM = "office@example.test";
    process.env.PUBLIC_ORIGIN = "http://localhost";
    const db = database(process.env.TEST_DATABASE_URL),
      schema = "recovery_" + randomBytes(5).toString("hex");
    await db.query("CREATE SCHEMA " + schema);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set("options", "-c search_path=" + schema);
    const isolated = database(url.href);
    let server;
    try {
      await setup(isolated);
      const adminPassword = randomBytes(20).toString("hex");
      await seedDemo(isolated, {
        admin: adminPassword,
        faculty: adminPassword,
        student: adminPassword,
      });
      server = application(isolated).listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = "http://127.0.0.1:" + server.address().port + "/api";
      async function call(path, body, cookie) {
        const response = await fetch(base + path, {
          method: body ? "POST" : "GET",
          headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: response.status,
          body: await response.json(),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      }
      const password = randomBytes(18).toString("hex");
      let result = await call("/register", {
        name: "Candidate evaluation",
        email: "new@example.test",
        password,
        role: "student",
      });
      assert.equal(result.status, 200);
      assert.equal(messages.length, 1);
      const verification = decoded(messages[0]).match(/#verify=([\w-]+)/)?.[1];
      assert.ok(verification);
      const member = await call("/session", {
        email: "new@example.test",
        password,
      });
      assert.equal(member.body.account.status, "pending");
      assert.equal(
        (
          await call("/account-token", {
            token: verification,
            purpose: "verify",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            "/account-token",
            { token: verification, purpose: "verify" },
            member.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            "/account-token",
            { token: verification, purpose: "verify" },
            member.cookie,
          )
        ).status,
        400,
      );
      const admin = await call("/session", {
        email: "admin@niyam.example",
        password: adminPassword,
      });
      const state = await call("/workspace", undefined, admin.cookie);
      result = await call(
        "/accounts/" + member.body.account.id + "/decision",
        {
          revision: state.body.revision,
          action: "approve",
          rosterId: "student-2",
        },
        admin.cookie,
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(
        (await call("/workspace", undefined, member.cookie)).status,
        200,
      );
      assert.equal(
        (await call("/recovery", { email: "new@example.test" })).status,
        200,
      );
      const reset = decoded(messages.at(-1)).match(/#reset=([\w-]+)/)?.[1];
      assert.ok(reset);
      const next = randomBytes(18).toString("hex");
      assert.equal(
        (
          await call("/account-token", {
            token: reset,
            purpose: "reset",
            password: next,
          })
        ).status,
        200,
      );
      assert.equal(
        (await call("/workspace", undefined, member.cookie)).status,
        401,
      );
      assert.equal(
        (await call("/session", { email: "new@example.test", password }))
          .status,
        401,
      );
      assert.equal(
        (await call("/session", { email: "new@example.test", password: next }))
          .status,
        200,
      );
      assert.equal(
        (
          await call("/account-token", {
            token: reset,
            purpose: "reset",
            password: next,
          })
        ).status,
        400,
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      smtp.close();
      for (const key of ["SMTP_URL", "MAIL_FROM", "PUBLIC_ORIGIN"]) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      await isolated.end();
      await db.query("DROP SCHEMA " + schema + " CASCADE");
      await db.end();
    }
  },
);
