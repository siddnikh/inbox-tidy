import type { AppContext } from "../../src/core/context.ts";
import type { UnsubscribeMethod } from "../../src/shared/api.ts";

export const DAY_MS = 86_400_000;

export function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export function insertAccount(ctx: AppContext, email: string): number {
  const row = ctx.db
    .query<{ id: number }, [string, string, string]>(
      `INSERT INTO accounts
         (provider, email, imap_host, imap_port, imap_secure, imap_user,
          smtp_host, smtp_port, smtp_secure, smtp_user)
       VALUES ('other', ?, '127.0.0.1', 3143, 0, ?, '127.0.0.1', 3025, 0, ?) RETURNING id`,
    )
    .get(email, email, email);
  if (!row) throw new Error("account insert failed");
  return row.id;
}

export interface SenderSeed {
  address: string;
  displayName?: string | null;
  method?: UnsubscribeMethod;
  target?: string | null;
  accountId?: number | null;
}

export function insertSender(ctx: AppContext, seed: SenderSeed): number {
  const row = ctx.db
    .query<{ id: number }, [string, string | null, string, string, string | null, number | null]>(
      `INSERT INTO senders
         (address, display_name, domain, unsubscribe_method, unsubscribe_target,
          unsubscribe_account_id)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      seed.address,
      seed.displayName ?? null,
      seed.address.split("@")[1] ?? "",
      seed.method ?? "none",
      seed.target ?? null,
      seed.accountId ?? null,
    );
  if (!row) throw new Error("sender insert failed");
  return row.id;
}

export interface MessageSeed {
  accountId: number;
  senderId: number;
  uid: number;
  uidValidity: number;
  mailbox?: string;
  subject?: string;
  receivedAt?: string;
  isRead?: boolean;
  listUnsubscribe?: string | null;
  listUnsubscribePost?: string | null;
}

export function insertMessage(ctx: AppContext, seed: MessageSeed): number {
  const row = ctx.db
    .query<
      { id: number },
      [
        number,
        string,
        number,
        number,
        number,
        string | null,
        string,
        number,
        string | null,
        string | null,
      ]
    >(
      `INSERT INTO messages
         (account_id, mailbox, uid_validity, uid, sender_id, subject, received_at, is_read,
          list_unsubscribe, list_unsubscribe_post)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      seed.accountId,
      seed.mailbox ?? "INBOX",
      seed.uidValidity,
      seed.uid,
      seed.senderId,
      seed.subject ?? null,
      seed.receivedAt ?? daysAgo(1),
      seed.isRead ? 1 : 0,
      seed.listUnsubscribe ?? null,
      seed.listUnsubscribePost ?? null,
    );
  if (!row) throw new Error("message insert failed");
  return row.id;
}

export interface ActionRow {
  sender_id: number;
  kind: string;
  method: string | null;
  status: string;
  detail: string | null;
  emails_per_month_before: number | null;
  messages_affected: number | null;
}

export function actionRows(ctx: AppContext, senderId: number): ActionRow[] {
  return ctx.db
    .query<ActionRow, [number]>(
      `SELECT sender_id, kind, method, status, detail, emails_per_month_before, messages_affected
       FROM actions WHERE sender_id = ? ORDER BY id`,
    )
    .all(senderId);
}

export function trashedUids(ctx: AppContext, senderId: number): number[] {
  return ctx.db
    .query<{ uid: number }, [number]>(
      "SELECT uid FROM messages WHERE sender_id = ? AND trashed_at IS NOT NULL ORDER BY uid",
    )
    .all(senderId)
    .map((r) => r.uid);
}
