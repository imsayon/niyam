# Niyam agent operating rules
- Work in `feat/niyam-next-app-router-parallel-20261123` unless an explicitly reviewed branch is agreed. Never modify `main` by accident; Render auto-deploys `main`.
- Read `docs/CODEX_FINISHER.md`, `docs/NEXTJS_MIGRATION.md`, and the current repository README before architectural changes.
- Distinguish deployed baseline, migration preview, and verified release. Do not claim production parity without role-specific and desktop end-to-end evidence.
- Use disposable PostgreSQL/Neon branches for tests, maintain rollback and encryption-key custody; never reset production records.
- Protect credentials and institutional records; do not commit secrets, real rosters, backups or local evidence.
- Keep changes small, tests green and domain logic independent of HTTP framework; prefer precise fixes over broad rewrites.
- Do not create chargeable resources or alter production services without task-specific authorization; cutover requires explicit verification gates.
