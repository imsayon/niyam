# Niyam API parity inventory — source-extracted, 23 November 2026

The following table was extracted from Express route registrations in `server/index.js`, `server/accounts.js`, `server/institution.js`, `server/workspace.js`, `server/outputs.js`, and `server/documents.js`, plus the indirect Google callback constant. It maps **route implementations, not test coverage or deployment status**.

**Current audit:** 38 registered API method/path pairs, 13 native Next preview handlers, 25 still served by the **temporary local-only Express sandbox**. Main production remains entirely Vite/Express. Not all indirect/dynamic route registrations can be proven by a simple textual inventory; recheck the source and client requests during final API parity testing.

| Method | API route | Current preview implementation | Existing source |
|---|---|---|---|
| `GET` | `/api/health` | Native (preview) | `server/index.js` |
| `GET` | `/api/releases` | Native (preview) | `server/index.js` |
| `GET` | `/api/session` | Native (preview) | `server/accounts.js` |
| `POST` | `/api/session` | Native (preview) | `server/accounts.js` |
| `POST` | `/api/session/desktop/start` | Legacy (sandbox bridge) | `server/accounts.js` |
| `POST` | `/api/session/desktop/approve` | Legacy (sandbox bridge) | `server/accounts.js` |
| `POST` | `/api/session/desktop/exchange` | Legacy (sandbox bridge) | `server/accounts.js` |
| `POST` | `/api/session/google` | Legacy (sandbox bridge) | `server/accounts.js` |
| `DELETE` | `/api/session` | Native (preview) | `server/accounts.js` |
| `POST` | `/api/register` | Legacy (sandbox bridge) | `server/accounts.js` |
| `POST` | `/api/recovery` | Legacy (sandbox bridge) | `server/accounts.js` |
| `POST` | `/api/account-token` | Legacy (sandbox bridge) | `server/accounts.js` |
| `PATCH` | `/api/profile` | Legacy (sandbox bridge) | `server/accounts.js` |
| `GET` | `/api/accounts` | Native (preview) | `server/accounts.js` |
| `GET` | `/api/session/google/callback` | Legacy (sandbox bridge) | `server/accounts.js` |
| `GET` | `/api/institution` | Native (preview) | `server/institution.js` |
| `PUT` | `/api/institution` | Native (preview) | `server/institution.js` |
| `GET` | `/api/workspace` | Native (preview) | `server/workspace.js` |
| `GET` | `/api/audit` | Native (preview) | `server/workspace.js` |
| `POST` | `/api/records/:kind` | Legacy (sandbox bridge) | `server/workspace.js` |
| `PATCH` | `/api/records/:kind/:id` | Legacy (sandbox bridge) | `server/workspace.js` |
| `DELETE` | `/api/records/:kind/:id` | Legacy (sandbox bridge) | `server/workspace.js` |
| `POST` | `/api/accounts/:id/decision` | Legacy (sandbox bridge) | `server/workspace.js` |
| `POST` | `/api/events/:id/transition` | Legacy (sandbox bridge) | `server/workspace.js` |
| `POST` | `/api/events/:id/solve` | Legacy (sandbox bridge) | `server/workspace.js` |
| `POST` | `/api/events/:id/publish` | Legacy (sandbox bridge) | `server/workspace.js` |
| `POST` | `/api/import/preview` | Legacy (sandbox bridge) | `server/workspace.js` |
| `POST` | `/api/import/commit` | Legacy (sandbox bridge) | `server/workspace.js` |
| `GET` | `/api/ai/status` | Native (preview) | `server/outputs.js` |
| `POST` | `/api/ai/config` | Legacy (sandbox bridge) | `server/outputs.js` |
| `GET` | `/api/ai/history` | Native (preview) | `server/outputs.js` |
| `DELETE` | `/api/ai/history` | Native (preview) | `server/outputs.js` |
| `POST` | `/api/ai/ask` | Legacy (sandbox bridge) | `server/outputs.js` |
| `POST` | `/api/ai/extract` | Legacy (sandbox bridge) | `server/outputs.js` |
| `GET` | `/api/export/:event/:kind.:format` | Legacy (sandbox bridge) | `server/outputs.js` |
| `POST` | `/api/import/docx` | Legacy (sandbox bridge) | `server/documents.js` |
| `POST` | `/api/import/archive-check` | Legacy (sandbox bridge) | `server/documents.js` |
| `POST` | `/api/import/classify` | Legacy (sandbox bridge) | `server/documents.js` |

## Migration contract

- Preserve URL/method, payload schema, response status/data, cookies, role authorization, revision conflict semantics, database transactions, AI read-only boundaries and desktop redirects.
- The native AI status GET, accounts GET, session GET/POST/DELETE, institution GET/PUT, workspace GET, audit GET, AI history GET/DELETE, health GET and installer metadata GET are **preview implementations**. They are not proof of hosted Google-provider acceptance or complete feature parity.
- The Next compatibility rewrite in `next-app/next.config.ts` must be **deleted before the final release**; adding another proxy or permanently embedding Express does not satisfy the goal.
- Prioritize Google callback and desktop pairing, then operational write transactions / allocation / import / export, then Gemini endpoints, settings and account management. Use source-driven contract tests and Playwright before changing Render.
- Do not modify the production `niyam` Neon branch while developing or testing.
