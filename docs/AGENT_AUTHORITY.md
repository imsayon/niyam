# Niyam assistant authority & batch-import acceptance

Status: **feature branch only, not deployed** (23 November 2026). PR #6 targets the standalone Next.js migration branch. The stable Vite/Express production service remains unchanged.

## Administrator action protocol

Ask Niyam is now a **reviewed record-action assistant**, not an unrestricted command interpreter.

1. Read only the authorized workspace, saved chat context and administrator-owned attached document excerpts. Ordinary chat answers do not mutate records.
2. For a recognized record command, normalize and validate fields against Niyam's existing `schemas.students` and role checks. Never invent a USN, identity, department, semester or email to fill missing data.
3. Return a **proposed action card** naming the target, changes and dependencies. The model produces only a proposal; it never chooses the database operation directly at execution time.
4. The administrator explicitly approves the card. Deletion and demo cleanup require typed confirmation (`DELETE STUDENT` or `REMOVE DEMO`).
5. The server validates a short-lived HMAC-signed token (10 minutes, bound to account ID and workspace revision), CSRF origin, admin role, target existence and conflict constraints, then uses the existing transactional `change()` with row locking, optimistic revision and audit log.
6. Once committed, the UI refreshes from authoritative PostgreSQL and reports the actual operation. A reused or stale proposal is rejected. Students and faculty cannot execute administrative actions.

Supported initial actions: **add student, update student fields, delete an unlinked student, find repeated IDs, and remove DEMO-coded students with dependency reporting**. Other commands are not claimed as supported and must be implemented as audited capabilities, not by letting the model write arbitrary SQL or execute shell commands.

Demo cleanup is particularly sensitive: it may disable existing demo logins, withdraw demo-only published plans, and remove seats/enrollments. The preview shows counts before typed approval. Mixed allocation runs or completed/archived exams block bulk cleanup; they require a reviewed resolution outside the assistant.

## Document knowledge versus operational imports

`POST /api/ai/documents` allows an administrator to attach DOCX, PDF (searchable), CSV/XLS/XLSX/TXT to chat; it reuses the validated 10 MB parsers. Niyam retains at most **25** extracted-text documents per administrator, each at most **25,000 characters**, not original binary files. Attachments deduplicate by extracted-content SHA256. `GET` lists them; `DELETE` clears that admin's saved document text after explicit UI confirmation. Admin-only role checks, per-account DB filters and audit apply.

Ask Niyam retrieves filename-backed, bounded text excerpts when answering document questions. Search is **lexical and limited**, not a complete semantic/vector retrieval engine. It must say when information is missing or truncated. Untrusted document text cannot authorize actions. Attaching a file to chat does **not** update student records.

The batch importer recognizes USN + name lab tables as student identities, not merely references. Historical academic year still matters: a past lab list is *not evidence of current exam enrollment*. Importing current student profiles requires the administrator to confirm **current department and semester**, then inspect the preview. Identical repeated USNs/names inside the uploaded batch are consolidated. Repeated USNs with conflicting names remain visible for correction, never silently merged. Existing USNs in the current directory are updated through validated import preview rather than duplicated; verified emails are preserved when incoming cells are blank. Only reviewed imports can commit, and paper enrollments are a separate operation.

## Deployment / safe migration

The new `niyam_ai_documents` table is additive and declared in the existing `server/store.js::setup()` for clean dev/test DBs. **The new Next.js runtime does not automatically call setup on production**; a staging schema migration is required before enabling knowledge upload. See `migrations/20261123_ai_documents.sql`. Verify it on an isolated Neon branch and back up data first. Do not apply changes to the production Neon branch as part of this PR.

Never merge PR #6 into production main or switch Render solely because unit/CI tests pass. Require real browser validation, staging data migration, provider acceptance, and a controlled rollback. Release evidence must include the exact commit, role-restricted tests, concurrency/stale-proposal tests and source provenance checks.

## Required regression tests

- Model-produced student proposal never writes before approval; approved write persists, appears in workspace and is audited.
- Wrong role, bad Origin, tampered token, expired token, missing confirmation and stale revision all fail; no rows change.
- Demo clean-up previews affected records/plans, refuses mixed/completed allocations and requires explicit phrase; a successful isolated-fixture rehearsal preserves non-demo records.
- Same DOCX content attaches once; attached document visibility is restricted to its administrator and survives reload. Query result quotes its saved filename and source excerpt.
- Lab batch classification is students + historical metadata; same-USN same-name duplicates consolidate, conflicting names are flagged, current semester is mandatory, no exam enrollment is silently generated.
- Re-run legacy tests, Next build, typecheck, isolated PostgreSQL smoke, and Chromium desktop/mobile tests. Do not count CI on an older commit as proving newer changes.

## Follow-on engineering

Expand from student CRUD to a typed, bounded tool registry for faculty, sittings, rooms, allocations and verified uploads when product requirements justify it, each with its own permission matrix, preview and impact assessment. Replace brittle lexical doc matching with source-grounded chunk retrieval if necessary, after maintaining provenance, tenant isolation and prompt-injection controls. Keep lower-risk operations simple and higher-impact operations harder to approve.
