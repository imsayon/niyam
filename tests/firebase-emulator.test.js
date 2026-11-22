import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { getAuth } from "firebase-admin/auth";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  firebaseAdminEmail,
  firebaseAuthApi,
} from "../server/firebase-auth.js";
import { firebaseStore, departmentId } from "../server/firebase-store.js";
import { firebaseWorkspaceApi } from "../server/firebase-workspace.js";
import { firebaseOutputApi } from "../server/firebase-outputs.js";
import { fixture } from "../server/fixture.js";
import { defaultPolicy } from "../server/workspace.js";
import { HttpError } from "../server/store.js";

const projectId = process.env.GCLOUD_PROJECT || "demo-niyam-local";
const ready =
  projectId.startsWith("demo-") &&
  !!process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  !!process.env.FIRESTORE_EMULATOR_HOST;
const docId = (value) =>
  createHash("sha256").update(String(value)).digest("hex");

test(
  "Firebase Auth and Firestore emulator enforce ISE access and allocation contracts",
  { skip: !ready },
  async () => {
    const appId = "niyam-emulator-test-" + randomUUID();
    const firebaseApp = initializeApp({ projectId }, appId);
    const auth = getAuth(firebaseApp);
    const firestore = getFirestore(firebaseApp);
    const store = firebaseStore(firestore);
    const tokens = new Map();
    const sessions = new Map();
    const generated = [];
    const madeUsers = [];
    const adminUser = await auth.createUser({
      email: firebaseAdminEmail,
      emailVerified: true,
      password: "Emulator-only-Admin-7Q!",
      displayName: "Synthetic administrator",
    });
    const studentUser = await auth.createUser({
      email: "student1@example.test",
      emailVerified: true,
      password: "Emulator-only-Student-7Q!",
      displayName: "Synthetic student",
    });
    const facultyUser = await auth.createUser({
      email: "faculty1@example.test",
      emailVerified: true,
      password: "Emulator-only-Faculty-7Q!",
      displayName: "Synthetic faculty",
    });
    const facultyTwoUser = await auth.createUser({
      email: "faculty2@example.test",
      emailVerified: true,
      password: "Emulator-only-Faculty-8Q!",
      displayName: "Synthetic faculty two",
    });
    const otherUser = await auth.createUser({
      email: "other@example.test",
      emailVerified: true,
      password: "Emulator-only-Other-7Q!",
    });
    madeUsers.push(
      adminUser,
      studentUser,
      facultyUser,
      facultyTwoUser,
      otherUser,
    );

    const addToken = (name, user, provider, emailVerified = true) => {
      tokens.set(name, {
        uid: user.uid,
        email: user.email,
        email_verified: emailVerified,
        firebase: { sign_in_provider: provider },
        department: "CSE",
      });
      return name;
    };
    const adminToken = addToken(
      "mock-verified-admin-id-token",
      adminUser,
      "password",
    );
    const adminGoogleToken = addToken(
      "mock-google-admin-id-token",
      adminUser,
      "google.com",
    );
    const studentToken = addToken(
      "mock-verified-student-id-token",
      studentUser,
      "google.com",
    );
    const facultyToken = addToken(
      "mock-verified-faculty-id-token",
      facultyUser,
      "google.com",
    );
    const facultyTwoToken = addToken(
      "mock-verified-faculty-two-id-token",
      facultyTwoUser,
      "google.com",
    );
    const otherToken = addToken(
      "mock-unrostered-admin-id-token",
      otherUser,
      "password",
    );
    const identity = {
      verifyIdToken: async (token) => {
        if (!tokens.has(token)) throw new Error("Invalid test identity token");
        return tokens.get(token);
      },
      verifySessionCookie: async (cookie) => {
        if (!sessions.has(cookie)) throw new Error("Invalid test session");
        return sessions.get(cookie);
      },
      createSessionCookie: async (token) => {
        const cookie = "mock-session-" + randomUUID();
        sessions.set(cookie, tokens.get(token));
        return cookie;
      },
      getUser: auth.getUser.bind(auth),
      updateUser: auth.updateUser.bind(auth),
    };
    const api = express();
    api.set("trust proxy", 1);
    api.use(express.json({ limit: "512kb" }), cookieParser());
    firebaseAuthApi(api, store, auth, identity);
    firebaseWorkspaceApi(api, store);
    firebaseOutputApi(api, store, {
      generate: async (_db, prompt) => {
        generated.push(prompt);
        return "Synthetic answer";
      },
    });
    api.use((error, _req, res, _next) => {
      res
        .status(error.status || (error.name === "ZodError" ? 422 : 500))
        .json({ error: error.message });
    });
    const server = api.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port + "/api";
    async function request(path, body, cookie, method = body ? "POST" : "GET") {
      const response = await fetch(base + path, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie: "__session=" + cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      return {
        status: response.status,
        data,
        cookie: response.headers
          .get("set-cookie")
          ?.split(";")[0]
          ?.split("=")
          .slice(1)
          .join("="),
      };
    }
    const signIn = async (token, role) => {
      const response = await request("/session", { idToken: token, role });
      return { ...response, cookie: response.cookie };
    };
    const resetWorkspace = async () => {
      await firestore.recursiveDelete(store.department);
      const data = fixture();
      data.faculty = data.faculty.map((person) => ({
        ...person,
        department: departmentId,
      }));
      data.students = data.students.map((person) => ({
        ...person,
        department: departmentId,
      }));
      data.sittings = data.sittings.map((sitting) => ({
        ...sitting,
        papers: sitting.papers.map((paper) => ({
          ...paper,
          department: departmentId,
        })),
      }));
      await store.seedWorkspace(data);
      const memberRef = store.memberRef(adminUser.uid, "admin");
      await memberRef.set({
        id: memberRef.id,
        uid: adminUser.uid,
        email: firebaseAdminEmail,
        name: "Synthetic administrator",
        role: "admin",
        status: "active",
        department: departmentId,
        rosterId: null,
        verified: true,
      });
      const signedIn = await signIn(adminToken, "admin");
      assert.equal(signedIn.status, 200);
      return signedIn.cookie;
    };
    async function functionHealth() {
      const response = await fetch(
        `http://127.0.0.1:5001/${projectId}/us-central1/api/api/health`,
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "ok");
      const hosted = await fetch("http://127.0.0.1:5000/api/health");
      assert.equal(hosted.status, 200);
      assert.equal((await hosted.json()).status, "ok");
    }

    async function verifyHostingSession() {
      const origin = "http://127.0.0.1:5000";
      const json = { "content-type": "application/json" };
      const credentials = await fetch(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-niyam-local",
        {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            email: firebaseAdminEmail,
            password: "Emulator-only-Admin-7Q!",
            returnSecureToken: true,
          }),
        },
      );
      assert.equal(credentials.status, 200);
      const { idToken } = await credentials.json();
      const login = await fetch(origin + "/api/session", {
        method: "POST",
        headers: { ...json, origin },
        body: JSON.stringify({ idToken, role: "admin" }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.getSetCookie()[0]?.split(";")[0];
      assert.ok(cookie?.startsWith("__session="));
      assert.match(login.headers.get("cache-control"), /private/);
      assert.equal(
        (await fetch(origin + "/api/workspace", { headers: { cookie } }))
          .status,
        200,
      );
      const logout = await fetch(origin + "/api/session", {
        method: "DELETE",
        headers: { origin, cookie },
      });
      assert.equal(logout.status, 200);
      assert.match(logout.headers.getSetCookie()[0] || "", /^__session=;/);
    }

    try {
      assert.equal((await signIn(adminToken, "admin")).status, 403);
      const adminCookie = await resetWorkspace();
      assert.equal((await signIn(adminGoogleToken, "admin")).status, 403);
      await functionHealth();
      await verifyHostingSession();
      assert.equal((await request("/workspace")).status, 401);
      assert.equal(
        (
          await request("/session", {
            idToken: "invalid-firebase-id-token",
            role: "admin",
          })
        ).status,
        401,
      );
      assert.equal(
        (await request("/session", { idToken: otherToken, role: "admin" }))
          .status,
        403,
      );
      assert.equal(
        (await request("/session", { idToken: studentToken, role: "admin" }))
          .status,
        403,
      );
      assert.equal(
        (await request("/session", { idToken: adminToken, role: "student" }))
          .status,
        403,
      );
      assert.equal(
        (
          await request("/session", {
            idToken: adminToken,
            role: "admin",
            department: "CSE",
          })
        ).status,
        422,
      );
      const adminSession = await request("/session", undefined, adminCookie);
      assert.equal(adminSession.data.account.role, "admin");
      assert.equal(adminSession.data.account.department, undefined);
      assert.equal(adminSession.data.firebase, true);

      const studentLogin = await signIn(studentToken, "student");
      const facultyLogin = await signIn(facultyToken, "faculty");
      const facultyTwoLogin = await signIn(facultyTwoToken, "faculty");
      assert.equal(studentLogin.status, 200);
      assert.equal(facultyLogin.status, 200);
      assert.equal(facultyTwoLogin.status, 200);
      assert.equal(
        (await request("/session", { idToken: studentToken, role: "faculty" }))
          .status,
        403,
      );
      assert.equal(
        (await request("/accounts", undefined, studentLogin.cookie)).status,
        403,
      );
      assert.equal(
        (await request("/workspace?department=CSE", undefined, adminCookie))
          .status,
        403,
      );
      assert.equal(
        (
          await request(
            "/records/students",
            {
              revision: 0,
              record: {
                name: "Outside department",
                code: "OUT1",
                email: "",
                department: "CSE",
                semester: 3,
              },
            },
            adminCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/events/demo-event/solve?department=CSE",
            {},
            adminCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/ai/ask",
            { question: "What is my exam?", department: "CSE" },
            studentLogin.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(base + "/export/demo-event/seating.csv?department=CSE", {
            headers: { cookie: "__session=" + adminCookie },
          })
        ).status,
        403,
      );

      let workspace = (await request("/workspace", undefined, adminCookie))
        .data;
      const firstRevision = workspace.revision;
      const createdEvent = await request(
        "/records/events",
        {
          revision: firstRevision,
          record: { name: "Synthetic stale-write check", cycle: "Test cycle" },
        },
        adminCookie,
      );
      assert.equal(createdEvent.status, 201);
      assert.equal(createdEvent.data.revision, firstRevision + 1);
      assert.equal(
        (
          await request(
            "/records/events",
            {
              revision: firstRevision,
              record: { name: "Stale write", cycle: "Test cycle" },
            },
            adminCookie,
          )
        ).status,
        409,
      );
      workspace = (await request("/workspace", undefined, adminCookie)).data;
      const beforeInvalidImport = workspace.data.students.length;
      const invalidImport = await request(
        "/import/commit",
        {
          revision: workspace.revision,
          kind: "students",
          rows: [
            {
              name: "Synthetic candidate",
              code: "TEMP1",
              department: "ISE",
              semester: 3,
            },
            { name: "Broken row" },
          ],
        },
        adminCookie,
      );
      assert.equal(invalidImport.status, 422);
      workspace = (await request("/workspace", undefined, adminCookie)).data;
      assert.equal(workspace.data.students.length, beforeInvalidImport);
      const duplicatePreview = await request(
        "/import/preview",
        {
          revision: workspace.revision,
          kind: "references",
          rows: [
            {
              type: "historical-lab-batch",
              year: "2025-26",
              section: "A",
              batch: "A1",
              studentId: "SYNTH001",
              studentName: "Synthetic row",
              source: { fileName: "synthetic.docx", table: 1, row: 2 },
            },
            {
              type: "historical-lab-batch",
              year: "2025-26",
              section: "A",
              batch: "A1",
              studentId: "SYNTH001",
              studentName: "Synthetic duplicate",
              source: { fileName: "synthetic.docx", table: 1, row: 3 },
            },
          ],
        },
        adminCookie,
      );
      assert.equal(duplicatePreview.status, 200);
      assert.equal(duplicatePreview.data.errors.length, 1);
      workspace = (await request("/workspace", undefined, adminCookie)).data;
      const beforePreview = workspace.data.students.length;
      const preview = await request(
        "/import/preview",
        {
          revision: workspace.revision,
          kind: "students",
          rows: [
            {
              name: "Synthetic candidate",
              code: "TEMP1",
              department: "ISE",
              semester: 3,
            },
          ],
        },
        adminCookie,
      );
      assert.equal(preview.status, 200);
      assert.equal(
        (await request("/workspace", undefined, adminCookie)).data.data.students
          .length,
        beforePreview,
      );
      const committed = await request(
        "/import/commit",
        {
          revision: workspace.revision,
          kind: "students",
          rows: [
            {
              name: "Synthetic candidate",
              code: "TEMP1",
              department: "ISE",
              semester: 3,
            },
          ],
        },
        adminCookie,
      );
      assert.equal(committed.status, 200);
      assert.equal(
        (
          await request(
            "/import/commit",
            {
              revision: workspace.revision,
              kind: "students",
              rows: [
                {
                  name: "Synthetic candidate",
                  code: "TEMP1",
                  department: "ISE",
                  semester: 3,
                },
              ],
            },
            adminCookie,
          )
        ).status,
        409,
      );
      workspace = (await request("/workspace", undefined, adminCookie)).data;
      const unchanged = await request(
        "/workspace?since=" + workspace.marker,
        undefined,
        adminCookie,
      );
      assert.equal(unchanged.data.unchanged, true);

      const movedMemberId = store.memberRef(facultyUser.uid, "faculty").id;
      const revisionBeforeDisable = workspace.revision;
      const markerBeforeDisable = workspace.marker;
      const disabled = await request(
        "/accounts/" + movedMemberId + "/decision",
        { revision: workspace.revision, action: "disable" },
        adminCookie,
      );
      assert.equal(disabled.status, 200);
      assert.equal(disabled.data.revision, revisionBeforeDisable);
      assert.equal(disabled.data.marker, markerBeforeDisable + 1);
      assert.equal(
        (await request("/workspace", undefined, facultyLogin.cookie)).status,
        401,
      );
      await auth.updateUser(facultyTwoUser.uid, {
        email: "changed@example.test",
      });
      assert.equal(
        (await request("/workspace", undefined, facultyTwoLogin.cookie)).status,
        401,
      );
      await store.refs.students.doc(docId("student-1")).delete();
      assert.equal(
        (await request("/workspace", undefined, studentLogin.cookie)).status,
        401,
      );

      let admin = await resetWorkspace();
      workspace = (await request("/workspace", undefined, admin)).data;
      let revisionNow = workspace.revision;
      await store.commitMutation(
        revisionNow,
        adminUser.uid,
        "test.enrollment_removed",
        "paper-5",
        (data) => {
          data.enrollments = data.enrollments.filter(
            (row) => row.paperId !== "paper-5",
          );
        },
      );
      workspace = (await request("/workspace", undefined, admin)).data;
      let missingEnrollment = await request(
        "/events/demo-event/solve",
        { revision: workspace.revision, policy: defaultPolicy },
        admin,
      );
      assert.equal(missingEnrollment.data.status, "needs_review");
      assert.ok(
        missingEnrollment.data.issues.some(
          (issue) => issue.code === "missing-paper-enrollment",
        ),
      );
      assert.equal((await store.refs.allocationRuns.get()).size, 0);

      admin = await resetWorkspace();
      workspace = (await request("/workspace", undefined, admin)).data;
      await store.commitMutation(
        workspace.revision,
        adminUser.uid,
        "test.capacity_reduced",
        "demo-sitting",
        (data) => {
          data.rooms = data.rooms.map((room) => ({
            ...room,
            cells: room.cells.map((cell) => ({ ...cell, blocked: true })),
          }));
        },
      );
      workspace = (await request("/workspace", undefined, admin)).data;
      const insufficient = await request(
        "/events/demo-event/solve",
        { revision: workspace.revision, policy: defaultPolicy },
        admin,
      );
      assert.equal(insufficient.data.status, "needs_review");
      assert.ok(
        insufficient.data.issues.some(
          (issue) => issue.code === "insufficient-capacity",
        ),
      );

      admin = await resetWorkspace();
      workspace = (await request("/workspace", undefined, admin)).data;
      await store.commitMutation(
        workspace.revision,
        adminUser.uid,
        "test.simultaneous_paper_added",
        "parallel-sitting",
        (data) => {
          data.sittings.push({
            ...data.sittings[0],
            id: "parallel-sitting",
            name: "Synthetic parallel paper",
            papers: [data.sittings[0].papers[0]],
          });
          data.enrollments.push({
            id: "parallel-enrollment",
            sittingId: "parallel-sitting",
            paperId: data.sittings[0].papers[0].id,
            studentId: "student-1",
            accessible: false,
          });
        },
      );
      workspace = (await request("/workspace", undefined, admin)).data;
      const collision = await request(
        "/events/demo-event/solve",
        { revision: workspace.revision, policy: defaultPolicy },
        admin,
      );
      assert.equal(collision.data.status, "needs_review");
      assert.ok(
        collision.data.issues.some(
          (issue) => issue.code === "simultaneous-paper-conflict",
        ),
      );

      admin = await resetWorkspace();
      workspace = (await request("/workspace", undefined, admin)).data;
      const solved = await request(
        "/events/demo-event/solve",
        { revision: workspace.revision, policy: defaultPolicy },
        admin,
      );
      assert.equal(solved.status, 200);
      assert.equal(solved.data.result.status, "feasible");
      assert.equal(solved.data.result.sessions[0].seats.length, 120);
      const storedRun = await store.refs.allocationRuns
        .where("id", "==", solved.data.result.id)
        .get();
      assert.equal(storedRun.size, 1);
      const runDocument = storedRun.docs[0];
      assert.equal(Object.hasOwn(runDocument.data(), "sessions"), false);
      const sittingResults = await runDocument.ref.collection("sittings").get();
      assert.equal(sittingResults.size, 1);
      assert.equal(sittingResults.docs[0].data().seats.length, 120);
      const published = await request(
        "/events/demo-event/publish",
        { revision: solved.data.revision, runId: solved.data.result.id },
        admin,
      );
      assert.equal(published.status, 200);
      const adminCsv = await fetch(base + "/export/demo-event/seating.csv", {
        headers: { cookie: "__session=" + admin },
      });
      assert.equal(adminCsv.status, 200);
      const adminCsvText = await adminCsv.text();
      assert.ok(adminCsvText.includes("DEMO001"));
      assert.ok(adminCsvText.includes("DEMO002"));
      const student = await signIn(studentToken, "student");
      assert.equal(student.status, 200);
      const studentCsv = await fetch(
        base + "/export/demo-event/seating.csv?department=CSE",
        { headers: { cookie: "__session=" + student.cookie } },
      );
      assert.equal(studentCsv.status, 403);
      const ownCsv = await fetch(base + "/export/demo-event/seating.csv", {
        headers: { cookie: "__session=" + student.cookie },
      });
      assert.equal(ownCsv.status, 200);
      const ownCsvText = await ownCsv.text();
      assert.ok(ownCsvText.includes("DEMO001"));
      assert.equal(ownCsvText.includes("DEMO002"), false);
      const pdf = await fetch(base + "/export/demo-event/timetable.pdf", {
        headers: { cookie: "__session=" + admin },
      });
      assert.equal(pdf.status, 200);
      assert.equal(
        Buffer.from(await pdf.arrayBuffer())
          .subarray(0, 4)
          .toString(),
        "%PDF",
      );
      const answer = await request(
        "/ai/ask",
        {
          eventId: "demo-event",
          question: "Where is my synthetic seat?",
          attachment: "PRIVATE_ATTACHMENT_CONTENT",
        },
        student.cookie,
      );
      assert.equal(answer.status, 200);
      assert.equal(answer.data.answer, "Synthetic answer");
      assert.equal(
        generated.at(-1).includes("PRIVATE_ATTACHMENT_CONTENT"),
        false,
      );
      assert.equal(answer.data.source.length, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await firestore.recursiveDelete(store.department).catch(() => {});
      await Promise.all(
        madeUsers.map((user) => auth.deleteUser(user.uid).catch(() => {})),
      );
      await deleteApp(firebaseApp);
    }
  },
);
