import cookieParser from "cookie-parser";
import express from "express";
import { getAuth } from "firebase-admin/auth";
import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import { documentApi } from "./documents.js";
import { firebaseAuthApi } from "./firebase-auth.js";
import { firebaseStore } from "./firebase-store.js";
import { firebaseWorkspaceApi } from "./firebase-workspace.js";
import { firebaseOutputApi } from "./firebase-outputs.js";

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "demo-niyam-local";
const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const loopback = (value) =>
  value && ["127.0.0.1", "localhost", "::1"].includes(value.split(":")[0]);
if (
  (authEmulator || firestoreEmulator) &&
  (!projectId.startsWith("demo-") ||
    (authEmulator && !loopback(authEmulator)) ||
    (firestoreEmulator && !loopback(firestoreEmulator)))
)
  throw new Error("Niyam Firebase emulators require a loopback demo project.");

const firebaseApp = getApps().length ? getApp() : initializeApp({ projectId });
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const store = firebaseStore(firestore);
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});
app.use(express.json({ limit: "512kb" }), cookieParser());
firebaseAuthApi(app, store, auth);
documentApi(app);
firebaseWorkspaceApi(app, store);
firebaseOutputApi(app, store);
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", version: process.env.K_REVISION || "firebase" }),
);
app.get("/api/releases", (req, res) =>
  res.json({
    windows: process.env.INSTALLER_URL || null,
    sha256: process.env.INSTALLER_SHA256 || null,
  }),
);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError)
    return res.status(422).json({
      error: "Correct the input and try again.",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  const status = error.status || 500;
  if (status === 500)
    console.error(
      "Request failed",
      req.method,
      req.path,
      error.code || error.name,
    );
  res.status(status).json({
    error:
      status === 500 ? "An unexpected server error occurred." : error.message,
    details: error.details,
  });
});

export const api = onRequest(
  { region: "us-central1", timeoutSeconds: 120, memory: "512MiB" },
  app,
);
