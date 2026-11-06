# Sprint

## Current objective

The overnight build of Inbox Tidy (2026-11-06) is complete: connecting accounts, scanning, sender insights with AI, unsubscribing, trashing, the home impact screen, and settings. The app is installed at `/Applications/Inbox Tidy.app`. The next objective is connecting the owner's real accounts.

## Working now

- Nothing in progress.

## Completed

- Foundation: native Objective-C shell, Bun core compiled into the bundle, session-guarded local API, SQLite schema and migrations, Keychain secrets, AI CLI bridge with Claude-then-Codex fallback, design tokens, build and install scripts, GreenMail test server, project docs, skills, and an app icon.
- Feature 2 (connect accounts) and feature 3 (incremental scanning).
- Feature 4 (sender insights, AI sorting with fallback, keep).
- Features 5 and 6 (unsubscribe through one-click, mailto, or web; move to Trash).
- Features 7 and 8 (home impact screen, settings) and all screens (PR #2).
- Integration fixes: password checks on the test mail server, a title-bar drag strip in the window, and the helper renamed to "Inbox Tidy Helper" so macOS prompts show a readable name.
- UI restyle: a single dark theme in the owner's purple, yellow, and lavender palette, with an icon or illustration on every instruction, hint, empty state, error, and confirmation.

## Next

- The owner connects their real accounts with app passwords: Gmail, iCloud, Yahoo, and Rediffmail Pro if they use it.
- Watch the first real scan for provider-specific surprises, such as large Gmail inboxes and Yahoo folder names.
- Confirm the product name ("Inbox Tidy" or "Inbox ID").
- Consider a stable local signing identity, so rebuilds don't trigger a Keychain prompt.

## Decisions

- 2026-11-06: The app connects to each provider directly over IMAP with app passwords. Apple Mail's local store isn't used, because the owner's accounts aren't in Apple Mail.
- 2026-11-06: A native Objective-C shell with a Bun core, instead of Electrobun. Electrobun 2.x installs a separate global toolchain, and this Mac's Swift toolchain has an SDK mismatch.
- 2026-11-06: The AI goes through the user's `claude` and `codex` CLIs (subscriptions) and receives no email bodies, only sender names, addresses, counts, and up to five subjects.
- 2026-11-06: Free Rediffmail is out of scope, since it appears to offer POP3 only. Rediffmail Pro is supported.
- 2026-11-06: The product name is "Inbox Tidy", which is to be confirmed (the owner dictated "inbox ID").
- 2026-11-06: The repository is private at github.com/siddnikh/inbox-tidy. The insights and scanning branches were merged locally while GitHub's git push was failing, so they have no PRs. Actions (#1) and UI (#2) went through PRs.
- 2026-11-06: The UI sends unsubscribe and trash requests one sender at a time, to show real per-sender progress.
- 2026-11-06: The owner fixed the palette (purple #5B34D6, yellow #FFCB47, lavender #B9A9E8, white text). Because text is white, the app is dark only. Primary buttons use deep-purple text on yellow, since white on yellow fails contrast.

## Blockers

- Real accounts need app passwords that only the owner can create.

## Work log

- 2026-11-06: Kickoff questions answered. Foundation built and verified: 11 unit tests, lint, and typecheck pass; the app builds, opens, and reports both AI CLIs; real Claude and Codex round trips work through the subscriptions.
- 2026-11-06: The owner asked for the full working app overnight. Four agents built accounts and scanning, insights and AI, actions, and the UI in parallel worktrees against `src/shared/api.ts`.
- 2026-11-06: GitHub rejected all `git push` ref updates with "fatal error in commit_refs" for about 30 minutes while the REST API worked. Agents used API uploads; pushes recovered later.
- 2026-11-06: End-to-end QA on GreenMail with 2,232 seeded emails from 15 senders, using the real Claude:
  - The scan and AI sorting took about 17 s. The recommendations were sensible.
  - One-click, mailto, and web unsubscribes all worked, and 779 emails moved to the server's Trash.
  - The home screen showed "3 senders, 58 fewer a month, 779 trashed". A rescan took about 1 s and kept the numbers stable.
  - The packaged app, launched the way Finder launches it, found both AI CLIs, scanned, and sorted 13 senders in about 12 s, with no Keychain prompt when it created its own item.
- 2026-11-06: Final checks: 106 unit tests and 15 integration tests pass, lint and typecheck are clean. The app (64 MB) is installed in /Applications and opens to the welcome screen.
- 2026-11-06: The purple and yellow restyle was checked screen by screen in headless Chromium against GreenMail QA data: Home (empty and with impact), Senders, the add-account steps for each provider, unsubscribe and trash confirmations and results, Accounts, and Settings. Every text and background pair was measured for WCAG contrast. `make check` passes (108 unit tests).
- 2026-11-06: New logo in the owner's purple and yellow palette: an inbox tray with a rising spark replaces the blue envelope icon. The icns is rebuilt (16–1024), and the logo suite is in `assets/brand/`.
- 2026-11-06: The owner's first real Gmail account couldn't be scanned or removed. The real database had been created by the foundation build while migrations 2 to 4 were empty placeholders, so it was marked version 4 and never got the columns that 2 and 3 added later. Migration 5 repairs such databases; it was checked on a copy of the real database (upgrade and account removal both work).
