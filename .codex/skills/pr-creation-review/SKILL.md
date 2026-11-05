---
name: pr-creation-review
description: Review changes and create or refine a focused pull request. Use when the user asks to review a branch, prepare a commit, open a PR, update a PR, or check whether changes are ready to merge.
---

# PR creation and review

1. Inspect the base branch, current branch, remotes, worktree, staged files, the full diff, and the relevant `ctx` documents.
2. Separate intended product changes from local-only artifacts. Never stage or commit environment files, credentials, QA-only scripts or data, screenshots, logs, generated output (`dist/`, `.local/`), or personal notes.
3. Confirm the documentation states the new behavior positively and currently. Remove stale descriptions rather than adding historical caveats.
4. Run the narrowest sufficient checks plus `make check` (add `make test-integration` when mail code changed). Review for correctness, regressions, security (Keychain-only secrets, the localhost-only plain-text rule, the API guard), mailbox data safety, accessibility, and missing tests.
5. Stage named intended files only, inspect the exact staged list, and use the existing Git identity without AI attribution.
6. Push and open or update the PR with `gh` only when authorized and authenticated. Keep the description short and plain: what changed, why, and the checks that were actually run. Do not embellish results or include agent narration.
7. Report the branch, commit, PR link, checks, and any honest remaining risk.
