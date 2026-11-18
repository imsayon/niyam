import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { database, setup } from "../server/store.js";
import { application } from "../server/index.js";
import { seedDemo } from "../scripts/seed.js";
import { defaultPolicy } from "../server/workspace.js";

const url = process.env.TEST_DATABASE_URL;
test(
  "authenticated CRUD, role isolation, atomic imports and publication",
  { skip: !url },
  async () => {
    const db = database(url);
    const schema = "test_" + randomBytes(5).toString("hex");
    await db.query("CREATE SCHEMA " + schema);
    const connection = new URL(url);
    connection.searchParams.set("options", "-c search_path=" + schema);
    const isolated = database(connection.href);
    let server;
    try {
      await setup(isolated);
      const passwords = Object.fromEntries(
        ["admin", "faculty", "student"].map((role) => [
          role,
          randomBytes(18).toString("hex"),
        ]),
      );
      await seedDemo(isolated, passwords);
      server = application(isolated).listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = "http://127.0.0.1:" + server.address().port + "/api";
      async function request(
        path,
        body,
        cookie,
        method = body ? "POST" : "GET",
      ) {
        const response = await fetch(base + path, {
          method,
          headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json();
        return {
          status: response.status,
          data,
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      }
      assert.equal((await request("/workspace")).status, 401);
      const cookies = {};
      for (const role of ["admin", "faculty", "student"]) {
        const result = await request("/session", {
          email: role + "@niyam.example",
          password: passwords[role],
        });
        assert.equal(result.status, 200);
        cookies[role] = result.cookie;
      }
      assert.equal(
        (await request("/accounts", undefined, cookies.student)).status,
        403,
      );
      const before = await request("/workspace", undefined, cookies.student);
      assert.equal(before.data.data.schedules.length, 0);
      let workspace = (await request("/workspace", undefined, cookies.admin))
        .data;
      const solved = await request(
        "/events/demo-event/solve",
        { revision: workspace.revision, policy: defaultPolicy },
        cookies.admin,
      );
      assert.equal(solved.status, 200, JSON.stringify(solved.data));
      assert.equal(solved.data.result.sessions[0].seats.length, 120);
      assert.equal(
        (await request("/workspace", undefined, cookies.student)).data.data
          .schedules.length,
        0,
      );
      assert.equal(
        (
          await request(
            "/events/demo-event/publish",
            { revision: workspace.revision, runId: solved.data.result.id },
            cookies.student,
          )
        ).status,
        403,
      );
      const pub = await request(
        "/events/demo-event/publish",
        { revision: workspace.revision, runId: solved.data.result.id },
        cookies.admin,
      );
      assert.equal(pub.status, 200, JSON.stringify(pub.data));
      const personal = (await request("/workspace", undefined, cookies.student))
        .data.data;
      assert.equal(personal.schedules.length, 1);
      assert.equal(personal.schedules[0].seat.studentId, "student-1");
      assert.equal(personal.faculty, undefined);
      workspace = (await request("/workspace", undefined, cookies.admin)).data;
      const input = {
        revision: workspace.revision,
        record: {
          name: "New student",
          code: "NEW1",
          email: "",
          department: "CSE",
          semester: 3,
        },
      };
      assert.equal(
        (await request("/records/students", input, cookies.student)).status,
        403,
      );
      const created = await request("/records/students", input, cookies.admin);
      assert.equal(created.status, 201);
      assert.equal(
        (await request("/records/students", input, cookies.admin)).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/events/demo-event/publish",
            { revision: created.data.revision, runId: solved.data.result.id },
            cookies.admin,
          )
        ).status,
        409,
      );
      const badImport = await request(
        "/import/commit",
        {
          revision: created.data.revision,
          kind: "students",
          rows: [
            { name: "Valid", code: "TEMP", department: "CSE", semester: 3 },
            { name: "Broken" },
          ],
        },
        cookies.admin,
      );
      assert.equal(badImport.status, 422);
      workspace = (await request("/workspace", undefined, cookies.admin)).data;
      assert.equal(
        workspace.data.students.some((s) => s.code === "TEMP"),
        false,
      );
      assert.equal(
        workspace.data.events[0].publishedRunId,
        solved.data.result.id,
      );
      const del = await request(
        "/records/students/student-1",
        { revision: workspace.revision },
        cookies.admin,
        "DELETE",
      );
      assert.equal(del.status, 409);
      const leave = await request(
        "/records/leaves",
        {
          revision: workspace.revision,
          record: {
            facultyId: "faculty-2",
            from: "2026-11-25",
            to: "2026-11-25",
            reason: "Personal",
          },
        },
        cookies.faculty,
      );
      assert.equal(leave.status, 201);
      const own = (await request("/workspace", undefined, cookies.faculty)).data
        .data;
      assert.ok(own.leaves.every((item) => item.facultyId === "faculty-1"));
      const csv = await fetch(base + "/export/demo-event/seating.csv", {
        headers: { cookie: cookies.student },
      });
      assert.equal(csv.status, 200);
      const text = await csv.text();
      assert.ok(text.includes("DEMO001"));
      assert.ok(!text.includes("DEMO002"));
      const pdf = await fetch(base + "/export/demo-event/timetable.pdf", {
        headers: { cookie: cookies.admin },
      });
      assert.equal(pdf.status, 200);
      assert.equal(
        Buffer.from(await pdf.arrayBuffer())
          .subarray(0, 4)
          .toString(),
        "%PDF",
      );
      assert.equal(
        (
          await request(
            "/ai/ask",
            { question: "What is my next exam?" },
            cookies.student,
          )
        ).status,
        503,
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await isolated.end();
      await db.query("DROP SCHEMA " + schema + " CASCADE");
      await db.end();
    }
  },
);
