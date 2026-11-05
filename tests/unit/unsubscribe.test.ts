import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { TrashOutcome } from "../../src/core/actions/trash.ts";
import {
  MAX_BROWSER_OPENS,
  MESSAGES,
  type UnsubscribeDeps,
  unsubscribeSenders,
} from "../../src/core/actions/unsubscribe.ts";
import type { AppContext } from "../../src/core/context.ts";
import type { AccountRow, OutgoingMail } from "../../src/core/mail/connection.ts";
import {
  actionRows,
  daysAgo,
  insertAccount,
  insertMessage,
  insertSender,
} from "./actions-fixtures.ts";
import { testContext } from "./helpers.ts";

interface Hit {
  path: string;
  method: string;
  body: string;
  contentType: string | null;
}

let server: ReturnType<typeof Bun.serve>;
let base = "";
let hits: Hit[] = [];

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      hits.push({
        path,
        method: req.method,
        body: await req.text(),
        contentType: req.headers.get("content-type"),
      });
      if (path === "/ok") return new Response("ok");
      if (path === "/redirect") return Response.redirect(`${base}/landed`, 302);
      if (path === "/slow") {
        await Bun.sleep(1_000);
        return new Response("late");
      }
      return new Response("nope", { status: 500 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

let ctx: AppContext;
let accountId: number;
let opened: string[];
let sent: { account: string; mail: OutgoingMail }[];
let deps: Partial<UnsubscribeDeps>;

beforeEach(() => {
  hits = [];
  ctx = testContext();
  accountId = insertAccount(ctx, "me@inbox-tidy.test");
  opened = [];
  sent = [];
  ctx.openExternal = async (url) => {
    opened.push(url);
  };
  deps = {
    sendMail: async (_ctx: AppContext, account: AccountRow, mail: OutgoingMail) => {
      sent.push({ account: account.email, mail });
    },
  };
});

function senderWithHeader(header: string, oneClick: boolean, address = "news@shop.test"): number {
  const senderId = insertSender(ctx, { address, displayName: "Shop" });
  insertMessage(ctx, {
    accountId,
    senderId,
    uid: 1,
    uidValidity: 7,
    listUnsubscribe: header,
    listUnsubscribePost: oneClick ? "List-Unsubscribe=One-Click" : null,
  });
  return senderId;
}

describe("unsubscribe fallback chain", () => {
  test("one-click posts the RFC 8058 body and counts a 2xx as done", async () => {
    const id = senderWithHeader(`<${base}/ok>, <mailto:unsub@shop.test>`, true);
    const [result] = await unsubscribeSenders(ctx, [id], false, deps);
    expect(result).toMatchObject({ status: "done", message: MESSAGES.oneClick, trashed: 0 });
    expect(hits).toEqual([
      {
        path: "/ok",
        method: "POST",
        body: "List-Unsubscribe=One-Click",
        contentType: "application/x-www-form-urlencoded",
      },
    ]);
    expect(sent).toHaveLength(0);
    expect(actionRows(ctx, id)).toEqual([
      expect.objectContaining({ kind: "unsubscribe", method: "one_click", status: "done" }),
    ]);
  });

  test("a failing one-click falls back to mailto from the receiving account", async () => {
    const id = senderWithHeader(
      `<${base}/fail>, <mailto:unsub@shop.test?subject=Remove%20me&body=Please%20stop>`,
      true,
    );
    const [result] = await unsubscribeSenders(ctx, [id], false, deps);
    expect(result).toMatchObject({ status: "done", message: MESSAGES.mailto });
    expect(sent).toEqual([
      {
        account: "me@inbox-tidy.test",
        mail: { to: "unsub@shop.test", subject: "Remove me", text: "Please stop" },
      },
    ]);
    expect(actionRows(ctx, id)[0]).toMatchObject({ method: "mailto", status: "done" });
  });

  test("mailto failure falls back to the web page", async () => {
    deps.sendMail = async () => {
      throw new Error("SMTP auth failed");
    };
    const id = senderWithHeader(`<${base}/fail>, <mailto:unsub@shop.test>`, true);
    const [result] = await unsubscribeSenders(ctx, [id], false, deps);
    expect(result).toMatchObject({ status: "opened_in_browser", message: MESSAGES.opened });
    expect(opened).toEqual([`${base}/fail`]);
    expect(actionRows(ctx, id)[0]).toMatchObject({ method: "web", status: "opened_in_browser" });
  });

  test("a redirect on the one-click POST is not followed", async () => {
    const id = senderWithHeader(`<${base}/redirect>`, true);
    const [result] = await unsubscribeSenders(ctx, [id], false, deps);
    expect(hits.map((h) => h.path)).toEqual(["/redirect"]);
    expect(result?.status).toBe("opened_in_browser");
  });

  test("a one-click endpoint that never answers times out and falls back", async () => {
    const id = senderWithHeader(`<${base}/slow>, <mailto:unsub@shop.test>`, true);
    const [result] = await unsubscribeSenders(ctx, [id], false, { ...deps, oneClickTimeoutMs: 50 });
    expect(result?.message).toBe(MESSAGES.mailto);
  });

  test("when everything fails the result says so", async () => {
    deps.sendMail = async () => {
      throw new Error("no route");
    };
    ctx.openExternal = async () => {
      throw new Error("no browser");
    };
    const id = senderWithHeader(`<mailto:unsub@shop.test>, <https://shop.test/u>`, false);
    const [result] = await unsubscribeSenders(ctx, [id], false, deps);
    expect(result).toMatchObject({ status: "failed", message: MESSAGES.failed });
    expect(actionRows(ctx, id)[0]).toMatchObject({ method: "web", status: "failed" });
  });

  test("the newest message's header is used", async () => {
    const senderId = insertSender(ctx, { address: "news@shop.test" });
    insertMessage(ctx, {
      accountId,
      senderId,
      uid: 1,
      uidValidity: 7,
      receivedAt: daysAgo(10),
      listUnsubscribe: "<https://shop.test/old>",
    });
    insertMessage(ctx, {
      accountId,
      senderId,
      uid: 2,
      uidValidity: 7,
      receivedAt: daysAgo(2),
      listUnsubscribe: "<https://shop.test/new>",
    });
    insertMessage(ctx, { accountId, senderId, uid: 3, uidValidity: 7, receivedAt: daysAgo(1) });
    await unsubscribeSenders(ctx, [senderId], false, deps);
    expect(opened).toEqual(["https://shop.test/new"]);
  });

  test("without message headers the sender's stored target is used", async () => {
    const id = insertSender(ctx, {
      address: "news@shop.test",
      method: "mailto",
      target: "mailto:leave@shop.test",
      accountId,
    });
    const [result] = await unsubscribeSenders(ctx, [id], false, deps);
    expect(result?.message).toBe(MESSAGES.mailto);
    expect(sent.map((s) => s.mail.to)).toEqual(["leave@shop.test"]);
  });

  test("mailto prefers the account recorded on the sender", async () => {
    const other = insertAccount(ctx, "work@inbox-tidy.test");
    const id = senderWithHeader("<mailto:unsub@shop.test>", false);
    ctx.db.query("UPDATE senders SET unsubscribe_account_id = ? WHERE id = ?").run(other, id);
    await unsubscribeSenders(ctx, [id], false, deps);
    expect(sent.map((s) => s.account)).toEqual(["work@inbox-tidy.test"]);
  });

  test("http links to other hosts are never contacted", async () => {
    const id = senderWithHeader("<http://shop.test/u>", true);
    const [result] = await unsubscribeSenders(ctx, [id], false, deps);
    expect(result?.status).toBe("not_available");
    expect(opened).toHaveLength(0);
  });
});

describe("browser pages", () => {
  test("open one at a time and at most ten per request", async () => {
    let active = 0;
    let maxActive = 0;
    ctx.openExternal = async (url) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(5);
      opened.push(url);
      active--;
    };
    const ids = Array.from({ length: 12 }, (_, i) => {
      const senderId = insertSender(ctx, { address: `n${i}@shop.test` });
      insertMessage(ctx, {
        accountId,
        senderId,
        uid: i + 1,
        uidValidity: 7,
        listUnsubscribe: `<https://shop.test/u/${i}>`,
      });
      return senderId;
    });
    const results = await unsubscribeSenders(ctx, ids, false, deps);
    expect(results.map((r) => r.senderId)).toEqual(ids);
    expect(maxActive).toBe(1);
    expect(opened).toHaveLength(MAX_BROWSER_OPENS);
    expect(results.filter((r) => r.status === "opened_in_browser")).toHaveLength(10);
    const capped = results.filter((r) => r.status === "failed");
    expect(capped).toHaveLength(2);
    expect(capped[0]?.message).toBe(MESSAGES.tooManyPages);
  });
});

describe("also move to Trash", () => {
  function fakeTrash(calls: number[], moved: number): UnsubscribeDeps["trash"] {
    return async (c, senderId) => {
      calls.push(senderId);
      c.db.query("UPDATE messages SET trashed_at = 'now' WHERE sender_id = ?").run(senderId);
      return { moved, failed: 0, needsRescan: false } as TrashOutcome;
    };
  }

  test("runs after success with the rate captured beforehand", async () => {
    const calls: number[] = [];
    const id = senderWithHeader(`<${base}/ok>`, true);
    const [result] = await unsubscribeSenders(ctx, [id], true, {
      ...deps,
      trash: fakeTrash(calls, 214),
    });
    expect(calls).toEqual([id]);
    expect(result).toMatchObject({
      status: "done",
      message: "Unsubscribed. Moved 214 emails to Trash.",
      trashed: 214,
    });
    expect(actionRows(ctx, id)[0]?.emails_per_month_before).toBe(1);
  });

  test("is skipped when unsubscribing failed", async () => {
    const calls: number[] = [];
    ctx.openExternal = async () => {
      throw new Error("no browser");
    };
    const id = senderWithHeader("<https://shop.test/u>", false);
    const [result] = await unsubscribeSenders(ctx, [id], true, {
      ...deps,
      trash: fakeTrash(calls, 3),
    });
    expect(calls).toHaveLength(0);
    expect(result?.trashed).toBe(0);
  });
});
