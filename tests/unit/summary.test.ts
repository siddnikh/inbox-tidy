import { afterEach, expect, test } from "bun:test";
import { monthsSpanned } from "../../src/core/insights/rate.ts";
import { homeSummary } from "../../src/core/insights/summary.ts";
import type { HomeSummary } from "../../src/shared/api.ts";
import { startTestApp, type TestApp, testContext } from "./helpers.ts";
import { addAccount, addAction, addMessages, addSender, daysAgo } from "./insights-fixtures.ts";

const NOW = Date.now();

test("summary is all zeros before anything is connected", () => {
  const ctx = testContext();
  expect(homeSummary(ctx, NOW)).toEqual({
    impact: { sendersUnsubscribed: 0, emailsAvoidedPerMonth: 0, emailsTrashed: 0 },
    inbox: {
      accounts: 0,
      totalEmails: 0,
      emailsPerMonth: 0,
      unreadPercent: 0,
      senders: 0,
      canUnsubscribe: 0,
      suggested: 0,
    },
    lookbackMonths: 12,
    lastScanAt: null,
  });
});

test("summary counts impact from the latest actions and the inbox over the window", () => {
  const ctx = testContext();
  const first = addAccount(ctx, "a@example.test", "2026-11-01T10:00:00.000Z");
  addAccount(ctx, "b@example.test", "2026-11-05T09:00:00.000Z");

  const done = addSender(ctx, { address: "news@done.example", method: "one_click" });
  addMessages(ctx, first, done, [{ daysAgo: 3 }, { daysAgo: 40, trashed: true }], NOW);
  addAction(ctx, {
    senderId: done,
    kind: "unsubscribe",
    status: "failed",
    emailsPerMonthBefore: 9,
  });
  addAction(ctx, {
    senderId: done,
    kind: "unsubscribe",
    status: "done",
    emailsPerMonthBefore: 12.4,
  });
  addAction(ctx, { senderId: done, kind: "trash", status: "done", messagesAffected: 120 });

  const browser = addSender(ctx, { address: "promo@web.example", method: "web" });
  addAction(ctx, {
    senderId: browser,
    kind: "unsubscribe",
    status: "opened_in_browser",
    emailsPerMonthBefore: 3.3,
  });
  addAction(ctx, { senderId: browser, kind: "trash", status: "failed", messagesAffected: 50 });

  const regressed = addSender(ctx, { address: "x@regressed.example", method: "mailto" });
  addMessages(ctx, first, regressed, [{ daysAgo: 1 }], NOW);
  addAction(ctx, {
    senderId: regressed,
    kind: "unsubscribe",
    status: "done",
    emailsPerMonthBefore: 50,
  });
  addAction(ctx, { senderId: regressed, kind: "unsubscribe", status: "not_available" });

  const suggested = addSender(ctx, {
    address: "deals@shop.example",
    method: "one_click",
    recommendation: "unsubscribe",
  });
  addMessages(
    ctx,
    first,
    suggested,
    [{ daysAgo: 1, read: true }, { daysAgo: 100 }, { daysAgo: 200 }, { daysAgo: 600 }],
    NOW,
  );
  const friend = addSender(ctx, { address: "pal@friend.example" });
  addMessages(ctx, first, friend, [{ daysAgo: 2, read: true }], NOW);

  const summary = homeSummary(ctx, NOW);
  expect(summary.impact).toEqual({
    sendersUnsubscribed: 2,
    emailsAvoidedPerMonth: 16,
    emailsTrashed: 120,
  });
  const total = 6;
  expect(summary.inbox).toEqual({
    accounts: 2,
    totalEmails: total,
    emailsPerMonth: Math.round(total / monthsSpanned(daysAgo(200, NOW), 12, NOW)),
    unreadPercent: 67,
    senders: 4,
    canUnsubscribe: 2,
    suggested: 1,
  });
  expect(summary.lastScanAt).toBe("2026-11-05T09:00:00.000Z");
  expect(summary.lookbackMonths).toBe(12);
});

let app: TestApp;
afterEach(() => app?.stop());

test("GET /api/summary returns the home summary", async () => {
  app = startTestApp();
  app.ctx.updateSettings({ lookbackMonths: 6 });
  addAccount(app.ctx);
  const res = await app.call("/api/summary");
  expect(res.status).toBe(200);
  const body = (await res.json()) as HomeSummary;
  expect(body.inbox.accounts).toBe(1);
  expect(body.lookbackMonths).toBe(6);
});
