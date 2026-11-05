import type { HomeSummary } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { monthsSpanned, windowStart } from "./rate.ts";
import { loadSenderRows, matchesFilter } from "./senders.ts";

export function homeSummary(ctx: AppContext, now = Date.now()): HomeSummary {
  const { lookbackMonths } = ctx.settings();
  const since = windowStart(lookbackMonths, now);

  const impact = ctx.db
    .query<{ senders: number; avoided: number | null }, []>(
      `SELECT COUNT(*) AS senders, SUM(a.emails_per_month_before) AS avoided
       FROM actions a
       WHERE a.kind = 'unsubscribe' AND a.status IN ('done', 'opened_in_browser') AND a.id = (
         SELECT MAX(b.id) FROM actions b WHERE b.sender_id = a.sender_id AND b.kind = 'unsubscribe'
       )`,
    )
    .get();
  const trashed = ctx.db
    .query<{ total: number | null }, []>(
      "SELECT SUM(messages_affected) AS total FROM actions WHERE kind = 'trash' AND status = 'done'",
    )
    .get();
  const accounts = ctx.db
    .query<{ count: number; last_scan_at: string | null }, []>(
      "SELECT COUNT(*) AS count, MAX(last_scan_at) AS last_scan_at FROM accounts",
    )
    .get();
  const mail = ctx.db
    .query<{ total: number; unread: number | null; first_at: string | null }, [string]>(
      `SELECT COUNT(*) AS total, SUM(is_read = 0) AS unread, MIN(received_at) AS first_at
       FROM messages WHERE trashed_at IS NULL AND received_at >= ?`,
    )
    .get(since);

  const rows = loadSenderRows(ctx, { withSubjects: false, now });
  const totalEmails = mail?.total ?? 0;

  return {
    impact: {
      sendersUnsubscribed: impact?.senders ?? 0,
      emailsAvoidedPerMonth: Math.round(impact?.avoided ?? 0),
      emailsTrashed: trashed?.total ?? 0,
    },
    inbox: {
      accounts: accounts?.count ?? 0,
      totalEmails,
      emailsPerMonth: mail?.first_at
        ? Math.round(totalEmails / monthsSpanned(mail.first_at, lookbackMonths, now))
        : 0,
      unreadPercent: totalEmails === 0 ? 0 : Math.round(((mail?.unread ?? 0) / totalEmails) * 100),
      senders: rows.filter((r) => r.emailsTotal > 0).length,
      canUnsubscribe: rows.filter((r) => matchesFilter(r, "can_unsubscribe")).length,
      suggested: rows.filter((r) => matchesFilter(r, "suggested")).length,
    },
    lookbackMonths,
    lastScanAt: accounts?.last_scan_at ?? null,
  };
}
