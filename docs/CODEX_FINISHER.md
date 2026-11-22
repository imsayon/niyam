# NIYAM — CODEX FINALIZER / EXECUTION CONTRACT

**Execution branch:** `feat/niyam-next-app-router-parallel-20261123` (stacked on PR #4, reviewed in PR #5).
**Production branch:** `main` — KEEP WORKING AND UNCHANGED until a fully verified cutover.
**Stable Render service:** `niyam-exams`, `https://niyam-exams.onrender.com`, auto-deploys `main`.
**Neon production project:** `green-math-11616927` — never run destructive tests or migrations here.
**Current phase:** Next App Router migration has runnable groundwork, not a complete Next-only product.

## One-line mission

Finish Niyam into the exact, delightful, stable, secure, fully native **Next.js App Router + TypeScript** examination platform described by the owner's `Pasted text(1).txt` / engineering requirements while preserving the working public app until the replacement passes live-style acceptance. **Do the implementation, not another proposal.**

## Existing work — build on this, do not restart

1. `server/index.js` now supports `application(db, { serveFrontend: false })` while `application(db)` retains the legacy service. `tests/api-boundary.test.js` verifies this behavior.
2. `next-app/` already boots Next 16.4.6 with TypeScript, visual styles, deep-link routing, and a copy of the working client UI (`legacy/NiyamApp.jsx`). This is a parity bridge, not the end state.
3. Native Next Route Handlers exist for `/api/health`, `/api/releases`, `/api/session` (password sign-in/out and GET), `/api/institution`, `/api/workspace` (read), `/api/audit`, and `/api/ai/history`. The shared `next-app/lib/db.ts` and `security.ts` preserve session-hash, role, roster checks and CSRF semantics; inspect and strengthen them rather than duplicating auth.
4. Unmigrated API requests temporarily route to a **loopback-only** Express sandbox through `next-app/next.config.ts`. `server/api-only.js` provides the opt-in backend. It must disappear from the final deployed architecture.
5. `.github/workflows/next-parallel.yml` runs Next build, TypeScript, native/API/Chromium tests on PostgreSQL 17. Existing `ci.yml` continues to verify stable Vite and releases from `main`; do NOT publish preview installers on PR pushes.
6. `docs/NEXTJS_MIGRATION.md` contains initial guardrails. `README.md` is the original live contract. Private DATA project notes: `CS/1 - Barrack/Projects/Niyam/PROJECT_STATE.md` and `MAYA/Agents/Products/README.md`. Use sources if available, not guesses.
7. As of writing, the original baseline CI and early Next preview CI passed; **always inspect latest PR checks yourself**. Do not trust a prior green run after new edits.

## Operating mode — orchestrate, implement, review, verify

Work as principal engineer / technical product owner. Use available repo, shell, Playwright, browser, relevant tools and subagents. Divide independent tasks among focused agents if supported (API/Auth, domain/DB, UI/UX, import/reports/AI, desktop/release), but keep one authoritative integrator for interfaces and merge conflicts. Before changing each module, inspect actual source and tests; execute small coherent commits with running tests, keep notes of exact evidence and remaining risks. Do not let subagent suggestions become assumed implementation. Prefer simple modular designs; avoid replacing a tested solver or rewriting storage without a demonstrated need. Do not ask for trivial design choices; make reversible decisions and proceed.

### A. Complete backend parity — real Next Route Handlers

Build a **single native Next.js Node runtime**. Inventory the old Express routes programmatically and create a route parity table: method, URL, request/response shape, role, status codes, schema validation, expected transactional behavior, tests, and whether desktop depends on it. Remove the preview proxy as each endpoint becomes native. Decompose shared domain code into importable, framework-neutral TS modules rather than duplicating 30k-line handlers. Convert remaining auth endpoints: rostered Neon Google OAuth start/callback, desktop pairing start/approve/exchange, recovery as configured, account lifecycle and password change. Ensure provider identity is NEVER equivalent to an institutional role. Preserve password hashes, existing session hashes/cookies, account IDs, CSRF, session invalidation after roster changes, rate limits, expiration and logout behavior. Review newly ported session code for proxy/IP spoofing, timing and edge cases.

Move all workspace operations: directory CRUD, rooms and seat editor, exam/sitting creation, enrollment, leave review, deterministic allocation, stale draft detection, publish/withdraw, revision conflict handling and audit. Keep PostgreSQL authoritative with concurrency-safe row locks and deterministic result identity. Convert imports (DOCX/PDF/CSV/XLSX, historical versus current rosters, duplicate correction, partial confirmation) and PDF/CSV exports. Keep large file parsing server-only in Node, bounded, secure, properly paginated and logged. Convert Ask Niyam Gemini status/config/ask/extract with persisted multi-turn messages, strictly role-aware read-only context, bounded retries, real provider errors, encrypted key custody and no invented successful writes.

**No permanently parallel Express, no Vite production frontend, no proxy to the legacy service at acceptance.** Legacy code can remain archived for comparison and rollback only.

### B. Finish premium frontend as an original Niyam product

Keep the existing navy-blue / warm-yellow academic identity. Replace the temporary 128k-line `legacy/NiyamApp.jsx` bridge with maintainable typed Next App Router screens, composed client islands, reusable hooks, forms, data tables and safe server-owned reads. Admin/faculty/student roles are distinct products within the same interface; all routes and commands must work. Apply exceptional typography, spacing, layout, dense but legible analytics, meaningful dashboards, polished tables, calendars, seating editor, dialogs, imports, reports, AI chat and public installer CTA. Elegant light and dark modes, mobile through wide desktop, keyboard focus, reduced motion, semantic form labeling, loading/empty/error/retry/optimistic states. Use Motion/Anime.js only where it enhances comprehension, not decoration. Test desktop and phone with screenshots and screenshots against source requirements. Avoid generic SaaS filler, dead controls, placeholder buttons and fake analytics.

### C. Data, security, observability and operations

Use a Neon dev/staging branch or disposable PostgreSQL clone; **NEVER** point new preview E2E writes at production. Snapshot before rehearsals, preserve the actual encryption key separately, compare operational, account and audit counts/hashes as appropriate, and demonstrate rollback from an isolated restore. Do not reset a production database. Use migration files and idempotency tests for any schema changes. Add health/readiness, structured logging and error boundaries without leaking secrets. Manage fixed lockfiles and `npm ci`/CI cache. Honor free-tier budgets; no chargeable plan upgrades without explicit authorization. Add integration tests for simultaneous writes, stale revisions, publication immutability, 208-row historical import, persisted AI context, wrong-role denials, Google email roster mismatch and desktop one-time OAuth exchange.

### D. Real release qualification

Bring CI to green for exact feature-branch SHA: lint, typecheck, unit, isolated PostgreSQL integration, Playwright desktop/mobile, test artifacts, production build, Electron Windows packaging and installation/login smoke. Verify browser-based Google handoff using a real authorized test identity and configured preview callback; distinguish mock OAuth from live provider evidence. Run staged Render + Neon preview; prove actual web role journeys, published data parity, imports/exports, AI provider and installer download. Keep the current production service and tagged installer as rollback. Only then plan a reversible production switch to the single Next runtime, verify the deployed Git SHA, account/data counts, and a live role-scoped session, and publish a working checksummed Windows installer. If an external secret, payment, provider setup, or irreversible cutover is inaccessible, report the exact dependency—do not fabricate completion.

## Enforced finish line

Do not stop after writing plans or a visual redesign. A strong final report needs:
- Exact final architecture and all API endpoints accounted for.
- A route/feature parity matrix with tests/evidence and zero unexplained failing critical paths.
- Real Render staged and production links, exact commits, run IDs, database integrity checks, real Windows asset URLs/checksums, tested download and installer behavior.
- Screenshot/Playwright proof for all roles and mobile/desktop, plus authentication/CSRF/concurrency/failure oracles.
- Known limitations, if any, described explicitly; production-safe rollback procedure.
- Updated repo README, engineering KB and release notes after verifying changes.

**Truth above rhetoric.** If a gate has not passed, keep production on legacy and label the work unshipped. If a command cannot run because of local access or infrastructure, finish every other independent part and leave one precise, reproducible blocker and next command. Never announce 'complete' on a successful build alone.

## Source-verified route parity checkpoint

At the November 23 preview checkpoint, `docs/API_PARITY.md` tracks 38 distinct registered method/path pairs: **13 native Next handlers and 25 remaining temporary Express handlers**. Check the live branch before relying on counts. A pinned `next-app/package-lock.json` is committed; use `npm ci --prefix next-app`. CI runs Next build, TypeScript, isolated PostgreSQL API smoke and Chromium browser interaction tests. Those green tests prove tested slices only, not entire product parity.

The local one-command finisher is `scripts/codex-finish.sh` after switching to this migration branch. Its branch/dirty-tree checks are intentional; do not bypass them to save effort.

## Immediate work, no re-planning loop

1. Run `git status --short`, compare branch to base, read current CI logs and identify real failures.
2. Close any missing dependency lockfile or browser/failing import first; eliminate build warnings that hide missing modules.
3. Complete the native API parity table; then port high-risk auth/data endpoints and run full equivalence tests.
4. Finish typed UI/design, desktop and staging. Finish with exact live evidence.
5. Summarize in `docs/FINAL_HANDOFF.md` with commands and proof. Commit focused changes on this branch and create/update the review PR; preserve `main` until gates pass.

Final objective: **the current app must stay operational throughout; the replacement must be objectively better, not merely newer.**
