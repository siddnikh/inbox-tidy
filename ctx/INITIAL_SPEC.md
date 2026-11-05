# Initial specification

Captured from the owner's brief and answers on 2026-11-06. This file records the original intent; current truth lives in `TECH.md`, `DESIGN.md`, and `FEATURES.md`.

## Vision (owner's words, lightly edited)

I want to keep it really straightforward. The whole point of this app is that it helps me clean up my email. It should show me where I get a lot of emails from, which ones I can unsubscribe from, and the app should be able to unsubscribe.

It is powered by an LLM. We will get an API later on; for now use my Claude Code and Codex subscriptions. It's just for me for now (I may license it later). It needs to be really lightweight and straightforward.

It should be an app on my Mac that I double-click. It should access my Apple email as well as Gmail, Yahoo Mail, Rediffmail, and so on, and give that access to an LLM that helps sort it all out.

Assume I don't know tech: the interface has to be really simple and show me data that actually makes sense to me. Use technology that is as lightweight as possible on a Mac.

## Answers to the kickoff questions

1. Accounts are not in Apple Mail today, and Gmail must work. Connect each provider directly.
2. First version: who emails me most, what I can unsubscribe from, unsubscribing on my click. Also take read versus unread email into account. Trashing old emails is a feature too.
3. Unsubscribe mechanics: left to the builder. (Chosen: one-click and email unsubscribes run automatically, web-only ones open in the browser, and nothing runs before an explicit confirmation.)
4. The AI sees only sender details, a few subject lines, and counts, never email bodies.
5. Claude Code first, Codex as automatic backup, switchable in settings.
6. Look back 12 months.
7. Name: "Inbox Tidy" (dictated as "inbox ID"; confirm with the owner). Installed into /Applications.
8. Minimal, one accent color, looks like macOS and iOS.
9. Happy path accepted, and the first screen must show the value delivered, for example how many senders I've unsubscribed from and how many fewer emails I'll get.
10. Code on GitHub to track progress, with each feature delivered as a pull request.

## Follow-up instruction (same night)

Build the full working tool overnight with subagents; the owner wants to wake up to a working, installable, lightweight app.
