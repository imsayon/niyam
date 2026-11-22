# Niyam Next — Code/agent continuation

This is the **active Next.js development branch**, not production. The existing Vite/Express live service remains on `main` and Render auto-deploys `main`. Never merge or deploy the feature branch to production without staging and the explicit cutover gate.

## November 23 implementation checkpoint

- [PR #6](https://github.com/imsayon/niyam/pull/6) was squash-merged **into this feature branch only**, not production.
- [Root verification CI](https://github.com/imsayon/niyam/actions/runs/45072642105) and [Next.js/PostgreSQL/Chromium CI](https://github.com/imsayon/niyam/actions/runs/45072642094) succeeded on verified PR head `4a293de26738f91ccb9e8e9b7105f6245f40982c`.
- Ask Niyam now retrieves authorized student records, source-backed references and separately attached document excerpts; proposes audited, confirmed admin student CRUD and dependency-aware DEMO cleanup.
- Lab-batch DOCX classification recognizes student identities and explicit current-roster conversion. Exact repeated USN/name rows consolidate; conflicting identity rows remain reviewable. Never infer current exam enrollment from a historical batch.
- New `niyam_ai_documents` table is **not live** until additive migration `migrations/20261123_ai_documents.sql` is applied to a reviewed staging database. No raw uploaded bytes are retained.
- `docs/AGENT_AUTHORITY.md` documents the permission, preview, evidence and data contracts.

## Priority follow-on (perform, do not only plan)

1. **Inspect and verify the exact latest branch SHA.** Run root and Next CI locally against an *isolated* Postgres fixture. Keep `main`, the live Neon branch and the Windows public release untouched. Verify new PR #6 commit is included in branch.
2. **Strengthen end-to-end real-world scenarios**: test actual college lab-batch documents (only with owner-supplied authorized samples), conflicting IDs, current roster conversion, preserving verified emails, and student accounts. The synthetic 208-row test is not proof that every real DOCX layout works.
3. **Exercise Ask Niyam on staging with real provider** where authorized: "Add [name], USN [id], in [department], semester [number], email [address]" must produce a reviewable create action, then save only on Apply; "remove example students" must show a detailed impact summary and require `REMOVE DEMO`. Non-admin denials, expired/stale/tampered tokens, and audit must pass.
4. **Rehearse additive document migration on isolated Neon clone** and test reload persistence, admin tenant separation, uploaded PDF/DOCX/CSV, provenance and prompt-injection attempts. Do not send real private records to a third-party model without authorized data-use conditions.
5. **Improve administrator tools carefully**, if needed: extend the typed operation registry to faculty/rooms/sittings/enrollment and import actions, each with Zod validation, role gate, impact preview, explicit approval, audit, rollback tests and safe failure behavior. Do not replace reviewed tools with general SQL/shell/permission-changing powers.
6. **Resolve remaining release gates**: verify all Next routes, Google/desktop OAuth, Gemini follow-ups, PDF reports, signed Windows installer and a rollback rehearsal on staged Render/Neon. Switch production only with task-specific cutover approval and evidence.
7. Record the exact CI run, code SHA, schema migration applied and final known blockers. Never claim "live" based only on a feature-branch build.

## Useful commands

```bash
git fetch origin
git switch feat/niyam-next-app-router-parallel-20261123
git pull --ff-only
npm ci
npm ci --prefix next-app
npm test
npm run build
npm run typecheck --prefix next-app
# CI's Next+PostgreSQL+Chromium smoke requires NIYAM_SANDBOX=1
# and a dedicated isolated DATABASE_URL, never the live Neon URL.
```

The app should **fail safe**: if action intent is uncertain, ask for missing information. If an import duplicates existing records, reconcile exact identifiers, preserve verified email on blank incoming cells, show conflicts and never silently create a second identity. If an agent lacks source evidence, state the limitation instead of inventing changes.

## Definition of done

An administrator can use Ask Niyam as a real reviewed operations console; all permitted requests show read-back confirmation, audit and persistent changes. Historical datasets cannot silently become current exams. All accepted data has provenance. Staging deployment, role-specific browser journeys, backups, installer acceptance and rollback evidence must precede the production switch.
