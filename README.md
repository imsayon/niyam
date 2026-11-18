# Niyam

Niyam manages examination events, candidate enrollment, rooms, invigilation duties, and published student seating. The website and Electron desktop clients use one Express API and persistent PostgreSQL database.

The evaluation release uses synthetic records. The seeded exam has 120 candidates in semesters 3, 5, and 7, twelve faculty, and three rooms. All records are stored in the database and editable through authenticated operations.

## Open the application

- Website — https://niyam-exams.onrender.com
- Source — private repository https://github.com/imsayon/niyam
- Desktop releases — https://github.com/imsayon/niyam-downloads/releases
- Local demo credentials — ignored `local/demo-accounts.json`, readable by the local user only. Account emails are `admin@niyam.example`, `faculty@niyam.example`, and `student@niyam.example`.

The Windows installer is unsigned. The desktop client requires an internet connection and displays the same hosted workspace as the browser. Render's free service sleeps after inactivity. Its first request may take about a minute to wake. The PostgreSQL database runs on a separate Neon free project and persists through app restarts.

## Run locally

Use Node 24 and Docker. Run `docker compose up -d --wait`, copy `.env.example` to `.env`, run `npm ci`, then `npm run seed`, `npm run build`, and `npm start`. Open http://127.0.0.1:4317.

The seed command generates random demo passwords and a server encryption key under ignored local configuration. It seeds an empty workspace and provisions missing demo accounts without replacing existing operational data or account passwords.

For frontend development, run `npm run dev` in a second terminal. Set `DEV_ORIGIN=http://localhost:5173` in the API environment to allow development requests. The dev server proxies the API to port 4317.

## Implemented workflows

- Session authentication with scrypt password hashes, hashed opaque session tokens, HTTP-only cookies, origin checks, login throttling, and server role enforcement.
- Verified-email registration, administrator approval with a unique roster link, account disabling, password recovery, profile editing, and password changes. Set `SMTP_URL`, `MAIL_FROM`, and `PUBLIC_ORIGIN` to activate delivery. Outgoing recovery and verification links expire after 30 minutes. The evaluation accounts are pre-provisioned.
- Faculty and student CRUD, room creation and bench layout editing, paper and sitting setup, individual and bulk enrollment, availability and leave approval.
- Explicit lifecycle through draft, configured, published, completed, and archived. Published assignments remain immutable until a new reviewed revision is published.
- Deterministic seating by physical bench position, configurable semester/paper/department selectors, accessible and blocked seats, optional same-paper adjacency restrictions, room and student conflict checks.
- Duty allocation with faculty availability, approved leave and buffers, overlap checks, per-event duty caps, workload ranking, and room repetition preferences. Search uses bounded backtracking and reports infeasible or exhausted searches explicitly. It does not certify globally optimal fairness.
- CSV/XLS/XLSX parsing, text PDF extraction, Gemini entity extraction, editable review, validation, duplicate detection, and atomic imports of up to 250 rows. PDF extraction is limited to 30 pages and 25,000 characters. Scanned PDFs require OCR before import.
- Actual CSV/PDF timetable, seat, and duty downloads. Role restrictions apply to exports.
- Server-side Gemini chat over authorized records, encrypted BYOK configuration and connection testing, and explicit provider error states. Add your key in Settings. The default is [Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash). AI chat has read-only access. It does not commit operational changes.
- Light and Dark appearance, responsive role portals, a keyboard-accessible room editor, and a tabular seating view.

## Architecture

```mermaid
flowchart LR
    Browser[Web browser] --> API[Express API]
    Desktop[Sandboxed Electron client] --> API
    API --> DB[(PostgreSQL)]
    API --> Gemini[Gemini API]
    API --> SMTP[Configured SMTP provider]
```

`server/accounts.js` owns identity, sessions, and role checks. `server/workspace.js` owns validated operational commands. `server/solver.js` owns pure allocation logic. `server/outputs.js` owns reports and authorized AI context. React views reside in `web/main.jsx`, with shared form and display components.

Operational documents live in a single JSONB workspace row for this single-institution evaluation release. Every mutation locks the row and checks the expected revision. Accounts, sessions, recovery tokens, encrypted settings, and audit records use separate relational tables. This favors a small, transactional implementation at evaluation scale. A production expansion should normalize operational entities after measuring actual workload. This release supports at most 600 candidates per sitting.

Every saved allocation includes its policy, source revision, and exact identities. Publish reruns the deterministic solver and compares the persisted draft before atomically changing the published pointer. Faculty and student views derive from published runs. They never read the full workspace. Editing planning inputs makes existing drafts stale. Published history remains available.

## Configuration and deployment

Deploy `main` with Node 24, `npm ci && npm run build`, and `npm start`. Set `DATABASE_URL` to the new Niyam database, `PUBLIC_ORIGIN` to the HTTPS URL, and `AI_ENCRYPTION_KEY` to 32 random bytes encoded as 64 hexadecimal characters. Keep the encryption key in a separate secure backup.

To provision evaluation accounts at first deploy, set `DEMO_ADMIN_PASSWORD`, `DEMO_FACULTY_PASSWORD`, and `DEMO_STUDENT_PASSWORD` to independent random passwords of at least 14 characters. The server seeds only when these are configured. Render holds these values as private environment settings. Source and built frontend assets contain no demo passwords or provider keys.

Optional settings include `GEMINI_API_KEY`, `GEMINI_MODEL`, `SMTP_URL`, `MAIL_FROM`, `INSTALLER_URL`, and `INSTALLER_SHA256`. A saved encrypted Gemini configuration takes precedence over the environment key. Console inspection is available in the owner's Neon dashboard.

## Verification and releases

`npm test` runs solver regressions. Set `TEST_DATABASE_URL` to run the API integration test in an isolated temporary schema. CI provides a dedicated PostgreSQL service and runs the integration tests, a production frontend build, and Windows/Linux packaging.

The Windows CI job silently installs the built NSIS installer on a fresh Windows runner, launches the installed app with Playwright, signs in as the provisioned student, checks the published room and paper, reloads, and captures evidence. It uses a repository secret for the password. Build artifacts and evidence are retained for 14 days. This checks installation and application operation on the CI runner. It does not establish SmartScreen reputation.

The public downloads repository contains release binaries. The main source repository remains private. The app's public download link points to the release asset and includes its SHA-256 checksum in the release metadata.

## Backups and migration

Run `node --env-file=.env scripts/backup.js` to create a consistent ignored backup with restrictive filesystem permissions. It includes operational records, account hashes, audit records, and encrypted provider settings. Session and recovery tokens are excluded. To restore into an empty database, run `node --env-file=.env scripts/backup.js restore /absolute/path/to/backup.json`. Preserve the original encryption key separately.

No ProctorFlow production data has been migrated. The original repository and deployment remain the owner's cutover source. Obtain a consistent Firebase export, reconcile identifiers and enrollment, and rehearse in an isolated database before using real institutional records. Archive the legacy project only after an approved cutover.

## Current limitations

- Email signup and recovery require SMTP configuration. Live Gemini requests require an owner-supplied key.
- Seat search is bounded. A timeout reports uncertainty and leaves publication intact. Workload ranking produces a feasible roster without proving global fairness optimality.
- Desktop releases require network access. Windows signing and macOS distribution remain pending. Linux is provided as an AppImage.
- Operational storage targets one institution and evaluation-sized datasets. Scheduled backup automation and a real college migration are future work.
- Runtime dependency auditing is part of verification. Build-tool advisories, when present, are recorded in the private verification notes and require upstream fixes or carefully tested toolchain updates.
