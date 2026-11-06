# Install Inbox Tidy with an AI agent

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup) or [Codex](https://developers.openai.com/codex/cli), it can install Inbox Tidy for you. It checks your Mac, installs what's missing, builds the app, and confirms that it opens. Your email passwords are never part of this. You paste app passwords into Inbox Tidy yourself, and the agent never sees them.

## For people: the prompt to paste

1. Open Terminal and start your agent: type `claude` (or `codex`) and press Return.
2. Paste this prompt:

```text
Please install the Inbox Tidy Mac app for me by following
https://github.com/siddnikh/inbox-tidy/blob/main/docs/INSTALL_WITH_AN_AGENT.md
(the "For agents" section) exactly. Explain each step in plain words before you
run it, and ask me before anything that needs my password or a click from me.
Never ask for my email passwords: I'll paste app passwords into the app myself.
When it's installed, help me create an app password for my email provider.
```

3. Answer its questions. macOS may show a window asking you to install the Command Line Tools. If it does, click **Install** and tell the agent when the install has finished.

You can follow the same steps by hand in the [README](../README.md#install).

---

## For agents

You are installing a local macOS app for a non-technical person. Explain each step in one plain sentence before you run it. After each step, run its check command and confirm the expected result before you continue. If a check fails, use the fixes listed for that step, then tell the user plainly what went wrong and what to do next.

### Limits (must follow)

- **Never ask for, type, read, store, or repeat the user's email passwords or app passwords.** The user creates app passwords on their provider's website and pastes them into the Inbox Tidy window themselves. If the user pastes a password into the chat, tell them not to share it, and don't use it.
- **Don't connect to the user's mailboxes yourself.** Don't use IMAP, SMTP, `curl`, or scripts against their mail providers. Don't call Inbox Tidy's local API to add accounts, scan, unsubscribe, or trash. All of that happens in the app, with the user confirming each action.
- **Don't read Keychain secrets.** Never run `security find-generic-password -w` or anything else that would print a stored password.
- **Don't read the user's mail data.** Leave the database in `~/Library/Application Support/Inbox Tidy/` alone; it holds the user's sender names and subject lines. When troubleshooting, the log file (see below) is enough. Treat the log as private and don't send it anywhere.
- **Don't use `sudo`**, except to reinstall broken Command Line Tools as described in step 1, and only after the user agrees.
- **Don't sign in to the AI CLIs for the user.** If `claude` or `codex` isn't signed in, the user signs in through the browser flow themselves.
- Make no changes to the user's system other than those listed below, and stop to ask if something unexpected comes up.

### Step 0: Check the Mac

```sh
sw_vers -productVersion
uname -m
```

The version must be 13.0 or later. The architecture is `arm64` on Apple Silicon (tested) or `x86_64` on Intel (untested; continue, but say so). If the version is below 13, stop: Inbox Tidy needs macOS 13 Ventura or later.

### Step 1: Command Line Tools (clang, git, make)

```sh
xcode-select -p && clang --version && git --version && make --version
```

All four commands must succeed. If they don't, run `xcode-select --install`. This opens a macOS window, so ask the user to click **Install** and to tell you when it has finished. Then run the check again.

If `xcode-select -p` succeeds but `clang` fails, the tools are broken. With the user's agreement, run `sudo rm -rf /Library/Developer/CommandLineTools`, then `xcode-select --install` again. A Swift "SDK is not supported by the compiler" message is harmless, because Inbox Tidy doesn't use Swift.

### Step 2: Bun 1.3 or later

```sh
bun --version || "$HOME/.bun/bin/bun" --version
```

If neither works, or the version is below 1.3, install Bun:

```sh
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
bun --version
```

The installer adds Bun to the user's shell profile for future Terminal windows. In your current shell, keep the `PATH` export.

### Step 3: Get the source

```sh
if [ -d "$HOME/inbox-tidy/.git" ]; then git -C "$HOME/inbox-tidy" pull --ff-only; else git clone https://github.com/siddnikh/inbox-tidy.git "$HOME/inbox-tidy"; fi
cd "$HOME/inbox-tidy" && git log -1 --oneline
```

The `git log` line must print a commit. If the user wants the source somewhere else, use that folder instead of `~/inbox-tidy` everywhere below.

### Step 4: Install dependencies and run the checks

```sh
cd "$HOME/inbox-tidy"
make install
make check
```

`make install` runs `bun install` inside the project folder only. `make check` runs the linter, the type checker, and the unit tests. These need no network, no Docker, and no mail server, and they must finish with every test passing. If `make check` fails, show the user the failing test names and stop. Don't edit the code to make the checks pass.

Don't run `make test-integration`, `make qa`, or `make dev`. Those are for developers, and they need a local test mail server in Docker.

### Step 5: Build and install the app

Tell the user this puts `Inbox Tidy.app` in their Applications folder. It replaces an older Inbox Tidy if there is one, and leaves any other app alone. Then run:

```sh
cd "$HOME/inbox-tidy"
make install-app
```

It must print a line starting with `Installed /Applications/Inbox Tidy.app.` The build takes one to three minutes, and the app is about 64 MB. If the script says the target "exists but is not Inbox Tidy", stop and ask the user what that app is. If it fails with a permission error, ask the user to drag `~/inbox-tidy/dist/Inbox Tidy.app` into Applications in Finder, rather than using `sudo`.

### Step 6: Verify the app

```sh
APP="/Applications/Inbox Tidy.app"
test -x "$APP/Contents/MacOS/Inbox Tidy" && test -x "$APP/Contents/Resources/Inbox Tidy Helper" && echo "bundle ok"
defaults read "$APP/Contents/Info" CFBundleIdentifier
codesign --verify --deep --strict "$APP" && echo "signature ok"
```

Expected: `bundle ok`, then `com.siddnikh.inboxtidy`, then `signature ok`. The build is signed ad hoc on this Mac and isn't notarised, which is normal.

Next, launch the app and confirm that its background core started:

```sh
open -a "Inbox Tidy"
sleep 6
pgrep -fl "Inbox Tidy Helper"
tail -n 5 "$HOME/Library/Logs/Inbox Tidy/core.log"
```

`pgrep` must list the helper process. The log must end with a line like `Inbox Tidy core 0.1.0 listening on http://127.0.0.1:<port> (data: …/Library/Application Support/Inbox Tidy)`. Then ask the user whether the window shows **Welcome to Inbox Tidy**. If it shows "Inbox Tidy stopped working in the background", read the log and use the troubleshooting section below.

### Step 7: Check the AI helpers

Inbox Tidy uses the `claude` CLI first and `codex` as a backup. At least one should be installed and signed in. Without either, the app still works, but with simpler suggestions.

```sh
command -v claude && claude --version && claude auth status
command -v codex && codex --version && codex login status
```

- `claude auth status` should report `"loggedIn": true`, and `codex login status` should say it's logged in.
- If a CLI is missing, point the user to its official install guide: [Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup), [Codex](https://developers.openai.com/codex/cli).
- If a CLI isn't signed in, ask the user to run `claude` (or `codex`) in a new Terminal window and finish the sign-in in their browser.

The app runs these CLIs through the user's login shell, so also check that the login shell can find them:

```sh
"$SHELL" -ilc 'command -v claude; command -v codex'
```

If a CLI works in your shell but isn't found here, its folder (often `~/.local/bin`, or an nvm Node folder for `codex`) is missing from the user's login-shell `PATH`. Explain this to the user and offer to add it to `~/.zprofile`. Then ask the user to open **Settings** in Inbox Tidy and press **Test the AI helper**, which sends a real one-word request through the chosen CLI.

### Step 8: Hand over

Tell the user:

- Inbox Tidy is in their Applications folder, and they can open it from Launchpad or Spotlight.
- Next they press **Add an email account**, pick their provider, create an app password, and paste it into the app themselves.
- Nothing is unsubscribed or trashed until they confirm it in the app, and trashed email can be recovered from the provider's Trash.

---

## Helping the user afterwards

### Creating app passwords

Walk the user through it in plain words. They do the clicking and copying; you never see the password.

| Provider | Steps |
| --- | --- |
| Gmail | Turn on 2-Step Verification at https://myaccount.google.com/signinoptions/twosv. Then open https://myaccount.google.com/apppasswords, enter the name "Inbox Tidy", press Create, and copy the 16-letter password into the app (spaces don't matter). If the page says the setting isn't available, 2-Step Verification is off, or the account is a work or school account whose administrator has turned app passwords off. |
| iCloud Mail | Two-factor authentication must be on. Go to https://account.apple.com/account/manage, choose Sign-In and Security, then App-Specific Passwords, then Generate, and name it "Inbox Tidy". |
| Yahoo Mail | Go to https://login.yahoo.com/account/security and choose Generate app password (it may be under External connections). Name it "Inbox Tidy". |
| Rediffmail Pro | The Pro administrator turns on IMAP (Admin, then Other Services, then Complete Mail Sync). Then the user's normal Pro password works. Free `@rediffmail.com` accounts are not supported, because they don't offer IMAP. |
| Other | Find the provider's IMAP and SMTP host, port, and TLS settings in its help pages, and an app password if it offers them. Encrypted connections are required. |

If macOS asks whether Inbox Tidy may use the Keychain, the user should choose **Always Allow**.

### Explaining the app

- **Home** shows progress: senders unsubscribed, the expected drop in emails a month, and emails moved to Trash.
- **Senders** lists everyone who emailed them in the last 12 months, with how often each sender emails and how many of those emails the user opens. **Suggested** lists the senders the AI recommends dropping. **Keep** hides a sender from suggestions.
- Unsubscribing uses the sender's one-click link, an unsubscribe email sent from the user's account, or the sender's web page, which opens in the browser for the user to finish there.
- **Settings** sets the AI helper (Automatic, Claude only, or Codex only) and how far back to look (3, 6, 12, or 24 months).
- The AI sees only sender names, addresses, domains, counts, read rates, and up to five subject lines per sender. It never sees email bodies or passwords.

### Troubleshooting

Read the log, which never contains passwords:

```sh
tail -n 100 "$HOME/Library/Logs/Inbox Tidy/core.log"
```

Common causes:

| Symptom in the app or log | Likely cause and fix |
| --- | --- |
| "didn't accept that password" | The user pasted their normal password, or the app password was revoked. They create a new app password and connect again. |
| "Couldn't reach …", `ENOTFOUND`, `ECONNREFUSED`, timeouts | There's no internet, or a VPN or work network is blocking mail connections. |
| IMAP disabled (Rediffmail Pro, some providers) | The provider or administrator must turn on IMAP access. |
| "Sorted without the AI helper" | Neither CLI was reachable during the scan. Fix it with step 7, then the user presses **Scan again**. |
| The window says the core stopped | Read the log's last lines. Quitting and reopening the app usually helps. Rebuilding with `make install-app` fixes a damaged install. |
| Keychain prompt after every update | Expected with ad-hoc signing. The user chooses **Always Allow**. |

### Updating and uninstalling

- **Update:** `cd ~/inbox-tidy && git pull --ff-only && make install && make install-app`. Accounts and history are kept.
- **Uninstall:** follow the [README's uninstall section](../README.md#uninstall). Ask the user to remove their accounts in the app first, so their Keychain items are deleted, and confirm with them before you delete anything.
