import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addAccount } from "../../src/core/mail/accounts.ts";
import { waitForScan } from "../../src/core/mail/scanner.ts";
import type { AccountSummary, ScanStatus } from "../../src/shared/api.ts";
import { startTestApp, type TestApp } from "../unit/helpers.ts";
import {
  accountRequest,
  createUser,
  daysAgo,
  type MailUser,
  rejectingImapServer,
  seed,
  withMailbox,
} from "./mail-server.ts";

const SHOP_UNSUB = {
  "List-Unsubscribe": "<https://shop.example/u/1>, <mailto:u@shop.example>",
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
};

let app: TestApp;
let user: MailUser;
let account: AccountSummary;
let uids: number[];
const rejecting = rejectingImapServer();

interface SenderView {
  address: string;
  display_name: string | null;
  unsubscribe_method: string;
  unsubscribe_target: string | null;
  unsubscribe_account_id: number | null;
  total: number;
  read: number;
}

function senders(): Record<string, SenderView> {
  const rows = app.ctx.db
    .query<SenderView, []>(
      `SELECT s.address, s.display_name, s.unsubscribe_method, s.unsubscribe_target,
         s.unsubscribe_account_id,
         COUNT(m.id) AS total, COALESCE(SUM(m.is_read), 0) AS read
       FROM senders s LEFT JOIN messages m ON m.sender_id = s.id AND m.trashed_at IS NULL
       GROUP BY s.id`,
    )
    .all();
  return Object.fromEntries(rows.map((r) => [r.address, r]));
}

async function scan(): Promise<ScanStatus> {
  const res = await app.call("/api/scan", { method: "POST" });
  expect(res.status).toBe(200);
  return waitForScan(app.ctx);
}

beforeAll(async () => {
  app = startTestApp();
  user = await createUser("scan");
  uids = await seed(user, [
    {
      from: "Shop <news@shop.example>",
      subject: "Sale 1",
      date: daysAgo(30),
      seen: true,
      headers: SHOP_UNSUB,
    },
    { from: "Shop <news@shop.example>", subject: "Sale 2", date: daysAgo(20), headers: SHOP_UNSUB },
    {
      from: "Shop Weekly <news@shop.example>",
      subject: "Sale 3",
      date: daysAgo(10),
      headers: SHOP_UNSUB,
    },
    {
      from: "Store Deals <deals@store.example>",
      subject: "Deal A",
      date: daysAgo(15),
      headers: { "List-Unsubscribe": "<mailto:unsub@store.example?subject=stop>" },
    },
    {
      from: "Store Deals <deals@store.example>",
      subject: "Deal B",
      date: daysAgo(5),
      headers: { "List-Unsubscribe": "<mailto:unsub@store.example?subject=stop>" },
    },
    { from: "Pal <pal@friends.example>", subject: "Lunch?", date: daysAgo(4), seen: true },
    {
      from: "=?UTF-8?B?w4lsaXNl?= <Writer@Blog.example>",
      subject: "=?UTF-8?Q?Caf=C3=A9_notes?=",
      date: daysAgo(3),
      headers: {
        "List-Unsubscribe": "<https://blog.example/unsub>,\r\n <https://blog.example/other>",
      },
    },
    { subject: "No sender at all", date: daysAgo(2) },
    { from: "Old <old@ancient.example>", subject: "Ancient", date: daysAgo(800) },
  ]);
  const res = await app.call("/api/accounts", { method: "POST", body: accountRequest(user) });
  expect(res.status).toBe(201);
  account = (await res.json()) as AccountSummary;
});

afterAll(async () => {
  await waitForScan(app.ctx);
  rejecting.stop();
  app.stop();
});

describe("scanning", () => {
  test("the first scan reads senders, counts, read flags, and unsubscribe options", async () => {
    const status = await waitForScan(app.ctx);
    expect(status).toMatchObject({ state: "done", stage: "done", errors: [] });
    expect(status.message).toStartWith(
      "Finished. You got 7 emails from 4 senders in the last 12 months.",
    );
    expect(status.finishedAt).not.toBeNull();

    const s = senders();
    expect(Object.keys(s).sort()).toEqual([
      "deals@store.example",
      "news@shop.example",
      "pal@friends.example",
      "writer@blog.example",
    ]);
    expect(s["news@shop.example"]).toMatchObject({
      display_name: "Shop Weekly",
      total: 3,
      read: 1,
      unsubscribe_method: "one_click",
      unsubscribe_target: "https://shop.example/u/1",
      unsubscribe_account_id: account.id,
    });
    expect(s["deals@store.example"]).toMatchObject({
      total: 2,
      read: 0,
      unsubscribe_method: "mailto",
      unsubscribe_target: "mailto:unsub@store.example?subject=stop",
    });
    expect(s["pal@friends.example"]).toMatchObject({
      total: 1,
      read: 1,
      unsubscribe_method: "none",
      unsubscribe_target: null,
    });
    expect(s["writer@blog.example"]).toMatchObject({
      display_name: "Élise",
      unsubscribe_method: "web",
      unsubscribe_target: "https://blog.example/unsub",
    });

    const blog = app.ctx.db
      .query("SELECT subject, list_unsubscribe, received_at FROM messages WHERE uid = ?")
      .get(uids[6] ?? 0) as { subject: string; list_unsubscribe: string; received_at: string };
    expect(blog.subject).toBe("Café notes");
    expect(blog.list_unsubscribe).toBe(
      "<https://blog.example/unsub>, <https://blog.example/other>",
    );
    expect(blog.received_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

    const state = app.ctx.db.query("SELECT last_uid FROM mailbox_state").get() as {
      last_uid: number;
    };
    expect(state.last_uid).toBe(uids[7] ?? -1);
  });

  test("a second scan picks up new mail, flag changes, and deletions", async () => {
    const [shopOldest, , , dealA, , pal] = uids;
    // Pretend Inbox Tidy already moved the oldest shop email to Trash.
    app.ctx.db
      .query("UPDATE messages SET trashed_at = ? WHERE uid = ?")
      .run(new Date().toISOString(), shopOldest ?? 0);
    await withMailbox(user, async (client) => {
      await client.mailboxOpen("INBOX");
      await client.messageFlagsAdd(String(dealA), ["\\Seen"], { uid: true });
      await client.messageDelete(`${shopOldest},${pal}`, { uid: true });
    });
    await seed(user, [
      {
        from: "Shop Daily <news@shop.example>",
        subject: "Sale 4",
        date: daysAgo(1),
        headers: { "List-Unsubscribe": "<https://shop.example/u/2>" },
      },
      { from: "Alerts <alerts@new.example>", subject: "Welcome", date: daysAgo(1) },
    ]);

    const first = await app.call("/api/scan", { method: "POST" });
    const running = (await first.json()) as ScanStatus;
    expect(running.state).toBe("running");
    const second = (await (await app.call("/api/scan", { method: "POST" })).json()) as ScanStatus;
    expect(second.startedAt).toBe(running.startedAt);
    const polled = (await (await app.call("/api/scan")).json()) as ScanStatus;
    expect(["running", "done"]).toContain(polled.state);

    const status = await waitForScan(app.ctx);
    expect(status.state).toBe("done");

    const s = senders();
    expect(s["news@shop.example"]).toMatchObject({
      display_name: "Shop Daily",
      total: 3,
      read: 0,
      unsubscribe_method: "web",
      unsubscribe_target: "https://shop.example/u/2",
    });
    expect(s["deals@store.example"]).toMatchObject({ total: 2, read: 1 });
    expect(s["pal@friends.example"]?.total ?? 0).toBe(0);
    expect(s["alerts@new.example"]).toMatchObject({ total: 1, display_name: "Alerts" });

    const trashed = app.ctx.db
      .query("SELECT COUNT(*) AS n FROM messages WHERE trashed_at IS NOT NULL")
      .get();
    expect(trashed).toEqual({ n: 1 });
    const list = (await (await app.call("/api/accounts")).json()) as AccountSummary[];
    expect(list[0]?.messageCount).toBe(7);
  });

  test("a UIDVALIDITY change rescans the inbox from scratch", async () => {
    app.ctx.db.run("UPDATE mailbox_state SET uid_validity = 42");
    app.ctx.db.run("UPDATE messages SET uid_validity = 42, is_read = 1 WHERE trashed_at IS NULL");
    const status = await scan();
    expect(status.state).toBe("done");
    const rows = app.ctx.db
      .query<{ uid_validity: number; n: number }, []>(
        "SELECT uid_validity, COUNT(*) AS n FROM messages WHERE trashed_at IS NULL GROUP BY uid_validity",
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.uid_validity).not.toBe(42);
    expect(rows[0]?.n).toBe(7);
    expect(senders()["deals@store.example"]).toMatchObject({ total: 2, read: 1 });
    expect(
      app.ctx.db.query("SELECT COUNT(*) AS n FROM messages WHERE trashed_at IS NOT NULL").get(),
    ).toEqual({ n: 1 });
  });

  test("a failing account is recorded without stopping the others", async () => {
    const other = await createUser("scan-broken");
    const broken = await addAccount(
      app.ctx,
      {
        ...accountRequest(other),
        imap: { host: "127.0.0.1", port: rejecting.port, secure: false },
      },
      async () => {},
    );

    const status = await scan();
    expect(status.state).toBe("done");
    expect(status.errors).toEqual([
      {
        accountEmail: other.email,
        message:
          "Your email provider didn't accept the saved password. Remove this account and add it again with a new app password.",
      },
    ]);
    expect(status.message).toContain(`Couldn't read ${other.email}.`);
    const list = (await (await app.call("/api/accounts")).json()) as AccountSummary[];
    expect(list.find((a) => a.id === account.id)?.lastScanError).toBeNull();
    expect(list.find((a) => a.id === broken.id)?.lastScanError).toContain("saved password");

    await app.call(`/api/accounts/${account.id}`, { method: "DELETE" });
    const failed = await scan();
    expect(failed.state).toBe("failed");
    expect(failed.message).toStartWith(`Couldn't read ${other.email}.`);

    await app.call(`/api/accounts/${broken.id}`, { method: "DELETE" });
    expect(app.ctx.db.query("SELECT COUNT(*) AS n FROM senders").get()).toEqual({ n: 0 });
  });
});
