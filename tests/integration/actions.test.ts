import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ImapFlow } from "imapflow";
import { emailsPerMonth } from "../../src/core/insights/rate.ts";
import type { ActionsResponse } from "../../src/shared/api.ts";
import {
  actionRows,
  daysAgo,
  insertAccount,
  insertMessage,
  insertSender,
  trashedUids,
} from "../unit/actions-fixtures.ts";
import { startTestApp, type TestApp } from "../unit/helpers.ts";

const PASSWORD = "actions-password";

async function createUser(): Promise<string> {
  const email = `actions-${crypto.randomUUID()}@inbox-tidy.test`;
  const res = await fetch("http://127.0.0.1:8080/api/user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, login: email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`GreenMail user creation failed: ${res.status}`);
  return email;
}

async function connect(email: string): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: "127.0.0.1",
    port: 3143,
    secure: false,
    auth: { user: email, pass: PASSWORD },
    logger: false,
  });
  await client.connect();
  return client;
}

async function subjects(client: ImapFlow, mailbox: string): Promise<string[]> {
  const exists = (await client.list()).some((b) => b.path === mailbox);
  if (!exists) return [];
  const lock = await client.getMailboxLock(mailbox);
  try {
    const found: string[] = [];
    if (client.mailbox && client.mailbox.exists > 0) {
      for await (const msg of client.fetch("1:*", { envelope: true })) {
        found.push(msg.envelope?.subject ?? "");
      }
    }
    return found.sort();
  } finally {
    lock.release();
  }
}

interface Mailbox {
  app: TestApp;
  email: string;
  accountId: number;
  imap: ImapFlow;
}

interface Seed {
  senderId: number;
  from: string;
  subject: string;
  days?: number;
  read?: boolean;
  listUnsubscribe?: string;
  oneClick?: boolean;
}

async function seedMessage(box: Mailbox, seed: Seed): Promise<number> {
  const date = new Date(daysAgo(seed.days ?? 1));
  const headers = [
    `From: ${seed.from}`,
    `To: ${box.email}`,
    `Subject: ${seed.subject}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@inbox-tidy.test>`,
  ];
  if (seed.listUnsubscribe) headers.push(`List-Unsubscribe: ${seed.listUnsubscribe}`);
  if (seed.oneClick) headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  const raw = `${headers.join("\r\n")}\r\n\r\nHello.\r\n`;
  const appended = await box.imap.append("INBOX", raw, seed.read ? ["\\Seen"] : [], date);
  if (appended === false || !appended.uid || !appended.uidValidity) {
    throw new Error("append failed");
  }
  insertMessage(box.app.ctx, {
    accountId: box.accountId,
    senderId: seed.senderId,
    uid: appended.uid,
    uidValidity: Number(appended.uidValidity),
    subject: seed.subject,
    receivedAt: date.toISOString(),
    isRead: seed.read ?? false,
    listUnsubscribe: seed.listUnsubscribe ?? null,
    listUnsubscribePost: seed.oneClick ? "List-Unsubscribe=One-Click" : null,
  });
  return appended.uid;
}

async function post(app: TestApp, path: string, body: unknown): Promise<ActionsResponse> {
  const res = await app.call(path, { method: "POST", body });
  expect(res.status).toBe(200);
  return (await res.json()) as ActionsResponse;
}

let box: Mailbox;
let opened: string[];

beforeEach(async () => {
  const app = startTestApp();
  const email = await createUser();
  await app.ctx.secrets.set(email, PASSWORD);
  opened = [];
  app.ctx.openExternal = async (url) => {
    opened.push(url);
  };
  box = { app, email, accountId: insertAccount(app.ctx, email), imap: await connect(email) };
});

afterEach(async () => {
  await box.imap.logout().catch(() => {});
  box.app.stop();
});

describe("move old emails to Trash", () => {
  test("moves only matching emails and marks them", async () => {
    const amazon = insertSender(box.app.ctx, {
      address: "deals@amazon.test",
      displayName: "Amazon",
    });
    const other = insertSender(box.app.ctx, { address: "hi@friend.test" });
    const from = "Amazon <deals@amazon.test>";
    const oldRead = await seedMessage(box, {
      senderId: amazon,
      from,
      subject: "old read",
      days: 60,
      read: true,
    });
    await seedMessage(box, { senderId: amazon, from, subject: "old unread", days: 60 });
    await seedMessage(box, { senderId: amazon, from, subject: "recent read", days: 2, read: true });
    await seedMessage(box, {
      senderId: other,
      from: "hi@friend.test",
      subject: "other sender",
      days: 90,
      read: true,
    });

    const first = await post(box.app, "/api/actions/trash", {
      senderIds: [amazon],
      olderThanDays: 30,
      onlyRead: true,
    });
    expect(first.results).toEqual([
      {
        senderId: amazon,
        senderName: "Amazon",
        status: "done",
        message: "Moved 1 email from Amazon to Trash.",
        trashed: 1,
      },
    ]);
    expect(await subjects(box.imap, "Trash")).toEqual(["old read"]);
    expect(await subjects(box.imap, "INBOX")).toEqual([
      "old unread",
      "other sender",
      "recent read",
    ]);
    expect(trashedUids(box.app.ctx, amazon)).toEqual([oldRead]);

    const second = await post(box.app, "/api/actions/trash", {
      senderIds: [amazon],
      olderThanDays: 0,
      onlyRead: false,
    });
    expect(second.results[0]?.message).toBe("Moved 2 emails from Amazon to Trash.");
    expect(await subjects(box.imap, "INBOX")).toEqual(["other sender"]);
    expect(await subjects(box.imap, "Trash")).toHaveLength(3);
    expect(trashedUids(box.app.ctx, other)).toEqual([]);

    const third = await post(box.app, "/api/actions/trash", {
      senderIds: [amazon],
      olderThanDays: 0,
      onlyRead: false,
    });
    expect(third.results[0]?.message).toBe("There were no emails from Amazon to move.");
    expect(
      actionRows(box.app.ctx, amazon).map((r) => [r.kind, r.status, r.messages_affected]),
    ).toEqual([
      ["trash", "done", 1],
      ["trash", "done", 2],
      ["trash", "done", 0],
    ]);
  });

  test("counts only what moved and skips a mailbox that changed", async () => {
    const shop = insertSender(box.app.ctx, { address: "news@shop.test", displayName: "Shop" });
    const from = "news@shop.test";
    const kept = await seedMessage(box, { senderId: shop, from, subject: "one" });
    const gone = await seedMessage(box, { senderId: shop, from, subject: "two" });
    const lock = await box.imap.getMailboxLock("INBOX");
    await box.imap.messageDelete(String(gone), { uid: true });
    lock.release();

    const stale = insertSender(box.app.ctx, { address: "old@stale.test", displayName: "Stale" });
    await seedMessage(box, { senderId: stale, from: "old@stale.test", subject: "stale" });
    box.app.ctx.db.query("UPDATE messages SET uid_validity = 1 WHERE sender_id = ?").run(stale);

    const { results } = await post(box.app, "/api/actions/trash", {
      senderIds: [shop, stale],
      olderThanDays: 0,
      onlyRead: false,
    });
    expect(results[0]).toMatchObject({
      status: "done",
      message: "Moved 1 email from Shop to Trash.",
      trashed: 1,
    });
    expect(trashedUids(box.app.ctx, shop)).toEqual([kept]);
    expect(results[1]).toMatchObject({
      status: "failed",
      message: "Couldn't move 1 email from Stale to Trash. Scan again, then try again.",
      trashed: 0,
    });
    expect(await subjects(box.imap, "INBOX")).toEqual(["stale"]);
    expect(actionRows(box.app.ctx, stale)[0]).toMatchObject({
      status: "failed",
      messages_affected: 0,
    });
  });
});

describe("unsubscribe", () => {
  let server: ReturnType<typeof Bun.serve>;
  let base = "";
  let hits: { path: string; body: string; contentType: string | null }[] = [];

  beforeAll(() => {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname;
        hits.push({ path, body: await req.text(), contentType: req.headers.get("content-type") });
        if (path === "/ok") return new Response("ok");
        if (path === "/redirect") return Response.redirect(`${base}/landed`, 302);
        return new Response("broken", { status: 500 });
      },
    });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));
  beforeEach(() => {
    hits = [];
  });

  async function newsletter(header: string, oneClick: boolean, count = 3): Promise<number> {
    const senderId = insertSender(box.app.ctx, {
      address: "news@shop.test",
      displayName: "Shop",
    });
    for (let i = 0; i < count; i++) {
      await seedMessage(box, {
        senderId,
        from: "Shop <news@shop.test>",
        subject: `issue ${i}`,
        days: i + 1,
        listUnsubscribe: header,
        oneClick,
      });
    }
    return senderId;
  }

  test("one-click posts to the sender and logs the rate before", async () => {
    const id = await newsletter(`<${base}/ok>, <mailto:unsub@shop.test>`, true);
    const before = emailsPerMonth(box.app.ctx, id);
    const { results } = await post(box.app, "/api/actions/unsubscribe", {
      senderIds: [id],
      alsoTrash: false,
    });
    expect(results[0]).toEqual({
      senderId: id,
      senderName: "Shop",
      status: "done",
      message: "Unsubscribed.",
      trashed: 0,
    });
    expect(hits).toEqual([
      {
        path: "/ok",
        body: "List-Unsubscribe=One-Click",
        contentType: "application/x-www-form-urlencoded",
      },
    ]);
    expect(before).toBe(3);
    expect(actionRows(box.app.ctx, id)).toEqual([
      expect.objectContaining({
        kind: "unsubscribe",
        method: "one_click",
        status: "done",
        detail: "Unsubscribed.",
        emails_per_month_before: before,
      }),
    ]);
  });

  test("a failing one-click falls back to an email that is delivered", async () => {
    const list = await createUser();
    const id = await newsletter(
      `<${base}/fail>, <mailto:${list}?subject=Unsubscribe%20me&body=Please%20remove%20me>`,
      true,
    );
    const { results } = await post(box.app, "/api/actions/unsubscribe", {
      senderIds: [id],
      alsoTrash: false,
    });
    expect(results[0]).toMatchObject({
      status: "done",
      message: "Unsubscribed by sending them an email.",
    });
    expect(hits.map((h) => h.path)).toEqual(["/fail"]);
    expect(actionRows(box.app.ctx, id)[0]).toMatchObject({ method: "mailto", status: "done" });

    const listBox = await connect(list);
    try {
      let received: string[] = [];
      for (let i = 0; i < 20 && received.length === 0; i++) {
        received = await subjects(listBox, "INBOX");
        if (received.length === 0) await Bun.sleep(100);
      }
      expect(received).toEqual(["Unsubscribe me"]);
      const lock = await listBox.getMailboxLock("INBOX");
      try {
        const msg = await listBox.fetchOne("1", { envelope: true, source: true });
        if (!msg) throw new Error("the unsubscribe email was not found");
        expect(msg.envelope?.from?.[0]?.address).toBe(box.email);
        expect(msg.source?.toString()).toContain("Please remove me");
      } finally {
        lock.release();
      }
    } finally {
      await listBox.logout();
    }
  });

  test("a redirect is not followed and the web page is opened instead", async () => {
    const id = await newsletter(`<${base}/redirect>`, true, 1);
    const { results } = await post(box.app, "/api/actions/unsubscribe", {
      senderIds: [id],
      alsoTrash: false,
    });
    expect(hits.map((h) => h.path)).toEqual(["/redirect"]);
    expect(results[0]?.status).toBe("opened_in_browser");
    expect(opened).toEqual([`${base}/redirect`]);
  });

  test("a web-only sender opens in the browser", async () => {
    const id = await newsletter("<https://unsubscribe.example.test/page?u=1>", false, 1);
    const { results } = await post(box.app, "/api/actions/unsubscribe", {
      senderIds: [id],
      alsoTrash: false,
    });
    expect(results[0]).toMatchObject({
      status: "opened_in_browser",
      message:
        'Opened their unsubscribe page in your browser. Finish there, then tick "I\'ve unsubscribed" in Inbox Tidy.',
    });
    expect(opened).toEqual(["https://unsubscribe.example.test/page?u=1"]);
    expect(actionRows(box.app.ctx, id)[0]).toMatchObject({
      method: "web",
      status: "opened_in_browser",
      emails_per_month_before: 1,
    });
  });

  test("also moving to Trash runs after unsubscribing", async () => {
    const id = await newsletter(`<${base}/ok>`, true);
    const { results } = await post(box.app, "/api/actions/unsubscribe", {
      senderIds: [id],
      alsoTrash: true,
    });
    expect(results[0]).toMatchObject({
      status: "done",
      message: "Unsubscribed. Moved 3 emails to Trash.",
      trashed: 3,
    });
    expect(await subjects(box.imap, "Trash")).toEqual(["issue 0", "issue 1", "issue 2"]);
    expect(await subjects(box.imap, "INBOX")).toEqual([]);
    expect(
      actionRows(box.app.ctx, id).map((r) => [
        r.kind,
        r.status,
        r.emails_per_month_before,
        r.messages_affected,
      ]),
    ).toEqual([
      ["unsubscribe", "done", 3, null],
      ["trash", "done", null, 3],
    ]);
  });
});
