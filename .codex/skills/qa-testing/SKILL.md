---
name: qa-testing
description: Run complete local QA and prepare a human-review walkthrough. Use when the user asks to QA, test, verify, smoke test, or manually review implemented work.
---

# QA testing

1. Read `ctx/TECH.md`, `ctx/FEATURES.md`, `ctx/SPRINT.md`, and the changed code.
2. List every affected user journey and acceptance condition from `ctx/FEATURES.md`.
3. Start and readiness-check local infrastructure with `make infra-up` (GreenMail on `127.0.0.1:3143` IMAP and `127.0.0.1:3025` SMTP).
4. Inspect the effective environment without printing values. Prove before writing anything that:
   - `INBOX_TIDY_DATA_DIR` points at a scratch or dev directory, never `~/Library/Application Support/Inbox Tidy`;
   - `INBOX_TIDY_KEYCHAIN_SERVICE` is not `Inbox Tidy` (use a QA-only service name);
   - every account you add uses host `127.0.0.1` or `localhost`.
   If any of these cannot be proven, stop and ask. Never touch a real mailbox.
5. Seed every state needed: an empty mailbox, a large mailbox with many senders, read and unread mail, one-click (`List-Unsubscribe-Post`), `mailto:`, web-only, and no-unsubscribe senders, plus a failing unsubscribe endpoint and a wrong password. Seed through SMTP to GreenMail or IMAP APPEND. Keep QA-only seed and reset helpers in the ignored `.local/qa/` directory; never commit them.
6. Run `make check` and `make test-integration`, then `make build`. Exercise the real flow in the dev window (`make dev`) or the built app, pointed at QA data. Capture concise evidence (command output, screenshots stored under `.local/`) and record results in `ctx/SPRINT.md`.
7. Give the user a human-review checklist: exact startup commands, the QA account (`qa@inbox-tidy.test` / `qa-password`, IMAP `127.0.0.1:3143` without TLS, SMTP `127.0.0.1:3025`), the steps for each journey, the expected result of each, and how to reset (`make infra-reset`, delete the QA data directory). Cover every implemented part; never hand off a vague "please test it".
