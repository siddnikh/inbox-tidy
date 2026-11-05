---
name: implement-feature
description: Plan, build, verify, document, and deliver a new product feature. Use whenever the user asks to add, build, create, or implement new behavior or materially extend an existing feature.
---

# Implement a feature

1. Read every file in `ctx/`, the root `AGENTS.md`, `src/shared/api.ts`, the relevant source, the current branch, `git status`, and the remote state.
2. Ask one consolidated set of unresolved product and technical questions before editing, each with a proposed default. After the user answers, proceed autonomously.
3. Update `ctx/SPRINT.md` with the objective and active plan before implementation and at meaningful checkpoints.
4. Follow `ctx/TECH.md`, `ctx/DESIGN.md`, and `ctx/FEATURES.md`. Change them deliberately when the feature changes project truth.
5. Replace obsolete documentation instead of keeping legacy behavior around. Preserve history only in the sprint work log.
6. Implement the full user journey: core logic, API route, UI with loading, empty, error, success, and pressed states, plain-language copy, keyboard and screen-reader access, and maintained tests (`tests/unit` with fakes, `tests/integration` against GreenMail). Never call real AI or real mailboxes from tests.
7. Use `/qa-testing` in Claude Code or `$qa-testing` in Codex before delivery.
8. Never stage or commit environment files, QA-only scripts or data, temporary helpers, or personal artifacts. Inspect the staged file list before committing, and never add AI identity or attribution.
9. Create a focused branch and PR against `main` for each completed feature when repository access permits. Keep the description short and plain, and report the real checks run.
