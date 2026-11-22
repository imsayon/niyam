#!/usr/bin/env bash
# Safe local Codex entrypoint for the Niyam Next migration. Never deploys on its own.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
BRANCH="feat/niyam-next-app-router-parallel-20261123"
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "Refusing: switch to $BRANCH first. Production main must stay untouched." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing: uncommitted work exists. Commit/stash it first; nothing was overwritten." >&2
  git status --short >&2
  exit 2
fi
if [[ ! -f docs/CODEX_FINISHER.md || ! -f docs/API_PARITY.md || ! -f AGENTS.md ]]; then
  echo "Migration guidance missing; verify the branch checkout." >&2
  exit 2
fi
if ! command -v codex >/dev/null; then
  echo "Codex CLI is not installed or not on PATH. Install/connect it before running." >&2
  exit 127
fi
echo "Niyam migration branch: $BRANCH"
echo "Current commit: $(git rev-parse --short HEAD)"
echo "Production main remains unchanged; run only against isolated resources."
exec codex exec --sandbox workspace-write -c 'model_reasoning_effort="high"' \
  'Read AGENTS.md, docs/CODEX_FINISHER.md, docs/API_PARITY.md, docs/NEXTJS_MIGRATION.md and next-app/README.md. Act as principal engineer and orchestrator. Implement the remaining Next.js migration end to end, starting with source-backed API contract parity, hard auth/transaction boundaries, all genuine workflows, and premium UI. Use meaningful subagents and installed skills only if available. Execute tests after every coherent slice; fix observed errors rather than narrating work. Keep production main, live Render, and live Neon data unchanged until all acceptance gates are evidenced and an authorized cutover is possible. Commit verified work on this branch and produce docs/FINAL_HANDOFF.md with exact tests, limitations, release readiness, and any genuinely blocked external action. Do not fabricate complete status.'
