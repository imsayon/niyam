import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { getAuth } from "firebase-admin/auth";
import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { fixture } from "./fixture.js";
import { firebaseAdminEmail } from "./firebase-auth.js";
import { firebaseStore, departmentId } from "./firebase-store.js";

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "demo-niyam-local";
const loopback = (value) =>
  value && ["127.0.0.1", "localhost", "::1"].includes(value.split(":")[0]);
if (!projectId.startsWith("demo-"))
  throw new Error("Firebase seed only runs for a demo-prefixed project.");
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
if (
  !loopback(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
  !loopback(process.env.FIRESTORE_EMULATOR_HOST)
)
  throw new Error("Firebase seed requires loopback emulators.");

const app = getApps().length ? getApp() : initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);
const store = firebaseStore(firestore);
const credentialsPath = join(process.cwd(), "local", "firebase-admin.json");

async function passwordForEmulator() {
  await mkdir(join(process.cwd(), "local"), { recursive: true, mode: 0o700 });
  const password = firebaseAdminEmail;
  await writeFile(
    credentialsPath,
    JSON.stringify(
      { projectId, email: firebaseAdminEmail, password },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  await chmod(credentialsPath, 0o600);
  return password;
}

async function seed() {
  const password = await passwordForEmulator();
  let user;
  try {
    user = await auth.getUserByEmail(firebaseAdminEmail);
    user = await auth.updateUser(user.uid, {
      password,
      emailVerified: true,
      displayName: "Niyam ISE Administrator",
    });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email: firebaseAdminEmail,
      password,
      emailVerified: true,
      displayName: "Niyam ISE Administrator",
    });
  }
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
  if (!(await store.stateRef.get()).exists) await store.seedWorkspace(data);
  const memberRef = store.memberRef(user.uid, "admin");
  await firestore.runTransaction(async (tx) => {
    const [member, stateSnapshot] = await Promise.all([
      tx.get(memberRef),
      tx.get(store.stateRef),
    ]);
    if (member.exists) return;
    const state = stateSnapshot.data() || { revision: 0, marker: 0 };
    tx.create(memberRef, {
      id: memberRef.id,
      uid: user.uid,
      email: firebaseAdminEmail,
      name: user.displayName,
      role: "admin",
      status: "active",
      department: departmentId,
      rosterId: null,
      verified: true,
    });
    tx.set(store.stateRef, {
      revision: state.revision || 0,
      marker: (state.marker || 0) + 1,
      updatedAt: new Date().toISOString(),
    });
    tx.create(store.refs.audit.doc(), {
      at: new Date().toISOString(),
      actor: user.uid,
      action: "account.seeded",
      target: memberRef.id,
    });
  });
  console.log("Loopback Firebase emulator seed is ready.");
}

seed().catch(() => {
  console.error("Firebase emulator seed failed.");
  process.exitCode = 1;
});
