# Sprint

## Current objective

Deliver a working, installable Inbox Tidy overnight (2026-11-06). That means connecting accounts, scanning, sender insights with AI, unsubscribing, trashing, the home impact screen, and settings, all verified against the local GreenMail server and installed to /Applications.

## Working now

- Parallel feature build in separate worktrees: mail accounts and scanning (features 2–3), insights and AI (feature 4 plus the summary data for 7), actions (features 5–6), and the UI (features 2–8 screens).

## Completed

- Foundation: native Objective-C shell, Bun core compiled into the bundle, session-guarded local API, SQLite schema and migrations, Keychain wrapper, AI CLI bridge with Claude-then-Codex fallback, design tokens, build and install scripts, GreenMail test server, project docs, and skills.

## Next

- Integrate the feature branches, run full QA against GreenMail, build and install the app, and update the docs to match what was built.

## Decisions

- 2026-11-06: The app connects to each provider directly over IMAP with app passwords. Apple Mail's local store isn't used, because the owner's accounts aren't in Apple Mail.
- 2026-11-06: A native Objective-C shell with a Bun core, instead of Electrobun. Electrobun 2.x installs a separate global toolchain, and this Mac's Swift toolchain has an SDK mismatch.
- 2026-11-06: The AI goes through the user's `claude` and `codex` CLIs (subscriptions) and receives no email bodies.
- 2026-11-06: Free Rediffmail is out of scope, since it appears to offer POP3 only. Rediffmail Pro is supported.
- 2026-11-06: The product name is "Inbox Tidy", which is to be confirmed (the owner dictated "inbox ID").
- 2026-11-06: The repository is private at github.com/siddnikh/inbox-tidy, with one PR per feature merged into `main` after checks pass.

## Blockers

- Real accounts need app passwords that only the owner can create. Everything is verified against GreenMail until then.

## Work log

- 2026-11-06: Kickoff questions answered. Foundation built and verified: 11 unit tests, lint, and typecheck pass; the app builds (61 MB), opens, and reports both AI CLIs; real Claude and Codex round trips work through the subscriptions.
