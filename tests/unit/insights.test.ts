import { afterEach, describe, expect, test } from "bun:test";
import type { AppContext } from "../../src/core/context.ts";
import { emailsPerMonth } from "../../src/core/insights/rate.ts";
import {
  displayNameFor,
  getSender,
  type ListOptions,
  listSenders,
} from "../../src/core/insights/senders.ts";
import type { ApiErrorBody, SenderRow } from "../../src/shared/api.ts";
import { startTestApp, type TestApp, testContext } from "./helpers.ts";
import { addAccount, addAction, addMessages, addSender, daysAgo } from "./insights-fixtures.ts";

const NOW = Date.now();

function seed(ctx: AppContext) {
  const account = addAccount(ctx);
  const promo = addSender(ctx, {
    address: "deals@shop.example",
    name: "Shop Deals",
    method: "one_click",
    recommendation: "unsubscribe",
  });
  addMessages(
    ctx,
    account,
    promo,
    [
      ...Array.from({ length: 30 }, (_, i) => ({ daysAgo: 10 + i * 5, subject: `Sale ${i}` })),
      { daysAgo: 1, read: true, subject: "Newest sale" },
      { daysAgo: 0.5, subject: "Trashed one", trashed: true },
      { daysAgo: 500, subject: "Too old" },
    ],
    NOW,
  );
  const bank = addSender(ctx, { address: "alerts@bank.example", name: "Bank", method: "none" });
  addMessages(
    ctx,
    account,
    bank,
    Array.from({ length: 6 }, (_, i) => ({ daysAgo: i * 2, read: true })),
    NOW,
  );
  const kept = addSender(ctx, {
    address: "news@paper.example",
    method: "mailto",
    recommendation: "unsubscribe",
    keptAt: daysAgo(3),
  });
  addMessages(ctx, account, kept, [{ daysAgo: 4 }, { daysAgo: 5, read: true }], NOW);
  const gone = addSender(ctx, { address: "promo@gone.example", method: "web" });
  addMessages(ctx, account, gone, [{ daysAgo: 20, trashed: true }], NOW);
  addAction(ctx, { senderId: gone, kind: "unsubscribe", status: "done" });
  const retried = addSender(ctx, { address: "a@retry.example", method: "one_click" });
  addMessages(ctx, account, retried, [{ daysAgo: 2 }], NOW);
  addAction(ctx, { senderId: retried, kind: "unsubscribe", status: "done" });
  addAction(ctx, { senderId: retried, kind: "unsubscribe", status: "failed" });
  const ancient = addSender(ctx, { address: "old@ancient.example", method: "one_click" });
  addMessages(ctx, account, ancient, [{ daysAgo: 800 }], NOW);
  return { account, promo, bank, kept, gone, retried, ancient };
}

function byId(rows: SenderRow[], id: number): SenderRow {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`sender ${id} missing`);
  return row;
}

describe("sender statistics", () => {
  test("count only non-trashed mail inside the lookback window", () => {
    const ctx = testContext();
    const ids = seed(ctx);
    const promo = byId(listSenders(ctx, { now: NOW }), ids.promo);
    expect(promo.emailsTotal).toBe(31);
    expect(promo.unreadCount).toBe(30);
    expect(promo.readPercent).toBe(3);
    expect(promo.lastReceivedAt).toBe(daysAgo(1, NOW));
    expect(promo.recentSubjects).toEqual(["Newest sale", "Sale 0", "Sale 1", "Sale 2", "Sale 3"]);
    expect(promo.displayName).toBe("Shop Deals");
    expect(promo.status).toBe("active");
  });

  test("bulk monthly rate equals emailsPerMonth for every sender", () => {
    const ctx = testContext();
    seed(ctx);
    for (const lookbackMonths of [12, 3, 1]) {
      ctx.updateSettings({ lookbackMonths });
      for (const row of listSenders(ctx, { now: NOW })) {
        expect(row.emailsPerMonth).toBe(emailsPerMonth(ctx, row.id, NOW));
      }
    }
  });

  test("status follows the latest unsubscribe action, then keep", () => {
    const ctx = testContext();
    const ids = seed(ctx);
    const rows = listSenders(ctx, { now: NOW });
    expect(byId(rows, ids.gone).status).toBe("unsubscribed");
    expect(byId(rows, ids.retried).status).toBe("active");
    expect(byId(rows, ids.kept).status).toBe("kept");
    expect(byId(rows, ids.bank).status).toBe("active");
  });

  test("filters pick the right senders", () => {
    const ctx = testContext();
    const ids = seed(ctx);
    const pick = (filter: ListOptions) =>
      listSenders(ctx, { ...filter, now: NOW })
        .map((r) => r.id)
        .sort();
    expect(pick({ filter: "all" })).toEqual(
      [ids.promo, ids.bank, ids.kept, ids.gone, ids.retried].sort(),
    );
    expect(pick({ filter: "suggested" })).toEqual([ids.promo]);
    expect(pick({ filter: "can_unsubscribe" })).toEqual([ids.promo, ids.retried].sort());
    expect(pick({ filter: "kept" })).toEqual([ids.kept]);
    expect(pick({ filter: "unsubscribed" })).toEqual([ids.gone]);
    const gone = byId(listSenders(ctx, { filter: "unsubscribed", now: NOW }), ids.gone);
    expect(gone.emailsTotal).toBe(0);
    expect(gone.lastReceivedAt).not.toBe("");
  });

  test("sorts by volume, least read, and most recent", () => {
    const ctx = testContext();
    const ids = seed(ctx);
    const order = (sort: "most" | "least_read" | "recent") =>
      listSenders(ctx, { sort, now: NOW }).map((r) => r.id);
    expect(order("most").slice(0, 3)).toEqual([ids.promo, ids.bank, ids.kept]);
    expect(order("least_read")).toEqual([ids.retried, ids.gone, ids.promo, ids.kept, ids.bank]);
    expect(order("recent")[0]).toBe(ids.bank);
  });

  test("search matches name, address, or domain case-insensitively", () => {
    const ctx = testContext();
    const ids = seed(ctx);
    const search = (q: string) => listSenders(ctx, { q, now: NOW }).map((r) => r.id);
    expect(search("shop DEALS")).toEqual([ids.promo]);
    expect(search("ALERTS@")).toEqual([ids.bank]);
    expect(search("paper.example")).toEqual([ids.kept]);
    expect(search("nobody")).toEqual([]);
  });

  test("display name falls back to a tidy local part or the domain", () => {
    expect(displayNameFor("  Jane Doe ", "jane@x.example", "x.example")).toBe("Jane Doe");
    expect(displayNameFor(null, "john.smith@x.example", "x.example")).toBe("John Smith");
    expect(displayNameFor("", "mary_ann-lee+tag@x.example", "x.example")).toBe("Mary Ann Lee");
    expect(displayNameFor(null, "no-reply@amazon.example", "amazon.example")).toBe(
      "amazon.example",
    );
    expect(displayNameFor("info@shop.example", "info@shop.example", "shop.example")).toBe(
      "shop.example",
    );
  });
});

describe("sender routes", () => {
  let app: TestApp;
  afterEach(() => app?.stop());

  test("GET /api/senders defaults to all senders, most emails first", async () => {
    app = startTestApp();
    const ids = seed(app.ctx);
    const res = await app.call("/api/senders");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as SenderRow[];
    expect(rows[0]?.id).toBe(ids.promo);
    expect(rows).toHaveLength(5);
    const suggested = (await (
      await app.call("/api/senders?filter=suggested&sort=recent&q=shop")
    ).json()) as SenderRow[];
    expect(suggested.map((r) => r.id)).toEqual([ids.promo]);
  });

  test("unknown filter or sort is refused with a plain message", async () => {
    app = startTestApp();
    const res = await app.call("/api/senders?filter=everything");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.message).toContain("Please try again");
    expect((await app.call("/api/senders?sort=alphabetical")).status).toBe(400);
  });

  test("keep and un-keep return the updated row", async () => {
    app = startTestApp();
    const ids = seed(app.ctx);
    const kept = (await (
      await app.call(`/api/senders/${ids.promo}/keep`, { method: "POST" })
    ).json()) as SenderRow;
    expect(kept.status).toBe("kept");
    expect(getSender(app.ctx, ids.promo)?.status).toBe("kept");
    const suggested = (await (await app.call("/api/senders?filter=suggested")).json()) as unknown[];
    expect(suggested).toHaveLength(0);
    const active = (await (
      await app.call(`/api/senders/${ids.promo}/keep`, { method: "DELETE" })
    ).json()) as SenderRow;
    expect(active.status).toBe("active");
  });

  test("keep on a missing sender is a 404", async () => {
    app = startTestApp();
    const res = await app.call("/api/senders/9999/keep", { method: "POST" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorBody).error.message).toBe(
      "That sender is no longer in your list.",
    );
  });
});

test("listing stays fast with 50,000 messages from 3,000 senders", () => {
  const ctx = testContext();
  const account = addAccount(ctx);
  const insertSender = ctx.db.query(
    "INSERT INTO senders (address, domain, unsubscribe_method) VALUES (?, ?, 'one_click')",
  );
  const insertMessage = ctx.db.query(
    `INSERT INTO messages (account_id, mailbox, uid_validity, uid, sender_id, subject, received_at, is_read)
     VALUES (?, 'INBOX', 1, ?, ?, ?, ?, ?)`,
  );
  ctx.db.transaction(() => {
    for (let s = 1; s <= 3000; s++) insertSender.run(`s${s}@d${s % 400}.example`, `d${s}.example`);
    for (let m = 1; m <= 50_000; m++) {
      const sender = 1 + ((m * 7919) % 3000);
      insertMessage.run(account, m, sender, `Message ${m}`, daysAgo(m % 360, NOW), m % 3 === 0);
    }
  })();
  const started = performance.now();
  const rows = listSenders(ctx, { now: NOW });
  const elapsed = performance.now() - started;
  expect(rows).toHaveLength(3000);
  expect(rows.reduce((sum, r) => sum + r.emailsTotal, 0)).toBe(50_000);
  expect(elapsed).toBeLessThan(1000);
});
