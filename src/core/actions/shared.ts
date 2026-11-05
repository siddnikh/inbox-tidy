import type { ActionStatus, UnsubscribeMethod } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { HttpError } from "../http.ts";

export const MAX_SENDERS_PER_REQUEST = 200;
export const UNKNOWN_SENDER_MESSAGE = "That sender is no longer in your list.";

export interface SenderRecord {
  id: number;
  address: string;
  display_name: string | null;
  unsubscribe_method: UnsubscribeMethod;
  unsubscribe_target: string | null;
  unsubscribe_account_id: number | null;
}

export function findSender(ctx: AppContext, id: number): SenderRecord | null {
  return ctx.db
    .query<SenderRecord, [number]>(
      `SELECT id, address, display_name, unsubscribe_method, unsubscribe_target,
              unsubscribe_account_id
       FROM senders WHERE id = ?`,
    )
    .get(id);
}

export function senderName(sender: SenderRecord): string {
  return sender.display_name?.trim() || sender.address;
}

export interface ActionLogEntry {
  senderId: number;
  kind: "unsubscribe" | "trash";
  method?: UnsubscribeMethod | null;
  status: ActionStatus;
  detail: string;
  emailsPerMonthBefore?: number | null;
  messagesAffected?: number | null;
}

export function logAction(ctx: AppContext, entry: ActionLogEntry): void {
  ctx.db
    .query(
      `INSERT INTO actions
         (sender_id, kind, method, status, detail, emails_per_month_before, messages_affected)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.senderId,
      entry.kind,
      entry.method ?? null,
      entry.status,
      entry.detail,
      entry.emailsPerMonthBefore ?? null,
      entry.messagesAffected ?? null,
    );
}

export function emailCount(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "email" : "emails"}`;
}

const UNREADABLE = "Inbox Tidy sent a request it couldn't read. Please try again.";

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, UNREADABLE);
  }
  return body as Record<string, unknown>;
}

// Duplicates are dropped so a sender is never unsubscribed or trashed twice in one request.
export function parseSenderIds(body: unknown): number[] {
  const raw = asObject(body).senderIds;
  if (!Array.isArray(raw)) throw new HttpError(400, UNREADABLE, "senderIds");
  if (raw.length === 0) throw new HttpError(400, "Choose at least one sender first.", "senderIds");
  if (raw.length > MAX_SENDERS_PER_REQUEST) {
    throw new HttpError(
      400,
      `That's a lot of senders at once. Choose ${MAX_SENDERS_PER_REQUEST} or fewer and try again.`,
      "senderIds",
    );
  }
  for (const id of raw) {
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, UNREADABLE, "senderIds");
    }
  }
  return [...new Set(raw as number[])];
}

export function parseBoolean(body: unknown, field: string): boolean {
  const value = asObject(body)[field];
  if (typeof value !== "boolean") throw new HttpError(400, UNREADABLE, field);
  return value;
}

export function parseOlderThanDays(body: unknown): number {
  const value = asObject(body).olderThanDays;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3650) {
    throw new HttpError(
      400,
      "Choose how old the emails should be, between 0 days and 10 years.",
      "olderThanDays",
    );
  }
  return value;
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  };
}
