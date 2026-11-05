import type { ImapFlow } from "imapflow";
import type { ActionResult } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { findTrashMailbox, getAccount, openImap } from "../mail/connection.ts";
import {
  emailCount,
  findSender,
  logAction,
  senderName,
  serialQueue,
  UNKNOWN_SENDER_MESSAGE,
} from "./shared.ts";

export interface TrashOptions {
  olderThanDays: number;
  onlyRead: boolean;
}

export interface TrashOutcome {
  result: ActionResult;
  moved: number;
  failed: number;
  needsRescan: boolean;
}

interface Candidate {
  id: number;
  account_id: number;
  mailbox: string;
  uid_validity: number;
  uid: number;
}

interface Tally {
  moved: number;
  failed: number;
  needsRescan: boolean;
}

const DAY_MS = 86_400_000;
const MOVE_CHUNK = 500;

// Concurrent trash runs on one account would race to create a missing Trash folder.
const accountQueues = new WeakMap<AppContext, Map<number, ReturnType<typeof serialQueue>>>();

function accountQueue(ctx: AppContext, accountId: number): ReturnType<typeof serialQueue> {
  let queues = accountQueues.get(ctx);
  if (!queues) {
    queues = new Map();
    accountQueues.set(ctx, queues);
  }
  let queue = queues.get(accountId);
  if (!queue) {
    queue = serialQueue();
    queues.set(accountId, queue);
  }
  return queue;
}

function groupBy<T>(items: T[], key: (item: T) => string | number): Map<string | number, T[]> {
  const groups = new Map<string | number, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function matchingMessages(ctx: AppContext, senderId: number, options: TrashOptions): Candidate[] {
  const where = ["sender_id = ?", "trashed_at IS NULL"];
  const params: (number | string)[] = [senderId];
  if (options.olderThanDays > 0) {
    where.push("received_at < ?");
    params.push(new Date(Date.now() - options.olderThanDays * DAY_MS).toISOString());
  }
  if (options.onlyRead) where.push("is_read = 1");
  return ctx.db
    .query<Candidate, (number | string)[]>(
      `SELECT id, account_id, mailbox, uid_validity, uid FROM messages
       WHERE ${where.join(" AND ")} ORDER BY account_id, mailbox, uid`,
    )
    .all(...params);
}

function markTrashed(ctx: AppContext, ids: number[]): void {
  const now = new Date().toISOString();
  const update = ctx.db.query("UPDATE messages SET trashed_at = ? WHERE id = ?");
  ctx.db.transaction(() => {
    for (const id of ids) update.run(now, id);
  })();
}

async function moveChunk(
  client: ImapFlow,
  uids: number[],
  trashPath: string,
): Promise<{ moved: Set<number>; remaining: number }> {
  const range = uids.join(",");
  let mapped: number[] | null = null;
  try {
    const result = await client.messageMove(range, trashPath, { uid: true });
    if (result !== false && result.uidMap) {
      const requested = new Set(uids);
      mapped = [...result.uidMap.keys()].filter((uid) => requested.has(uid));
    }
  } catch (error) {
    console.error("Moving emails to Trash failed:", error);
  }
  if (mapped && mapped.length === uids.length) return { moved: new Set(mapped), remaining: 0 };

  // Without a UID map, the only safe evidence of a move is that the email left the source mailbox.
  const found = await client.search({ uid: range }, { uid: true });
  if (!Array.isArray(found)) throw new Error("Could not check which emails were moved");
  const still = new Set(found);
  const moved = new Set(mapped ?? uids.filter((uid) => !still.has(uid)));
  return { moved, remaining: uids.filter((uid) => still.has(uid) && !moved.has(uid)).length };
}

async function trashInAccount(
  ctx: AppContext,
  accountId: number,
  messages: Candidate[],
): Promise<Tally> {
  const tally: Tally = { moved: 0, failed: 0, needsRescan: false };
  let handled = 0;
  let client: ImapFlow | null = null;
  try {
    client = await openImap(ctx, getAccount(ctx, accountId));
    const trashPath = await findTrashMailbox(client);
    for (const group of groupBy(messages, (m) => `${m.mailbox}\n${m.uid_validity}`).values()) {
      const first = group[0] as Candidate;
      const lock = await client.getMailboxLock(first.mailbox);
      try {
        const current = client.mailbox ? Number(client.mailbox.uidValidity) : null;
        if (current !== first.uid_validity) {
          tally.failed += group.length;
          tally.needsRescan = true;
          handled += group.length;
          continue;
        }
        for (let i = 0; i < group.length; i += MOVE_CHUNK) {
          const chunk = group.slice(i, i + MOVE_CHUNK);
          const { moved, remaining } = await moveChunk(
            client,
            chunk.map((m) => m.uid),
            trashPath,
          );
          markTrashed(
            ctx,
            chunk.filter((m) => moved.has(m.uid)).map((m) => m.id),
          );
          tally.moved += moved.size;
          tally.failed += remaining;
          handled += chunk.length;
        }
      } finally {
        lock.release();
      }
    }
  } catch (error) {
    console.error(`Moving emails to Trash in account ${accountId} failed:`, error);
    tally.failed += messages.length - handled;
  } finally {
    if (client) {
      const open = client;
      await open.logout().catch(() => open.close());
    }
  }
  return tally;
}

function nextStep(tally: Tally): string {
  return tally.needsRescan ? "Scan again, then try again." : "Try again later.";
}

export function trashSentence(tally: Tally): string {
  if (tally.failed === 0) {
    return tally.moved > 0
      ? `Moved ${emailCount(tally.moved)} to Trash.`
      : "There were no emails to move to Trash.";
  }
  if (tally.moved === 0) return `Couldn't move their emails to Trash. ${nextStep(tally)}`;
  return `Moved ${emailCount(tally.moved)} to Trash, but ${tally.failed.toLocaleString("en-US")} couldn't be moved. ${nextStep(tally)}`;
}

function resultMessage(name: string, tally: Tally): string {
  if (tally.failed === 0) {
    return tally.moved > 0
      ? `Moved ${emailCount(tally.moved)} from ${name} to Trash.`
      : `There were no emails from ${name} to move.`;
  }
  if (tally.moved === 0) {
    return `Couldn't move ${emailCount(tally.failed)} from ${name} to Trash. ${nextStep(tally)}`;
  }
  return `Moved ${emailCount(tally.moved)} from ${name} to Trash, but ${tally.failed.toLocaleString("en-US")} couldn't be moved. ${nextStep(tally)}`;
}

export async function trashSender(
  ctx: AppContext,
  senderId: number,
  options: TrashOptions,
): Promise<TrashOutcome> {
  const sender = findSender(ctx, senderId);
  if (!sender) {
    return {
      result: {
        senderId,
        senderName: "",
        status: "not_available",
        message: UNKNOWN_SENDER_MESSAGE,
        trashed: 0,
      },
      moved: 0,
      failed: 0,
      needsRescan: false,
    };
  }
  const name = senderName(sender);
  const tally: Tally = { moved: 0, failed: 0, needsRescan: false };
  const byAccount = groupBy(matchingMessages(ctx, senderId, options), (m) => m.account_id);
  for (const [accountId, messages] of byAccount) {
    const id = accountId as number;
    const part = await accountQueue(ctx, id)(() => trashInAccount(ctx, id, messages));
    tally.moved += part.moved;
    tally.failed += part.failed;
    tally.needsRescan ||= part.needsRescan;
  }
  const message = resultMessage(name, tally);
  // The log counts a partial move as done so the home screen's trashed total includes what moved.
  logAction(ctx, {
    senderId,
    kind: "trash",
    status: tally.moved > 0 || tally.failed === 0 ? "done" : "failed",
    detail: message,
    messagesAffected: tally.moved,
  });
  return {
    result: {
      senderId,
      senderName: name,
      status: tally.failed > 0 ? "failed" : "done",
      message,
      trashed: tally.moved,
    },
    ...tally,
  };
}

// Moves a sender's matching emails to each account's Trash and logs a `trash` action.
export async function trashSenderEmails(
  ctx: AppContext,
  senderId: number,
  options: TrashOptions,
): Promise<ActionResult> {
  return (await trashSender(ctx, senderId, options)).result;
}
