# Technical overview

## Architecture

Inbox Tidy is one macOS app bundle with two processes:

- **Shell** (`shell/main.m`, Objective-C, about 55 KB). A native Cocoa window hosting a `WKWebView`. It launches the core from `Contents/Resources/inbox-tidy-core --parent-watch`, reads the core's first stdout line `INBOX_TIDY_READY <session-url>`, and loads that URL. Links to anything other than the app's own origin open in the default browser. The core's stderr goes to `~/Library/Logs/Inbox Tidy/core.log`. Quitting the window terminates the core, and the core also exits when the shell's stdin pipe closes.
- **Core** (`src/core`, TypeScript on Bun, compiled with `bun build --compile` into one binary that embeds the Bun runtime and the bundled UI). It runs an HTTP server on `127.0.0.1` with a random port and serves the UI (`src/ui`, Preact, bundled by Bun's HTML imports) and a JSON API under `/api`.

```text
Inbox Tidy.app
├─ Contents/MacOS/Inbox Tidy           native window (shell)
└─ Contents/Resources/inbox-tidy-core  Bun core: API + UI + SQLite + IMAP/SMTP + AI CLI bridge
        │
        ├─ SQLite: ~/Library/Application Support/Inbox Tidy/inbox-tidy.sqlite
        ├─ macOS Keychain (service "Inbox Tidy"): one item per mail account password
        ├─ IMAP/SMTP over TLS → Gmail, iCloud, Yahoo, Rediffmail Pro, other
        └─ `claude -p` / `codex exec` child processes → the user's AI subscriptions
```

### API access guard

Every `/api` request must (1) target exactly `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS-rebinding pages, (2) carry the `inbox_tidy_session` HttpOnly SameSite=Strict cookie, which the shell obtains by loading `/session?t=<token>`, and (3) for writes, have a same-origin `Origin` header if one is present. The token is random per launch unless `INBOX_TIDY_TOKEN` is set (dev only).

### AI bridge (`src/core/ai/cli.ts`)

- Providers are tried in order: `auto` means Claude, then Codex. The choice is stored in settings.
- Claude runs as `claude -p --output-format json --tools "" --no-session-persistence --strict-mcp-config --setting-sources "" --model sonnet [--json-schema <schema>]`, with the prompt on stdin. A structured reply arrives in `structured_output`. Do not use `--bare`, because it refuses subscription (OAuth) login.
- Codex runs as `codex exec --sandbox read-only --skip-git-repo-check --ephemeral --color never -o <file> [--output-schema <file>] -`, with the prompt on stdin.
- Each call runs in a fresh temporary directory, so no project instructions leak in. `ANTHROPIC_API_KEY` and parent Claude Code session variables are stripped, so the subscription is used.
- Finder-launched apps get a minimal `PATH`. `src/core/ai/shell-path.ts` asks the user's interactive login shell (`$SHELL -ilc`) for its `PATH`, which is how nvm-installed `codex` (needing `node`) and `~/.local/bin/claude` are found.
- A JSON schema passed to `ask` must suit both CLIs, so it follows OpenAI strict structured outputs, which Codex enforces. The top level is an object. Every object sets `additionalProperties: false` and lists all of its properties in `required`. Keywords such as `maxLength` and `format` are not used, so length limits are applied in code after validation. The sender-sorting schema is `SORT_SCHEMA` in `src/core/insights/sort.ts`.
- Tests inject a fake `AiClient`; they must never spawn the real CLIs.
- Moving to paid APIs later means adding another `AiClient` implementation. Nothing else changes.

### Mail access

- Mail is read over IMAP with `imapflow` and sent (for `mailto:` unsubscribes) over SMTP with `nodemailer`. Each account uses an app password stored with `Bun.secrets` (macOS Keychain, service `Inbox Tidy`, name = account email).
- Provider presets:

| Provider | IMAP | SMTP | App password |
| --- | --- | --- | --- |
| Gmail | imap.gmail.com:993 TLS | smtp.gmail.com:465 TLS | Requires 2-Step Verification; https://myaccount.google.com/apppasswords |
| iCloud | imap.mail.me.com:993 TLS | smtp.mail.me.com:587 STARTTLS | Requires two-factor; account.apple.com → Sign-In and Security → App-Specific Passwords. IMAP user is the address without the domain; SMTP user is the full address. |
| Yahoo | imap.mail.yahoo.com:993 TLS | smtp.mail.yahoo.com:465 TLS | https://login.yahoo.com/account/security → Generate app password |
| Rediffmail Pro | imap.rediffmailpro.com:993 TLS | smtp.rediffmailpro.com:465 TLS | The Pro admin must enable IMAP sync. Free @rediffmail.com accounts appear to offer only POP3, which is not supported. |

- Only `INBOX` is scanned, opened read-only, over the lookback window (`SINCE`, 12 months by default). Gmail's `INBOX` includes all category tabs.
- The scanner (`src/core/mail/scanner.ts`) keeps one scan per `AppContext` in a module-level `WeakMap`. It fetches envelope, flags, internal date, and only the `List-Unsubscribe` and `List-Unsubscribe-Post` headers, in UID batches of 500, then refreshes `\Seen` with flags-only fetches in batches of 2,000. imapflow returns the requested headers as a raw Buffer; `src/core/mail/headers.ts` unfolds it and decodes RFC 2047 words.
- Migration 2 adds `senders.display_name_at` and `senders.unsubscribe_at`, the `received_at` of the message each value came from, so the newest message wins regardless of scan order.
- IMAP errors are classified in `src/core/mail/errors.ts` by imapflow's `authenticationFailed` and `serverResponseCode`, and by Node socket codes such as `ENOTFOUND` and `ECONNREFUSED`.
- Trash means `MOVE` to the special-use `\Trash` mailbox, found by special-use flag rather than name (`[Gmail]/Trash`, `Deleted Messages`, `Trash`), falling back to a mailbox named `Trash`. On Gmail, deleting without moving only removes a label, so always move.
- Plain-text IMAP/SMTP and `http:` unsubscribe URLs are allowed only for `127.0.0.1` and `localhost`, which is the GreenMail QA server.

### Data model (`src/core/db/migrations.ts`)

`accounts`, `mailbox_state` (UIDVALIDITY plus the highest scanned UID, for incremental rescans), `senders` (one row per lowercased address, holding its unsubscribe method and target and its AI category, summary, and recommendation), `messages` (headers only: subject, date, read flag, List-Unsubscribe headers, trashed_at), `actions` (an unsubscribe and trash log used for the home screen's impact numbers), and `settings`. Migrations are an ordered list applied through `PRAGMA user_version`. Versions 2, 3, and 4 are reserved slots for mail sync, insights, and actions.

## Technologies

| Technology | Why |
| --- | --- |
| Bun 1.3 | Runtime, package manager, bundler (HTML imports), test runner, SQLite (`bun:sqlite`), Keychain (`Bun.secrets`), and single-binary compile |
| Objective-C + Cocoa/WebKit via `clang` | Native window with no framework. Swift is avoided because this Mac's Command Line Tools have a Swift compiler and SDK mismatch. |
| Preact 11 | A 4 KB UI library with a React-style API |
| imapflow / nodemailer | Mature IMAP and SMTP clients that run on Bun |
| Biome | Formatting and linting |
| TypeScript 7 (`tsc --noEmit`) | Type checking |
| GreenMail (Docker via Colima) | Local fake IMAP and SMTP server for tests and QA |

## Repository layout

```text
shell/              native window source and Info.plist template
src/core/           Bun core
  ai/               AI CLI bridge and PATH resolution
  db/               SQLite open and migrations
  mail/             IMAP/SMTP, provider presets, scanning
  insights/         sender statistics and AI categorisation
  actions/          unsubscribe and trash execution
  routes/           HTTP route tables: system, accounts, insights, actions
src/shared/api.ts   UI ↔ core contract (all request and response types)
src/ui/             Preact UI (index.html, App.tsx, styles.css tokens)
scripts/            build, install, dev, and readiness tooling
tests/unit/         fast tests with in-memory DB, fake AI, memory secret store
tests/integration/  tests against GreenMail (need `make infra-up`)
ctx/                project knowledge
.local/             ignored: dev data, QA helpers, screenshots
dist/               ignored: build output
```

## Prerequisites

- macOS 13 or later on Apple Silicon, with Xcode Command Line Tools (`xcode-select --install`). `clang` is required.
- Bun 1.3 or later (`curl -fsSL https://bun.sh/install | bash`).
- Docker through Colima (`brew install colima docker docker-compose && colima start`), needed only for integration tests and QA.
- The `claude` CLI signed in to a Claude subscription and, optionally, the `codex` CLI signed in to ChatGPT. Run each once interactively to sign in.

## Commands

| Task | Command |
| --- | --- |
| Install dependencies | `make install` |
| Start the test mail server | `make infra-up` |
| Stop it | `make infra-down` |
| Reset it (wipes all test mail) | `make infra-reset` |
| Develop (native window plus core with reload; data in `.local/dev-data`, Keychain service `Inbox Tidy Dev`) | `make dev` |
| Unit tests | `make test` |
| Integration tests | `make test-integration` |
| Lint, typecheck | `make lint`, `make typecheck` |
| Format | `make format` |
| All fast checks | `make check` |
| Build `dist/Inbox Tidy.app` | `make build` |
| Build and install to `/Applications` | `make install-app` |
| Full QA gate | `make qa` |

In dev, frontend edits hot-reload. Backend edits restart the core on the same port and token; press Cmd+R in the window afterwards.

## Ports and URLs

- Core: `127.0.0.1:<random>` in the app, `127.0.0.1:4477` under `make dev`. Health: `GET /api/health`, which needs the session cookie. In dev, open the printed `/session?t=…` URL in a browser to get one.
- GreenMail: IMAP `127.0.0.1:3143` (plain), SMTP `127.0.0.1:3025` (plain), REST `127.0.0.1:8080`. Users: `qa@inbox-tidy.test` / `qa-password` and `friend@inbox-tidy.test` / `friend-password`.

## Environment variables

No env file is used or committed. All variables are optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `INBOX_TIDY_DATA_DIR` | `~/Library/Application Support/Inbox Tidy` (`… Inbox Tidy Dev` in dev) | SQLite location |
| `INBOX_TIDY_PORT` | `0` (random) | Core port |
| `INBOX_TIDY_TOKEN` | random | Fixed session token (dev only) |
| `INBOX_TIDY_AI_PROVIDER` | `auto` | Default AI choice until changed in settings |
| `INBOX_TIDY_LOOKBACK_MONTHS` | `12` | Default scan window until changed in settings |
| `INBOX_TIDY_KEYCHAIN_SERVICE` | `Inbox Tidy` (`Inbox Tidy Dev` in dev) | Keychain service for passwords; QA must use its own |
| `INBOX_TIDY_DEV` | unset | `1` enables HMR and dev defaults |
| `INBOX_TIDY_DEV_URL` | unset | Makes the shell load this URL instead of starting the bundled core |

## Remote dependencies

The only remote services contacted at runtime are the user's mail providers, the AI providers through the user's own CLIs, and unsubscribe endpoints chosen by senders.

## Troubleshooting

- **"Inbox Tidy stopped working in the background."** Read `~/Library/Logs/Inbox Tidy/core.log`.
- **The AI helper isn't found when the app is opened from Finder, but works in Terminal.** The login-shell `PATH` lookup failed. Check that `zsh -ilc 'echo $PATH'` includes the CLI's directory.
- **The AI check fails with an auth error.** Run `claude` (or `codex`) once in Terminal to sign in.
- **A Keychain prompt appears after rebuilding the app.** Ad-hoc signatures change with every build. Choose "Always Allow".
- **The Swift error "this SDK is not supported by the compiler" appears.** The shell build doesn't use Swift; reinstall the Command Line Tools if `clang` itself fails.
- **`make infra-up` hangs.** Run `colima start`, then retry.
- **Gmail says "Application-specific password required".** Turn on 2-Step Verification and create an app password; the normal password never works over IMAP.
