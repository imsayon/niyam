import { database, setup } from "./store.js";
import { application } from "./index.js";
// Separate, explicitly opted-in developer process only.
if (process.env.NIYAM_SANDBOX !== "1" || process.env.RENDER) {
  throw new Error("API-only runner requires NIYAM_SANDBOX=1 outside Render.");
}
if (!process.env.DATABASE_URL) throw new Error("An isolated DATABASE_URL is required.");
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1):[0-9]{2,5}$/.test(origin)) {
  throw new Error("PUBLIC_ORIGIN must be a local preview origin.");
}
process.env.PUBLIC_ORIGIN = origin;
const db = database();
await setup(db);
const port = Number(process.env.PORT || 4317);
const server = application(db, { serveFrontend: false }).listen(port, "127.0.0.1", () => {
  console.log("Niyam sandbox API listening on " + port);
});
for (const sig of ["SIGTERM", "SIGINT"])
  process.once(sig, () => server.close(() => db.end()));
