# Niyam agents

Read `docs/AGENT_AUTHORITY.md` and `docs/AGENT_NEXT_STEPS.md` before implementing agent actions, student imports, auth or deployment.

Use the active Next.js feature branch. Production `main` is stable and must remain independent until verified staging cutover. No live Neon writes, production Render deploy, Windows release, or provider changes without task-specific authorization. Do not silently overwrite local work; inspect status before changes. Reuse existing server-side domain validation, revision checks, audit, API contracts and source-grounded tests. The model proposes bounded actions; only server-approved reviewed operations may mutate records. Do not confer arbitrary shell, SQL, credentials or administrative permissions to chat prompts. Keep tests green and evidence reproducible.
