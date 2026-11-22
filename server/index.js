import express from "express";
import cookieParser from "cookie-parser";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { database, setup } from "./store.js";
import { accountApi } from "./accounts.js";
import { workspaceApi } from "./workspace.js";
import { outputApi } from "./outputs.js";
import { documentApi } from "./documents.js";
import { seedDemo } from "../scripts/seed.js";

export function application(db) {
  const app = express();
  const origin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  const download = process.env.INSTALLER_URL;
  // Stable, version-independent link. Legacy v0.1.0 overrides must not
  // advertise an installer that predates roster-based Google sign-in.
  const latest = "https://github.com/imsayon/niyam/releases/latest/download/Niyam-Setup-x64.exe";
  const obsolete = !!download && (
    download.includes("imsayon/niyam-downloads/") ||
    download.includes("imsayon/niyam/releases/download/v0.1.0/")
  );
  const installer = !download || obsolete ? latest : download;
  if (origin?.startsWith("https://")) app.set("trust proxy", 1);
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
  app.get("/api/health", async (req, res) => {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      version:
        process.env.RENDER_GIT_COMMIT ||
        process.env.npm_package_version ||
        "dev",
    });
  });
  app.get("/api/releases", async (req, res) => {
    const local = resolve("public/downloads/Niyam-Setup.exe");
    const exists = await access(local).then(
      () => true,
      () => false,
    );
    res.json({
      windows: exists && !origin ? "/downloads/Niyam-Setup.exe" : installer,
      sha256: installer === download ? process.env.INSTALLER_SHA256 || null : null,
    });
  });
  accountApi(app, db, origin);
  documentApi(app);
  workspaceApi(app, db);
  outputApi(app, db);
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  app.use(
    "/downloads",
    express.static(resolve("public/downloads"), { fallthrough: false }),
  );
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError)
      return res
        .status(422)
        .json({
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
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "An unexpected server error occurred."
            : error.message,
        details: error.details,
      });
  });
  return app;
}

if (process.argv[1]?.endsWith("/server/index.js")) {
  const db = database();
  await setup(db);
  if (process.env.DEMO_ADMIN_PASSWORD) {
    await seedDemo(
      db,
      Object.fromEntries(
        ["admin", "faculty", "student"].map((role) => [
          role,
          process.env["DEMO_" + role.toUpperCase() + "_PASSWORD"],
        ]),
      ),
    );
  }
  const port = Number(process.env.PORT || process.env.NIYAM_PORT || 3000);
  const server = application(db).listen(
    port,
    process.env.RENDER ? "0.0.0.0" : "127.0.0.1",
    (error) => {
      if (error) {
        console.error("Could not start Niyam:", error.message);
        process.exitCode = 1;
        db.end();
        return;
      }
      console.log("Niyam listening on " + port);
    },
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => server.close(() => db.end()));
}
