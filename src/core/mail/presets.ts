import type { MailProviderId, ProviderPreset } from "../../shared/api.ts";

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    steps: [
      "Make sure 2-Step Verification is turned on for your Google account.",
      "Open the App passwords page (button below) and sign in.",
      'Type "Inbox Tidy" as the name and press Create.',
      "Copy the 16-letter password Google shows and paste it here.",
    ],
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    appPasswordUrl: "https://account.apple.com/account/manage",
    steps: [
      "Open your Apple Account page (button below) and sign in.",
      "Choose Sign-In and Security, then App-Specific Passwords.",
      'Press Generate, type "Inbox Tidy", and press Create.',
      "Copy the password Apple shows and paste it here.",
    ],
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    appPasswordUrl: "https://login.yahoo.com/account/security",
    steps: [
      "Open Yahoo Account Security (button below) and sign in.",
      "Choose Generate app password (it may be under External connections).",
      'Type "Inbox Tidy" and press Generate password.',
      "Copy the password Yahoo shows and paste it here.",
    ],
  },
  {
    id: "rediffmail_pro",
    label: "Rediffmail Pro",
    imap: { host: "imap.rediffmailpro.com", port: 993, secure: true },
    smtp: { host: "smtp.rediffmailpro.com", port: 465, secure: true },
    appPasswordUrl: null,
    steps: [
      "Ask your Rediffmail Pro administrator to turn on IMAP access (Admin → Other Services → Complete Mail Sync).",
      "Use your normal Rediffmail Pro email address and password here.",
    ],
    note: "Free @rediffmail.com accounts don't allow this kind of connection. Only Rediffmail Pro works.",
  },
  {
    id: "other",
    label: "Other",
    imap: null,
    smtp: null,
    appPasswordUrl: null,
    steps: [
      "Find your provider's IMAP and SMTP settings on their help pages.",
      "If your provider offers app passwords, create one and use it here.",
    ],
  },
];

export function presetFor(id: MailProviderId): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

export function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}
