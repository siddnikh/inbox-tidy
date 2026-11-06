# Design

No Figma has been supplied. The owner fixed the palette: purple, yellow, and a washed-out purple (lavender), with white text. The app should feel like macOS and iOS, and the user is non-technical, so clarity beats density.

## Personality and principles

- **Calm and trustworthy.** Inbox Tidy touches someone's email, so it should feel like a careful assistant. Nothing destructive happens without a clear confirmation, and every result is reported honestly.
- **Value first.** The home screen leads with what the app has achieved: senders unsubscribed, fewer emails per month, and emails moved to Trash.
- **Plain words.** Write "about 40 emails a month", "you open 3 in 100", "Shopping". Never write IMAP, UID, API, token, or error codes in the UI. Numbers are rounded and human ("about 1,200", "2 in 3").
- **Every instruction has a picture.** Anything that tells the user what to do, or explains what will happen, carries an icon: numbered steps get a step badge and an icon, hints and footnotes lead with an icon, errors carry an alert icon, and empty states show a small illustration. Text still carries the meaning; the icon makes it readable at a glance.
- **Restrained colour.** Yellow is rare: the one main action on a screen and the big impact numbers. Lavender carries supporting accents (links, selection, badges, icons). Brand purple marks the selected tab or filter and the step badges. Status colours (mint and coral) appear only for success and error feedback.
- **Native feel.** Use the system font, grouped inset lists, sheets that slide up, soft cards with subtle depth, and generous whitespace. One soft purple glow sits behind the top of the window; no other decorative gradients.

## Colour tokens (`src/ui/styles.css`)

The three brand colours are `--brand-purple` #5B34D6, `--brand-yellow` #FFCB47, and `--brand-lavender` #B9A9E8 (the logo uses the same hexes). Text is white. The app is a single dark theme built from deep shades of the brand purple (`color-scheme: dark`); there is no light mode.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | #140D29 | Window background |
| `--color-bar` | bg at 80% | Translucent sticky header (with backdrop blur) |
| `--color-surface` | #1E1540 | Cards, lists |
| `--color-surface-raised` | #2A1F55 | Sheets, toasts, bulk bar |
| `--color-input` | rgba(10,6,24,.45) | Text field and checkbox wells |
| `--color-fill` / `-hover` | lavender 12% / 20% | Secondary buttons, segmented track, skeletons, sheet lists |
| `--color-separator` | lavender 16% | Hairlines and outlined badges |
| `--color-overlay` | rgba(8,5,18,.62) | Dimmed backdrop behind sheets |
| `--color-text` | #FFFFFF | Primary text |
| `--color-text-secondary` | white 74% | Supporting text |
| `--color-text-tertiary` | white 50% | Placeholders, disabled text, upcoming steps |
| `--color-accent` / `-hover` / `-pressed` | #FFCB47 / #FFD56B / #F0B830 | Primary button fill |
| `--color-on-accent` | #1A1036 | Text and icons on yellow |
| `--color-accent-text` | #B9A9E8 | Links, plain buttons, accent icons |
| `--color-accent-soft` | lavender 16% | Selected rows, "Suggested" badge, icon tiles |
| `--color-brand` / `-hover` | #5B34D6 / #6A45E0 | Selected tab and filter (white text), step badges, branded icon tiles |
| `--color-highlight` | #FFCB47 | Impact numbers |
| `--color-success` / `-soft` | #5DDB9E / mint 14% | Success text and icons |
| `--color-danger` / `-soft` | #FF8F8F / coral 14% | Error text, icons, and notice backgrounds |
| `--color-danger-fill` / `-pressed` | #D13C48 / #B32F3B | Destructive confirm button fill (white text) |
| `--color-focus` | lavender 70% | Focus ring |

**Contrast exception.** White on yellow is only 1.5:1, so primary buttons use deep purple text (#1A1036, 11.9:1) instead of white. This is the one place text isn't white.

Measured contrast (WCAG 2.1): white is 18.8:1 on bg, 17.0:1 on surface, 14.7:1 on raised, and 7.2:1 on brand purple. Secondary text is at least 6.7:1 on every surface, including selected rows and sheet lists. Lavender is at least 5.1:1, yellow 9.7:1, success 6.7:1, and danger 5.3:1 on every surface they appear on. White on the danger fill is 4.7:1. Tertiary text is 4.8:1 on raised but is never used for information the user needs. Body text must reach 4.5:1; check any new pair before using it.

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
- Depth comes from layered shadows, not borders: `--shadow-card` is a faint white top edge, a lavender hairline ring, and a soft purple-black drop; sheets use the stronger `--shadow-sheet`; the selected segment uses `--shadow-segment`; primary buttons use `--shadow-primary`. Lists use hairline separators inset to the text column.
- The body has one soft brand-purple radial glow at the top of the window. Impact cards with a value get a faint yellow glow in one corner, and the welcome card a faint purple glow behind its illustration. Nothing else uses gradients except the scan bar fill (purple to lavender) and branded icon tiles.
- A sticky, translucent header holds the 28 px title-bar zone (the window title "Inbox Tidy", centred, clear of the window buttons), the tab row, and the scan bar while a scan runs. Content below is centred at a maximum width of 920 px, with 32 px side padding, and each screen starts with a large title.
- The window is at least 820 × 580, so no mobile breakpoints are needed. Impact cards are three across, wrapping to one column below 760 px.

## Components and conventions

- **Navigation.** A centred segmented tab row in the header: Home, Senders, Accounts, Settings (tab semantics, arrow keys move between tabs, and the URL hash keeps the tab across reloads). The selected tab is a brand-purple pill with white text. Keep it flat; no nested navigation. Filters inside a screen use the same segmented look as pressed toggle buttons.
- **Buttons.** Primary has a yellow fill with deep-purple text, and there is at most one per screen or sheet. Secondary uses the lavender fill. Plain buttons and links are lavender text. Destructive confirms use the danger fill. Action buttons lead with a 14 px icon where it helps (plus for adding, bell-off for unsubscribe, trash, pin for keep, refresh for scan again). Every button has pressed (scale 0.97), hover, in-flight ("Unsubscribing…", disabled), and disabled states, and changes within 100 ms of a click.
- **Form controls.** Text fields sit in a dark well with a lavender hairline. Checkboxes and radios are custom: a dark well with a lavender ring, filled lavender with a deep-purple mark when on. Selects are a lavender-fill pill with a lavender chevron. Switches turn lavender when on.
- **Icons (`src/ui/components/Icon.tsx`).** One inline-SVG set on a 16 px grid with round 1.7 px strokes in `currentColor`. `IconTile` puts an icon on a small rounded tile: lavender-soft (default), brand purple (section headings and sheet intros), mint (recoverable or safe), coral (destructive), or neutral (not yet done).
- **Illustrations (`src/ui/components/Illustration.tsx`).** Inline SVG only, no images. `SpotArt` is a glyph on a soft purple disc with one yellow spark, used by every empty state. `WelcomeArt` is the first-run envelopes with a yellow check.
- **Sender rows.** A circular monogram (the initial in lavender on a purple tint), the display name in headline style, and the category plus domain in secondary style. On the right: "about N a month" and "you open X in 10" ("you never open them", "you rarely open them", "you open almost all of them" at the extremes). A checkbox selects the row for bulk actions and tints it with `--color-accent-soft`. Badges are pills: "Suggested" (accent soft), "Unsubscribed" and "Kept" (neutral), and the unsubscribe method as an outlined pill with its icon: "Automatic" (bolt), "By email" (envelope), "Opens a web page" (globe), "No unsubscribe link" (dash). Clicking a row expands it to show the summary, the recommendation and reason ("Not sorted yet" when missing), recent subjects, the row's actions, and icon-led hints.
- **Home.** With no accounts, a welcome card shows `WelcomeArt`, a short explanation, three icon-led steps (add your account, see who emails you most, unsubscribe in a few clicks), and the primary "Add an email account". Otherwise each impact card has an icon tile and its label above a yellow number ("None yet" in secondary text at zero); when nothing has been done, a tinted hint with sparkle art invites the user to start.
- **Settings.** Each group starts with a brand-purple icon tile (sparkles for the AI helper, calendar for how far back to look). Helper availability shows a mint check or a dim dash per helper.
- **Bulk bar.** When at least one sender is selected, a floating bar at the bottom shows "N senders selected", Clear, "Move emails to Trash", and the primary "Unsubscribe from N".
- **Sheets.** Centred modal panels that slide up over a dimmed backdrop, with a title, body, and a footer of Cancel plus one primary or destructive button. Focus moves into the sheet (the dialog itself unless a safe control is marked to receive it) and returns to the opener on close; Tab is trapped; Escape closes unless an action is in flight. Long actions run one sender at a time with a determinate "Unsubscribing 2 of 5…" bar, then the same sheet switches to a results list with an icon and a status word per sender.
- **Add-account sheet.** A three-part step track (Choose, Password, Connect) under "Step N of 3". Provider tiles each carry an icon. The password step opens with a large icon tile and one sentence, then numbered visual steps: each has a purple number badge on an icon tile, joined by a thin line. The icon comes from the step's words (`stepIcon` in `src/ui/format.ts`): shield for 2-Step Verification, globe for opening a page, key for creating a password, clipboard for copy and paste, person for asking an administrator, server for mail server details, and a password field for using the normal password. The provider link is an outlined lavender button with an external-link icon, placed inside the step that says "(button below)". The form step shows a clipboard hint under the app-password field and a lock hint about the Keychain.
- **Confirmations.** Bulk actions open a sheet that lists exactly what will happen, per sender, with the plan in words and the method badge with its icon, one primary confirm button, and Cancel. "Also move their emails to Trash" is a tinted row with a trash tile and a mint "You can recover them from Trash" cue. Trash confirmations lead with a coral trash tile and the email count, then a mint "You can get them back" note, and use the danger fill.
- **Scan progress.** The header bar shows the stage sentence, a Connect, Read, Sort step row (done steps turn mint with a check, the current one is a lavender-tinted pill with its icon, later ones are dim), the percentage, and a purple-to-lavender bar.
- **Toasts.** Top-centre, just below the header (so they never cover navigation or scan progress), with `aria-live="polite"`. Success and info toasts leave after 3 s; error toasts stay 6 s so the fix can be read. Each has a dismiss button. A toast that would duplicate an open results sheet is shown when the sheet closes instead.
- **Feedback.**
  - Errors name the action and the fix ("Couldn't connect to Gmail. Check the app password and try again.") and offer the action in place. Error notices, inline errors (`InlineError`), field problems, and error toasts all lead with the alert icon. Form input is kept after an error.
  - Successes are confirmed with a short toast or an inline state change, tied to the real result, with a check icon.
  - Long work (scans, AI sorting) shows a determinate bar and a stage sentence ("Reading emails from you@gmail.com: 1,200 of 4,000", "Sorting your senders: 3 of 8").
  - Loading uses skeletons shaped like the content. Empty states show a `SpotArt` illustration, then explain why and what to do ("Add an email account to see who emails you most."). Loading, empty, and error are always separate states.
  - Explanations and footnotes use `Hint`: a caption led by an icon (lock for privacy, clock for timing, pin for Keep, info otherwise).
- **Copy.** Use sentence case. Address the user as "you". Be short and specific, and don't joke about their email.

## Motion

- Durations are 120 ms (press), 200 ms (state changes), and 320 ms (sheets and toasts), all with `--ease-out` (`cubic-bezier(0.2, 0.8, 0.2, 1)`).
- Sheets slide up and fade. Toasts slide in from the top and leave after 3 s.
- `prefers-reduced-motion` reduces every animation to an instant change.

## Accessibility baseline

- Everything is reachable and operable by keyboard, with a visible focus ring (`--color-focus`, 3 px).
- Interactive elements are real `<button>`, `<input>`, and `<label>` elements. Icons get labels, and progress and toasts use `aria-live`.
- Information is never carried by colour alone: badges and statuses carry text, and success and error differ by icon (check or alert) as well as by mint or coral.
- Decorative icons and illustrations are `aria-hidden`; the text next to them carries the meaning.
- Text can be zoomed with Cmd and the plus key without breaking the layout.
- The app is always dark, whatever the system appearance.

## App icon

The icon is a blue rounded square (the accent gradient) holding a white envelope and a white check badge. The source is `shell/icon/AppIcon.svg`, built into `shell/AppIcon.icns` (all sizes 16–1024).

## Unresolved

- Final product name: "Inbox Tidy" is to be confirmed with the owner.
