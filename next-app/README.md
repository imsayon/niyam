# Niyam Next — isolated migration preview

**Not production-ready. Do not change Render main or release a Windows installer from this branch.**

This is a working App Router **frontend migration baseline**, not the final product. The current Niyam Vite/Express application remains live. `legacy/NiyamApp.jsx` is a temporary, client-only copy of the working React UI. The actual API remains on Express during the transition; replacing those endpoints with real Next Route Handlers is the next critical task. Native `/api/health` and `/api/releases` are already present.

## Local development

1. Provision a **separate development database**, ideally a short-lived Neon branch. Never reuse production `DATABASE_URL`. Backups and encryption key custody remain the owner's responsibility.
2. At repository root run `npm ci`, then `cd next-app && npm install`.
3. At repository root, start the legacy API against the isolated database:

```bash
NIYAM_SANDBOX=1 DATABASE_URL='<sandbox-db-url>' PUBLIC_ORIGIN=http://127.0.0.1:3000 PORT=4317 node server/api-only.js
```

4. Start Next in another terminal:

```bash
cd next-app
DATABASE_URL='<sandbox-db-url>' NIYAM_LEGACY_API_ORIGIN=http://127.0.0.1:4317 npm run dev
```

5. Open `http://127.0.0.1:3000`. Run `npm run build && npm run typecheck` before suggesting a merge.

**Never use production as the proxy target**. The Next configuration restricts the temporary API rewrite to loopback. The API-only runner also requires `NIYAM_SANDBOX=1` outside Render and does not seed accounts. Testing with the hosted Google provider needs an independently trusted preview origin.

## What works in this slice

- Next App Router owns routing, metadata, CSS, and a client-only mount of the existing React workflows.
- Native Node Route Handlers handle health queries (real PostgreSQL) and installer metadata.
- Unmigrated API routes proxy to a separate **local** existing Express process, retaining its database, sessions, permissions and validation on a sandbox.
- Existing production code is unchanged on this feature branch except the isolated API-only startup helper and the already-reviewed optional API boundary.

## Not complete — mandatory before full cutover

1. Extract authorization and all API operations into native Next Route Handlers and framework-neutral domain modules. Remove the Express dependency and local rewrite from the final build.
2. Convert the preserved `legacy/` JSX into typed, well-composed Next client/server components and deliver the requested superior design.
3. Prove parity for role-scoped sign-in (admin/Google), desktop pairing, CRUD, allocation, publication, revision conflicts, historical imports, reports and persistent Gemini conversations.
4. Commit a generated dependency lockfile and use reproducible `npm ci` installs for the Next preview.
5. Verify real staging with cloned data, failure testing, Playwright, desktop Windows smoke, and a documented production rollback. Only then switch Render.
