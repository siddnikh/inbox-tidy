# Features

Statuses: `Not started`, `In progress`, `Partial`, `Built`, `Future idea`.

## 1. App opens and checks its helpers

- **Status:** Built
- **Problem and outcome:** The user double-clicks Inbox Tidy and gets a native Mac window that works without any setup in Terminal.
- **Journey:** Open from Applications, see "Opening Inbox Tidy…", and then the app's screens load. Quitting the window stops everything in the background.
- **Built now:** The native shell, the bundled core, the session guard, `GET /api/health` (database and AI tool availability), `POST /api/ai/check` (a real one-word round trip through Claude, falling back to Codex), and `GET`/`PUT /api/settings`. The starter screen has been replaced by the full UI (see features 2 to 8), which talks to the routes in `src/shared/api.ts`.
- **Edge cases:** A missing core binary, a core that never becomes ready (20 s), and a core that crashes each show a plain-language page in the window pointing to the log.

## 2. Connect email accounts

- **Status:** Built
- **Built now:** The core API. `GET /api/providers` returns the presets. `POST /api/accounts` validates the request, applies the preset, tests the login (connect, open `INBOX` read-only, log out), saves the password to the Keychain, saves the account, returns `201` with an `AccountSummary`, and starts a background scan. `GET /api/accounts` lists accounts with their non-trashed message counts. `DELETE /api/accounts/:id` removes the Keychain item, the account with its messages and mailbox state, and every sender left with no messages and no `actions` history. Senders whose unsubscribe option came from the removed account take it from their newest remaining message instead.
- **Built now (UI):** The add-account sheet (provider tiles, app-password steps with a link to the provider's page, the form with field-level errors, "Checking…"), and the Accounts tab with last-scan status, errors, and Remove with confirmation. Verified end to end against GreenMail: a wrong password gets a plain message, the right one connects and starts a scan.
- **Problem and outcome:** The user's mail is spread over Gmail, iCloud, Yahoo, and Rediffmail. They connect each one once, and the password is kept safely in the Keychain.
- **Discovery:** On first open, home shows an "Add your first email account" card. The Accounts tab shows the list and an "Add account" button.
- **Journey:**
  1. Pick a provider from large tiles: Gmail, iCloud Mail, Yahoo Mail, Rediffmail Pro, or Other.
  2. See numbered plain-language steps for creating an app password, with a button that opens the provider's page in the browser.
  3. Enter the email address and app password, then press "Connect", which shows "Checking…".
  4. On success, see "Connected" with the account in the list, and a scan starts automatically.
  5. On failure, see a specific message (wrong password or app password needed, server unreachable, IMAP disabled) while the form keeps its input.
- **Requirements:**
  - The connection is tested by IMAP login and opening `INBOX` before anything is saved.
  - The password is stored with `Bun.secrets` under the account email and is never returned by the API.
  - Removing an account deletes its Keychain item and its messages. Senders it was the only source of disappear from lists.
  - "Other" accepts custom IMAP and SMTP host, port, and TLS settings.
  - Plain-text connections are refused unless the host is `127.0.0.1` or `localhost`.
  - iCloud's IMAP username is the part before `@`.
  - Email addresses are stored lowercased. Spaces in Gmail app passwords are removed, because Google displays them in groups of four.
  - Login failures become plain sentences naming the provider. A refused password reads like "Gmail didn't accept that password. Make sure you pasted an app password, not your normal password." and returns `400` with `field: "password"`. An unreachable server (DNS failure, refused connection, timeout) reads "Couldn't reach Gmail. Check your internet connection and try again." and returns `503`. IMAP turned off and TLS failures have their own sentences. Technical details go to the log, never the password.
- **Edge cases:** A duplicate email address ("That account is already connected.", `409`, checked before connecting), the free Rediffmail domain (refused with the Rediffmail Pro preset's note), and a Keychain write denied (nothing is saved, and the message asks the user to choose Allow).

## 3. Scan mailboxes

- **Status:** Built
- **Built now:** The scanner (`src/core/mail/scanner.ts`) and `GET`/`POST /api/scan`, with incremental sync, staged progress, and per-account errors.
- **Built now (UI):** A global scan bar with stage sentences and a determinate bar, a finish toast, and "Scan again" on Home. Verified end to end: 2,232 emails from 15 senders read and sorted by the real Claude in about 17 s, with a follow-up incremental scan taking about 1 s.
- **Problem and outcome:** The app learns who emails the user, how often, and whether the user reads those emails, without downloading message bodies.
- **Journey:** A scan starts after an account is connected, or from "Scan again" on home. The user sees a determinate progress bar with a stage sentence. They can move around the app while it runs, and a slim bar remains visible.
- **Requirements:**
  - `POST /api/scan` starts a background scan of all accounts and returns `ScanStatus` immediately. `GET /api/scan` is polled about once per second.
  - Each account's `INBOX` is searched `SINCE` now minus the lookback months. Envelope (from, subject, date), flags (`\Seen`), `internalDate`, and only the `List-Unsubscribe` and `List-Unsubscribe-Post` headers are fetched, in batches.
  - Scans are incremental, using `mailbox_state`: new UIDs above `last_uid` are fetched, flags are refreshed for already-known messages so read and unread stays current, messages no longer on the server are removed, and a UIDVALIDITY change triggers a full rescan.
  - Senders are upserted by lowercased address. Each keeps the newest unsubscribe header (see feature 5 for parsing) and the account it came from.
  - Stages are `connecting`, then `reading` (processed and total per account), then `understanding` (feature 4's AI sorting), then `done`. A failing account records `last_scan_error` and doesn't stop the other accounts.
  - One scan runs at a time. `POST /api/scan` during a scan returns the running scan's status.
  - `INBOX` is opened read-only, so scanning never changes read state. Headers are fetched in UID batches of 500, and each batch is written in one transaction.
  - Every UID in the lookback window that isn't stored yet is fetched, which covers new mail and a widened lookback. Stored messages that left the window, or are gone from the server, are deleted, except ones Inbox Tidy moved to Trash (`trashed_at` set), which stay as history. A UIDVALIDITY change deletes the mailbox's other rows and reads it again.
  - A sender's display name comes from its newest message that has one. Its unsubscribe method, target, and account come from its newest message that has a `List-Unsubscribe` header. Both use `received_at`, which is the internal date, or the `Date` header when that is missing.
  - Progress messages read "Connecting to you@gmail.com…", "Reading emails from you@gmail.com (1,200 of 4,000)", and "Sorting your senders (3 of 8)". The scan ends with a summary such as "Finished. You got 4,213 emails from 312 senders in the last 12 months." It adds "Sorted without the AI helper this time." when senders needed sorting and the AI wasn't used, and it names any account that couldn't be read.
  - A failing account gets a plain `last_scan_error` and appears in `errors`. A successful one gets `last_scan_at` and its error cleared. The scan state is `failed` only when every account failed.
- **Edge cases:** An empty inbox, 50,000 or more messages (batches keep memory flat), messages with no From address (skipped), and encoded sender names and subjects (RFC 2047 words are decoded).

## 4. Understand senders (insights and AI)

- **Status:** Built
- **Built now:** The core side, in `src/core/insights/` and `src/core/routes/insights.ts`: `GET /api/senders?filter=&sort=&q=` (defaults `all` and `most`), `POST` and `DELETE /api/senders/:id/keep` (each returns the updated `SenderRow`, or 404), the data for `GET /api/summary` (feature 7), and `sortSenders`, which runs the AI sorting with the fallback. It was verified with fake AI clients in unit tests, and once by hand through the real Claude and Codex CLIs, where a batch of 40 took about 18 s and 36 s respectively.
- **Built now (UI):** The Senders tab with filters, sort, search, expandable rows, Keep/Stop keeping (optimistic, with rollback), and bulk selection. The scanner calls `sortSenders` during `understanding`. In an end-to-end check, Claude's recommendations were sensible: promotions you ignore were set to unsubscribe, banks, bills, work, and personal senders to keep, and mixed cases to review.
- **Problem and outcome:** The user sees, in plain words, who emails them most, which senders they ignore, what kind of sender each one is, and what Inbox Tidy recommends.
- **Discovery:** The Senders tab, plus the top suggestions on home.
- **Journey:** The Senders tab shows a list sorted by "Most emails", with a filter control (Suggested, All, Can unsubscribe, Unsubscribed, Kept), a sort option (Most emails, Least read, Most recent), and a search box. Each row shows the monogram, name, category, about N a month, how many in 10 the user opens, and the method badge. Expanding a row reveals the AI's one-sentence summary, the reason for the recommendation, recent subjects, and buttons: "Unsubscribe", "Keep" (hide from suggestions), and "Move old emails to Trash".
- **Requirements:**
  - Statistics come from SQL over `messages` inside the lookback window, excluding trashed ones: total, emails a month (total divided by the months spanned, at least 1 and at most lookback, using `src/core/insights/rate.ts` so every screen agrees), unread count, read percentage (a whole number from 0 to 100), last received, and up to five recent subjects, newest first. The list is built from two aggregate queries, backed by the `messages_sender_stats` index, and takes about 100 ms for 50,000 messages from 3,000 senders.
  - A sender's status is `unsubscribed` if its latest unsubscribe action is `done` or `opened_in_browser`. Otherwise it is `kept` if the user pressed Keep, and `active` if not.
  - Filters: "All" shows senders with mail in the window, plus unsubscribed senders even when all their mail is trashed. "Can unsubscribe" shows active senders with a method. "Suggested" shows those that are also recommended for unsubscribing. "Kept" and "Unsubscribed" filter by status. Sorts: "Most emails" (volume), "Least read" (read percentage, then volume), and "Most recent". The search matches name, address, or domain, ignoring case.
  - When a sender has no display name, the name shown is the address's local part tidied up ("john.smith" becomes "John Smith"). A generic local part such as `noreply` or `info` shows the domain instead.
  - AI sorting runs during the scan's `understanding` stage for senders with mail in the window and without AI data, or whose data is over 30 days old. Senders go in batches of 40, ordered by volume, and progress is reported after each batch. The input per sender is its name, address, domain, emails a month, read percentage, whether it has an unsubscribe option, and up to five recent subjects cut to 100 characters. Bodies are never sent.
  - The structured output, validated by JSON schema and enum checks, gives `category` (shopping, news, social, bills, travel, work, personal, other), a `summary` of at most 120 characters, a `recommendation` (unsubscribe, keep, or review), and a `reason` of at most 120 characters. Longer text is cut.
  - The sender data goes in a delimited JSON block, with `<` and `>` escaped so a subject cannot fake the end marker. The prompt says this data is untrusted and must not be followed as instructions. Banks, bills, receipts from services the user uses, security or login codes, real people, and work senders lean to "keep". Heavy, unread promotional senders lean to "unsubscribe". Anything uncertain gets "review".
  - If a batch fails (AI unavailable, timeout, bad JSON, or no usable items), that batch uses a deterministic fallback, and the next batch tries the AI again. Senders with an unsubscribe option, at least 4 emails a month, and under 20% read are recommended for unsubscribing, with a plain reason. Everything else gets no recommendation. The fallback sets no category and no AI timestamp, so these senders are retried on the next scan. Senders that already have older AI results keep them rather than taking the fallback. `sortSenders` never throws, and its `usedAi` flag is false when no batch reached the AI, so the scan can report "Sorted without the AI helper".
  - "Suggested" means the recommendation is unsubscribe, the sender is active (not unsubscribed or kept), and an unsubscribe method exists.
- **Edge cases:** The AI returns malformed output or unknown IDs (ignore those senders and keep the rest), and very long subjects (truncate them before sending).

## 5. Unsubscribe

- **Status:** Built
- **Problem and outcome:** The user ticks senders and presses one button, and Inbox Tidy unsubscribes in the most reliable way each sender allows.
- **Journey:** Select senders, press "Unsubscribe from N", and review a sheet listing each sender with the method in plain words. An option reads "Also move their emails to Trash". Press "Unsubscribe". A results list then shows "Done", "Opened in your browser — click the button there", "Couldn't unsubscribe — try their web page", or "No unsubscribe option".
- **Built now:** `POST /api/actions/unsubscribe` (`src/core/actions/unsubscribe.ts`, `src/core/routes/actions.ts`), verified against GreenMail and local test endpoints.
- **Built now (UI):** The confirm sheet with per-method plain wording, an "Also move their emails to Trash" option, live per-sender progress, and results. Verified end to end: a one-click POST reached the local endpoint, a mailto unsubscribe was delivered by SMTP, and a web-only sender opened in the browser.
- **Requirements:**
  - The request is `{senderIds, alsoTrash}`: 1 to 200 positive integer IDs (a duplicate is handled once) and a boolean. Results come back in request order. An unknown sender gets `not_available` with "That sender is no longer in your list." and no log row.
  - Options come from the `List-Unsubscribe` and `List-Unsubscribe-Post` headers of the sender's newest non-trashed message that has them, or from the sender's stored target when no message does. The header is parsed into its `<…>` entries, which are tried in this order, falling back to the next on failure:
    1. `one_click`: an https URL plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Send a POST with body `List-Unsubscribe=One-Click` (form-encoded) and a 15 s timeout. Any 2xx counts as done. Redirects are never followed, so a 3xx counts as a failure.
    2. `mailto`: send an email to that address through the SMTP of the account recorded on the sender (or else the account of the sender's newest message), using the `subject` and `body` from the mailto URL, or "unsubscribe" by default.
    3. `web`: an https URL. Open it in the default browser and report `opened_in_browser`.
    4. `none`: `not_available`.
  - Up to four senders are handled at once. Browser pages open one at a time, and at most 10 per request; later ones fail with a message asking to try them in a smaller batch.
  - Result messages: "Unsubscribed.", "Unsubscribed by sending them an email.", "Opened their unsubscribe page in your browser. Press the button there to finish.", "Couldn't unsubscribe automatically. Try again later.", and "This sender doesn't offer a way to unsubscribe. You can move their emails to Trash instead." Technical failure details go to the core log only.
  - Every attempt writes one `actions` row with kind `unsubscribe`, the last method tried, the status, the result sentence, and `emails_per_month_before`, the sender's monthly rate taken before anything is trashed.
  - `done` and `opened_in_browser` mark the sender unsubscribed, through that latest `unsubscribe` action.
  - When `alsoTrash` is set, feature 6's trash runs for all of that sender's emails after a `done` or `opened_in_browser` result. `trashed` holds the count, and the message gains a sentence such as "Moved 214 emails to Trash."
  - `http:` URLs and plain-text SMTP are refused unless the host is localhost.
- **Edge cases:** A sender with several accounts (the account recorded on the sender is used), redirects on the one-click POST (not followed), an endpoint that never answers (times out and falls back), and SMTP authentication failure (falls back to the web page).

## 6. Move old emails to Trash

- **Status:** Built
- **Problem and outcome:** The user clears out years of newsletters in one step, and the emails go to Trash so they can still be recovered.
- **Journey:** Choose "Move old emails to Trash" on a sender or a selection. A sheet offers "All of their emails" or "Only ones older than 30 days", plus an "Only emails I've read" toggle, and shows the count. Pressing "Move N emails to Trash" leads to the result: "Moved 214 emails from Amazon to Trash".
- **Built now:** `POST /api/actions/trash` and `trashSenderEmails` (`src/core/actions/trash.ts`), verified against GreenMail.
- **Built now (UI):** The trash sheet (all emails or only older than 30 days, plus an only-read option) and its results. The count shown before moving is an estimate ("up to N" for the older-than option). Verified end to end: 779 emails moved to the server's Trash, matching the app's count.
- **Requirements:**
  - The request is `{senderIds, olderThanDays, onlyRead}`: the same sender ID rules as feature 5, an integer from 0 (all emails) to 3650, and a boolean.
  - The sender's matching non-trashed messages are grouped by account and mailbox. Each account gets one IMAP connection, and trash runs on the same account never overlap. Each mailbox's UIDVALIDITY must still match the stored one; if it doesn't, those emails are skipped and the user is asked to scan again.
  - Matching messages are moved to the account's Trash with IMAP MOVE in chunks of 500 UIDs. imapflow falls back to COPY followed by EXPUNGE when the server lacks MOVE.
  - The provider's `\Trash` is found by special-use flag, falling back to a mailbox named `Trash`, which is created if missing.
  - Only messages that really moved get `trashed_at`: those in the server's UID map or, without one, those no longer in the source mailbox.
  - One `actions` row of kind `trash` records `messages_affected`. Its status is `done` when anything moved or nothing needed moving, so the home screen counts partial moves, and `failed` otherwise.
  - Result messages are "Moved 214 emails from Amazon to Trash.", "There were no emails from Amazon to move.", or a partial failure such as "Moved 120 emails from Amazon to Trash, but 94 couldn't be moved. Try again later." A partial or full failure has result status `failed`.
  - Nothing is ever permanently deleted.
- **Edge cases:** Messages already gone on the server (only what moved is counted; the rest is left for the next scan), a mailbox whose UIDVALIDITY changed (skipped, with "Scan again, then try again."), and a failure on one account (the other accounts still move, and the message says what moved and what didn't).

## 7. Home: value at a glance

- **Status:** Built
- **Built now:** The welcome card with no accounts; three impact cards with encouraging copy at zero; the inbox overview sentence; the top suggestions with quick Unsubscribe; the last scan time and "Scan again". Verified against real data: "3 senders, 58 fewer emails a month, 779 moved to Trash".
- **Problem and outcome:** The first screen shows how Inbox Tidy has helped and what to do next.
- **Journey:**
  - With no accounts, a welcome card explains the app in two sentences and leads to adding an account.
  - Otherwise, three impact cards at the top: "Senders you've unsubscribed from", "Fewer emails a month" (expected), and "Emails moved to Trash".
  - Below them, an inbox overview sentence: "In the last 12 months you got about 9,400 emails from 612 senders. You left 71% unread."
  - Then the top five suggestions with quick "Unsubscribe" actions and a "See all senders" link.
  - Finally, the last scan time and "Scan again".
- **Requirements:**
  - `GET /api/summary` provides the data.
  - `sendersUnsubscribed` counts distinct senders whose latest unsubscribe action is `done` or `opened_in_browser`.
  - `emailsAvoidedPerMonth` is the sum of `emails_per_month_before` over those senders, rounded.
  - `emailsTrashed` is the sum of `messages_affected` from successful trash actions.
- **Edge cases:** All zeros before any action shows encouraging copy instead of "0", and a scan in progress shows the scan bar here too.

## 8. Settings

- **Status:** Built
- **Problem and outcome:** The user can choose which AI helper is used and how far back to look.
- **Built now:** `GET`/`PUT /api/settings`, with validation and persistence.
- **Built now (UI):** The Settings tab: an AI helper choice (Automatic, which tries Claude and then Codex, or Claude only, or Codex only) saved immediately with a "Saved" confirmation, availability of each helper, "Test the AI helper", a lookback choice (3, 6, 12, or 24 months), and the app version. Connected accounts and Remove live on the Accounts tab.

## Future ideas (not committed)

- POP3 read-only support for free Rediffmail accounts.
- Google sign-in (OAuth) instead of app passwords.
- Paid API keys as an `AiClient` option, for licensing.
- Reading Apple Mail's local store without passwords.
- Scheduled background rescans and a weekly "you got N fewer emails" note.
- Developer ID signing and notarization for distribution.
