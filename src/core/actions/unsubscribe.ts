import type { ActionResult, ActionStatus, UnsubscribeMethod } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { HttpError } from "../http.ts";
import { emailsPerMonth } from "../insights/rate.ts";
import { getAccount, sendMail } from "../mail/connection.ts";
import {
  parseMailto,
  type UnsubscribeOption,
  unsubscribeOptions,
} from "../mail/unsubscribe-header.ts";
import {
  findSender,
  logAction,
  mapLimit,
  type SenderRecord,
  senderName,
  serialQueue,
  UNKNOWN_SENDER_MESSAGE,
} from "./shared.ts";
import { type TrashOptions, type TrashOutcome, trashSender, trashSentence } from "./trash.ts";

export const UNSUBSCRIBE_CONCURRENCY = 4;
export const MAX_BROWSER_OPENS = 10;

export const MESSAGES = {
  oneClick: "Unsubscribed.",
  mailto: "Unsubscribed by sending them an email.",
  opened:
    'Opened their unsubscribe page in your browser. Finish there, then tick "I\'ve unsubscribed" in Inbox Tidy.',
  confirmed: "You finished unsubscribing on their web page.",
  failed: "Couldn't unsubscribe automatically. Try again later.",
  none: "This sender doesn't offer a way to unsubscribe. You can move their emails to Trash instead.",
  tooManyPages: `Inbox Tidy opens at most ${MAX_BROWSER_OPENS} unsubscribe pages at a time. Try this sender again in a smaller batch.`,
} as const;

export interface UnsubscribeDeps {
  sendMail: typeof sendMail;
  trash: (ctx: AppContext, senderId: number, options: TrashOptions) => Promise<TrashOutcome>;
  oneClickTimeoutMs: number;
}

const defaultDeps: UnsubscribeDeps = {
  sendMail,
  trash: trashSender,
  oneClickTimeoutMs: 15_000,
};

interface RunState {
  browserOpens: number;
  browserQueue: ReturnType<typeof serialQueue>;
}

interface UnsubscribeSource {
  options: UnsubscribeOption[];
  accountId: number | null;
}

function unsubscribeSource(ctx: AppContext, sender: SenderRecord): UnsubscribeSource {
  const latest = ctx.db
    .query<
      { account_id: number; list_unsubscribe: string; list_unsubscribe_post: string | null },
      [number]
    >(
      `SELECT account_id, list_unsubscribe, list_unsubscribe_post FROM messages
       WHERE sender_id = ? AND trashed_at IS NULL
         AND list_unsubscribe IS NOT NULL AND list_unsubscribe != ''
       ORDER BY received_at DESC LIMIT 1`,
    )
    .get(sender.id);
  const newestAccount =
    ctx.db
      .query<{ account_id: number }, [number]>(
        "SELECT account_id FROM messages WHERE sender_id = ? ORDER BY received_at DESC LIMIT 1",
      )
      .get(sender.id)?.account_id ?? null;
  const accountId = sender.unsubscribe_account_id ?? newestAccount;

  if (latest) {
    const options = unsubscribeOptions(latest.list_unsubscribe, latest.list_unsubscribe_post);
    if (options.length > 0) return { options, accountId };
  }
  if (sender.unsubscribe_target && sender.unsubscribe_method !== "none") {
    const post = sender.unsubscribe_method === "one_click" ? "List-Unsubscribe=One-Click" : null;
    return { options: unsubscribeOptions(`<${sender.unsubscribe_target}>`, post), accountId };
  }
  return { options: [], accountId };
}

async function postOneClick(url: string, timeoutMs: number): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    body: "List-Unsubscribe=One-Click",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    // RFC 8058 senders answer the POST directly; a redirect could lead anywhere, so it counts as failure.
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  await res.body?.cancel().catch(() => {});
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`one-click endpoint ${new URL(url).host} answered ${res.status}`);
  }
}

async function sendUnsubscribeEmail(
  ctx: AppContext,
  accountId: number | null,
  target: string,
  deps: UnsubscribeDeps,
): Promise<void> {
  const mail = parseMailto(target);
  if (!mail) throw new Error("unreadable mailto address");
  if (accountId === null) throw new Error("no account to send the unsubscribe email from");
  await deps.sendMail(ctx, getAccount(ctx, accountId), {
    to: mail.to,
    subject: mail.subject,
    text: mail.body,
  });
}

type WebOutcome = "opened" | "failed" | "capped";

async function openWebPage(ctx: AppContext, url: string, run: RunState): Promise<WebOutcome> {
  if (run.browserOpens >= MAX_BROWSER_OPENS) return "capped";
  run.browserOpens++;
  try {
    await run.browserQueue(() => ctx.openExternal(url));
    return "opened";
  } catch (error) {
    console.error("Opening an unsubscribe page failed:", error);
    return "failed";
  }
}

interface Attempt {
  method: UnsubscribeMethod;
  status: ActionStatus;
  message: string;
}

async function attemptOptions(
  ctx: AppContext,
  sender: SenderRecord,
  source: UnsubscribeSource,
  run: RunState,
  deps: UnsubscribeDeps,
): Promise<Attempt> {
  if (source.options.length === 0) {
    return { method: "none", status: "not_available", message: MESSAGES.none };
  }
  let method: UnsubscribeMethod = "none";
  for (const option of source.options) {
    method = option.method;
    if (option.method === "web") {
      const outcome = await openWebPage(ctx, option.target, run);
      if (outcome === "opened") {
        return { method, status: "opened_in_browser", message: MESSAGES.opened };
      }
      if (outcome === "capped") return { method, status: "failed", message: MESSAGES.tooManyPages };
      continue;
    }
    try {
      if (option.method === "one_click") {
        await postOneClick(option.target, deps.oneClickTimeoutMs);
        return { method, status: "done", message: MESSAGES.oneClick };
      }
      await sendUnsubscribeEmail(ctx, source.accountId, option.target, deps);
      return { method, status: "done", message: MESSAGES.mailto };
    } catch (error) {
      console.error(`Unsubscribe from sender ${sender.id} by ${option.method} failed:`, error);
    }
  }
  return { method, status: "failed", message: MESSAGES.failed };
}

async function unsubscribeOne(
  ctx: AppContext,
  senderId: number,
  alsoTrash: boolean,
  run: RunState,
  deps: UnsubscribeDeps,
): Promise<ActionResult> {
  const sender = findSender(ctx, senderId);
  if (!sender) {
    return {
      senderId,
      senderName: "",
      status: "not_available",
      message: UNKNOWN_SENDER_MESSAGE,
      trashed: 0,
    };
  }
  const name = senderName(sender);
  try {
    const before = emailsPerMonth(ctx, senderId);
    const attempt = await attemptOptions(ctx, sender, unsubscribeSource(ctx, sender), run, deps);
    logAction(ctx, {
      senderId,
      kind: "unsubscribe",
      method: attempt.method,
      status: attempt.status,
      detail: attempt.message,
      emailsPerMonthBefore: before,
    });
    let message: string = attempt.message;
    let trashed = 0;
    if (alsoTrash && (attempt.status === "done" || attempt.status === "opened_in_browser")) {
      const outcome = await deps.trash(ctx, senderId, { olderThanDays: 0, onlyRead: false });
      trashed = outcome.moved;
      message = `${message} ${trashSentence(outcome)}`;
    }
    return { senderId, senderName: name, status: attempt.status, message, trashed };
  } catch (error) {
    console.error(`Unsubscribe from sender ${senderId} failed:`, error);
    return { senderId, senderName: name, status: "failed", message: MESSAGES.failed, trashed: 0 };
  }
}

export async function unsubscribeSenders(
  ctx: AppContext,
  senderIds: number[],
  alsoTrash: boolean,
  deps: Partial<UnsubscribeDeps> = {},
): Promise<ActionResult[]> {
  const resolved = { ...defaultDeps, ...deps };
  const run: RunState = { browserOpens: 0, browserQueue: serialQueue() };
  return mapLimit(senderIds, UNSUBSCRIBE_CONCURRENCY, (id) =>
    unsubscribeOne(ctx, id, alsoTrash, run, resolved),
  );
}

// The app can't see what happens on a sender's web page, so a web unsubscribe only counts once
// the user confirms it. The confirmation copies the opened attempt's monthly rate snapshot.
export function confirmWebUnsubscribe(ctx: AppContext, senderId: number): void {
  const latest = ctx.db
    .query<{ status: string; emails_per_month_before: number | null }, [number]>(
      `SELECT status, emails_per_month_before FROM actions
       WHERE sender_id = ? AND kind = 'unsubscribe' ORDER BY id DESC LIMIT 1`,
    )
    .get(senderId);
  if (latest?.status !== "opened_in_browser") {
    throw new HttpError(
      409,
      "This sender isn't waiting for you to finish on a web page. Refresh and try again.",
    );
  }
  logAction(ctx, {
    senderId,
    kind: "unsubscribe",
    method: "web",
    status: "done",
    detail: MESSAGES.confirmed,
    emailsPerMonthBefore: latest.emails_per_month_before,
  });
}
