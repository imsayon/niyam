# Niyam: Next.js migration execution gates

Status: **In progress — preparation only**, 23 November 2026.
Baseline: `main` at `d725bab47d2b1b68f2be865a02e47729045752b2`.

This document tracks a controlled migration, **not** a claim that Niyam has migrated.
The production service currently uses the Express API, a Vite-built React SPA, a
Neon PostgreSQL database, and a hosted Electron client. The existing CI workflow
publishes Windows/Linux installers from verified `main` pushes.

## Why an incremental migration is mandatory

- The live database contains persistent workspace, identity, session, audit,
  provider settings and AI conversation records. A framework switch must not
  alter their interpretation or reset them.
- `server/accounts.js` handles app sessions, role enforcement, roster checks,
  Google callback and desktop pairing. Changing only the UI login flow would
  not preserve this security contract.
- `web/main.jsx` is a large single-file React application with client-side
  navigation; moving it verbatim into an App Router Server Component is not a
  valid migration.
- Existing URL paths, HTTP methods/status codes, cookies, exports and desktop
  callback query parameters are compatibility-sensitive public interfaces.
- Render auto-deploys `main`; do not move the deployed build or start commands
  before isolated release candidates pass the required evidence gates.

## Target architecture

```text
Browser / Windows Electron
          |
          v  HTTPS / single Render origin
  Next.js App Router + TypeScript (Node runtime)
          |               |
          |               +-- Server Components / client islands
          v
    Route Handlers / domain services
          |
          +-- existing allocation solver and validated commerce-style commands
          +-- session + roster authorization boundary
          +-- DOCX/PDF/CSV imports and exports (Node runtime)
          +-- server-only Gemini / SMTP integrations
          |
          v
    Neon PostgreSQL (same persistent records)
```

The final service has **one Next.js runtime**, no permanent second Express API
and no Vite production frontend. The database is authoritative, not browser
state or an AI response. Retain the existing PostgreSQL transactional revision
protocol and publication invariants unless an explicitly tested replacement
is proved equivalent.

## Delivery sequence and evidence gates

1. **Inventory and safeguard**. Preserve a database backup, encryption-key
   recovery procedure and last known-good Render release. Record the API
   endpoints, status codes, cookie attributes, route links and account roles.
   Audit current public pages and the actual Windows installer; a successful
   CI run does not prove Google sign-in against the real provider.
2. **Runtime boundary**. Support `application(db, { serveFrontend: false })`
   so the current HTTP API can be regression-tested independently of its
   Vite/static shell. Keep the default `application(db)` path unchanged on
   production. Run API-only contract tests in normal `npm test` CI.
3. **Create the Next.js TypeScript application** on a feature branch, with
   explicit Node version, lockfile, lint, typecheck and production build.
   Establish design tokens, root layout, loading/error boundaries and role
   routing. Verify framework/dependency compatibility against current
   upstream docs before pinning versions.
4. **Extract framework-neutral domain logic** from Express request/response
   handlers, one endpoint group at a time. Keep API responses and tests
   identical. Implement native Next.js Route Handlers; do not permanently
   embed the Express app or proxy to a second Node server.
5. **Migrate authentication first**: preserve existing account IDs, role
   checks, password hashes/session lifecycle, Google roster matching,
   single-use desktop pairing, and secure cookies. Neon Auth provides Google
   identity; a provider session alone must never grant an institutional
   role. Prove administrator, faculty and student access and denial cases.
6. **Migrate the React UI by workflow**, not as one huge JSX component:
   sign-in, overview, directories, rooms, examination setup, allocation,
   leave, imports, AI chat, reports, access, audit, settings. Use Server
   Components only for safe server-owned reads and client components for
   interactive editors. Keep accessible keyboard/focus behavior.
7. **Document and report parity**. Repeat official timetable, historical
   roster, duplicate reconciliation, Gemini follow-up persistence and PDF
   export regressions. Keep PDF/DOCX processing on Node, with resource limits.
8. **Desktop compatibility**. Test the hosted Next.js site in an installed
   Windows client; verify browser-based Google handoff, callback URL query,
   one-time exchange, reload and authenticated role-specific screens.
9. **Rehearsal and cutover**. Test a restored/isolated database, failure
   recovery, rollback and migration idempotency. Only then update Render
   build/start commands; deploy one Next.js runtime. Confirm the exact live
   commit and critical journeys. Retain the previous release for rollback.
10. **Release and document**. Run repository CI and signed-off Windows
    installation/launch tests, publish checksums and installer, verify actual
    download URL from the public landing page and record remaining limits.

## Non-negotiable acceptance tests

- API contract tests pass unchanged across the old and new runtime.
- Unauthenticated, wrong-role and revoked-roster access are rejected on the
  server. Password admin and real hosted Google sign-in both work.
- A concurrent/stale revision cannot publish or overwrite newer data.
- An imported historical roster cannot silently become current candidates.
- AI history persists across reloads and is never allowed to mutate records.
- The released installer installs, launches, signs in and loads published data.
- Live web revision, PostgreSQL persistence and downloadable release asset
  match the verified commit; rollback is executable.

## First change in this branch

Only the API/static-serving separation and its regression test are added.
There is **no Next.js dependency, new data migration, Render configuration
change, installer release or claim of migration completion** in this slice.
The next engineering change should begin only after this branch's CI tests
pass and the shared route contracts are mapped.
