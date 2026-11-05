# Design

No Figma or brand assets have been supplied. The direction comes from the owner: minimal, one accent colour, and it should feel like macOS and iOS. The user is non-technical, so clarity beats density.

## Personality and principles

- **Calm and trustworthy.** Inbox Tidy touches someone's email, so it should feel like a careful assistant. Nothing destructive happens without a clear confirmation, and every result is reported honestly.
- **Value first.** The home screen leads with what the app has achieved: senders unsubscribed, fewer emails per month, and emails moved to Trash.
- **Plain words.** Write "about 40 emails a month", "you open 3 in 100", "Shopping". Never write IMAP, UID, API, token, or error codes in the UI. Numbers are rounded and human ("about 1,200", "2 in 3").
- **One accent colour.** Blue is used only for primary actions, selection, and links. Status colours (green and red) appear only for success and error feedback.
- **Native feel.** Use the system font, grouped inset lists, sheets that slide up, soft cards, and generous whitespace.

## Colour tokens (`src/ui/styles.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-bg` | #F5F5F7 | #1C1C1E | Window background |
| `--color-bar` | bg at 82% | bg at 82% | Translucent sticky header (with backdrop blur) |
| `--color-surface` | #FFFFFF | #2C2C2E | Cards, lists |
| `--color-surface-raised` | #FFFFFF | #3A3A3C | Sheets, popovers |
| `--color-fill` / `-hover` | grey 12% / 20% | grey 24% / 32% | Secondary buttons, skeletons |
| `--color-separator` | rgba(60,60,67,.18) | rgba(84,84,88,.6) | Hairlines |
| `--color-overlay` | black 22% | black 45% | Dimmed backdrop behind sheets |
| `--color-text` | #1D1D1F | #F5F5F7 | Primary text |
| `--color-text-secondary` | #6E6E73 | #AEAEB2 | Supporting text |
| `--color-text-tertiary` | #8E8E93 | #8E8E93 | Placeholders, disabled text only |
| `--color-accent` | #0071E3 | #0071E3 | Primary button fill (white text, 4.7:1) |
| `--color-accent-pressed` | #005BB8 | #005BB8 | Pressed and hovered primary |
| `--color-accent-text` | #0066CC | #4DA3FF | Links and accent text on surfaces |
| `--color-accent-soft` | blue 10% | blue 18% | Selected rows, badges |
| `--color-success` | #248A3D | #30D158 | Success text and icons |
| `--color-danger` / `-soft` | #D70015 | #FF6961 | Error text and error notice backgrounds |
| `--color-danger-fill` / `-pressed` | #D70015 / #B00011 | same | Destructive confirm button fill (white text) |

The app follows the system light or dark setting automatically. Body text must reach a 4.5:1 contrast ratio; tertiary text is never used for information the user needs.

## Typography

The system font stack is `-apple-system, BlinkMacSystemFont, "SF Pro Text"/"SF Pro Display", "Helvetica Neue", Arial, sans-serif`. All numbers use tabular figures.

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `--text-large-title` | 30 / 36 | 700 | Screen title |
| `--text-stat` | 40 / 44 | 700 | Impact numbers |
| `--text-title` | 20 / 26 | 600 | Section titles |
| `--text-headline` | 16 / 22 | 600 | Row titles, buttons |
| `--text-body` | 15 / 21 | 400 | Default |
| `--text-callout` | 14 / 19 | 400 | Row details |
| `--text-caption` | 12.5 / 16 | 400 | Footnotes |

## Spacing, shape, and layout

- The spacing scale is 4, 8, 12, 16, 20, 24, 32, and 40 px (`--space-1` … `--space-10`).
- Radii are 8 px for controls, 14 px for cards and grouped lists, and a full pill for badges.
- Card shadows are very soft (`--shadow-card`); sheets use `--shadow-sheet`; the selected segment uses `--shadow-segment`. Lists use hairline separators inset to the text column.
- A sticky, translucent header holds the 28 px title-bar zone (the window title "Inbox Tidy", centred, clear of the window buttons), the tab row, and the scan bar while a scan runs. Content below is centred at a maximum width of 920 px, with 32 px side padding, and each screen starts with a large title.
- The window is at least 820 × 580, so no mobile breakpoints are needed. Impact cards are three across, wrapping to one column below 760 px.

## Components and conventions

- **Navigation.** A centred segmented tab row in the header: Home, Senders, Accounts, Settings (tab semantics, arrow keys move between tabs, and the URL hash keeps the tab across reloads). Keep it flat; no nested navigation. Filters inside a screen use the same segmented look as pressed toggle buttons.
- **Buttons.** Primary has an accent fill with white text. Secondary uses the grey fill. Destructive confirms use a danger fill. Every button has pressed (scale 0.97), hover, in-flight ("Unsubscribing…", disabled), and disabled states, and changes within 100 ms of a click.
- **Sender rows.** A circular monogram (the initial on a neutral fill), the display name in headline style, and the category plus domain in secondary style. On the right: "about N a month" and "you open X in 10" ("you never open them", "you rarely open them", "you open almost all of them" at the extremes). A checkbox selects the row for bulk actions and tints it with `--color-accent-soft`. Badges are pills: "Suggested" (accent soft), "Unsubscribed" and "Kept" (neutral), and the unsubscribe method in plain words as an outlined pill ("Automatic", "By email", "Opens a web page", "No unsubscribe link"). Clicking a row expands it to show the summary, the recommendation and reason ("Not sorted yet" when missing), recent subjects, and the row's actions.
- **Bulk bar.** When at least one sender is selected, a floating bar at the bottom shows "N senders selected", Clear, "Move emails to Trash", and the primary "Unsubscribe from N".
- **Sheets.** Centred modal panels that slide up over a dimmed backdrop, with a title, body, and a footer of Cancel plus one primary or destructive button. Focus moves into the sheet (the dialog itself unless a safe control is marked to receive it) and returns to the opener on close; Tab is trapped; Escape closes unless an action is in flight. Long actions run one sender at a time with a determinate "Unsubscribing 2 of 5…" bar, then the same sheet switches to a results list with an icon and a status word per sender.
- **Confirmations.** Bulk actions open a sheet that lists exactly what will happen, per sender and method, with one primary confirm button and Cancel. Trash confirmations state the email count and that items go to the provider's Trash, where they can be recovered, and use the danger fill.
- **Toasts.** Top-centre, just below the header (so they never cover navigation or scan progress), with `aria-live="polite"`. Success and info toasts leave after 3 s; error toasts stay 6 s so the fix can be read. Each has a dismiss button. A toast that would duplicate an open results sheet is shown when the sheet closes instead.
- **Feedback.**
  - Errors name the action and the fix ("Couldn't connect to Gmail. Check the app password and try again.") and offer the action in place. Form input is kept after an error.
  - Successes are confirmed with a short toast or an inline state change, tied to the real result.
  - Long work (scans, AI sorting) shows a determinate bar and a stage sentence ("Reading emails from you@gmail.com: 1,200 of 4,000", "Sorting your senders: 3 of 8").
  - Loading uses skeletons shaped like the content. Empty states explain why and what to do ("Add an email account to see who emails you most."). Loading, empty, and error are always separate states.
- **Copy.** Use sentence case. Address the user as "you". Be short and specific, and don't joke about their email.

## Motion

- Durations are 120 ms (press), 200 ms (state changes), and 320 ms (sheets and toasts), all with `--ease-out` (`cubic-bezier(0.2, 0.8, 0.2, 1)`).
- Sheets slide up and fade. Toasts slide in from the top and leave after 3 s.
- `prefers-reduced-motion` reduces every animation to an instant change.

## Accessibility baseline

- Everything is reachable and operable by keyboard, with a visible focus ring (`--color-focus`, 3 px).
- Interactive elements are real `<button>`, `<input>`, and `<label>` elements. Icons get labels, and progress and toasts use `aria-live`.
- Information is never carried by colour alone; badges carry text too.
- Text can be zoomed with Cmd and the plus key without breaking the layout.
- The app follows the system light or dark appearance; both were checked in the native window.

## App icon

The icon is a blue rounded square (the accent gradient) holding a white envelope and a white check badge. The source is `shell/icon/AppIcon.svg`, built into `shell/AppIcon.icns` (all sizes 16–1024).

## Unresolved

- Final product name: "Inbox Tidy" is to be confirmed with the owner.
