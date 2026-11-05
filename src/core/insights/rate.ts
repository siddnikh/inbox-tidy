import type { AppContext } from "../context.ts";

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.44;

// One definition of "emails a month", shared by the senders list, the home screen, and the
// before-unsubscribe snapshot, so the impact numbers always agree with what the user saw.
export function monthsSpanned(
  firstReceivedIso: string,
  lookbackMonths: number,
  now = Date.now(),
): number {
  const days = (now - Date.parse(firstReceivedIso)) / DAY_MS;
  return Math.min(Math.max(days / MONTH_DAYS, 1), lookbackMonths);
}

export function emailsPerMonth(ctx: AppContext, senderId: number, now = Date.now()): number {
  const { lookbackMonths } = ctx.settings();
  const since = new Date(now - lookbackMonths * MONTH_DAYS * DAY_MS).toISOString();
  const row = ctx.db
    .query<{ total: number; first: string | null }, [number, string]>(
      `SELECT COUNT(*) AS total, MIN(received_at) AS first FROM messages
       WHERE sender_id = ? AND trashed_at IS NULL AND received_at >= ?`,
    )
    .get(senderId, since);
  if (!row?.first || row.total === 0) return 0;
  return row.total / monthsSpanned(row.first, lookbackMonths, now);
}
