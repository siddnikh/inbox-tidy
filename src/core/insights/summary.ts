import type { HomeSummary } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { monthsSpanned, windowStart } from "./rate.ts";
import { loadSenderRows, matchesFilter } from "./senders.ts";

export interface SummaryOptions {
  accountId?: number;
  now?: number;
}

const LATEST_UNSUBSCRIBE = `a.kind = 'unsubscribe' AND a.status IN ('done', 'opened_in_browser') AND a.id = (
  SELECT MAX(b.id) FROM actions b WHERE b.sender_id = a.sender_id AND b.kind = 'unsubscribe'
)`;

interface Impact {
  senders: number;
  avoided: number | null;
  trashed: number | null;
}

function allAccountsImpact(ctx: AppContext): Impact {
  const unsubscribed = ctx.db
    .query<{ senders: number; avoided: number | null }, []>(
      `SELECT COUNT(*) AS senders, SUM(a.emails_per_month_before) AS avoided
       FROM actions a WHERE ${LATEST_UNSUBSCRIBE}`,
    )
    .get();
  const trashed = ctx.db
    .query<{ total: number | null }, []>(
      "SELECT SUM(messages_affected) AS total FROM actions WHERE kind = 'trash' AND status = 'done'",
    )
    .get();
  return {
    senders: unsubscribed?.senders ?? 0,
    avoided: unsubscribed?.avoided ?? null,
    trashed: trashed?.total ?? null,
  };
}

// Actions are logged per sender, not per account, so a sender's expected monthly saving is
// split across accounts by the share of that sender's stored messages each account holds.
function accountImpact(ctx: AppContext, accountId: number): Impact {
  const unsubscribed = ctx.db
    .query<{ senders: number; avoided: number | null }, [number]>(
      `WITH shares AS (
         SELECT sender_id, SUM(account_id = ?1) * 1.0 / COUNT(*) AS share
         FROM messages GROUP BY sender_id
       )
       SELECT COUNT(*) AS senders, SUM(a.emails_per_month_before * sh.share) AS avoided
       FROM actions a JOIN shares sh ON sh.sender_id = a.sender_id
       WHERE sh.share > 0 AND ${LATEST_UNSUBSCRIBE}`,
    )
    .get(accountId);
  const trashed = ctx.db
    .query<{ total: number }, [number]>(
      "SELECT COUNT(*) AS total FROM messages WHERE account_id = ? AND trashed_at IS NOT NULL",
    )
    .get(accountId);
  return {
    senders: unsubscribed?.senders ?? 0,
    avoided: unsubscribed?.avoided ?? null,
    trashed: trashed?.total ?? null,
  };
}

export function homeSummary(ctx: AppContext, options: SummaryOptions = {}): HomeSummary {
  const now = options.now ?? Date.now();
  const { accountId } = options;
  const { lookbackMonths } = ctx.settings();
  const since = windowStart(lookbackMonths, now);
  const scoped = accountId !== undefined;

  const impact = scoped ? accountImpact(ctx, accountId) : allAccountsImpact(ctx);
  const accounts = ctx.db
    .query<{ count: number; last_scan_at: string | null }, []>(
      "SELECT COUNT(*) AS count, MAX(last_scan_at) AS last_scan_at FROM accounts",
    )
    .get();
  const lastScanAt = scoped
    ? (ctx.db
        .query<{ last_scan_at: string | null }, [number]>(
          "SELECT last_scan_at FROM accounts WHERE id = ?",
        )
        .get(accountId)?.last_scan_at ?? null)
    : (accounts?.last_scan_at ?? null);
  const mail = ctx.db
    .query<
      { total: number; unread: number | null; first_at: string | null },
      [string, number | null]
    >(
      `SELECT COUNT(*) AS total, SUM(is_read = 0) AS unread, MIN(received_at) AS first_at
       FROM messages WHERE trashed_at IS NULL AND received_at >= ?1
         AND (?2 IS NULL OR account_id = ?2)`,
    )
    .get(since, accountId ?? null);

  const rows = loadSenderRows(ctx, { withSubjects: false, now, accountId });
  const totalEmails = mail?.total ?? 0;

  return {
    impact: {
      sendersUnsubscribed: impact.senders,
      emailsAvoidedPerMonth: Math.round(impact.avoided ?? 0),
      emailsTrashed: impact.trashed ?? 0,
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
    lastScanAt,
  };
}
