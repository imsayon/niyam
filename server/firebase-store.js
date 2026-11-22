import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "./store.js";

export const departmentId = "ISE";
const collections = [
  "events",
  "sittings",
  "rooms",
  "faculty",
  "students",
  "enrollments",
  "leaves",
  "references",
];
const documentId = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
const emptyWorkspace = () => ({
  events: [],
  sittings: [],
  rooms: [],
  faculty: [],
  students: [],
  enrollments: [],
  leaves: [],
  references: [],
  runs: [],
  imports: [],
});

export function firebaseStore(firestore) {
  const department = firestore.collection("niyamDepartments").doc(departmentId);
  const stateRef = department.collection("meta").doc("workspace");
  const refs = Object.fromEntries(
    [
      ...collections,
      "imports",
      "accountMembers",
      "sessions",
      "audit",
      "allocationRuns",
    ].map((name) => [name, department.collection(name)]),
  );

  async function readWorkspace(tx) {
    const stateSnapshot = await tx.get(stateRef);
    const state = stateSnapshot.data() || { revision: 0, marker: 0 };
    const docs = await Promise.all(
      collections.map((name) => tx.get(refs[name])),
    );
    const data = emptyWorkspace();
    collections.forEach((name, index) => {
      data[name] = docs[index].docs.map((doc) => doc.data());
    });
    const importDocs = await tx.get(refs.imports);
    data.imports = importDocs.docs.map((doc) => doc.data().id);
    const runDocs = await tx.get(refs.allocationRuns);
    const resultDocs = await Promise.all(
      runDocs.docs.map((doc) => tx.get(doc.ref.collection("sittings"))),
    );
    data.runs = runDocs.docs
      .map((doc, index) => {
        const metadata = doc.data();
        const sessions = resultDocs[index].docs.map((sitting) =>
          sitting.data(),
        );
        return {
          ...metadata,
          status: metadata.status,
          sessions: sessions.sort((a, b) => a.id.localeCompare(b.id)),
        };
      })
      .sort(
        (a, b) =>
          (a.at || "").localeCompare(b.at || "") || a.id.localeCompare(b.id),
      );
    return {
      data,
      revision: state.revision || 0,
      marker: state.marker || 0,
    };
  }

  function writeCollection(tx, name, before, after) {
    const oldRows = new Map(before.map((row) => [String(row.id), row]));
    const newRows = new Map(after.map((row) => [String(row.id), row]));
    for (const [id, row] of newRows) {
      if (
        !oldRows.has(id) ||
        JSON.stringify(oldRows.get(id)) !== JSON.stringify(row)
      )
        tx.set(refs[name].doc(documentId(id)), row);
    }
    for (const id of oldRows.keys())
      if (!newRows.has(id)) tx.delete(refs[name].doc(documentId(id)));
  }

  function writeRuns(tx, before, after) {
    const oldRuns = new Map(before.map((run) => [String(run.id), run]));
    const newRuns = new Map(after.map((run) => [String(run.id), run]));
    for (const [id, run] of newRuns) {
      const ref = refs.allocationRuns.doc(documentId(id));
      const { sessions = [], ...metadata } = run;
      const { sessions: oldSessions = [], ...oldMetadata } =
        oldRuns.get(id) || {};
      if (JSON.stringify(oldMetadata) !== JSON.stringify(metadata))
        tx.set(ref, metadata);
      const oldRows = new Map(oldSessions.map((row) => [String(row.id), row]));
      const nextRows = new Map(sessions.map((row) => [String(row.id), row]));
      for (const [sittingId, row] of nextRows)
        if (
          !oldRows.has(sittingId) ||
          JSON.stringify(oldRows.get(sittingId)) !== JSON.stringify(row)
        )
          tx.set(ref.collection("sittings").doc(documentId(sittingId)), row);
      for (const sittingId of oldRows.keys())
        if (!nextRows.has(sittingId))
          tx.delete(ref.collection("sittings").doc(documentId(sittingId)));
    }
    for (const id of oldRuns.keys()) {
      if (newRuns.has(id)) continue;
      const ref = refs.allocationRuns.doc(documentId(id));
      for (const result of oldRuns.get(id).sessions || [])
        tx.delete(ref.collection("sittings").doc(documentId(result.id)));
      tx.delete(ref);
    }
  }

  function writeImports(tx, before, after) {
    const oldRows = new Set(before);
    const newRows = new Set(after);
    for (const id of newRows)
      if (!oldRows.has(id)) tx.set(refs.imports.doc(documentId(id)), { id });
    for (const id of oldRows)
      if (!newRows.has(id)) tx.delete(refs.imports.doc(documentId(id)));
  }

  async function commitMutation(
    revision,
    actor,
    action,
    target,
    work,
    { planning = true } = {},
  ) {
    return firestore.runTransaction(async (tx) => {
      const current = await readWorkspace(tx);
      if (revision !== current.revision)
        throw new HttpError(
          409,
          "The workspace changed. Refresh and try again.",
        );
      const data = structuredClone(current.data);
      const result = await work(data, { tx, department, refs });
      for (const name of collections)
        writeCollection(tx, name, current.data[name] || [], data[name] || []);
      writeImports(tx, current.data.imports, data.imports);
      writeRuns(tx, current.data.runs, data.runs);
      const marker = current.marker + 1;
      tx.set(stateRef, {
        revision: current.revision + Number(planning),
        marker,
        updatedAt: new Date().toISOString(),
      });
      tx.create(refs.audit.doc(randomUUID()), {
        at: new Date().toISOString(),
        actor,
        action,
        target,
      });
      return {
        revision: current.revision + Number(planning),
        marker,
        result,
      };
    });
  }

  return {
    firestore,
    department,
    refs,
    stateRef,
    memberRef(uid, role) {
      return refs.accountMembers.doc(documentId(uid + ":" + role));
    },
    sessionRef(value) {
      return refs.sessions.doc(documentId(value));
    },
    async snapshot(since) {
      return firestore.runTransaction(async (tx) => {
        const stateSnapshot = await tx.get(stateRef);
        const state = stateSnapshot.data() || { revision: 0, marker: 0 };
        const marker = state.marker || 0;
        if (since !== undefined && Number(since) === marker)
          return { unchanged: true, revision: state.revision || 0, marker };
        const current = await readWorkspace(tx);
        return current;
      });
    },
    commitMutation,
    async auditRows() {
      const result = await refs.audit.orderBy("at", "desc").limit(100).get();
      return result.docs.map((doc) => doc.data());
    },
    async listMembers() {
      const result = await refs.accountMembers.get();
      return result.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    async findRoster(role, address) {
      const collection = role === "faculty" ? refs.faculty : refs.students;
      const result = await collection.where("email", "==", address).get();
      return result.docs
        .map((doc) => doc.data())
        .filter(
          (person) =>
            person.department === departmentId &&
            person.status !== "inactive" &&
            person.status !== "disabled" &&
            person.active !== false &&
            typeof person.email === "string" &&
            person.email.trim().toLowerCase() === address,
        );
    },
    async seedWorkspace(data) {
      await firestore.runTransaction(async (tx) => {
        if ((await tx.get(stateRef)).exists) return;
        tx.set(department, { id: departmentId });
        tx.set(stateRef, { revision: 0, marker: 1 });
        for (const name of collections)
          for (const row of data[name] || [])
            tx.set(refs[name].doc(documentId(row.id)), row);
        for (const id of data.imports || [])
          tx.set(refs.imports.doc(documentId(id)), { id });
      });
    },
  };
}
