import type { AiClient, AskOptions } from "../../src/core/ai/cli.ts";
import type { AppContext } from "../../src/core/context.ts";
import type { UnsubscribeMethod } from "../../src/shared/api.ts";

const DAY_MS = 86_400_000;

export function daysAgo(days: number, now = Date.now()): string {
  return new Date(now - days * DAY_MS).toISOString();
}

export function addAccount(ctx: AppContext, email = "me@example.test", lastScanAt?: string) {
  const row = ctx.db
    .query<{ id: number }, [string, string | null]>(
      `INSERT INTO accounts (provider, email, imap_host, imap_port, imap_secure, imap_user, last_scan_at)
       VALUES ('other', ?, '127.0.0.1', 3143, 0, 'qa', ?) RETURNING id`,
    )
    .get(email, lastScanAt ?? null);
  return row?.id as number;
}

export interface SenderFixture {
  address: string;
  name?: string | null;
  method?: UnsubscribeMethod;
  keptAt?: string;
  recommendation?: string;
  category?: string;
  aiUpdatedAt?: string;
}

export function addSender(ctx: AppContext, s: SenderFixture): number {
  const row = ctx.db
    .query<{ id: number }, (string | null)[]>(
      `INSERT INTO senders (address, display_name, domain, unsubscribe_method, kept_at,
         recommendation, category, ai_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      s.address,
      s.name ?? null,
      s.address.split("@")[1] ?? "",
      s.method ?? "none",
      s.keptAt ?? null,
      s.recommendation ?? null,
      s.category ?? null,
      s.aiUpdatedAt ?? null,
    );
  return row?.id as number;
}

export interface MessageFixture {
  daysAgo: number;
  read?: boolean;
  subject?: string | null;
  trashed?: boolean;
}

let nextUid = 1;

export function addMessages(
  ctx: AppContext,
  accountId: number,
  senderId: number,
  messages: MessageFixture[],
  now = Date.now(),
): void {
  const insert = ctx.db.query(
    `INSERT INTO messages (account_id, mailbox, uid_validity, uid, sender_id, subject, received_at,
       is_read, trashed_at)
     VALUES (?, 'INBOX', 1, ?, ?, ?, ?, ?, ?)`,
  );
  ctx.db.transaction(() => {
    for (const m of messages) {
      insert.run(
        accountId,
        nextUid++,
        senderId,
        m.subject === undefined ? `Subject ${nextUid}` : m.subject,
        daysAgo(m.daysAgo, now),
        m.read ? 1 : 0,
        m.trashed ? daysAgo(0, now) : null,
      );
    }
  })();
}

export function addAction(
  ctx: AppContext,
  a: {
    senderId: number;
    kind: "unsubscribe" | "trash";
    status: string;
    emailsPerMonthBefore?: number;
    messagesAffected?: number;
  },
): void {
  ctx.db
    .query(
      `INSERT INTO actions (sender_id, kind, method, status, emails_per_month_before, messages_affected)
       VALUES (?, ?, 'one_click', ?, ?, ?)`,
    )
    .run(a.senderId, a.kind, a.status, a.emailsPerMonthBefore ?? null, a.messagesAffected ?? null);
}

export interface RecordedCall {
  prompt: string;
  options: AskOptions | undefined;
}

export function scriptedAi(
  respond: (prompt: string, call: number) => string | Promise<string>,
): AiClient & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    availability: async () => [
      { id: "claude", label: "Claude", available: true, path: "/fake/claude" },
      { id: "codex", label: "Codex", available: false, path: null },
    ],
    ask: async (prompt, options) => {
      calls.push({ prompt, options });
      return { provider: "claude", text: await respond(prompt, calls.length), durationMs: 1 };
    },
  };
}

export function senderBlock(prompt: string): Record<string, unknown>[] {
  const start = prompt.lastIndexOf("<<<SENDERS") + "<<<SENDERS".length;
  return JSON.parse(prompt.slice(start, prompt.lastIndexOf("SENDERS>>>")));
}

export function idsInPrompt(prompt: string): number[] {
  return senderBlock(prompt).map((s) => s.id as number);
}
