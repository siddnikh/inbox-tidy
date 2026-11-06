import type {
  ActionStatus,
  HomeSummary,
  MailProviderId,
  Recommendation,
  ScanStatus,
  SenderCategory,
  UnsubscribeMethod,
} from "../shared/api.ts";
import type { IconName } from "./components/Icon.tsx";

const grouped = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
  return grouped.format(Math.round(n));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

function roundForHumans(n: number): number {
  if (n < 1000) return Math.round(n / 10) * 10;
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / magnitude) * magnitude;
}

// Exact below 100, otherwise "about 1,200" (two significant figures, or tens under 1,000).
export function approxCount(n: number): string {
  const value = Math.max(0, n);
  if (value < 100) return formatNumber(value);
  return `about ${formatNumber(roundForHumans(value))}`;
}

export function monthlyRate(perMonth: number): string {
  if (perMonth < 1) return "less than 1 a month";
  if (perMonth < 100) return `about ${formatNumber(perMonth)} a month`;
  return `about ${formatNumber(roundForHumans(perMonth))} a month`;
}

export function readShare(readPercent: number): string {
  if (readPercent <= 0) return "you never open them";
  if (readPercent < 5) return "you rarely open them";
  if (readPercent >= 100) return "you open all of them";
  if (readPercent >= 95) return "you open almost all of them";
  const tens = Math.min(9, Math.max(1, Math.round(readPercent / 10)));
  return `you open ${tens} in 10`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "at an unknown time";
  const diff = now - then;
  if (diff < 45_000) return "just now";
  if (diff < 90_000) return "a minute ago";
  if (diff < 45 * MINUTE) return `${Math.round(diff / MINUTE)} minutes ago`;
  if (diff < 90 * MINUTE) return "an hour ago";
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
  if (days === 0) return `${Math.round(diff / HOUR)} hours ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return sameYear ? `on ${day}` : `on ${day} ${date.getFullYear()}`;
}

const PROVIDER_LABELS: Record<MailProviderId, string> = {
  gmail: "Gmail",
  icloud: "iCloud Mail",
  yahoo: "Yahoo Mail",
  rediffmail_pro: "Rediffmail Pro",
  other: "Other email",
};

export function providerLabel(id: MailProviderId): string {
  return PROVIDER_LABELS[id] ?? "Email";
}

const CATEGORY_LABELS: Record<SenderCategory, string> = {
  shopping: "Shopping",
  news: "News",
  social: "Social",
  bills: "Bills",
  travel: "Travel",
  work: "Work",
  personal: "Personal",
  other: "Other",
};

export function categoryLabel(category: SenderCategory | null): string | null {
  return category ? CATEGORY_LABELS[category] : null;
}

const METHOD_BADGES: Record<UnsubscribeMethod, string> = {
  one_click: "Automatic",
  mailto: "By email",
  web: "Opens a web page",
  none: "No unsubscribe link",
};

export function methodBadge(method: UnsubscribeMethod): string {
  return METHOD_BADGES[method];
}

const METHOD_ICONS: Record<UnsubscribeMethod, IconName> = {
  one_click: "bolt",
  mailto: "mail",
  web: "globe",
  none: "skip",
};

export function methodIcon(method: UnsubscribeMethod): IconName {
  return METHOD_ICONS[method];
}

// Provider steps arrive as plain sentences, so the picture for each is chosen from its words.
const STEP_ICONS: [RegExp, IconName][] = [
  [/2-step|two-factor|verification/, "shield"],
  [/administrator|\badmin\b/, "user"],
  [/\bcopy\b|\bpaste\b/, "clipboard"],
  [/imap|smtp|server|help pages/, "server"],
  [/normal .*password/, "field"],
  [/\bopen\b|sign in/, "globe"],
  [/\btype\b|create|generate|app password|app-specific/, "key"],
];

export function stepIcon(step: string): IconName {
  const text = step.toLowerCase();
  return STEP_ICONS.find(([pattern]) => pattern.test(text))?.[1] ?? "info";
}

const METHOD_PLANS: Record<UnsubscribeMethod, string> = {
  one_click: "We'll unsubscribe you automatically",
  mailto: "We'll send them an email for you",
  web: "We'll open their page in your browser. You press the button there.",
  none: "No unsubscribe option, so this one is skipped",
};

export function methodPlan(method: UnsubscribeMethod): string {
  return METHOD_PLANS[method];
}

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  unsubscribe: "Suggested: unsubscribe",
  keep: "Suggested: keep",
  review: "Worth a look",
};

export function recommendationLabel(rec: Recommendation | null): string {
  return rec ? RECOMMENDATION_LABELS[rec] : "Not sorted yet";
}

const STATUS_LABELS: Record<ActionStatus, string> = {
  done: "Done",
  opened_in_browser: "Opened in your browser",
  failed: "Didn't work",
  not_available: "Skipped",
};

export function actionStatusLabel(status: ActionStatus): string {
  return STATUS_LABELS[status];
}

export function monogram(name: string, address: string): string {
  const source = `${name} ${address}`;
  const match = source.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : "?";
}

export function inboxOverview(summary: HomeSummary): string {
  const { inbox, lookbackMonths } = summary;
  const span = `In the last ${plural(lookbackMonths, "month")}`;
  if (inbox.totalEmails === 0) {
    return summary.lastScanAt
      ? `${span} we didn't find any emails in your inbox.`
      : "Your first scan hasn't finished yet. Your inbox overview appears here when it does.";
  }
  const emails = inbox.totalEmails === 1 ? "1 email" : `${approxCount(inbox.totalEmails)} emails`;
  const unread = Math.round(inbox.unreadPercent);
  const unreadSentence = unread <= 0 ? "You opened all of them." : `You left ${unread}% unread.`;
  return `${span} you got ${emails} from ${plural(inbox.senders, "sender")}. ${unreadSentence}`;
}

// Returns a 0–1 fraction, or null (an indeterminate bar) until the scan reports a total and
// its first finished item: sorting runs as one long AI call, and a bar parked at 0% looks frozen.
export function scanFraction(status: ScanStatus): number | null {
  if (status.total <= 0 || status.processed <= 0) return null;
  return Math.min(1, Math.max(0, status.processed / status.total));
}
