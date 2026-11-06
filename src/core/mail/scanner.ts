import type { Database } from "bun:sqlite";
import type { FetchMessageObject, ImapFlow } from "imapflow";
import type { ScanStatus } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { sortSenders } from "../insights/sort.ts";
import { type AccountRow, listAccounts, openImap } from "./connection.ts";
import { describeError, plainMailError } from "./errors.ts";
import { decodeEncodedWords, parseHeaderBlock } from "./headers.ts";
import { bestUnsubscribe } from "./unsubscribe-header.ts";

const MAILBOX = "INBOX";
const FETCH_CHUNK = 500;
const FLAG_CHUNK = 2000;
const UNSUBSCRIBE_HEADERS = ["list-unsubscribe", "list-unsubscribe-post"];

export interface ScannedMessage {
  uid: number;
  messageId: string | null;
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  receivedAt: string;
  isRead: boolean;
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
}

export interface ReadProgress {
  processed: number;
  total: number;
}

interface ScanRun {
  status: ScanStatus;
  promise: Promise<ScanStatus> | null;
  queued: boolean;
}

const runs = new WeakMap<AppContext, ScanRun>();

function idleStatus(): ScanStatus {
  return {
    state: "idle",
    stage: null,
    accountEmail: null,
    processed: 0,
    total: 0,
    message: "",
    startedAt: null,
    finishedAt: null,
    errors: [],
  };
}

function runFor(ctx: AppContext): ScanRun {
  let run = runs.get(ctx);
  if (!run) {
    run = { status: idleStatus(), promise: null, queued: false };
    runs.set(ctx, run);
  }
  return run;
}

export function scanStatus(ctx: AppContext): ScanStatus {
  return structuredClone(runFor(ctx).status);
}

// Starts a background scan of every account. Asking while one runs queues one more full pass
// after it, so an account added mid-scan is never skipped.
export function startScan(ctx: AppContext): ScanStatus {
  const run = runFor(ctx);
  if (run.promise) {
    run.queued = true;
    return scanStatus(ctx);
  }
  run.promise = (async () => {
    let last: ScanStatus;
    do {
      run.queued = false;
      run.status = {
        ...idleStatus(),
        state: "running",
        stage: "connecting",
        message: "Getting ready to read your email…",
        startedAt: new Date().toISOString(),
      };
      last = await runScan(ctx, run);
    } while (run.queued);
    return last;
  })().finally(() => {
    run.promise = null;
  });
  return scanStatus(ctx);
}

export function waitForScan(ctx: AppContext): Promise<ScanStatus> {
  return runFor(ctx).promise ?? Promise.resolve(scanStatus(ctx));
}

const count = (n: number) => n.toLocaleString("en-US");

function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

async function runScan(ctx: AppContext, run: ScanRun): Promise<ScanStatus> {
  const update = (patch: Partial<ScanStatus>) => Object.assign(run.status, patch);
  const finish = (state: "done" | "failed", message: string) => {
    update({
      state,
      stage: "done",
      accountEmail: null,
      message,
      finishedAt: new Date().toISOString(),
    });
    return scanStatus(ctx);
  };

  try {
    const accounts = listAccounts(ctx);
    if (accounts.length === 0) return finish("done", "There are no email accounts to scan yet.");

    let succeeded = 0;
    for (const account of accounts) {
      update({
        stage: "connecting",
        accountEmail: account.email,
        processed: 0,
        total: 0,
        message: `Connecting to ${account.email}…`,
      });
      try {
        await syncAccount(ctx, account, ({ processed, total }) =>
          update({
            stage: "reading",
            processed,
            total,
            message:
              total === 0
                ? `Checking ${account.email} for changes…`
                : `Reading emails from ${account.email} (${count(processed)} of ${count(total)})`,
          }),
        );
        ctx.db
          .query("UPDATE accounts SET last_scan_at = ?, last_scan_error = NULL WHERE id = ?")
          .run(new Date().toISOString(), account.id);
        succeeded++;
      } catch (error) {
        if (!accountExists(ctx.db, account.id)) continue;
        console.error(`Scanning ${account.email} failed:`, describeError(error));
        const { message } = plainMailError(error, account.provider, account.imap_host, "scan");
        ctx.db
          .query("UPDATE accounts SET last_scan_error = ? WHERE id = ?")
          .run(message, account.id);
        run.status.errors.push({ accountEmail: account.email, message });
      }
    }

    if (succeeded === 0) {
      const [only] = run.status.errors;
      return finish(
        "failed",
        run.status.errors.length === 1 && only
          ? `Couldn't read ${only.accountEmail}. ${only.message}`
          : "Couldn't read any of your email accounts. Open Accounts to see what went wrong.",
      );
    }

    update({
      stage: "understanding",
      accountEmail: null,
      processed: 0,
      total: 0,
      message: "Sorting your senders…",
    });
    let needed = false;
    let usedAi = false;
    try {
      const result = await sortSenders(ctx, ({ done, total }) => {
        if (total > 0) needed = true;
        update({
          processed: done,
          total,
          message: `Sorting your senders (${count(done)} of ${count(total)})`,
        });
      });
      usedAi = result.usedAi;
      if (result.sorted > 0) needed = true;
    } catch (error) {
      console.error("Sorting senders failed:", describeError(error));
      needed = true;
    }

    return finish("done", doneMessage(ctx, needed && !usedAi, run.status.errors));
  } catch (error) {
    console.error("Scan failed:", describeError(error));
    return finish(
      "failed",
      "Inbox Tidy ran into a problem while reading your email. Please try again.",
    );
  }
}

function doneMessage(ctx: AppContext, withoutAi: boolean, errors: ScanStatus["errors"]): string {
  const totals = ctx.db
    .query<{ emails: number; senders: number }, []>(
      `SELECT COUNT(*) AS emails, COUNT(DISTINCT sender_id) AS senders
       FROM messages WHERE trashed_at IS NULL`,
    )
    .get() ?? { emails: 0, senders: 0 };
  const months = ctx.settings().lookbackMonths;
  const parts = [
    totals.emails === 0
      ? `Finished. There are no emails in your inbox from the last ${plural(months, "month", "months")}.`
      : `Finished. You got ${plural(totals.emails, "email", "emails")} from ${plural(totals.senders, "sender", "senders")} in the last ${plural(months, "month", "months")}.`,
  ];
  if (withoutAi) parts.push("Sorted without the AI helper this time.");
  if (errors.length === 1 && errors[0]) parts.push(`Couldn't read ${errors[0].accountEmail}.`);
  if (errors.length > 1) parts.push(`Couldn't read ${count(errors.length)} accounts.`);
  if (errors.length > 0) parts.push("Open Accounts to see what went wrong.");
  return parts.join(" ");
}

function accountExists(db: Database, id: number): boolean {
  return db.query("SELECT 1 FROM accounts WHERE id = ?").get(id) !== null;
}

export function lookbackStart(months: number, now = new Date()): Date {
  const since = new Date(now);
  since.setMonth(since.getMonth() - months);
  return since;
}

// Compacts sorted UIDs into an IMAP sequence set: [1,2,3,7,9,10] -> "1:3,7,9:10".
export function uidRanges(uids: number[]): string {
  const sorted = [...uids].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = start;
  for (const uid of sorted.slice(1)) {
    if (prev !== undefined && uid === prev + 1) {
      prev = uid;
      continue;
    }
    if (start !== undefined) parts.push(start === prev ? `${start}` : `${start}:${prev}`);
    start = uid;
    prev = uid;
  }
  if (start !== undefined) parts.push(start === prev ? `${start}` : `${start}:${prev}`);
  return parts.join(",");
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isoDate(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanText(value: string | undefined): string | null {
  if (!value) return null;
  const text = decodeEncodedWords(value).replace(/\s+/g, " ").trim();
  return text || null;
}

export function toScannedMessage(message: FetchMessageObject): ScannedMessage | null {
  const from = message.envelope?.from?.find((a) => a.address?.includes("@"));
  const fromAddress = from?.address?.trim().toLowerCase();
  if (!fromAddress) return null;
  const headers = parseHeaderBlock(message.headers);
  return {
    uid: message.uid,
    messageId: message.envelope?.messageId ?? null,
    fromAddress,
    fromName: cleanText(from?.name),
    subject: cleanText(message.envelope?.subject),
    receivedAt:
      isoDate(message.internalDate) ?? isoDate(message.envelope?.date) ?? new Date().toISOString(),
    isRead: message.flags?.has("\\Seen") ?? false,
    listUnsubscribe: headers.get("list-unsubscribe") || null,
    listUnsubscribePost: headers.get("list-unsubscribe-post") || null,
  };
}

// Writes one batch in a single transaction. Sender name and unsubscribe option always come from
// the newest message seen so far, whatever order batches and scans arrive in.
export function storeMessages(
  db: Database,
  accountId: number,
  mailbox: string,
  uidValidity: number,
  messages: ScannedMessage[],
): number {
  const upsertSender = db.query<{ id: number }, [string, string | null, string, string | null]>(
    `INSERT INTO senders (address, display_name, domain, display_name_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       display_name = CASE
         WHEN excluded.display_name IS NOT NULL
           AND (senders.display_name_at IS NULL OR excluded.display_name_at >= senders.display_name_at)
         THEN excluded.display_name ELSE senders.display_name END,
       display_name_at = CASE
         WHEN excluded.display_name IS NOT NULL
           AND (senders.display_name_at IS NULL OR excluded.display_name_at >= senders.display_name_at)
         THEN excluded.display_name_at ELSE senders.display_name_at END
     RETURNING id`,
  );
  const exists = db.query(
    "SELECT 1 FROM messages WHERE account_id = ? AND mailbox = ? AND uid_validity = ? AND uid = ?",
  );
  const insertMessage = db.query(
    `INSERT INTO messages
       (account_id, mailbox, uid_validity, uid, message_id, sender_id, subject, received_at,
        is_read, list_unsubscribe, list_unsubscribe_post)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateUnsubscribe = db.query(
    `UPDATE senders SET unsubscribe_method = ?, unsubscribe_target = ?, unsubscribe_account_id = ?,
       unsubscribe_at = ?
     WHERE id = ? AND (unsubscribe_at IS NULL OR unsubscribe_at <= ?)`,
  );

  let inserted = 0;
  db.transaction(() => {
    for (const m of messages) {
      if (exists.get(accountId, mailbox, uidValidity, m.uid)) continue;
      const domain = m.fromAddress.slice(m.fromAddress.lastIndexOf("@") + 1);
      const sender = upsertSender.get(
        m.fromAddress,
        m.fromName,
        domain,
        m.fromName ? m.receivedAt : null,
      );
      if (!sender) continue;
      insertMessage.run(
        accountId,
        mailbox,
        uidValidity,
        m.uid,
        m.messageId,
        sender.id,
        m.subject,
        m.receivedAt,
        m.isRead ? 1 : 0,
        m.listUnsubscribe,
        m.listUnsubscribePost,
      );
      inserted++;
      if (m.listUnsubscribe) {
        const best = bestUnsubscribe(m.listUnsubscribe, m.listUnsubscribePost);
        updateUnsubscribe.run(
          best.method,
          best.target,
          accountId,
          m.receivedAt,
          sender.id,
          m.receivedAt,
        );
      }
    }
  })();
  return inserted;
}

async function refreshFlags(
  client: ImapFlow,
  db: Database,
  accountId: number,
  uidValidity: number,
  known: { uid: number; is_read: number }[],
): Promise<void> {
  const update = db.query(
    `UPDATE messages SET is_read = ?
     WHERE account_id = ? AND mailbox = ? AND uid_validity = ? AND uid = ?`,
  );
  const wasRead = new Map(known.map((k) => [k.uid, k.is_read === 1]));
  for (const batch of chunks(
    known.map((k) => k.uid),
    FLAG_CHUNK,
  )) {
    const changed: { uid: number; read: boolean }[] = [];
    for await (const msg of client.fetch(
      uidRanges(batch),
      { uid: true, flags: true },
      { uid: true },
    )) {
      const read = msg.flags?.has("\\Seen") ?? false;
      if (wasRead.get(msg.uid) !== read) changed.push({ uid: msg.uid, read });
    }
    if (changed.length === 0) continue;
    db.transaction(() => {
      for (const c of changed) update.run(c.read ? 1 : 0, accountId, MAILBOX, uidValidity, c.uid);
    })();
  }
}

// Brings one account's INBOX rows in line with the server over the lookback window.
export async function syncAccount(
  ctx: AppContext,
  account: AccountRow,
  onProgress: (progress: ReadProgress) => void,
): Promise<void> {
  const { db } = ctx;
  const client = await openImap(ctx, account);
  try {
    const box = await client.mailboxOpen(MAILBOX, { readOnly: true });
    const uidValidity = Number(box.uidValidity);
    const state = db
      .query<{ uid_validity: number; last_uid: number }, [number, string]>(
        "SELECT uid_validity, last_uid FROM mailbox_state WHERE account_id = ? AND mailbox = ?",
      )
      .get(account.id, MAILBOX);
    // Messages the user moved to Trash through Inbox Tidy stay as history in every case.
    if (state && state.uid_validity !== uidValidity) {
      db.query(
        "DELETE FROM messages WHERE account_id = ? AND mailbox = ? AND trashed_at IS NULL",
      ).run(account.id, MAILBOX);
    }

    const found = await client.search(
      { since: lookbackStart(ctx.settings().lookbackMonths) },
      { uid: true },
    );
    if (found === false) throw new Error("INBOX search failed");
    const onServer = new Set(found ?? []);

    const known = db
      .query<{ uid: number; is_read: number }, [number, string, number]>(
        `SELECT uid, is_read FROM messages
         WHERE account_id = ? AND mailbox = ? AND uid_validity = ? AND trashed_at IS NULL`,
      )
      .all(account.id, MAILBOX, uidValidity);
    const knownUids = new Set(known.map((k) => k.uid));

    onProgress({ processed: 0, total: 0 });

    // Gone from the server, or now older than the lookback window.
    const gone = known.filter((k) => !onServer.has(k.uid)).map((k) => k.uid);
    const remove = db.query(
      `DELETE FROM messages
       WHERE account_id = ? AND mailbox = ? AND uid_validity = ? AND uid = ? AND trashed_at IS NULL`,
    );
    db.transaction(() => {
      for (const uid of gone) remove.run(account.id, MAILBOX, uidValidity, uid);
    })();

    await refreshFlags(
      client,
      db,
      account.id,
      uidValidity,
      known.filter((k) => onServer.has(k.uid)),
    );

    const fresh = [...onServer].filter((uid) => !knownUids.has(uid)).sort((a, b) => a - b);
    let processed = 0;
    onProgress({ processed, total: fresh.length });
    for (const batch of chunks(fresh, FETCH_CHUNK)) {
      const scanned: ScannedMessage[] = [];
      for await (const msg of client.fetch(
        uidRanges(batch),
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          headers: UNSUBSCRIBE_HEADERS,
        },
        { uid: true },
      )) {
        const parsed = toScannedMessage(msg);
        if (parsed) scanned.push(parsed);
      }
      storeMessages(db, account.id, MAILBOX, uidValidity, scanned);
      processed += batch.length;
      onProgress({ processed, total: fresh.length });
    }

    let highest = state && state.uid_validity === uidValidity ? state.last_uid : 0;
    for (const uid of onServer) if (uid > highest) highest = uid;
    db.query(
      `INSERT INTO mailbox_state (account_id, mailbox, uid_validity, last_uid) VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, mailbox) DO UPDATE SET
         uid_validity = excluded.uid_validity, last_uid = excluded.last_uid`,
    ).run(account.id, MAILBOX, uidValidity, highest);

    await client.logout();
  } catch (error) {
    client.close();
    throw error;
  }
}
