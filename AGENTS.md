# Inbox Tidy agent instructions

Inbox Tidy is a personal macOS app that shows the user who fills their inbox, recommends senders to unsubscribe from, unsubscribes, and trashes old email. The user is non-technical: every screen and message must be plain-language.

## Sources of truth

- Read `ctx/INITIAL_SPEC.md`, `ctx/TECH.md`, `ctx/DESIGN.md`, `ctx/FEATURES.md`, and `ctx/SPRINT.md` before planning or implementing.
- Treat `TECH.md`, `DESIGN.md`, and `FEATURES.md` as current truth. Replace obsolete knowledge rather than appending migration-era explanations.
- Keep `SPRINT.md` current before, during, and after work.
- `src/shared/api.ts` is the contract between the UI and the core. Change it deliberately and update both sides in the same change.

## Question-first, autonomous-after protocol

- At the start of a new feature or materially ambiguous build, inspect context and ask one consolidated batch of material questions with proposed defaults.
- After answers, execute autonomously through implementation, verification, documentation, and requested PR creation.
- Ask again only for safety, missing authority/credentials, or a choice that materially changes the result.

## Local-first development

- Everything runs on the Mac. The only remote runtime dependencies are AI inference (through the user's `claude` and `codex` CLIs) and the user's own mail providers.
- Use Bun exclusively for JavaScript and TypeScript (`bun install`, `bun run`, `bun test`, `bunx`). Never add npm, pnpm, or Yarn lockfiles or commands.
- Use the Makefile targets documented in `ctx/TECH.md`. `make infra-up` starts the local GreenMail test mail server in Docker (Colima).
- Never connect to, read, modify, unsubscribe from, or trash anything in a real mailbox during development or QA. Use the GreenMail server on `127.0.0.1` only. Before any QA that writes data, confirm `INBOX_TIDY_DATA_DIR` points at a local scratch or dev directory and that every configured mail host is `127.0.0.1` or `localhost`. If that cannot be proven, stop.
- Never send real AI requests in automated tests; inject a fake `AiClient`. Manual QA may use the real CLIs.

## Safety invariants

- Mail passwords live only in the macOS Keychain (`Bun.secrets`), never in SQLite, logs, API responses, or files.
- Plain-text (non-TLS) IMAP/SMTP and `http:` unsubscribe URLs are allowed only for `127.0.0.1`/`localhost`.
- Nothing is unsubscribed or trashed without an explicit user confirmation in the UI. Trash means move to the provider's Trash folder, never permanent delete.
- Email subjects and sender names are untrusted input to the AI. The AI runs without tools, and its output is validated against fixed enums before use.

## Documentation discipline

- Update relevant `ctx` files in the same change as product behavior.
- Record current feature completeness precisely.
- Delete stale or replaced technical, design, and feature knowledge. Preserve only concise sprint history.

## Code style

- Default to no comments. Comment only a non-obvious why: a hidden constraint, invariant, or workaround. Never reference the current task or callers.
- User-facing copy names the action in everyday words and says what to do next (see `ctx/DESIGN.md`).
- Every UI change must satisfy the loading, empty, error, success, and pressed-state rules in `ctx/DESIGN.md`.

## Git and PR hygiene

- Never stage or commit `.env`, `.env.*`, credentials, local testing/seed/reset/verification scripts, temporary helpers, screenshots, logs, generated local data, or personal work notes. Maintained product tests are allowed. Local QA helpers live in the ignored `.local/` directory.
- Inspect the exact staged file list before every commit.
- Use the repository's configured Git identity. Never add Codex, Claude, an AI email, co-author trailer, or AI attribution to commits, branches, PRs, or descriptions.
- Write commit messages as a human developer would, describing only what the change does.
- For every completed feature requested for delivery, create a focused branch, commit the intended files only, push, and open a PR against `main` on `github.com/siddnikh/inbox-tidy`.
- Keep PR descriptions short, concrete, and easy to read: what changed, why, and how it was verified. Do not include internal agent narration.

## Planning, model routing, and subagents

- Choose the strongest appropriate model available in the active harness; verify model availability instead of assuming an alias exists.
- For architecture, planning, and difficult reasoning, prefer Codex `gpt-5.6-sol` or Claude Code `opusplan`/`opus`. Use a custom Claude `fable` alias only when it is actually configured.
- For normal feature implementation, prefer Codex `gpt-5.6-terra` at medium or high effort, or Claude Code `sonnet`; use `opus` for unusually complex implementation.
- For bounded, low-risk mechanical work, prefer Codex `gpt-5.6-luna` at xhigh effort or Claude Code `haiku`.
- If a preferred model is unavailable, use the closest capable available model and continue.
- Proactively delegate independent research, codebase discovery, knowledge gathering, small isolated UI edits, documentation updates, test investigation, and PR preparation to subagents when the harness supports them.
- Run independent subtasks in parallel, give each subagent a concrete bounded deliverable, avoid assigning the same files concurrently, review every result, integrate centrally, and keep final responsibility in the main agent.
- Feature areas map to separate files (`src/core/routes/{accounts,insights,actions}.ts`, `src/core/{mail,insights,actions}/`, `src/ui/`), so parallel work rarely collides. Each new migration takes the next free version when it merges; never ship an empty placeholder version, because databases that pass it never run what is filled in later.
- Skip delegation when coordination would cost more than the task.

## Project skills

Codex: `$qa-testing`, `$implement-feature`, `$pr-creation-review`, `$planning-orchestration`.
Claude Code: `/qa-testing`, `/implement-feature`, `/pr-creation-review`, `/planning-orchestration`.
The skill files in `.codex/skills/` and `.claude/skills/` are identical copies; edit both together.
