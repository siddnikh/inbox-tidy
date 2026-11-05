import type {
  Recommendation,
  SenderCategory,
  SenderFilter,
  SenderRow,
  SenderSort,
  SenderStatus,
  UnsubscribeMethod,
} from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { monthsSpanned, windowStart } from "./rate.ts";

export const SENDER_FILTERS: SenderFilter[] = [
  "suggested",
  "all",
  "can_unsubscribe",
  "kept",
  "unsubscribed",
];
export const SENDER_SORTS: SenderSort[] = ["most", "least_read", "recent"];

const RECENT_SUBJECTS = 5;

const GENERIC_LOCAL_PARTS = new Set([
  "account",
  "accounts",
  "admin",
  "alert",
  "alerts",
  "billing",
  "bounce",
  "contact",
  "customerservice",
  "deals",
  "digest",
  "do-not-reply",
  "donotreply",
  "email",
  "hello",
  "help",
  "hi",
  "info",
  "mail",
  "mailer",
  "marketing",
  "news",
  "newsletter",
  "newsletters",
  "no-reply",
  "no_reply",
  "noreply",
  "notification",
  "notifications",
  "notify",
  "offers",
  "order",
  "orders",
  "postmaster",
  "reply",
  "sales",
  "service",
  "shop",
  "store",
  "support",
  "team",
  "update",
  "updates",
]);

interface SenderDbRow {
  id: number;
  address: string;
  display_name: string | null;
  domain: string;
  unsubscribe_method: string;
  category: string | null;
  summary: string | null;
  recommendation: string | null;
  recommendation_reason: string | null;
  kept_at: string | null;
  total: number | null;
  read_count: number | null;
  first_at: string | null;
  last_at: string | null;
  last_any_at: string | null;
  unsubscribe_status: string | null;
}

export interface LoadOptions {
  senderId?: number;
  withSubjects?: boolean;
  now?: number;
}

export function displayNameFor(name: string | null, address: string, domain: string): string {
  const trimmed = name?.trim() ?? "";
  if (trimmed && !trimmed.includes("@")) return trimmed;
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  if (!local || GENERIC_LOCAL_PARTS.has(local)) return domain || address;
  const words = local
    .replace(/\+.*$/, "")
    .split(/[._-]+/)
    .filter(Boolean);
  if (words.length === 0) return domain || address;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function senderStatus(row: SenderDbRow): SenderStatus {
  if (row.unsubscribe_status === "done" || row.unsubscribe_status === "opened_in_browser") {
    return "unsubscribed";
  }
  return row.kept_at ? "kept" : "active";
}

// Stats cover non-trashed messages inside the lookback window. Unsubscribed senders are kept
// even when all their mail is trashed or gone, so they still appear under "Unsubscribed".
export function loadSenderRows(ctx: AppContext, options: LoadOptions = {}): SenderRow[] {
  const now = options.now ?? Date.now();
  const { lookbackMonths } = ctx.settings();
  const since = windowStart(lookbackMonths, now);
  const one = options.senderId !== undefined;
  const senderClause = one ? "WHERE s.id = $senderId" : "";
  const messageClause = one ? "WHERE sender_id = $senderId" : "";
  const params: Record<string, string | number> = { since };
  if (one) params.senderId = options.senderId as number;

  const rows = ctx.db
    .query<SenderDbRow, [Record<string, string | number>]>(
      `WITH stats AS (
         SELECT sender_id,
           SUM(trashed_at IS NULL AND received_at >= $since) AS total,
           SUM(trashed_at IS NULL AND received_at >= $since AND is_read = 1) AS read_count,
           MIN(CASE WHEN trashed_at IS NULL AND received_at >= $since THEN received_at END) AS first_at,
           MAX(CASE WHEN trashed_at IS NULL AND received_at >= $since THEN received_at END) AS last_at,
           MAX(received_at) AS last_any_at
         FROM messages ${messageClause}
         GROUP BY sender_id
       ),
       latest_unsubscribe AS (
         SELECT a.sender_id, a.status FROM actions a
         WHERE a.kind = 'unsubscribe' AND a.id = (
           SELECT MAX(b.id) FROM actions b WHERE b.sender_id = a.sender_id AND b.kind = 'unsubscribe'
         )
       )
       SELECT s.id, s.address, s.display_name, s.domain, s.unsubscribe_method, s.category,
         s.summary, s.recommendation, s.recommendation_reason, s.kept_at,
         st.total, st.read_count, st.first_at, st.last_at, st.last_any_at,
         lu.status AS unsubscribe_status
       FROM senders s
       LEFT JOIN stats st ON st.sender_id = s.id
       LEFT JOIN latest_unsubscribe lu ON lu.sender_id = s.id
       ${senderClause}`,
    )
    .all(params);

  const subjects = new Map<number, string[]>();
  if (options.withSubjects !== false) {
    const subjectRows = ctx.db
      .query<{ sender_id: number; subject: string }, [Record<string, string | number>]>(
        `SELECT sender_id, subject FROM (
           SELECT sender_id, subject,
             ROW_NUMBER() OVER (PARTITION BY sender_id ORDER BY received_at DESC, id DESC) AS rn
           FROM messages
           WHERE trashed_at IS NULL AND received_at >= $since
             AND subject IS NOT NULL AND TRIM(subject) != ''
             ${one ? "AND sender_id = $senderId" : ""}
         ) WHERE rn <= ${RECENT_SUBJECTS}
         ORDER BY sender_id, rn`,
      )
      .all(params);
    for (const { sender_id, subject } of subjectRows) {
      const list = subjects.get(sender_id) ?? [];
      list.push(subject.trim());
      subjects.set(sender_id, list);
    }
  }

  const result: SenderRow[] = [];
  for (const row of rows) {
    const total = row.total ?? 0;
    const status = senderStatus(row);
    if (!one && total === 0 && status !== "unsubscribed") continue;
    const readCount = row.read_count ?? 0;
    result.push({
      id: row.id,
      address: row.address,
      displayName: displayNameFor(row.display_name, row.address, row.domain),
      domain: row.domain,
      emailsTotal: total,
      emailsPerMonth: row.first_at ? total / monthsSpanned(row.first_at, lookbackMonths, now) : 0,
      unreadCount: total - readCount,
      readPercent: total === 0 ? 0 : Math.round((readCount / total) * 100),
      lastReceivedAt: row.last_at ?? row.last_any_at ?? "",
      category: row.category as SenderCategory | null,
      summary: row.summary,
      recommendation: row.recommendation as Recommendation | null,
      recommendationReason: row.recommendation_reason,
      unsubscribeMethod: row.unsubscribe_method as UnsubscribeMethod,
      status,
      recentSubjects: subjects.get(row.id) ?? [],
    });
  }
  return result;
}

export function matchesFilter(row: SenderRow, filter: SenderFilter): boolean {
  const canUnsubscribe = row.unsubscribeMethod !== "none" && row.status === "active";
  switch (filter) {
    case "suggested":
      return canUnsubscribe && row.recommendation === "unsubscribe";
    case "can_unsubscribe":
      return canUnsubscribe;
    case "kept":
      return row.status === "kept";
    case "unsubscribed":
      return row.status === "unsubscribed";
    case "all":
      return true;
  }
}

function compareRows(sort: SenderSort): (a: SenderRow, b: SenderRow) => number {
  const byVolume = (a: SenderRow, b: SenderRow) => b.emailsTotal - a.emailsTotal;
  const byRecent = (a: SenderRow, b: SenderRow) =>
    a.lastReceivedAt < b.lastReceivedAt ? 1 : a.lastReceivedAt > b.lastReceivedAt ? -1 : 0;
  const byId = (a: SenderRow, b: SenderRow) => a.id - b.id;
  const chain =
    sort === "least_read"
      ? [(a: SenderRow, b: SenderRow) => a.readPercent - b.readPercent, byVolume, byId]
      : sort === "recent"
        ? [byRecent, byVolume, byId]
        : [byVolume, byRecent, byId];
  return (a, b) => {
    for (const compare of chain) {
      const order = compare(a, b);
      if (order !== 0) return order;
    }
    return 0;
  };
}

export interface ListOptions {
  filter?: SenderFilter;
  sort?: SenderSort;
  q?: string;
  now?: number;
}

export function listSenders(ctx: AppContext, options: ListOptions = {}): SenderRow[] {
  const filter = options.filter ?? "all";
  const sort = options.sort ?? "most";
  const q = options.q?.trim().toLowerCase() ?? "";
  return loadSenderRows(ctx, { now: options.now })
    .filter((row) => matchesFilter(row, filter))
    .filter(
      (row) =>
        !q ||
        row.displayName.toLowerCase().includes(q) ||
        row.address.toLowerCase().includes(q) ||
        row.domain.toLowerCase().includes(q),
    )
    .sort(compareRows(sort));
}

export function getSender(ctx: AppContext, senderId: number, now?: number): SenderRow | null {
  return loadSenderRows(ctx, { senderId, now })[0] ?? null;
}

export function setKept(ctx: AppContext, senderId: number, kept: boolean): boolean {
  const result = kept
    ? ctx.db
        .query("UPDATE senders SET kept_at = COALESCE(kept_at, ?) WHERE id = ?")
        .run(new Date().toISOString(), senderId)
    : ctx.db.query("UPDATE senders SET kept_at = NULL WHERE id = ?").run(senderId);
  return result.changes > 0;
}
