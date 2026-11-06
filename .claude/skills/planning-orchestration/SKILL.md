---
name: planning-orchestration
description: Plan and orchestrate non-trivial repository work with appropriate models and subagents. Use for architecture, multi-step features, cross-service changes, research, parallelizable work, or tasks that need delegation and integration.
---

# Planning and orchestration

1. Read all `ctx` files and inspect the concrete repository state before planning.
2. Ask one consolidated question batch for unresolved choices, then work autonomously after answers.
3. Break work into bounded deliverables with dependencies, owners, verification, and documentation updates. Use the existing seams: `src/shared/api.ts` for contracts, and one route file and one core folder per feature area. New migrations take the next free version at merge time, never a placeholder.
4. Apply the model-routing and subagent rules from the root `AGENTS.md`. Prefer `gpt-5.6-sol` or Claude `opusplan`/`opus` for planning; `gpt-5.6-terra` at medium or high effort, or Claude `sonnet`/`opus`, for implementation; and `gpt-5.6-luna` at xhigh effort, or Claude `haiku`, for mechanical tasks. Treat `fable` as a custom Claude alias that must be verified before use.
5. Delegate independent research, discovery, small isolated changes, docs, QA investigation, and PR preparation when supported. Parallelize only non-overlapping work, isolate parallel writers in separate worktrees, and require evidence-backed handoffs (files changed, checks run with output).
6. Keep one main agent responsible for decisions, integration, conflict resolution, end-to-end verification, `ctx/SPRINT.md`, and final delivery.
7. Update the plan and `ctx/SPRINT.md` as facts change. Do not let delegated work silently expand scope.
